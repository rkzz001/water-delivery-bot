// Servidor HTTP mínimo requerido por Railway/Render para health checks

import { createServer } from 'http';

const PORT = process.env.PORT || 3000;

export function startHealthServer() {
  createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  }).listen(PORT, () => {
    console.log(`[Health] Servidor HTTP escuchando en puerto ${PORT}`);
  });
}
