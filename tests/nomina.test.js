const test = require('node:test');
const assert = require('node:assert/strict');
const nomina = require('../lib/nomina');

test('normalizar: las 3 formas de los archivos dan la misma nómina canónica', () => {
  assert.equal(nomina.normalizar('L03560330'), 'L03560330'); // OPINA / Excel de grupos
  assert.equal(nomina.normalizar(3560330), 'L03560330'); // Descuentos
  assert.equal(nomina.normalizar(19011), 'L00019011'); // Incidencias
  assert.equal(nomina.normalizar('19011'), 'L00019011');
  assert.equal(nomina.normalizar(' l00019011 '), 'L00019011');
  assert.equal(nomina.normalizar('L0-356-0330'), 'L03560330');
});

test('normalizar: valores inválidos dan null', () => {
  for (const v of [null, undefined, '', 'abc', 'L', '000', 123456789, '123456789', 3.5]) {
    assert.equal(nomina.normalizar(v), null, `valor: ${v}`);
  }
});

test('esCanonica', () => {
  assert.equal(nomina.esCanonica('L03560330'), true);
  assert.equal(nomina.esCanonica('03560330'), false);
  assert.equal(nomina.esCanonica('L3560330'), false);
  assert.equal(nomina.esCanonica('L00000000'), false);
  assert.equal(nomina.esCanonica(3560330), false);
});

test('aNacional: número sin L ni ceros (Descuentos e Incidencias)', () => {
  assert.equal(nomina.aNacional('L00019011'), 19011);
  assert.equal(nomina.aNacional('L03560330'), 3560330);
  assert.equal(typeof nomina.aNacional('L03560330'), 'number');
  assert.equal(nomina.aNacional('basura'), null);
});

test('sonIguales compara en cualquier forma', () => {
  assert.equal(nomina.sonIguales('L00019011', 19011), true);
  assert.equal(nomina.sonIguales('3560330', 'L03560330'), true);
  assert.equal(nomina.sonIguales('3560330', 'L03560331'), false);
  assert.equal(nomina.sonIguales(null, null), false);
});
