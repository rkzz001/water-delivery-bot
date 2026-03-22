// Cliente real de WhatsApp: autenticación por QR con sesión persistida en disco

import { Client, LocalAuth } from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname  = dirname(fileURLToPath(import.meta.url));
const SESSION_PATH = join(__dirname, '../../sessions');

// Argumentos de Chromium necesarios para correr en entornos sin GUI (Railway/Render/Docker)
const PUPPETEER_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--single-process',
  '--disable-gpu',
];

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: SESSION_PATH }),
  puppeteer: {
    headless: true,
    args: PUPPETEER_ARGS,
    // En Railway/Render se inyecta la ruta al Chrome del sistema via env var
    ...(process.env.PUPPETEER_EXECUTABLE_PATH && {
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH,
    }),
  },
});

// ─── Eventos del cliente ──────────────────────────────────────────────────────

client.on('qr', (qr) => {
  console.log('\n[WhatsApp] Escaneá este QR con tu teléfono:\n');
  qrcode.generate(qr, { small: true });
});

client.on('authenticated', () => {
  console.log('[WhatsApp] Sesión autenticada correctamente.');
});

client.on('ready', () => {
  console.log('[WhatsApp] Cliente conectado y listo.');
});

client.on('disconnected', (reason) => {
  console.warn('[WhatsApp] Cliente desconectado:', reason);
  // Reintentar conexión después de 10 segundos
  setTimeout(() => client.initialize(), 10_000);
});

client.on('auth_failure', (msg) => {
  console.error('[WhatsApp] Fallo de autenticación:', msg);
});

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Envía un mensaje a un número de teléfono.
 * @param {string} to   - Número sin @c.us (ej: "5491112345678")
 * @param {string} text - Texto del mensaje
 */
export async function sendMessage(to, text) {
  try {
    const chatId = `${to}@c.us`;
    await client.sendMessage(chatId, text);
  } catch (err) {
    console.error(`[WhatsApp] Error enviando mensaje a ${to}:`, err.message);
  }
}

/**
 * Registra un handler que se ejecuta cada vez que llega un mensaje de texto individual.
 * Filtra mensajes de grupos y mensajes del propio bot.
 * @param {(from: string, text: string) => void} handler
 */
export function onMessage(handler) {
  client.on('message', (msg) => {
    // Ignorar mensajes de grupos, estados y mensajes propios
    if (msg.from.endsWith('@g.us')) return;
    if (msg.from === 'status@broadcast') return;
    if (msg.fromMe) return;
    // Ignorar mensajes que no sean texto
    if (msg.type !== 'chat') return;

    // Normalizar número: quitar el sufijo @c.us
    const from = msg.from.replace('@c.us', '');
    handler(from, msg.body.trim());
  });
}

/**
 * Inicializa el cliente de WhatsApp (conecta con Puppeteer y gestiona la sesión).
 * Debe llamarse una sola vez al arrancar.
 */
export async function initWhatsApp() {
  await client.initialize();
}
