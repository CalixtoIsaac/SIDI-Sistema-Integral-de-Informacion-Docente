const test = require('node:test');
const assert = require('node:assert/strict');
const faltas = require('../services/faltasService');
const asignaturas = require('../services/asignaturasService');
const { crearEscenario } = require('./helpers/escenario');

// Escenario (AGO-DIC 2026): María 16001 (Lu-Ju, 3 h ES $54) y 16002 (Lu–Vi, 5 h EN $106), ambos con contrato 5500001;
// Guillermo 16452 (Mi, dos sesiones, 3 h ES, sin contrato); Ana 16434 (Ma-Ju, 3 h EN $65, sin contrato);
// Pedro 16500 (Vi, VSPP Fútbol, 1.5 h ES $26, sin contrato).
const LUNES = '2026-08-17';
const MIERCOLES = '2026-08-19';
const VIERNES = '2026-08-21';
const BASE = { motivo: 'Falta por asunto personal' };

function quincena(db, cerrada = 0) {
  return Number(db.prepare(`INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago, cerrada)
                            VALUES (2026, 16, '2026-08-16', '2026-08-31', '2026-08-30', ?)`).run(cerrada).lastInsertRowid);
}

test('preview: propone los CRN que el docente tiene ese día, con monto y comentario; no guarda', () => {
  const { db, ids } = crearEscenario();
  const lunes = faltas.preview(db, { ...BASE, docenteId: ids.maria, fechas: [LUNES] });
  assert.equal(lunes.propuestas, true);
  assert.deepEqual(lunes.filas.map((f) => [f.crn, f.montoDescuento, f.comentario]), [
    ['16001', 54, 'CRN 16001 de 3 horas a la semana, a descontar 54.00 = 54.00'],
    ['16002', 106, 'CRN 16002 de 5 horas a la semana, a descontar 106.00 = 106.00'],
  ]);
  assert.deepEqual(lunes.totales, { filas: 2, descuento: 160 });
  assert.equal(lunes.filas[0].situacion, 'Se hace descuento correspondiente por permiso personal sin justificación.');
  // El miércoles María solo tiene 16002
  assert.deepEqual(faltas.preview(db, { ...BASE, docenteId: ids.maria, fechas: [MIERCOLES] }).filas.map((f) => f.crn), ['16002']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM faltas').get().n, 0);
});

test('crear: una fila por CRN y día, pendiente de reportar; repetida → 409', () => {
  const { db, ids } = crearEscenario();
  const r = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: [LUNES, MIERCOLES] });
  assert.equal(r.faltas.length, 3);
  assert.deepEqual(r.totales, { filas: 3, descuento: 266 });
  const f = r.faltas[0];
  assert.deepEqual([f.pendiente, f.quincena, f.dias, f.sesion, f.cuentaCargo, f.horasTexto], [true, null, 1, 1, '5420103000', '8 horas= 1 día completo']);
  assert.throws(() => faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: [LUNES] }), { status: 409, code: 'FALTA_REPETIDA' });
});

test('justificación IMSS: exige folio y el descuento es 0 (con sus textos de Detalle)', () => {
  const { db, ids } = crearEscenario();
  const imss = { ...BASE, docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [], justificacion: 'incapacidad_imss' };
  const asig = db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  assert.throws(() => faltas.crear(db, { ...imss, asignaturaIds: [asig] }), (e) => e.status === 400 && e.details[0].campo === 'folioImss');
  const r = faltas.crear(db, { ...imss, asignaturaIds: [asig], folioImss: 'UW465897' });
  assert.deepEqual([r.faltas[0].montoDescuento, r.faltas[0].tarifaAplicada, r.faltas[0].folioImss], [0, 54, 'UW465897']);
  assert.equal(r.faltas[0].situacion, 'No se hace descuento correspondiente por incapacidad del IMSS');
  assert.equal(r.faltas[0].estatus, 'No se descuenta y no se toma la falta correspondiente.');
});

