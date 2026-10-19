/**
 * Utilidades de sesión: clave JWT, firma de tokens, middleware requireAuth
 * y un limitador de intentos en memoria.
 */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('./db');

const TOKEN_TTL = '8h';

function loadSecret() {
  const secret = process.env.JWT_SECRET || '';
  if (secret.length >= 32) return secret;

  if (process.env.NODE_ENV === 'production') {
    console.error('✖ JWT_SECRET falta o tiene menos de 32 caracteres. Defínelo en .env antes de arrancar en producción.');
    process.exit(1);
  }
  console.warn('⚠ JWT_SECRET no está definido: se usa una clave temporal. Las sesiones se cerrarán al reiniciar el servidor.');
  return crypto.randomBytes(48).toString('hex');
}

const JWT_SECRET = loadSecret();

const findUserById = db.prepare('SELECT id, nombre, usuario FROM usuarios WHERE id = ?');

/** Firma un token de sesión para el usuario. */
function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), nombre: user.nombre, usuario: user.usuario },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: TOKEN_TTL }
  );
}

/**
 * Middleware: exige la cabecera "Authorization: Bearer <token>".
 * Si es válida, deja el usuario en req.user.
 */
function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const match = header.match(/^Bearer\s+(.+)$/i);
  const deny = (error) => res.status(401).json({ error, code: 'AUTH_REQUIRED' });

  if (!match) return deny('Inicia sesión para continuar.');

  let payload;
  try {
    payload = jwt.verify(match[1], JWT_SECRET, { algorithms: ['HS256'] });
  } catch (err) {
    return deny(err.name === 'TokenExpiredError'
      ? 'Tu sesión expiró. Vuelve a iniciar sesión.'
      : 'Sesión no válida. Vuelve a iniciar sesión.');
  }

  // Confirma que la cuenta sigue existiendo (por ejemplo, si se borró la base de datos).
  const user = findUserById.get(Number(payload.sub));
  if (!user) return deny('La cuenta ya no existe. Vuelve a iniciar sesión.');

  req.user = user;
  next();
}

/**
 * Limitador de intentos en memoria (se reinicia al reiniciar el servidor).
 * Uso: router.post('/login', rateLimit({ max: 10, windowMs: 15 * 60e3, key: req => req.ip }), ...)
 */
function rateLimit({ max, windowMs, key }) {
  const hits = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [k, entry] of hits) if (entry.reset <= now) hits.delete(k);
  }, windowMs);
  cleanup.unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    let entry = hits.get(k);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(k, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retrySeconds = Math.ceil((entry.reset - now) / 1000);
      res.set('Retry-After', String(retrySeconds));
      return res.status(429).json({
        error: `Demasiados intentos. Espera ${Math.ceil(retrySeconds / 60)} minuto(s) e inténtalo de nuevo.`
      });
    }
    next();
  };
}

module.exports = { signToken, requireAuth, rateLimit };
