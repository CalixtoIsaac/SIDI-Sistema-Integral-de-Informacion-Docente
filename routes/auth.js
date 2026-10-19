/**
 * Rutas de autenticación (públicas).
 *
 * La plantilla está pensada para UN usuario:
 *  - La primera vez que se abre la app no hay cuentas, así que el login
 *    muestra el formulario "Crea tu cuenta" (POST /api/auth/setup).
 *  - Después, /setup queda deshabilitado y solo se puede iniciar sesión.
 *
 *  GET  /api/auth/status  → { hasUser }
 *  POST /api/auth/setup   → { token, user }   (solo si no hay cuentas)
 *  POST /api/auth/login   → { token, user }
 *  GET  /api/auth/me      → { user }          (requiere sesión)
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../lib/db');
const { signToken, requireAuth, rateLimit } = require('../lib/auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const USERNAME_RE = /^[a-zA-Z0-9._-]{3,30}$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // límite de bcrypt
const FIFTEEN_MIN = 15 * 60 * 1000;

// Hash de relleno: iguala el tiempo de respuesta cuando el usuario no existe.
const DUMMY_HASH = bcrypt.hashSync('relleno-que-nunca-coincide', 10);

const loginLimiter = rateLimit({ max: 10, windowMs: FIFTEEN_MIN, key: (req) => 'login:' + req.ip });
const setupLimiter = rateLimit({ max: 5, windowMs: FIFTEEN_MIN, key: (req) => 'setup:' + req.ip });

const countUsers = db.prepare('SELECT COUNT(*) AS n FROM usuarios');
const findByUsername = db.prepare('SELECT id, nombre, usuario, password_hash FROM usuarios WHERE usuario = ?');
const insertUser = db.prepare('INSERT INTO usuarios (nombre, usuario, password_hash) VALUES (?, ?, ?)');

const bad = (res, error) => res.status(400).json({ error });

router.get('/status', (req, res) => {
  res.json({ hasUser: countUsers.get().n > 0 });
});

router.post('/setup', setupLimiter, wrap(async (req, res) => {
  const nombre = String(req.body?.nombre ?? '').trim();
  const usuario = String(req.body?.usuario ?? '').trim();
  const password = String(req.body?.password ?? '');

  if (!nombre || nombre.length > 60) return bad(res, 'Escribe tu nombre (máximo 60 caracteres).');
  if (!USERNAME_RE.test(usuario)) {
    return bad(res, 'El usuario debe tener de 3 a 30 caracteres: letras, números, punto, guion o guion bajo.');
  }
  if (password.length < MIN_PASSWORD) return bad(res, `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
  if (password.length > MAX_PASSWORD) return bad(res, `La contraseña no puede tener más de ${MAX_PASSWORD} caracteres.`);

  const hash = await bcrypt.hash(password, 10);

  // Transacción: si llegan dos peticiones a la vez, solo una crea la cuenta.
  const createFirstUser = db.transaction(() => {
    if (countUsers.get().n > 0) return null;
    const info = insertUser.run(nombre, usuario, hash);
    return { id: Number(info.lastInsertRowid), nombre, usuario };
  });

  const user = createFirstUser();
  if (!user) return res.status(409).json({ error: 'La cuenta ya fue creada. Inicia sesión.' });

  res.status(201).json({ token: signToken(user), user });
}));

router.post('/login', loginLimiter, wrap(async (req, res) => {
  const usuario = String(req.body?.usuario ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!usuario || !password) return bad(res, 'Escribe tu usuario y tu contraseña.');

  const row = findByUsername.get(usuario);
  const ok = await bcrypt.compare(password, row ? row.password_hash : DUMMY_HASH);
  // Mensaje único: no revela si el usuario existe.
  if (!row || !ok) return res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });

  const user = { id: row.id, nombre: row.nombre, usuario: row.usuario };
  res.json({ token: signToken(user), user });
}));

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
