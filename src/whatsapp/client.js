// Cliente real de WhatsApp: autenticación por QR con sesión persistida en disco

import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
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

// Timestamp de inicio del bot (en segundos, igual que msg.timestamp de whatsapp-web.js)
// Se usa para ignorar mensajes que llegaron mientras el bot estaba caído.
const BOT_START_TIME = Math.floor(Date.now() / 1000);

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Envía un mensaje a un número de teléfono.
 * @param {string} to   - Número sin @c.us (ej: "5491112345678")
 * @param {string} text - Texto del mensaje
 */
export async function sendMessage(to, text) {
  try {
    // Si ya tiene sufijo @g.us (grupo) o @c.us usarlo directo, si no agregar @c.us
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    await client.sendMessage(chatId, text);
  } catch (err) {
    console.error(`[WhatsApp] Error enviando mensaje a ${to}:`, err.message);
  }
}

/**
 * Escucha mensajes de un admin específico dentro de un grupo.
 * Funciona cuando el bot tiene número propio (no el mismo que el admin).
 * @param {string} groupId    - Chat ID del grupo (con @g.us)
 * @param {string} adminPhone - Teléfono del admin sin @c.us
 * @param {(text: string) => void} handler
 */
export function onAdminGroupMessage(groupId, adminPhone, handler) {
  client.on('message', async (msg) => {
    if (msg.from !== groupId) return;
    if (msg.type !== 'chat') return;
    if (msg.timestamp < BOT_START_TIME) return;

    let quotedText = null;
    if (msg.hasQuotedMsg) {
      try {
        const quoted = await msg.getQuotedMessage();
        quotedText = quoted.body;
      } catch { /* ignorar */ }
    }

    handler(msg.body.trim(), quotedText);
  });
}

export function onMessage(handler) {
  client.on('message', async (msg) => {
    // Loguear grupos para facilitar la configuración de NOTIFY_GROUP_ID
    if (msg.from.endsWith('@g.us')) {
      console.log(`[WhatsApp] Mensaje de grupo — Group ID: ${msg.from}`);
      return;
    }
    // Ignorar estados y mensajes propios
    if (msg.from === 'status@broadcast') return;
    if (msg.fromMe) return;

    // Ignorar mensajes anteriores al arranque del bot (evita reprocesar cola offline)
    if (msg.timestamp < BOT_START_TIME) return;

    // Permitir texto e imágenes (comprobantes de transferencia)
    const isText  = msg.type === 'chat';
    const isImage = msg.type === 'image' || msg.type === 'document';
    if (!isText && !isImage) return;

    // Si el mensaje es una respuesta a otro, obtener el texto citado
    let quotedText = null;
    if (msg.hasQuotedMsg) {
      try {
        const quoted = await msg.getQuotedMessage();
        quotedText = quoted.body;
      } catch {
        // Si falla, simplemente no hay texto citado
      }
    }

    // Normalizar número: quitar el sufijo @c.us
    const from = msg.from.replace('@c.us', '');
    const body = isImage ? '[comprobante]' : msg.body.trim();
    handler(from, body, quotedText);
  });
}

/**
 * Inicializa el cliente de WhatsApp (conecta con Puppeteer y gestiona la sesión).
 * Debe llamarse una sola vez al arrancar.
 */
export async function initWhatsApp() {
  await client.initialize();
}
