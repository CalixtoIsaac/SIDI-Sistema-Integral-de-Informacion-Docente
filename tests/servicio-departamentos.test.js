const test = require('node:test');
const assert = require('node:assert/strict');
const departamentos = require('../services/departamentosService');
const edicion = require('../services/docentesEdicionService');
const docentes = require('../services/docentesService');
const { crearEscenario } = require('./helpers/escenario');

test('departamentos: alta, renombrar, duplicado, asignar a un docente y no borrar si está en uso', () => {
  const { db, ids } = crearEscenario();
  const cn = departamentos.crear(db, { nombre: '  Ciencias   Naturales ' });
  assert.equal(cn.nombre, 'Ciencias Naturales');
  assert.throws(() => departamentos.crear(db, { nombre: 'Ciencias Naturales' }), { status: 409, code: 'DUPLICADO' });
  assert.throws(() => departamentos.crear(db, { nombre: '' }), { status: 400 });
  const hum = departamentos.crear(db, { nombre: 'Humanidades' });
  assert.equal(departamentos.renombrar(db, hum.id, { nombre: 'Humanidades y Artes' }).nombre, 'Humanidades y Artes');

  edicion.actualizar(db, ids.maria, { departamentoId: cn.id });
  const d = docentes.detalle ? docentes.detalle(db, ids.maria) : docentes.obtener(db, ids.maria);
  assert.deepEqual([d.departamento, d.departamentoId], ['Ciencias Naturales', cn.id]);
  assert.throws(() => edicion.actualizar(db, ids.maria, { departamentoId: 9999 }), { status: 400 });

  assert.deepEqual(departamentos.listar(db).map((x) => [x.nombre, x.docentes]), [['Ciencias Naturales', 1], ['Humanidades y Artes', 0]]);
  assert.throws(() => departamentos.eliminar(db, cn.id), { status: 409, code: 'EN_USO' });
  departamentos.eliminar(db, hum.id);
  assert.equal(departamentos.listar(db).length, 1);
});
