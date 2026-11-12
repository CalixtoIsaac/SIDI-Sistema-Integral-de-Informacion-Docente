/**
 * Punto de entrada del servidor.
 * Express sirve la API REST (/api/*) y los archivos estáticos de public/.
 */
require('dotenv').config();

const path = require('path');
const express = require('express');

const db = require('./lib/db');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = path.join(__dirname, 'public');

app.disable('x-powered-by');

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

app.get('/api/health', (req, res) => {
  res.json({ status: 'online', timestamp: new Date().toISOString() });
});

// ---------- SIDI (sin login, 03 §1) ----------
app.use('/api/grupos', require('./routes/grupos'));
app.use('/api/opina', require('./routes/opina'));
app.use('/api/docentes', require('./routes/docentes'));
app.use('/api/titulos', require('./routes/titulos'));
app.use('/api/asignaturas', require('./routes/asignaturas'));
app.use('/api/tipos-clase', require('./routes/catalogos').tiposClase);
app.use('/api/catalogos', require('./routes/catalogos').catalogos);
app.use('/api/contratos', require('./routes/contratos'));

app.use('/api', (req, res) => res.status(404).json({ error: 'Ruta de la API no encontrada.' }));

// ---------- Páginas ----------
app.use(express.static(PUBLIC_DIR, { index: false }));
// Sin login (03 §1): se abre directo en la app. /app se conserva por los enlaces viejos.
app.get(['/', '/app'], (req, res) => res.sendFile(path.join(PUBLIC_DIR, 'app.html')));

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

const server = app.listen(PORT, HOST, () => {
  console.log(`✔ SIDI listo en http://localhost:${PORT}`);
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
