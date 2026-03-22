// Script de datos de prueba: ejercita todos los flujos del bot con mensajes simulados

import { simulateIncoming } from '../src/whatsapp/simulator.js';

// Pequeña pausa para que los mensajes no se procesen todos en el mismo tick
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

async function run() {
  console.log('\n════════════════════════════════════════════════════');
  console.log(' SEED — Simulación completa de conversaciones');
  console.log('════════════════════════════════════════════════════\n');

  // ── Caso 1: Cliente nuevo que NO sabe su repartidor ───────────────────────
  console.log('--- CASO 1: Cliente nuevo (elige "No sé") ---');
  simulateIncoming('5491100000001', 'hola');
  await delay(100);
  simulateIncoming('5491100000001', '2 bidones de 20 litros');
  await delay(100);
  simulateIncoming('5491100000001', 'Av. Corrientes 1234, piso 3');
  await delay(100);
  simulateIncoming('5491100000001', '4'); // No sé
  await delay(200);

  // ── Caso 2: Cliente nuevo que SÍ sabe su repartidor ──────────────────────
  console.log('\n--- CASO 2: Cliente nuevo (elige repartidor Silvio) ---');
  simulateIncoming('5491100000002', 'buenas');
  await delay(100);
  simulateIncoming('5491100000002', '3 bidones de 12 litros');
  await delay(100);
  simulateIncoming('5491100000002', 'Calle Falsa 742');
  await delay(100);
  simulateIncoming('5491100000002', '1'); // Silvio
  await delay(200);

  // ── Caso 3: Cliente ya conocido (la app recuerda su repartidor) ───────────
  console.log('\n--- CASO 3: Cliente conocido (asignación guardada → Silvio) ---');
  simulateIncoming('5491100000002', 'quiero pedir');
  await delay(100);
  simulateIncoming('5491100000002', '1 bidón de 20 litros');
  await delay(100);
  simulateIncoming('5491100000002', 'Calle Falsa 742'); // dirección → flujo directo
  await delay(200);

  // ── Caso 4: Respuesta inválida del cliente en WAITING_DRIVER ─────────────
  console.log('\n--- CASO 4: Cliente envía respuesta inválida al elegir repartidor ---');
  simulateIncoming('5491100000003', 'hola');
  await delay(100);
  simulateIncoming('5491100000003', 'bidón grande');
  await delay(100);
  simulateIncoming('5491100000003', 'Rivadavia 500');
  await delay(100);
  simulateIncoming('5491100000003', 'cinco'); // inválido
  await delay(100);
  simulateIncoming('5491100000003', '2');     // Alejandro → corrige
  await delay(200);

  // ── Caso 5: Repartidor responde a un pedido ───────────────────────────────
  console.log('\n--- CASO 5: Repartidor Silvio responde "1 Entregado" ---');
  simulateIncoming('driver_1', '1');
  await delay(200);

  // ── Caso 6: Repartidor responde sin pedidos activos ───────────────────────
  console.log('\n--- CASO 6: Repartidor Damian responde sin pedidos activos ---');
  simulateIncoming('driver_3', '1');
  await delay(200);

  console.log('\n════════════════════════════════════════════════════');
  console.log(' SEED completado.');
  console.log('════════════════════════════════════════════════════\n');
}

// Importar index.js para inicializar la DB y registrar los handlers antes del seed
import('../src/index.js').then(() => {
  // Esperar un tick para asegurar que onMessage está registrado
  setTimeout(run, 100);
});
