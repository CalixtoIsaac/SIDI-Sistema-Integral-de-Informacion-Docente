/**
 * Contraste de colores (WCAG 2.1) para validar el color principal del Perfil (03 §3, HU-17).
 * Mismo cálculo que public/js/theme.js: el color sirve si el texto blanco u oscuro
 * sobre él logra contraste ≥ 4.5:1.
 */
const CONTRASTE_MIN = 4.5;
const TEXTO_OSCURO = '#09090b';

function hexValido(hex) {
  return /^#[0-9a-f]{6}$/i.test(String(hex ?? ''));
}

function luminancia(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** { valido, primerPlano: '#ffffff' | '#09090b' | null, contraste } */
function analizar(hex) {
  if (!hexValido(hex)) return { valido: false, primerPlano: null, contraste: 0 };
  const blanco = contraste(hex, '#ffffff');
  const oscuro = contraste(hex, TEXTO_OSCURO);
  let primerPlano = null;
  if (blanco >= CONTRASTE_MIN) primerPlano = '#ffffff';
  else if (oscuro >= CONTRASTE_MIN) primerPlano = TEXTO_OSCURO;
  return { valido: primerPlano !== null, primerPlano, contraste: Math.max(blanco, oscuro) };
}

module.exports = { hexValido, contraste, analizar, CONTRASTE_MIN };
