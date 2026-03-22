// Simulador de API de WhatsApp: reemplaza la integración real durante desarrollo

import { EventEmitter } from 'events';

const emitter = new EventEmitter();

/**
 * Simula el envío de un mensaje saliente.
 * En producción esto sería una llamada a la API de WhatsApp Business.
 */
export function sendMessage(to, text) {
  console.log(`[WA OUT → ${to}]: ${text}`);
}

/**
 * Simula la llegada de un mensaje entrante desde un número externo.
 * Úsalo en tests y seeds para ejercitar el flujo completo.
 */
export function simulateIncoming(from, text) {
  console.log(`[WA IN  ← ${from}]: ${text}`);
  emitter.emit('message', from, text);
}

/**
 * Registra un handler que se ejecuta cada vez que llega un mensaje.
 * @param {(from: string, text: string) => void} handler
 */
export function onMessage(handler) {
  emitter.on('message', handler);
}
