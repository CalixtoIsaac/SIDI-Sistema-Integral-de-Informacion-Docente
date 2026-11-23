const test = require('node:test');
const assert = require('node:assert/strict');
const { crearBd } = require('./helpers/bd');
const color = require('../lib/color');
const configuracionService = require('../services/configuracionService');

test('color: la paleta sugerida tiene contraste suficiente y el amarillo claro no', () => {
  for (const hex of ['#DB2777', '#BE185D', '#9333EA', '#1D4ED8', '#0F766E', '#475569']) {
    assert.equal(color.analizar(hex).valido, true, hex);
  }
  assert.equal(color.analizar('#DB2777').primerPlano, '#ffffff');
  assert.equal(color.analizar('#FACC15').primerPlano, '#09090b'); // amarillo: texto oscuro
  assert.equal(color.analizar('#7DD3FC').valido, true);
  assert.equal(color.analizar('#777777').valido, false); // gris medio: ni blanco ni oscuro llegan a 4.5
  assert.equal(color.analizar('rosa').valido, false);
});

test('configuración: valores por defecto del perfil', () => {
  const db = crearBd();
  const c = configuracionService.listar(db);
  assert.equal(c['tema.modo'], 'automatico');
  assert.equal(c['tema.color'], '#DB2777');
  assert.equal(c['perfil.nombre'], 'Coordinación de Docentes');
  assert.equal(c['grupos.omitir_grupos'], 'F61,F62');
});

test('configuración: guarda modo, color (en mayúsculas) y nombre', () => {
  const db = crearBd();
  const c = configuracionService.actualizar(db, { 'tema.modo': 'oscuro', 'tema.color': '#1d4ed8', 'perfil.nombre': '  Coordinación   Prepa ' });
  assert.equal(c['tema.modo'], 'oscuro');
  assert.equal(c['tema.color'], '#1D4ED8');
  assert.equal(c['perfil.nombre'], 'Coordinación Prepa');
  assert.equal(configuracionService.listar(db)['tema.modo'], 'oscuro');
});

test('configuración: rechaza color sin contraste, modo y claves desconocidas (400, nada se guarda)', () => {
  const db = crearBd();
  assert.throws(() => configuracionService.actualizar(db, { 'tema.color': '#777777', 'tema.modo': 'oscuro' }), (err) => {
    assert.equal(err.status, 400);
    assert.match(err.message, /contraste/);
    return true;
  });
  assert.equal(configuracionService.listar(db)['tema.modo'], 'automatico');
  assert.throws(() => configuracionService.actualizar(db, { 'tema.modo': 'noche' }), (err) => err.details[0].problema === 'VALOR_INVALIDO');
  assert.throws(() => configuracionService.actualizar(db, { 'jwt.secret': 'x' }), (err) => err.details[0].problema === 'CLAVE_DESCONOCIDA');
});
