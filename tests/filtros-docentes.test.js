const test = require('node:test');
const assert = require('node:assert/strict');
const docentesService = require('../services/docentesService');
const filtros = require('../services/filtrosDocentes');
const { crearEscenario } = require('./helpers/escenario');

function buscar(db, query) {
  return docentesService.listar(db, query, { filtrar: filtros.filtrar, hoy: '2026-11-11' }).docentes.map((d) => d.nomina);
}

test('búsqueda por nombre: sin acentos, parcial y en cualquier orden', () => {
  const { db } = crearEscenario();
  assert.deepEqual(buscar(db, { search: 'maria' }), ['L03500001']);
  assert.deepEqual(buscar(db, { search: 'RUIZ lóp' }), ['L03500001']);
  assert.deepEqual(buscar(db, { search: 'von putlitz' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: 'xyz' }), []);
  assert.equal(buscar(db, { search: '   ' }).length, 4);
});

test('búsqueda por nómina con o sin L0, por CURP y por CRN', () => {
  const { db } = crearEscenario();
  assert.deepEqual(buscar(db, { search: '3500002' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: 'L03500002' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: 'l0350000' }).length, 4); // prefijo: mientras escribe
  assert.deepEqual(buscar(db, { search: 'lorm9502' }), ['L03500001']);
  assert.deepEqual(buscar(db, { search: '16452' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: '1643' }), ['L03500003']);
});

test('la búsqueda se combina con activo', () => {
  const { db, ids } = crearEscenario();
  db.prepare('UPDATE docentes SET activo = 0 WHERE id = ?').run(ids.maria);
  assert.deepEqual(buscar(db, { search: 'maria', activo: 'true' }), []);
  assert.deepEqual(buscar(db, { search: 'maria', activo: 'false' }), ['L03500001']);
});