test('pide el contrato del CRN si falta y lo guarda en la asignatura', () => {
  const { db, ids } = crearEscenario();
  const asig = db.prepare("SELECT id FROM asignaturas WHERE crn = '16434'").get().id;
  const cuerpo = { ...BASE, docenteId: ids.ana, fechas: ['2026-08-18'] }; // martes
  assert.deepEqual(faltas.preview(db, cuerpo).sinContrato.map((x) => x.crn), ['16434']);
  assert.throws(() => faltas.crear(db, cuerpo), (e) => e.status === 400 && e.code === 'SIN_CONTRATO' && e.details[0].crn === '16434');
  assert.throws(() => faltas.crear(db, { ...cuerpo, contratos: { [asig]: '55-01' } }), { status: 400 });
  faltas.crear(db, { ...cuerpo, contratos: { [asig]: '5500003' } });
  assert.equal(db.prepare('SELECT num_contrato FROM asignaturas WHERE id = ?').get(asig).num_contrato, '5500003');
});

test('monto editable (queda marcado) y CRN sin tarifa exige monto', () => {
  const { db, ids } = crearEscenario();
  const a16001 = db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  const r = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [a16001], montos: { [a16001]: 50 } });
  assert.deepEqual([r.faltas[0].montoDescuento, r.faltas[0].montoEditado, r.faltas[0].tarifaAplicada], [50, true, 54]);
  assert.equal(r.faltas[0].comentario, 'CRN 16001 de 3 horas a la semana, a descontar 50.00 = 50.00');

  const ruta = asignaturas.crear(db, ids.maria, { nombreActividad: 'Ruta exploratoria', horarios: [{ dia: 1, inicio: '12:00', fin: '12:59' }], horasSemana: 2 });
  const cuerpo = { ...BASE, docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [ruta.id] };
  assert.throws(() => faltas.crear(db, cuerpo), { status: 400, code: 'SIN_TARIFA' });
  const conMonto = faltas.crear(db, { ...cuerpo, montos: { [ruta.id]: 90 } });
  assert.equal(conMonto.faltas[0].comentario, 'Ruta exploratoria de 2 horas a la semana, a descontar 90.00 = 90.00');
});

test('2ª sesión del mismo CRN y día: caso especial con confirmación', () => {
  const { db, ids } = crearEscenario();
  const a = db.prepare("SELECT id FROM asignaturas WHERE crn = '16452'").get().id;
  const cuerpo = { ...BASE, docenteId: ids.guillermo, fechas: [MIERCOLES], asignaturaIds: [a], contratos: { [a]: '5500002' }, segundasSesiones: [{ asignaturaId: a, fecha: MIERCOLES }] };
  const p = faltas.preview(db, cuerpo);
  assert.deepEqual(p.filas.map((f) => [f.sesion, f.sesionesEseDia, f.montoDescuento]), [[1, 2, 54], [2, 2, 54]]);
  assert.throws(() => faltas.crear(db, cuerpo), { status: 409, code: 'CONFIRMAR_SEGUNDA_SESION' });
  const r = faltas.crear(db, { ...cuerpo, confirmarSegundaSesion: true });
  assert.deepEqual(r.faltas.map((f) => f.sesion), [1, 2]);
});

test('materias VSPP usan la cuenta 5422101001', () => {
  const { db, ids } = crearEscenario();
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;
  const a = db.prepare("SELECT id FROM asignaturas WHERE crn = '16500'").get().id;
  const r = faltas.crear(db, { ...BASE, docenteId: pedro, fechas: [VIERNES], contratos: { [a]: '5500005' } });
  assert.deepEqual([r.faltas[0].cuentaCargo, r.faltas[0].montoDescuento], ['5422101001', 26]);
  assert.ok(ids.maria);
});

