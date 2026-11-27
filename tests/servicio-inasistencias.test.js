const test = require('node:test');
const assert = require('node:assert/strict');
const faltas = require('../services/faltasService');
const { resumenSemestral } = require('../services/inasistenciasService');
const { crearEscenario } = require('./helpers/escenario');

const BASE = { motivo: 'Falta por asunto personal' };

/**
 * AGO-DIC 2026: María falta el 17 (16001 y 16002) y el 20 (16001); Ana tiene incapacidad IMSS el 18
 * y la cubre Guillermo; Pedro tiene un descuento manual de 14 días (falta injustificada, sin CRN).
 * ENE-MAY 2026: una falta de María (no debe contar en AGO-DIC).
 */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  const asig = (crn, periodo = 1) => db.prepare('SELECT id FROM asignaturas WHERE crn = ? AND periodo_id = ?').get(crn, periodo).id;
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;
  db.prepare("UPDATE asignaturas SET num_contrato = '5500003' WHERE docente_id = ?").run(ids.ana);
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [asig('16001'), asig('16002')] });
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-20'], asignaturaIds: [asig('16001')] });
  faltas.crear(db, { ...BASE, docenteId: ids.ana, fechas: ['2026-08-18'], asignaturaIds: [asig('16434')], justificacion: 'incapacidad_imss', folioImss: 'UW1',
    suplencias: [{ asignaturaId: asig('16434'), fecha: '2026-08-18', docenteSuplenteId: ids.guillermo }] });
  faltas.crear(db, { docenteId: pedro, modo: 'manual', motivo: 'Falta injustificadas', fechaTexto: '03/08/2026 al 16/08/2026', dias: 14, horasTexto: '6 horas= 14 días', monto: 500 });
  const enero = db.prepare("SELECT id FROM asignaturas WHERE docente_id = ? AND periodo_id = 2").get(ids.maria).id;
  db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, motivo, monto_descuento) VALUES (?, ?, '2026-03-02', 'Falta por asunto personal', 54)`).run(ids.maria, enero);
  return { ...e, pedro };
}

test('indicadores del semestre actual: faltas, días, profesores, descontado y pagado a suplentes', () => {
  const { db } = escenario();
  const r = resumenSemestral(db);
  assert.deepEqual(r.periodo, { id: 1, clave: 'AGO-DIC 2026' });
  assert.deepEqual(r.indicadores, { faltas: 5, diasFaltados: 17, profesores: 3, montoDescontado: 714, pagadoSuplentes: 65, cubiertas: 1 });
});

test('desglose por motivo, por justificación y por tipo de resumen (3 tipos)', () => {
  const { db } = escenario();
  const r = resumenSemestral(db);
  assert.deepEqual(r.porMotivo, [
    { motivo: 'Falta por asunto personal', faltas: 4, profesores: 2, montoDescontado: 214 },
    { motivo: 'Falta injustificadas', faltas: 1, profesores: 1, montoDescontado: 500 },
  ]);
  assert.deepEqual(r.porJustificacion.map((j) => [j.justificacion, j.faltas, j.profesores, j.montoDescontado]),
    [['ninguna', 4, 2, 714], ['incapacidad_imss', 1, 1, 0], ['cita_imss', 0, 0, 0], ['viaje_escolar', 0, 0, 0]]);
  assert.deepEqual(r.porTipo, [
    { tipo: 'Asunto personal', faltas: 4, profesores: 2, montoDescontado: 714 },
    { tipo: 'Incapacidad médica', faltas: 1, profesores: 1, montoDescontado: 0 },
    { tipo: 'Viaje escolar', faltas: 0, profesores: 0, montoDescontado: 0 },
  ]);
});

test('por docente: quién faltó, cuántas veces y por qué (más faltas primero)', () => {
  const { db, ids, pedro } = escenario();
  assert.deepEqual(resumenSemestral(db).porDocente.map((x) => [x.docenteId, x.faltas, x.diasFaltados, x.montoDescontado, x.motivos]), [
    [ids.maria, 3, 2, 214, ['Falta por asunto personal']],
    [ids.ana, 1, 1, 0, ['Falta por asunto personal']],
    [pedro, 1, 14, 500, ['Falta injustificadas']],
  ]);
});

test('otro semestre por periodoId; semestre sin faltas da ceros y los tres tipos; 404 si no existe', () => {
  const { db } = escenario();
  assert.deepEqual(resumenSemestral(db, { periodoId: '2' }).indicadores, { faltas: 1, diasFaltados: 1, profesores: 1, montoDescontado: 54, pagadoSuplentes: 0, cubiertas: 0 });
  const vacio = crearEscenario();
  const r = resumenSemestral(vacio.db);
  assert.deepEqual(r.indicadores, { faltas: 0, diasFaltados: 0, profesores: 0, montoDescontado: 0, pagadoSuplentes: 0, cubiertas: 0 });
  assert.deepEqual(r.porTipo.map((t) => [t.tipo, t.faltas]), [['Asunto personal', 0], ['Incapacidad médica', 0], ['Viaje escolar', 0]]);
  assert.throws(() => resumenSemestral(db, { periodoId: 99 }), (e) => e.status === 404);
});
