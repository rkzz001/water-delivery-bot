// Servidor HTTP: health check para Railway/Render + endpoint de asignación manual

import { createServer } from 'http';

const PORT = process.env.PORT || 3000;
const ASSIGN_SECRET = process.env.ASSIGN_SECRET ?? '';

// ── Rate limiting en memoria (por IP) ────────────────────────────────────────
const rateLimitWindows = new Map(); // ip → { count, resetAt }
const RATE_LIMIT_MAX = 20;         // peticiones por ventana
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minuto

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateLimitWindows.get(ip);

  if (!entry || now > entry.resetAt) {
    rateLimitWindows.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) return true;
  return false;
}

// Limpiar entradas expiradas cada 5 minutos
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitWindows) {
    if (now > entry.resetAt) rateLimitWindows.delete(ip);
  }
}, 5 * 60_000);

// ── Headers de seguridad ──────────────────────────────────────────────────────
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'",
  'Referrer-Policy': 'no-referrer',
};

/**
 * Inicia el servidor HTTP.
 * @param {(orderId: number, driverId: number) => Promise<string>} assignHandler
 *   Función que asigna un pedido y retorna un mensaje de confirmación.
 */
export function startHealthServer(assignHandler) {
  createServer(async (req, res) => {
    const ip = req.socket.remoteAddress ?? 'unknown';

    if (isRateLimited(ip)) {
      res.writeHead(429, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
      res.end('Too Many Requests');
      return;
    }

    const url = new URL(req.url, `http://localhost`);

    // ── GET /assign?order=5&driver=2 ────────────────────────────────────────
    if (url.pathname === '/assign') {
      // Autenticación por token de query (?secret=...) o header Authorization
      const providedSecret =
        url.searchParams.get('secret') ??
        (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '');

      if (!ASSIGN_SECRET || providedSecret !== ASSIGN_SECRET) {
        res.writeHead(401, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
        res.end('Unauthorized');
        return;
      }

      const orderId  = parseInt(url.searchParams.get('order'),  10);
      const driverId = parseInt(url.searchParams.get('driver'), 10);

      if (!orderId || !driverId || driverId < 1 || driverId > 3) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
        res.end(assignPage('', 'Parámetros inválidos. Ejemplo: /assign?order=5&driver=2'));
        return;
      }

      try {
        const msg = await assignHandler(orderId, driverId);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
        res.end(assignPage(msg));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8', ...SECURITY_HEADERS });
        res.end(assignPage('', 'Error interno al procesar la asignación.'));
      }
      return;
    }

    // ── Health check ─────────────────────────────────────────────────────────
    res.writeHead(200, { 'Content-Type': 'text/plain', ...SECURITY_HEADERS });
    res.end('OK');
  }).listen(PORT, () => {
    console.log(`[Health] Servidor HTTP escuchando en puerto ${PORT}`);
    if (!ASSIGN_SECRET) console.warn('[Health] ADVERTENCIA: ASSIGN_SECRET no está configurado — el endpoint /assign está desprotegido.');
  });
}

function assignPage(success, error) {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><title>Asignar pedido</title>
<style>body{font-family:sans-serif;max-width:400px;margin:60px auto;padding:0 20px}
input,select,button{width:100%;padding:10px;margin:8px 0;font-size:16px;box-sizing:border-box}
button{background:#25d366;color:#fff;border:none;border-radius:6px;cursor:pointer}
.ok{color:green;font-weight:bold}.err{color:red;font-weight:bold}</style>
</head>
<body>
<h2>Asignar repartidor</h2>
${success ? `<p class="ok">✅ ${success}</p>` : ''}
${error   ? `<p class="err">❌ ${error}</p>`  : ''}
<form method="GET" action="/assign">
  <label>Número de pedido</label>
  <input type="number" name="order" placeholder="Ej: 5" required>
  <label>Repartidor</label>
  <select name="driver">
    <option value="1">1 — Silvio</option>
    <option value="2">2 — Alejandro</option>
    <option value="3">3 — Damian</option>
  </select>
  <button type="submit">Asignar</button>
</form>
</body></html>`;
}