test('descuento manual: rango en texto, días, horas y monto capturados', () => {
  const { db, ids } = crearEscenario();
  const cuerpo = { modo: 'manual', docenteId: ids.ana, motivo: 'Falta injustificadas', fechaTexto: '03/08/2026 al 16/08/2026', dias: 14, horasTexto: '6 horas= 14 días', monto: 3183.74 };
  const r = faltas.crear(db, cuerpo);
  const f = r.faltas[0];
  assert.deepEqual([f.modo, f.fecha, f.fechaTexto, f.dias, f.montoDescuento, f.montoEditado, f.horasTexto],
    ['manual', null, '03/08/2026 al 16/08/2026', 14, 3183.74, true, '6 horas= 14 días']);
  assert.equal(f.comentario, '6 horas= 14 días, a descontar 3183.74 = 3183.74');
  assert.throws(() => faltas.crear(db, { ...cuerpo, monto: undefined, dias: 0 }), (e) => e.details.map((x) => x.campo).sort().join() === 'dias,monto');
});

test('editar: recalcula con la tarifa del momento de la falta, restaura monto y respeta quincena cerrada', () => {
  const { db, ids } = crearEscenario();
  const a = db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  const [f] = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [a] }).faltas;
  db.prepare('UPDATE tipos_clase SET pago_por_dia = 60 WHERE horas_semana = 3 AND idioma = ?').run('ES'); // cambia la tarifa después

  let e = faltas.actualizar(db, f.id, { monto: 40 });
  assert.deepEqual([e.montoDescuento, e.montoEditado], [40, true]);
  e = faltas.actualizar(db, f.id, { justificacion: 'cita_imss', folioImss: 'AB123' });
  assert.deepEqual([e.montoDescuento, e.justificacion, e.estatus], [0, 'cita_imss', 'No se descuenta y no se toma la falta/permiso con goce correspondiente.']);
  e = faltas.actualizar(db, f.id, { justificacion: 'ninguna', restaurarMonto: true });
  assert.deepEqual([e.montoDescuento, e.montoEditado, e.folioImss], [54, false, null]); // 54, no 60
  assert.throws(() => faltas.actualizar(db, f.id, { justificacion: 'incapacidad_imss' }), { status: 400 });

  db.prepare('UPDATE faltas SET quincena_id = ? WHERE id = ?').run(quincena(db, 1), f.id);
  assert.throws(() => faltas.actualizar(db, f.id, { monto: 1 }), { status: 423, code: 'QUINCENA_CERRADA' });
  assert.throws(() => faltas.eliminar(db, f.id), { status: 423 });
});

test('listar con filtros y eliminar', () => {
  const { db, ids } = crearEscenario();
  const r = faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: [LUNES] });
  faltas.crear(db, { modo: 'manual', docenteId: ids.ana, motivo: 'Suspensión', fechaTexto: 'Semana 1', dias: 5, horasTexto: '5 días', monto: 100 });
  const q = quincena(db);
  db.prepare('UPDATE faltas SET quincena_id = ? WHERE id = ?').run(q, r.faltas[0].id);

  assert.equal(faltas.listar(db).faltas.length, 3);
  assert.equal(faltas.listar(db, { pendientes: 'true' }).faltas.length, 2);
  assert.deepEqual(faltas.listar(db, { quincenaId: String(q) }).faltas.map((f) => f.quincena.etiqueta), ['Q16']);
  assert.equal(faltas.listar(db, { docenteId: String(ids.ana) }).totales.descuento, 100);
  const periodo = db.prepare("SELECT id FROM periodos WHERE clave = 'AGO-DIC 2026'").get().id;
  assert.equal(faltas.listar(db, { periodoId: String(periodo) }).faltas.length, 2); // las de CRN del periodo
  assert.throws(() => faltas.listar(db, { docenteId: 'x' }), { status: 400 });

  faltas.eliminar(db, r.faltas[1].id);
  assert.throws(() => faltas.obtener(db, r.faltas[1].id), { status: 404 });
});

