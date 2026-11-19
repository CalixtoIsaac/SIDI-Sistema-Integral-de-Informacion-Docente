const test = require('node:test');
const assert = require('node:assert/strict');
const analitica = require('../services/analiticaService');
const faltas = require('../services/faltasService');
const { sembrar } = require('../lib/semillas');
const { crearEscenario } = require('./helpers/escenario');

const HOY = new Date(2026, 10, 18); // 18/11/2026 (Q22)

function escenario() {
  const e = crearEscenario();
  sembrar(e.db);
  return e;
}

test('kpis: docentes, quincena (faltas, descontado y pagado a suplentes), semestre y OPINA del último semestre con datos', () => {
  const { db, ids } = escenario();
  db.prepare("UPDATE asignaturas SET num_contrato = '5500003' WHERE docente_id = ?").run(ids.ana);
  const asig = (crn) => db.prepare('SELECT id FROM asignaturas WHERE crn = ? AND periodo_id = 1').get(crn).id;
  faltas.crear(db, { motivo: 'Falta por asunto personal', docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [asig('16001'), asig('16002')] });
  faltas.crear(db, { motivo: 'Falta por asunto personal', docenteId: ids.ana, fechas: ['2026-08-18'], asignaturaIds: [asig('16434')], justificacion: 'incapacidad_imss', folioImss: 'X1',
    suplencias: [{ asignaturaId: asig('16434'), fecha: '2026-08-18', docenteSuplenteId: ids.guillermo }] });
  db.prepare('UPDATE docentes SET activo = 0 WHERE id = ?').run(ids.guillermo);
  const q16 = db.prepare('SELECT id FROM quincenas WHERE anio = 2026 AND numero = 16').get().id;

  const k = analitica.kpis(db, { quincenaId: q16 }, HOY);
  assert.deepEqual(k.periodo, { id: 1, clave: 'AGO-DIC 2026' });
  assert.deepEqual(k.docentes, { activos: 3, inactivos: 1, total: 4, conClaseEnSemestre: 3 });
  assert.deepEqual([k.quincena.numero, k.quincena.faltas, k.quincena.descontado, k.quincena.pagadoSuplentes], [16, 3, 160, 65]);
  assert.deepEqual(k.faltasSemestre, { faltas: 3, profesores: 2, descontado: 160, pagadoSuplentes: 65 });
  assert.deepEqual(k.opina, { periodo: { id: 2, clave: 'ENE-MAY 2026' }, promedioMaestros: 91.7, docentes: 1 });
  assert.equal(analitica.kpis(db, {}, HOY).quincena.numero, 22); // sin quincenaId: la de hoy
});

test('opina: % por maestro, los de muestra insuficiente al final y marcados', () => {
  const { db, ids } = escenario();
  const r = analitica.opina(db, {});
  assert.deepEqual(r.periodo, { id: 2, clave: 'ENE-MAY 2026' });
  assert.deepEqual([r.promedioMaestros, r.calificacionCampus, r.muestraMinima], [91.7, 86.7, 10]);
  assert.deepEqual(r.docentes.map((d) => [d.docenteId, d.porcentaje, d.respuestas, d.muestraSuficiente]), [[ids.maria, 91.7, 12, true], [ids.guillermo, 66.7, 3, false]]);
  assert.deepEqual(analitica.opina(db, { periodoId: 1 }).docentes, []); // semestre en curso sin OPINA
  assert.equal(r.docentes.some((d) => 'comentario' in d), false);
});

test('distribución por nivel que imparten (General / Bilingüe) del semestre actual', () => {
  const { db } = escenario();
  const r = analitica.distribucionNivel(db, {});
  assert.deepEqual(r.niveles, [
    { nivel: 'Bachillerato General', docentes: 3, grupos: 4 },
    { nivel: 'Bachillerato General Bilingüe', docentes: 1, grupos: 1 },
  ]);
  assert.deepEqual([r.ambos, r.totalDocentes], [0, 4]);
});

test('perfil de docentes: género, nivel de estudios, campo de formación y rangos de antigüedad', () => {
  const { db } = escenario();
  const r = analitica.perfilDocentes(db, {}, HOY);
  assert.equal(r.total, 4);
  assert.deepEqual(r.genero, [{ genero: 'M', docentes: 0 }, { genero: 'F', docentes: 1 }, { genero: 'ninguno', docentes: 3 }]);
  assert.equal(r.nivelEstudios.find((n) => n.nivelEstudios === 'Licenciatura').docentes, 1);
  assert.deepEqual(r.campoFormacion.filter((c) => c.docentes), [{ campo: 'Ingeniería y Tecnología', docentes: 1 }, { campo: 'ninguno', docentes: 3 }]);
  // María desde AGO-DIC 2022 → 4 años; los demás empezaron en 2026
  assert.deepEqual(r.antiguedad.map((a) => [a.rango, a.docentes]),
    [['Menos de 1 año', 3], ['1 a 2 años', 0], ['3 a 5 años', 1], ['6 a 10 años', 0], ['Más de 10 años', 0]]);
  assert.equal(analitica.perfilDocentes(db, { activo: 'false' }, HOY).total, 0);
  assert.throws(() => analitica.perfilDocentes(db, { activo: 'quizas' }), (e) => e.status === 400);
});

test('faltas por motivo del semestre (con los 2 tipos de G9 aunque no haya faltas)', () => {
  const { db } = escenario();
  const r = analitica.faltasPorMotivo(db, {});
  assert.deepEqual([r.total, r.porMotivo, r.porTipo.map((t) => t.tipo)], [0, [], ['Asunto personal', 'Incapacidad médica']]);
});

test('cumpleaños del mes: solo activos, por día, con edad que cumplen y si es hoy', () => {
  const { db, ids } = escenario();
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;
  const nac = db.prepare('UPDATE docentes SET fecha_nacimiento = ?, activo = ? WHERE id = ?');
  nac.run('1990-11-18', 1, ids.ana);
  nac.run('1985-11-03', 1, ids.guillermo);
  nac.run('1980-11-10', 0, pedro);
  const r = analitica.cumpleanosMes(db, {}, HOY);
  assert.equal(r.mes, 11);
  assert.deepEqual(r.docentes.map((d) => [d.docenteId, d.dia, d.cumple, d.esHoy, d.yaPaso]), [[ids.guillermo, 3, 41, false, true], [ids.ana, 18, 36, true, false]]);
  assert.deepEqual(analitica.cumpleanosMes(db, { mes: '2' }, HOY).docentes.map((d) => d.docenteId), [ids.maria]);
  assert.throws(() => analitica.cumpleanosMes(db, { mes: 13 }), (e) => e.status === 400);
});
