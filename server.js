/**
 * Punto de entrada del servidor.
 * Express sirve la API REST (/api/*) y los archivos estáticos de public/.
 */
require('dotenv').config();

const path = require('path');
const express = require('express');

const db = require('./lib/db');
const { requireAuth } = require('./lib/auth');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');
// Si lo pones detrás de un proxy inverso (Nginx, Caddy), descomenta para que
// el limitador de intentos vea la IP real del cliente:
// app.set('trust proxy', 1);

// Cabeceras de seguridad básicas
app.use((req, res, next) => {
  res.set({
    'X-Frame-Options': 'DENY',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin'
  });
  next();
});

app.use(express.json({ limit: '1mb' }));

// ---------- API pública ----------
app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});
app.use('/api/auth', require('./routes/auth'));

// ---------- API protegida: todo lo que sigue requiere sesión ----------
app.use('/api', requireAuth);
app.use('/api/notas', require('./routes/notas'));
// Registra aquí tus módulos nuevos, por ejemplo:
// app.use('/api/clientes', require('./routes/clientes'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada.' }));

// ---------- Páginas ----------
app.use(express.static(PUBLIC_DIR, { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'login.html')));
app.get('/app', (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.html')));

// ---------- Manejo de errores ----------
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'El cuerpo de la petición no es un JSON válido.' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'La petición es demasiado grande.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor.' });
});

const server = app.listen(PORT, () => {
  console.log(`✔ Servidor listo en http://localhost:${PORT}`);
  console.log(`  Base de datos: ${db.DB_PATH}`);
});

// Cierre ordenado: libera el archivo de la base de datos.
function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