test('monto editado por día: la clave "asignaturaId|fecha" (o con sesión) gana sobre la del CRN', () => {
  const { db, ids } = crearEscenario();
  const a = db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id;
  const cuerpo = { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17', '2026-08-20'], asignaturaIds: [a] };
  assert.deepEqual(faltas.preview(db, cuerpo).filas.map((f) => f.clave), [`${a}|2026-08-17|1`, `${a}|2026-08-20|1`]);
  const r = faltas.crear(db, { ...cuerpo, montos: { [a]: 50, [`${a}|2026-08-20|1`]: 27 } });
  assert.deepEqual(r.faltas.map((f) => [f.fecha, f.montoDescuento, f.montoEditado]), [['2026-08-17', 50, true], ['2026-08-20', 27, true]]);
  const soloUnDia = faltas.preview(db, { ...cuerpo, fechas: ['2026-08-24', '2026-08-27'], montos: { [`${a}|2026-08-27`]: 30 } });
  assert.deepEqual(soloUnDia.filas.map((f) => [f.montoDescuento, f.montoEditado]), [[54, false], [30, true]]);
});

// ------------------------------------------------- retro de la sesión con la cliente (26/11/2026)

test('motivo: No justificada / Justificada sale de la justificación; siempre 8 horas', () => {
  const { db, ids } = crearEscenario();
  const [no] = faltas.crear(db, { docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [db.prepare("SELECT id FROM asignaturas WHERE crn = '16001'").get().id] }).faltas;
  assert.deepEqual([no.motivo, no.justificacion, no.horasTexto, no.montoDescuento], ['Falta por asunto personal', 'ninguna', '8 horas= 1 día completo', 54]);
  const [si] = faltas.crear(db, { docenteId: ids.maria, fechas: [MIERCOLES], justificacion: 'incapacidad_imss', folioImss: 'UW1' }).faltas;
  assert.deepEqual([si.motivo, si.montoDescuento], ['Falta justificada', 0]);
  // Ya no hay medio día
  assert.throws(() => faltas.crear(db, { docenteId: ids.maria, fechas: [VIERNES], horasTexto: '4 horas= 1/2 día' }),
    (e) => e.status === 400 && e.details.some((x) => x.campo === 'horasTexto'));
});

test('viaje escolar: es justificada, no pide folio, no se descuenta y lleva sus textos de Detalle', () => {
  const { db, ids } = crearEscenario();
  const r = faltas.crear(db, { docenteId: ids.maria, fechas: [LUNES], justificacion: 'viaje_escolar', folioImss: 'NO-SE-GUARDA' });
  assert.ok(r.faltas.length > 0);
  for (const f of r.faltas) {
    assert.deepEqual([f.justificacion, f.motivo, f.folioImss, f.montoDescuento], ['viaje_escolar', 'Falta justificada', null, 0]);
  }
  const fila = db.prepare('SELECT situacion, estatus FROM faltas WHERE id = ?').get(r.faltas[0].id);
  assert.deepEqual(fila, { situacion: 'No se hace descuento correspondiente por viaje escolar',
    estatus: 'No se descuenta y no se toma la falta correspondiente (viaje escolar).' });
});

test('editar: pasar de No justificada a Justificada (y al revés) ajusta motivo, folio y descuento', () => {
  const { db, ids } = crearEscenario();
  const [f] = faltas.crear(db, { docenteId: ids.maria, fechas: [LUNES] }).faltas;
  assert.throws(() => faltas.actualizar(db, f.id, { justificacion: 'cita_imss' }), (e) => e.status === 400);   // IMSS sin folio
  const viaje = faltas.actualizar(db, f.id, { justificacion: 'viaje_escolar' });
  assert.deepEqual([viaje.motivo, viaje.montoDescuento, viaje.folioImss], ['Falta justificada', 0, null]);
  const otraVez = faltas.actualizar(db, f.id, { justificacion: 'ninguna' });
  assert.deepEqual([otraVez.motivo, otraVez.montoDescuento], ['Falta por asunto personal', f.montoDescuento]);
});
