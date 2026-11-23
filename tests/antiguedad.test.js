const test = require('node:test');
const assert = require('node:assert/strict');
const antiguedad = require('../lib/antiguedad');
const { formatoHorario } = require('../lib/horario');

test('calcular: desde AGO-DIC 2022 hasta noviembre 2026 = 4 años · 9 semestres', () => {
  assert.deepEqual(antiguedad.calcular('2022-08-01', '2026-11-11'), {
    anios: 4, semestres: 9, desde: 'AGO-DIC 2022', texto: '4 años · 9 semestres',
  });
});

test('calcular: acepta la clave del semestre y casos borde', () => {
  assert.equal(antiguedad.calcular('AGO-DIC 2026', '2026-11-11').texto, '0 años · 1 semestre');
  assert.equal(antiguedad.calcular('ENE-MAY 2025', '2026-11-11').semestres, 4);
  assert.equal(antiguedad.calcular('ENE-MAY 2026', '2026-06-20').semestres, 1); // verano cuenta en ENE-MAY
  assert.equal(antiguedad.calcular('2027-01-01', '2026-11-11'), null); // futuro
  assert.equal(antiguedad.calcular(null, '2026-11-11'), null);
});

test('primerInicio: el más antiguo entre lo calculado y lo capturado a mano', () => {
  assert.equal(antiguedad.primerInicio('2024-08-01', 'AGO-DIC 2017'), '2017-08-01');
  assert.equal(antiguedad.primerInicio('2024-08-01', null), '2024-08-01');
  assert.equal(antiguedad.primerInicio(null, 'texto raro'), null);
});

test('formatoHorario agrupa días con las mismas horas', () => {
  assert.equal(formatoHorario([
    { dia: 4, inicio: '07:30', fin: '08:59' },
    { dia: 1, inicio: '07:30', fin: '08:59' },
    { dia: 3, inicio: '11:00', fin: '12:29' },
  ]), 'Lu-Ju 07:30–08:59 · Mi 11:00–12:29');
  assert.equal(formatoHorario([]), '');
});
