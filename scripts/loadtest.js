/**
 * Load test: simula N conversaciones completas contra la FSM.
 * No conecta a WhatsApp. Las sesiones son en memoria (rápido).
 * Los precios se cargan desde Supabase para verificar el caché dinámico.
 *
 * Uso:
 *   node scripts/loadtest.js              # 300 conversaciones
 *   node scripts/loadtest.js --clients 500
 *   node scripts/loadtest.js --no-log     # no guardar archivo de conversaciones
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname }            from 'path';
import { fileURLToPath }            from 'url';

import { initDb }          from '../src/database/connection.js';
import { initPriceCache, PRICES } from '../src/cache/precioCache.js';
import { handleMessage }   from '../src/bot/messageHandler.js';
import { validateOrder }   from '../src/orders/orderModel.js';
import { STEPS, ORDER_STATUS } from '../src/config.js';

// ── CLI ───────────────────────────────────────────────────────────────────────

const argv   = process.argv.slice(2);
const argVal = (flag, fallback) => { const i = argv.indexOf(flag); return i !== -1 && argv[i + 1] ? argv[i + 1] : fallback; };
const N      = parseInt(argVal('--clients', '300'), 10);
const NO_LOG = argv.includes('--no-log');

// ── Stores en memoria (evita miles de queries a Supabase por sesión) ──────────

const sessionStore    = new Map(); // phone → { step, data }
const assignmentStore = new Map(); // phone → { driver_id }
const orderStore      = [];        // pedidos creados durante el test
let   nextOrderId     = 1;

function getOrCreateSession(phone) {
  return sessionStore.get(phone) ?? { step: STEPS.IDLE, data: {} };
}
function saveSession(phone, step, data) {
  sessionStore.set(phone, { step, data });
}
function clearSession(phone) {
  sessionStore.delete(phone);
}
function getClientAssignment(phone) {
  return assignmentStore.get(phone) ?? null;
}
function upsertClientAssignment(phone, driverId) {
  assignmentStore.set(phone, { driver_id: driverId });
}
function createOrderInMemory(validated) {
  const order = { id: nextOrderId++, ...validated, estado: validated.status };
  orderStore.push(order);
  return order;
}
function getActiveOrdersByDriver(driverId) {
  return orderStore.filter(
    (o) => o.driverId === driverId &&
           [ORDER_STATUS.PENDING, ORDER_STATUS.ASSIGNED].includes(o.estado),
  );
}
function markOrderDelivered(orderId) {
  const o = orderStore.find((o) => o.id === orderId);
  if (o) o.estado = ORDER_STATUS.DELIVERED;
}

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

const allConversations = [];

// ── Respuesta automática por paso ─────────────────────────────────────────────

const rand = (arr) => arr[Math.floor(Math.random() * arr.length)];

const AUTO_RESPONSE = {
  [STEPS.WAITING_ORDER]: () => rand([
    '2 bidones de 20 litros', '3 bidones de 12 litros',
    '1 bidón de 20', '2 sifones', 'bidones', '1 sifón de soda',
  ]),
  [STEPS.WAITING_QUANTITY]:     () => rand(['2', '3', '1', 'dos']),
  [STEPS.WAITING_SIZE]:         () => rand(['1', '2', '3', '4', '5', '6']),
  [STEPS.WAITING_ADDRESS]:      () => rand([
    'Corrientes 1234', 'San Martín 500', 'Rivadavia 789 piso 2',
    'Av. Santa Fe 3000', '9 de Julio 350, timbre 4B',
    "O'Higgins 500", 'Güemes 1234', 'San Martín 500 ✨', 'Peña 800, 2° piso',
  ]),
  [STEPS.WAITING_DRIVER]:       () => rand(['1', '2', '3', '4']),
  [STEPS.WAITING_PAYMENT]:      () => rand(['1', '2', 'efectivo', 'transferencia', 'transfer']),
  [STEPS.WAITING_RECEIPT]:      () => '[comprobante]',
  [STEPS.WAITING_NOTES]:        () => rand(['No', 'nop', 'ok', 'Estoy en casa de 9 a 12', 'mejor de 12', 'mejor de 20']),
  [STEPS.WAITING_RESCHEDULE]:   () => rand(['Sí', 'No']),
  [STEPS.WAITING_CONFIRMATION]: () => rand(['1', '1', '1', 'dale', 'sí', '2', 'hmm', 'mejor 3', 'mejor 2', 'mejor 3 de 12', 'mejor 1 de 20']),
};

// ── Procesar un mensaje (FSM + stores en memoria) ─────────────────────────────

function processMessage(phone, text, convLog) {
  stats.messages++;

  const session    = getOrCreateSession(phone);
  const assignment = getClientAssignment(phone);

  const { reply, nextStep, nextData, sideEffects } = handleMessage(phone, text, session, assignment);

  convLog.push({ from: 'cliente', text });
  convLog.push({ from: 'bot',     text: reply });

  if (sideEffects?.createOrder) {
    try {
      const { driverId, address, details, status, paymentMethod, notes } = sideEffects.createOrder;
      const validated = validateOrder({ clientPhone: phone, driverId, address, details, status, paymentMethod, notes });
      const order     = createOrderInMemory(validated);
      stats.orders++;
      const total = reply.match(/\$[\d.,]+/)?.[0] ?? '$?';
      convLog.push({ from: 'sistema', text: `Pedido #${order.id} creado — ${validated.details} — Total aprox: ${total}` });
    } catch (err) {
      convLog.push({ from: 'sistema', text: `ERROR al crear pedido: ${err.message}` });
      stats.errors++;
    }
  }

  if (sideEffects?.saveAssignment) {
    upsertClientAssignment(phone, sideEffects.saveAssignment.driverId);
  }

  if (sideEffects?.rescheduleOrder) {
    convLog.push({ from: 'sistema', text: `Reprogramación — pedido #${sideEffects.rescheduleOrder.orderId}` });
  }

  if (nextStep === STEPS.IDLE) {
    clearSession(phone);
  } else {
    saveSession(phone, nextStep, nextData);
  }

  return { nextStep };
}

// ── Conversación con mensajes automáticos ─────────────────────────────────────

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

// ── Conversación con secuencia fija ───────────────────────────────────────────

function runFixedConversation(phone, fixedMessages, scenarioName) {
  stats.scenarioCounts[scenarioName] = (stats.scenarioCounts[scenarioName] ?? 0) + 1;

  const convLog = [];
  let turns     = 0;
  let outcome   = 'completada';
  let nextStep  = STEPS.IDLE;

  try {
    for (const msg of fixedMessages) {
      ({ nextStep } = processMessage(phone, msg, convLog));
      turns++;
      if (nextStep === STEPS.IDLE) break;
    }

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
  // Saludos
  ['saludo-hola',           'Hola'],
  ['saludo-buenas',         'Buenas'],
  ['saludo-buenos-dias',    'Buenos días'],
  // Bidones clásicos
  ['pedido-20l',            '2 bidones de 20 litros'],
  ['pedido-12l',            '3 bidones de 12 litros'],
  ['pedido-sin-tamaño',     '2 bidones'],
  ['pedido-sin-cantidad',   'bidones de 20 litros'],
  // Nuevos productos
  ['pedido-sifon',          '2 sifones'],
  ['pedido-sifon-soda',     '1 sifón de soda'],
  ['pedido-5l',             '3 bidones de 5 litros'],
  ['pedido-8l',             '2 bidones de 8 litros'],
  ['pedido-10l',            '1 bidón de 10 litros'],
  // Todo junto
  ['todo-junto-a',          '2 bidones de 20 litros a Corrientes 1234'],
  ['todo-junto-en',         '3 bidones en San Martín 500'],
  ['todo-junto-dir',        '1 bidón, dirección: Rivadavia 789'],
  // Lenguaje natural
  ['natural-me-mandas',     'Hola, me podés mandar 2 bidones de 20 litros'],
  ['natural-quiero-pedir',  'quiero pedir 3 bidones de 12'],
  ['natural-che',           'che, me mandás 2 bidones a Av. Corrientes 1234'],
  ['natural-quisiera',      'quisiera pedir 2 sifones'],
  // Números escritos
  ['numeros-escritos',      'dos bidones de veinte litros'],
  ['numeros-mixtos',        'tres bidones de 12 litros'],
  // Frases sociales
  ['social-gracias',        'Gracias'],
  ['social-ok',             'ok'],
  ['social-dale',           'dale'],
  // FAQ
  ['faq-horario',           '¿Hasta qué hora reparten?'],
  ['faq-precio',            '¿Cuánto cuesta el bidón de 20?'],
  // Respuesta corta
  ['respuesta-corta-1',     '2'],
  ['respuesta-corta-2',     '1'],
  // Caracteres especiales
  ['char-comilla',          "2 bidones de 20 a O'Higgins 500"],
  ['char-tilde',            '1 bidón de 12 a Güemes 1234'],
  ['char-emoji',            '3 bidones de 20 a San Martín 500 ✨'],
  ['char-segundo-piso',     '2 bidones de 12 a Peña 800, 2° piso'],
];

// ── Log de conversaciones ─────────────────────────────────────────────────────

function buildLogFile(driverActions) {
  const SEP  = '─'.repeat(62);
  const SEP2 = '═'.repeat(62);
  const lines = [];

  lines.push(SEP2);
  lines.push(` LOAD TEST — ${stats.conversations} conversaciones`);
  lines.push(` Generado: ${new Date().toLocaleString('es-AR')}`);
  lines.push(` Precios cargados: sifón=$${PRICES.sifon} | 5L=$${PRICES[5]} | 8L=$${PRICES[8]} | 10L=$${PRICES[10]} | 12L=$${PRICES[12]} | 20L=$${PRICES[20]}`);
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
        const botLines = entry.text.split('\n');
        lines.push(`  Bot     : ${botLines[0]}`);
        for (const extra of botLines.slice(1)) lines.push(`            ${extra}`);
      } else {
        lines.push(`  [sistema] ${entry.text}`);
      }
    }
    lines.push('');
  }

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
    lines.push(`    ${name.padEnd(30)} ${count}`);
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

async function run() {
  const SEP = '═'.repeat(60);
  console.log(`\n${SEP}`);
  console.log(` LOAD TEST — ${N} conversaciones`);
  console.log(SEP);

  // Inicializar DB y precios desde Supabase
  console.log('\nConectando a Supabase...');
  await initDb();
  await initPriceCache();
  console.log(`Precios cargados: sifón=$${PRICES.sifon} | 5L=$${PRICES[5]} | 8L=$${PRICES[8]} | 10L=$${PRICES[10]} | 12L=$${PRICES[12]} | 20L=$${PRICES[20]}`);

  const t0 = Date.now();

  // Fase 1: Clientes nuevos
  console.log(`\nFase 1: ${N} clientes nuevos…`);
  for (let i = 0; i < N; i++) {
    const phone    = `54911${String(i).padStart(7, '0')}`;
    const scenario = SCENARIOS[i % SCENARIOS.length];
    runConversation(phone, scenario[1], scenario[0]);
  }

  // Fase 2: El "Gamer" — mismo teléfono, 3 pedidos en ráfaga
  console.log('Fase 2: El Gamer (3 pedidos en ráfaga, mismo teléfono)…');
  const GAMER_PHONE = '54911GAMER000';
  for (let i = 0; i < 3; i++) {
    runConversation(GAMER_PHONE, '2 bidones de 20 litros a Corrientes 1234', 'gamer-rafaga');
  }

  // Fase 3: Clientes conocidos (segunda compra con repartidor ya asignado)
  const returningCount = Math.floor(N * 0.3);
  console.log(`Fase 3: ${returningCount} clientes conocidos (segunda compra)…`);
  for (let i = 0; i < returningCount; i++) {
    const phone = `54911${String(i).padStart(7, '0')}`;
    runConversation(phone, '2 bidones de 20 litros a San Martín 500', 'conocido-directo');
  }

  // Fase 4: Flujos fijos — doble saludo, FAQs en medio del flujo, chars especiales
  console.log('Fase 4: Flujos fijos…');
  const FIXED_SEQS = [
    { phone: '54911FIX0001', msgs: ['Hola', 'Hola', '2 bidones de 20'],               name: 'doble-saludo' },
    { phone: '54911FIX0002', msgs: ['Hola', 'dale', '3 bidones de 12'],               name: 'saludo-social' },
    { phone: '54911FIX0003', msgs: ['Hola', '¿Hasta qué hora reparten?', '2 bidones de 20'], name: 'faq-mid-flow' },
    { phone: '54911FIX0004', msgs: ['Hola', '¿Cuánto cuesta el sifón?', '1 sifón'],   name: 'faq-precio-nuevo' },
    { phone: '54911FIX0005', msgs: ['2 bidones de 20', "O'Higgins 500"],              name: 'char-apostrofo' },
    { phone: '54911FIX0006', msgs: ['1 bidón de 12', 'Güemes 1234'],                  name: 'char-dieresis' },
    { phone: '54911FIX0007', msgs: ['1 sifón a Corrientes 1234'],                     name: 'sifon-todo-junto' },
    { phone: '54911FIX0008', msgs: ['2 sifones a San Martín 500'],                    name: 'sifones-todo-junto' },
    { phone: '54911FIX0009', msgs: ['3 bidones de 5 litros a Rivadavia 789'],         name: '5l-todo-junto' },
    { phone: '54911FIX0010', msgs: ['cancelar'],                                      name: 'cancelar-idle' },
    { phone: '54911FIX0011', msgs: ['2 bidones de 20 a Corrientes 1234', '1', '1', '1', 'cancelar'], name: 'cancelar-en-flow' },
  ];
  for (const { phone, msgs, name } of FIXED_SEQS) {
    runFixedConversation(phone, msgs, name);
  }

  // Fase 5: Verificación de precios — comprueba que calculateTotal usa los precios del caché
  console.log('Fase 5: Verificación de precios…');
  const PRICE_CHECKS = [
    { details: '1 sifón de soda',       expected: PRICES.sifon,   label: 'sifón ×1' },
    { details: '2 sifones de soda',      expected: PRICES.sifon * 2,  label: 'sifón ×2' },
    { details: '1 bidón de 5 litros',    expected: PRICES[5],     label: '5L ×1' },
    { details: '3 bidones de 5 litros',  expected: PRICES[5] * 3, label: '5L ×3' },
    { details: '1 bidón de 8 litros',    expected: PRICES[8],     label: '8L ×1' },
    { details: '1 bidón de 10 litros',   expected: PRICES[10],    label: '10L ×1' },
    { details: '2 bidones de 12 litros', expected: PRICES[12] * 2,label: '12L ×2' },
    { details: '1 bidón de 20 litros',   expected: PRICES[20],    label: '20L ×1' },
    { details: '3 bidones de 20 litros', expected: PRICES[20] * 3,label: '20L ×3' },
  ];

  const { calculateTotal } = await import('../src/bot/messageHandler.js');
  let priceErrors = 0;
  const priceLines = [];
  for (const { details, expected, label } of PRICE_CHECKS) {
    const got = calculateTotal(details);
    const ok  = got === expected;
    if (!ok) priceErrors++;
    priceLines.push(`  ${ok ? '✓' : '✗'} ${label.padEnd(14)} esperado=$${expected}  obtenido=$${got}`);
  }

  // Fase 6: Repartidores marcan entregas
  console.log('Fase 6: Repartidores marcando entregas…');
  let driverActions = 0;
  for (const driverId of [1, 2, 3]) {
    for (const order of getActiveOrdersByDriver(driverId)) {
      markOrderDelivered(order.id);
      driverActions++;
    }
  }
  stats.driverActions = driverActions;

  const elapsed = ((Date.now() - t0) / 1000).toFixed(2);

  // Guardar log
  let logPath = null;
  if (!NO_LOG) {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const logsDir   = join(__dirname, '../logs');
    mkdirSync(logsDir, { recursive: true });
    const ts  = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    logPath   = join(logsDir, `loadtest-${ts}.txt`);
    writeFileSync(logPath, buildLogFile(driverActions), 'utf-8');
  }

  // Reporte final
  const totalErrors = stats.errors + priceErrors;
  console.log(`\n${SEP}`);
  console.log(' RESULTADOS');
  console.log(SEP);
  console.log(`  Conversaciones simuladas : ${stats.conversations}`);
  console.log(`  Mensajes procesados      : ${stats.messages}`);
  console.log(`  Pedidos creados          : ${stats.orders}`);
  console.log(`  Pedidos entregados       : ${driverActions}`);
  console.log(`  Errores FSM              : ${stats.errors}`);
  console.log(`  Tiempo total             : ${elapsed}s`);
  console.log(`  Throughput               : ${Math.round(stats.messages / elapsed)} msg/s`);

  console.log('\n  Verificación de precios (vs Supabase):');
  for (const line of priceLines) console.log(line);

  if (stats.stuckConvs.length > 0) {
    console.log('\n  Conversaciones bloqueadas:');
    for (const c of stats.stuckConvs) {
      console.log(`    ${c.phone}  paso: ${c.step}  escenario: ${c.scenario}`);
    }
  }

  if (logPath) console.log(`\n  Conversaciones guardadas en:\n  ${logPath}`);

  const ok = totalErrors === 0 ? '✓ Sin errores' : `✗ ${totalErrors} errores`;
  console.log(`\n  Estado final: ${ok}`);
  console.log(`${SEP}\n`);

  process.exit(totalErrors > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error('Error fatal en el loadtest:', err);
  process.exit(1);
});
