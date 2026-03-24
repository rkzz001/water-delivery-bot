// Servidor HTTP: health check para Railway/Render + endpoint de asignación manual

import { createServer } from 'http';

const PORT = process.env.PORT || 3000;

/**
 * Inicia el servidor HTTP.
 * @param {(orderId: number, driverId: number) => Promise<string>} assignHandler
 *   Función que asigna un pedido y retorna un mensaje de confirmación.
 */
export function startHealthServer(assignHandler) {
  createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost`);

    // ── GET /assign?order=5&driver=2 ────────────────────────────────────────
    if (url.pathname === '/assign') {
      const orderId  = parseInt(url.searchParams.get('order'),  10);
      const driverId = parseInt(url.searchParams.get('driver'), 10);

      if (!orderId || !driverId || driverId < 1 || driverId > 3) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(assignPage('', 'Parámetros inválidos. Ejemplo: /assign?order=5&driver=2'));
        return;
      }

      try {
        const msg = await assignHandler(orderId, driverId);
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(assignPage(msg));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(assignPage('', `Error: ${err.message}`));
      }
      return;
    }

    // ── Health check ─────────────────────────────────────────────────────────
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  }).listen(PORT, () => {
    console.log(`[Health] Servidor HTTP escuchando en puerto ${PORT}`);
    console.log(`[Health] Panel de asignación: http://localhost:${PORT}/assign?order=<id>&driver=<1|2|3>`);
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
