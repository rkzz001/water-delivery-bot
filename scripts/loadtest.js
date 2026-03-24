/**
 * Load test: simula N conversaciones completas contra la FSM + DB.
 * No conecta a WhatsApp. Mide throughput y detecta errores de lógica/estado.
 *
 * Uso:
 *   node scripts/loadtest.js              # 300 conversaciones
 *   node scripts/loadtest.js --clients 500
 *   node scripts/loadtest.js --no-log     # no guardar archivo de conversaciones
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';

import { getDb }               from '../src/database/connection.js';
import { handleMessage }       from '../src/bot/messageHandler.js';
import { getOrCreateSession,
         saveSession,
         clearSession }        from '../src/bot/sessionManager.js';
import { getClientAssignment,
         upsertClientAssignment,
         createOrder,
         getActiveOrdersByDriver,
         updateOrderStatus }   from '../src/database/queries.js';
import { validateOrder }       from '../src/orders/orderModel.js';
import { STEPS, ORDER_STATUS } from '../src/config.js';

// ── CLI ───────────────────────────────────────────────────────────────────────

const argv    = process.argv.slice(2);
const argVal  = (flag, fallback) => { const i = argv.indexOf(flag); return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback; };
const N       = parseInt(argVal('--clients', '1000'), 10);
const NO_LOG  = argv.includes('--no-log');

// ── Helpers ───────────────────────────────────────────────────────────────────

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ── DB ────────────────────────────────────────────────────────────────────────

getDb();

// ── Stats ─────────────────────────────────────────────────────────────────────

const stats = {
  conversations:  0,
  messages:       0,
  orders:         0,
  driverActions:  0,
  errors:         0,
  stuckConvs:     [],
  scenarioCounts: {},
};

// Almacena todas las conversaciones para el archivo de log
const allConversations = [];

// ── Respuesta automática por paso de la FSM ───────────────────────────────────

const AUTO_RESPONSE = {
  [STEPS.WAITING_ORDER]:        () => rand(['2 bidones de 20 litros', '3 bidones de 12 litros', '1 bidón de 20', 'bidones']),
  [STEPS.WAITING_QUANTITY]:     () => rand(['2', '3', '1', 'dos']),
  [STEPS.WAITING_SIZE]:         () => rand(['1', '2', '12', '20', '12l', '20l']),  // 1=12L, 2=20L + respuesta directa
  [STEPS.WAITING_ADDRESS]:      () => rand([
    'Corrientes 1234',
    'San Martín 500',
    'Rivadavia 789 piso 2',
    'Av. Santa Fe 3000',
    'Rivadavia esquina Corrientes 1200',
    '9 de Julio 350, timbre 4B',
    'Mitre 100, la casa con portón azul, timbre 3',
    // Caracteres especiales — verifica codificación en DB y ticket
    "O'Higgins 500",
    "Calle 'Falsa' 123",
    'Güemes 1234',
    'San Martín 500 ✨',
    'Peña 800, 2° piso',
  ]),
  [STEPS.WAITING_DRIVER]:       () => rand(['1', '2', '3', '4']),
  [STEPS.WAITING_PAYMENT]:      () => rand(['1', '2', 'efectivo', 'transferencia', 'transfer', 'efect']),
  [STEPS.WAITING_RECEIPT]:      () => '[comprobante]',
  [STEPS.WAITING_NOTES]:        () => rand(['No', 'nop', 'ok', 'paso', 'Estoy en casa de 9 a 12', 'Llamar antes de llegar', 'mejor de 12', 'mejor de 20']),
  [STEPS.WAITING_RESCHEDULE]:   () => rand(['Sí', 'No']),
  [STEPS.WAITING_CONFIRMATION]: () => rand(['1', '1', '1', 'dale', 'sí', '2', 'un momento', 'pará', 'hmm', 'mejor 3', 'mejor 2', 'mejor 3 de 12', 'mejor 1 de 20']), // duda + cambio cantidad + cambio cantidad/tamaño
};

// ── Procesar un mensaje (FSM + DB, sin WhatsApp I/O) ─────────────────────────

function processMessage(phone, text, convLog) {
  stats.messages++;

  const session    = getOrCreateSession(phone);
  const assignment = getClientAssignment(phone);
  const { reply, nextStep, nextData, sideEffects } = handleMessage(phone, text, session, assignment);

  convLog.push({ from: 'cliente', text });
  convLog.push({ from: 'bot',     text: reply });

  if (sideEffects?.createOrder) {
    const validated = validateOrder({ clientPhone: phone, ...sideEffects.createOrder });
    createOrder(validated);
    stats.orders++;
    convLog.push({ from: 'sistema', text: `Pedido creado — estado: ${validated.status}, pago: ${validated.paymentMethod}` });
  }

  if (sideEffects?.saveAssignment) {
    upsertClientAssignment(phone, sideEffects.saveAssignment.driverId);
    convLog.push({ from: 'sistema', text: `Repartidor ${sideEffects.saveAssignment.driverId} guardado para este cliente` });
  }

  if (sideEffects?.rescheduleOrder) {
    convLog.push({ from: 'sistema', text: `Reprogramación solicitada — pedido #${sideEffects.rescheduleOrder.orderId}` });
  }

  if (nextStep === STEPS.IDLE) {
    clearSession(phone);
  } else {
    saveSession(phone, nextStep, nextData);
  }

  return { nextStep };
}

// ── Ejecutar una conversación completa ────────────────────────────────────────

const MAX_TURNS = 15;

function runConversation(phone, firstMessage, scenarioName) {
  stats.scenarioCounts[scenarioName] = (stats.scenarioCounts[scenarioName] ?? 0) + 1;

  const convLog = [];
  let turns     = 0;
  let outcome   = 'completada';

  try {
    let { nextStep } = processMessage(phone, firstMessage, convLog);
    turns++;

    while (nextStep !== STEPS.IDLE && turns < MAX_TURNS) {
      const responder = AUTO_RESPONSE[nextStep];

      if (!responder) {
        outcome = `stuck en paso: ${nextStep}`;
        stats.errors++;
        stats.stuckConvs.push({ phone, step: nextStep, scenario: scenarioName });
        clearSession(phone);
        break;
      }

      ({ nextStep } = processMessage(phone, responder(), convLog));
      turns++;
    }

    if (turns >= MAX_TURNS && nextStep !== STEPS.IDLE) {
      outcome = `timeout (${MAX_TURNS} turnos), último paso: ${nextStep}`;
      stats.errors++;
      stats.stuckConvs.push({ phone, step: nextStep, scenario: scenarioName });
      clearSession(phone);
    }

  } catch (err) {
    outcome = `error: ${err.message}`;
    stats.errors++;
    stats.stuckConvs.push({ phone, step: '?', scenario: scenarioName });
    clearSession(phone);
  }

  allConversations.push({ phone, scenarioName, outcome, turns, log: convLog });
  stats.conversations++;
}

// ── Conversación con secuencia fija de mensajes ───────────────────────────────
//
// Útil para probar flujos exactos (doble saludo, cambio de opinión, chars especiales)
// sin depender del azar de AUTO_RESPONSE.
// Después de agotar la secuencia fija, continúa con AUTO_RESPONSE para los pasos restantes.

function runFixedConversation(phone, fixedMessages, scenarioName) {
  stats.scenarioCounts[scenarioName] = (stats.scenarioCounts[scenarioName] ?? 0) + 1;

  const convLog = [];
  let turns     = 0;
  let outcome   = 'completada';
  let nextStep  = STEPS.IDLE;

  try {
    // Secuencia predeterminada de mensajes
    for (const msg of fixedMessages) {
      ({ nextStep } = processMessage(phone, msg, convLog));
      turns++;
      if (nextStep === STEPS.IDLE) break;
    }

    // Continúa con AUTO_RESPONSE para los pasos que queden
    while (nextStep !== STEPS.IDLE && turns < MAX_TURNS) {
      const responder = AUTO_RESPONSE[nextStep];
      if (!responder) {
        outcome = `stuck en paso: ${nextStep}`;
        stats.errors++;
        stats.stuckConvs.push({ phone, step: nextStep, scenario: scenarioName });
        clearSession(phone);
        break;
      }
      ({ nextStep } = processMessage(phone, responder(), convLog));
      turns++;
    }

    if (turns >= MAX_TURNS && nextStep !== STEPS.IDLE) {
      outcome = `timeout (${MAX_TURNS} turnos), último paso: ${nextStep}`;
      stats.errors++;
      stats.stuckConvs.push({ phone, step: nextStep, scenario: scenarioName });
      clearSession(phone);
    }

  } catch (err) {
    outcome = `error: ${err.message}`;
    stats.errors++;
    stats.stuckConvs.push({ phone, step: '?', scenario: scenarioName });
    clearSession(phone);
  }

  allConversations.push({ phone, scenarioName, outcome, turns, log: convLog });
  stats.conversations++;
}

// ── Escenarios ────────────────────────────────────────────────────────────────

const SCENARIOS = [
  ['saludo-hola',           'Hola'],
  ['saludo-buenas',         'Buenas'],
  ['saludo-buenos-dias',    'Buenos días'],
  ['saludo-buenas-tardes',  'Buenas tardes'],
  ['pedido-20l',            '2 bidones de 20 litros'],
  ['pedido-12l',            '3 bidones de 12 litros'],
  ['pedido-sin-tamaño',     '2 bidones'],
  ['pedido-sin-cantidad',   'bidones de 20 litros'],
  ['todo-junto-a',          '2 bidones de 20 litros a Corrientes 1234'],
  ['todo-junto-en',         '3 bidones en San Martín 500'],
  ['todo-junto-dir',        '1 bidón, dirección: Rivadavia 789'],
  ['natural-me-mandas',     'Hola, me podés mandar 2 bidones de 20 litros'],
  ['natural-quiero-pedir',  'quiero pedir 3 bidones de 12'],
  ['natural-che',           'che, me mandás 2 bidones a Av. Corrientes 1234'],
  ['natural-buenas-tardes', 'buenas tardes, me mandás 1 bidón de 20'],
  ['natural-quisiera',      'quisiera pedir 2 bidones de 20'],
  ['numeros-escritos',      'dos bidones de veinte litros'],
  ['numeros-mixtos',        'tres bidones de 20 litros'],
  ['social-gracias',        'Gracias'],
  ['social-muchas-gracias', 'Muchas gracias'],
  ['social-ok',             'ok'],
  ['social-dale',           'dale'],
  ['social-genial',         'genial'],
  ['ambiguo-solo-texto',    'quiero agua'],
  // FAQ en IDLE (sin flujo abierto)
  ['faq-horario-idle',      '¿Hasta qué hora reparten?'],
  ['faq-precio-idle',       '¿Cuánto cuesta el bidón de 20?'],
  // Direcciones complejas en el mensaje inicial
  ['dirección-esquina',     '2 bidones de 20 a Rivadavia esquina Corrientes 1200'],
  ['dirección-numero-calle','1 bidón de 12 a 9 de Julio 350'],
  // El "Extranjero" — números escritos (ya cubierto, verificación explícita)
  ['extranjero-dos',        'dos bidones de veinte litros'],
  ['extranjero-tres',       'tres bidones de 12 litros'],
  // El "Indeciso" — cambio de cantidad en confirmación
  ['indeciso-cambio',        '2 bidones de 20 a Corrientes 1234'],
  // El "Arrepentido" — cambia cantidad Y tamaño en confirmación ("mejor 3 de 12")
  ['arrepentido-qty-size',   '2 bidones de 20 a San Martín 500'],
  // Mezcla de formatos numéricos (El "Extranjero" ampliado)
  ['mezcla-dos-de-veinte',   'Dos bidones de 20 litros'],
  ['mezcla-2-de-12',         '2 de 12 a Rivadavia 789'],
  ['mezcla-tres-de-doce',    'tres bidones de 12 litros a Corrientes 100'],
  // El "Cliente Educado" — usa "por favor" en distintas posiciones
  ['educado-por-favor',      'Por favor, 2 bidones de 20 litros'],
  ['educado-por-favor-2',    'por favor mandarme 3 bidones de 12'],
  ['educado-por-favor-3',    'buen día, por favor quiero 1 bidón de 20 a Corrientes 1234'],
  // El "Cliente de Respuesta Corta" — respuestas mínimas en cada paso
  ['respuesta-corta-20l',    '2'],
  ['respuesta-corta-12l',    '1'],
  // El "Arrepentido de último momento" — cambia tamaño en la nota
  ['arrepentido-en-nota',    '2 bidones de 20 a San Martín 500'],
  ['arrepentido-en-nota-2',  '3 bidones de 20 a Corrientes 1234'],
  // Caracteres especiales en el mensaje inicial (todo-junto con dirección especial)
  ['char-comilla-simple',    "2 bidones de 20 a O'Higgins 500"],
  ['char-tilde-u',           '1 bidón de 12 a Güemes 1234'],
  ['char-emoji',             '3 bidones de 20 a San Martín 500 ✨'],
  ['char-segundo-piso',      '2 bidones de 12 a Peña 800, 2° piso'],
];

// ── Escribir log de conversaciones ────────────────────────────────────────────

function buildLogFile(driverActions) {
  const SEP  = '─'.repeat(62);
  const SEP2 = '═'.repeat(62);
  const lines = [];

  lines.push(SEP2);
  lines.push(` LOAD TEST — ${stats.conversations} conversaciones simuladas`);
  lines.push(` Generado: ${new Date().toLocaleString('es-AR')}`);
  lines.push(SEP2);
  lines.push('');

  for (let i = 0; i < allConversations.length; i++) {
    const { phone, scenarioName, outcome, turns, log } = allConversations[i];

    lines.push(SEP);
    lines.push(` #${String(i + 1).padStart(3, '0')}  ${scenarioName}  [${phone}]`);
    lines.push(` Resultado: ${outcome}  |  Turnos: ${turns}`);
    lines.push(SEP);
    lines.push('');

    for (const entry of log) {
      if (entry.from === 'cliente') {
        lines.push(`  Cliente : ${entry.text}`);
      } else if (entry.from === 'bot') {
        // Indentar respuestas multilínea del bot
        const botLines = entry.text.split('\n');
        lines.push(`  Bot     : ${botLines[0]}`);
        for (const extra of botLines.slice(1)) {
          lines.push(`            ${extra}`);
        }
      } else {
        lines.push(`  [sistema] ${entry.text}`);
      }
    }

    lines.push('');
  }

  // Resumen al final del archivo
  lines.push(SEP2);
  lines.push(' RESUMEN');
  lines.push(SEP2);
  lines.push(`  Conversaciones : ${stats.conversations}`);
  lines.push(`  Mensajes       : ${stats.messages}`);
  lines.push(`  Pedidos        : ${stats.orders}`);
  lines.push(`  Entregas       : ${driverActions}`);
  lines.push(`  Errores        : ${stats.errors}`);
  lines.push('');
  lines.push('  Por escenario:');
  for (const [name, count] of Object.entries(stats.scenarioCounts).sort((a, b) => b[1] - a[1])) {
    lines.push(`    ${name.padEnd(28)} ${count}`);
  }

  if (stats.stuckConvs.length > 0) {
    lines.push('');
    lines.push('  Conversaciones bloqueadas:');
    for (const c of stats.stuckConvs) {
      lines.push(`    ${c.phone}  paso: ${c.step}  escenario: ${c.scenario}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

// ── Main ──────────────────────────────────────────────────────────────────────

function run() {
  const SEP = '═'.repeat(60);
  console.log(`\n${SEP}`);
  console.log(` LOAD TEST — ${N} conversaciones`);
  console.log(SEP);

  const t0 = Date.now();

  // Fase 1: Clientes nuevos
  console.log('\nFase 1: Clientes nuevos…');
  for (let i = 0; i < N; i++) {
    const phone    = `54911${String(i).padStart(7, '0')}`;
    const scenario = SCENARIOS[i % SCENARIOS.length];
    runConversation(phone, scenario[1], scenario[0]);
  }

  // Fase 2: El "Gamer" — mismo teléfono, 3 pedidos en ráfaga
  // Verifica que clearSession funcione correctamente entre conversaciones del mismo número.
  console.log('Fase 2: El Gamer (3 conversaciones en ráfaga, mismo teléfono)…');
  const GAMER_PHONE = '54911GAMER000';
  for (let i = 0; i < 3; i++) {
    runConversation(GAMER_PHONE, '2 bidones de 20 litros a Corrientes 1234', 'gamer-rafaga');
  }

  // Fase 3: Clientes conocidos (segunda compra)
  const returningCount = Math.floor(N * 0.3);
  console.log(`Fase 3: ${returningCount} clientes conocidos (segunda compra)…`);
  for (let i = 0; i < returningCount; i++) {
    const phone = `54911${String(i).padStart(7, '0')}`;
    runConversation(phone, '2 bidones de 20 litros a San Martín 500', 'conocido-directo');
  }

  // Fase 4: Doble saludo y caracteres especiales
  console.log('Fase 4: Doble saludo y caracteres especiales…');

  // Doble saludo: verifica que el bot no reinicie el flujo por un saludo accidental
  const DOUBLE_GREET_SEQS = [
    // "Hola" → WAITING_ORDER → "Hola" de vuelta → bot re-pregunta → pedido normal
    ['Hola', 'Hola', '2 bidones de 20'],
    // Saludo + frase social → bot aguanta en WAITING_ORDER
    ['Hola', 'dale', '3 bidones de 12'],
    // Doble saludo distinto
    ['Buenas', 'Hola, ¿hay alguien?', '1 bidón de 20'],
    // Pregunta FAQ mid-WAITING_ORDER → bot responde y re-pregunta pedido
    ['Hola', '¿Hasta qué hora reparten?', '2 bidones de 20'],
  ];
  for (let i = 0; i < DOUBLE_GREET_SEQS.length; i++) {
    const phone = `54911DGREET${String(i).padStart(4, '0')}`;
    runFixedConversation(phone, DOUBLE_GREET_SEQS[i], 'doble-saludo');
  }

  // Caracteres especiales: verifica codificación Unicode, comillas y emojis en DB
  const SPECIAL_CHAR_SEQS = [
    ['2 bidones de 20', "O'Higgins 500"],           // apóstrofo en dirección
    ['1 bidón de 12',   "Calle 'Falsa' 123"],        // comillas simples
    ['3 bidones de 20', 'Güemes 1234'],              // diéresis
    ['2 bidones de 12', 'San Martín 500 ✨'],        // emoji en dirección
    ['1 bidón de 20',   'Peña 800, 2° piso'],        // símbolo de grado
    ['2 bidones de 20', 'O\'Brien 123, "el rojo"'],  // comillas dobles + apóstrofo
  ];
  for (let i = 0; i < SPECIAL_CHAR_SEQS.length; i++) {
    const phone = `54911SPECH${String(i).padStart(4, '0')}`;
    // El primer mensaje es el pedido (desde IDLE→WAITING_ADDRESS), el segundo es la dirección
    runFixedConversation(phone, SPECIAL_CHAR_SEQS[i], 'char-especial');
  }

  // Fase 5: Repartidores marcan entregas
  console.log('Fase 5: Repartidores marcando entregas…');
  let driverActions = 0;
  for (const driverId of [1, 2, 3]) {
    for (const order of getActiveOrdersByDriver(driverId)) {
      updateOrderStatus(order.id, ORDER_STATUS.DELIVERED);
      driverActions++;
    }
  }
  stats.driverActions = driverActions;

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  // Guardar log de conversaciones
  let logPath = null;
  if (!NO_LOG) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const logsDir   = join(__dirname, '../logs');
    mkdirSync(logsDir, { recursive: true });

    const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    logPath   = join(logsDir, `loadtest-${ts}.txt`);
    writeFileSync(logPath, buildLogFile(driverActions), 'utf-8');
  }

  // Reporte en consola
  console.log(`\n${SEP}`);
  console.log(' RESULTADOS');
  console.log(SEP);
  console.log(`  Conversaciones simuladas : ${stats.conversations}`);
  console.log(`  Mensajes procesados      : ${stats.messages}`);
  console.log(`  Pedidos creados          : ${stats.orders}`);
  console.log(`  Pedidos entregados       : ${driverActions}`);
  console.log(`  Errores / stuck          : ${stats.errors}`);
  console.log(`  Tiempo total             : ${elapsed}s`);
  console.log(`  Throughput               : ${Math.round(stats.messages / elapsed)} msg/s`);

  console.log('\n  Por escenario:');
  for (const [name, count] of Object.entries(stats.scenarioCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    ${name.padEnd(28)} ${count}`);
  }

  if (stats.stuckConvs.length > 0) {
    console.log('\n  Conversaciones bloqueadas:');
    for (const c of stats.stuckConvs) {
      console.log(`    ${c.phone}  paso: ${c.step}  escenario: ${c.scenario}`);
    }
  }

  if (logPath) {
    console.log(`\n  Conversaciones guardadas en:\n  ${logPath}`);
  }

  const ok = stats.errors === 0 ? '✓ Sin errores' : `✗ ${stats.errors} errores`;
  console.log(`\n  Estado final: ${ok}`);
  console.log(`${SEP}\n`);

  process.exit(stats.errors > 0 ? 1 : 0);
}

run();
