const test = require('node:test');
const assert = require('node:assert/strict');
const catalogos = require('../services/catalogosService');
const docentesService = require('../services/docentesService');
const { crearEscenario } = require('./helpers/escenario');

test('tipos de clase: lista con tarifa mensual calculada', () => {
  const { db } = crearEscenario();
  const lista = catalogos.tiposClase(db);
  assert.equal(lista.length, 8);
  const t = lista.find((x) => x.horasSemana === 3 && x.idioma === 'ES');
  assert.deepEqual([t.pagoSemestre, t.pagoPorDia, t.pagoMensual, t.activo], [7056, 54, 1764, true]);
  assert.equal(t.asignaturas, 2); // 16001 y 16452
});

test('editar tarifa: cambia la ficha pero NO las faltas ya registradas', () => {
  const { db, ids } = crearEscenario();
  const t = catalogos.tiposClase(db).find((x) => x.horasSemana === 3 && x.idioma === 'ES');
  const asig = db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, motivo, tarifa_aplicada, monto_descuento)
              VALUES (?, ?, '2026-09-01', 'Falta por asunto personal', 54, 54)`).run(ids.maria, asig);

  const r = catalogos.actualizarTipoClase(db, t.id, { pagoSemestre: 7200, pagoPorDia: 55.5 });
  assert.deepEqual([r.pagoSemestre, r.pagoPorDia, r.pagoMensual], [7200, 55.5, 1800]);
  const ficha = docentesService.detalle(db, ids.maria).asignaturas.find((a) => a.crn === '16001');
  assert.deepEqual([ficha.tarifaDiaria, ficha.tarifaMensual], [55.5, 1800]);
  assert.deepEqual(db.prepare('SELECT tarifa_aplicada, monto_descuento FROM faltas').get(), { tarifa_aplicada: 54, monto_descuento: 54 });
});

test('editar tarifa: validaciones', () => {
  const { db } = crearEscenario();
  assert.throws(() => catalogos.actualizarTipoClase(db, 1, { pagoPorDia: -1 }), { status: 400 });
  assert.throws(() => catalogos.actualizarTipoClase(db, 1, { pagoMensual: 100 }), { status: 400, code: 'SOLO_LECTURA' });
  assert.throws(() => catalogos.actualizarTipoClase(db, 1, { nombre: 'Clase de 3 hrs en español' }), { status: 409 });
  assert.throws(() => catalogos.actualizarTipoClase(db, 999, {}), { status: 404 });
});

test('catálogos: listar por tipo, crear, editar, duplicado y baja lógica', () => {
  const { db } = crearEscenario();
  assert.equal(catalogos.listar(db, { tipo: 'nivel_estudios' }).length, 4);
  assert.throws(() => catalogos.listar(db, { tipo: 'colores' }), { status: 400 });

  const c = catalogos.crear(db, { tipo: 'campo_formacion', valor: 'Artes', orden: 9 });
  assert.deepEqual([c.tipo, c.valor, c.activo], ['campo_formacion', 'Artes', true]);
  assert.throws(() => catalogos.crear(db, { tipo: 'campo_formacion', valor: 'Artes' }), { status: 409 });
  assert.throws(() => catalogos.crear(db, { tipo: 'otro', valor: 'x' }), { status: 400 });

  assert.equal(catalogos.actualizar(db, c.id, { valor: 'Artes y Diseño' }).valor, 'Artes y Diseño');
  assert.throws(() => catalogos.actualizar(db, c.id, { tipo: 'motivo_baja' }), { status: 400 });

  catalogos.desactivar(db, c.id);
  assert.equal(catalogos.listar(db, { tipo: 'campo_formacion' }).some((x) => x.id === c.id), false);
  assert.equal(catalogos.listar(db, { tipo: 'campo_formacion', incluirInactivos: 'true' }).some((x) => x.id === c.id), true);
  assert.throws(() => catalogos.desactivar(db, 9999), { status: 404 });
});
