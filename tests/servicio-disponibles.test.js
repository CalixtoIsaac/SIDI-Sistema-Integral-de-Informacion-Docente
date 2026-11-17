const test = require('node:test');
const assert = require('node:assert/strict');
const { disponibles } = require('../services/disponiblesService');
const { crearEscenario } = require('./helpers/escenario');
const { seEmpalman, diaSemana } = require('../lib/horario');

const LUNES = '2026-08-17';

/**
 * Además de María (titular), Guillermo, Ana y Pedro del escenario:
 *   Jorge  · Matemáticas I (misma clave que 16001) el martes        → ★ sin clase ese día
 *   Laura  · Math III (misma clave que 16002) lunes 08:00–09:29     → empalma con 16001, ★ en 16002
 *   Tomás  · Historia lunes 09:00–09:59                             → da clase ese día; 09:00 no empalma con 08:59
 *   Rosa   · sin clases, no recontratable                           → al final con ⚠
 *   Beto   · inactivo                                               → nunca aparece
 * Pedro tiene falta ese lunes (no aparece) y Guillermo ya hizo una suplencia en el periodo.
 */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  const periodo = db.prepare("SELECT id FROM periodos WHERE clave = 'AGO-DIC 2026'").get().id;
  const docente = db.prepare(`INSERT INTO docentes (nomina, nombres, apellido_paterno, apellido_materno, activo, recontratable)
                              VALUES (?, ?, ?, ?, ?, ?)`);
  const asig = db.prepare(`INSERT INTO asignaturas (periodo_id, docente_id, crn, clave_materia, materia, numero_grupo)
                           VALUES (?, ?, ?, ?, ?, ?)`);
  const hor = db.prepare('INSERT INTO horarios (asignatura_id, dia_semana, hora_inicio, hora_fin) VALUES (?, ?, ?, ?)');
  const nuevo = (nomina, nombres, ap, am, { activo = 1, recontratable = null, clase } = {}) => {
    const id = Number(docente.run(nomina, nombres, ap, am, activo, recontratable).lastInsertRowid);
    if (clase) {
      const a = Number(asig.run(periodo, id, clase.crn, clase.clave, clase.materia, '613').lastInsertRowid);
      hor.run(a, clase.dia, clase.inicio, clase.fin);
    }
    return id;
  };
  const x = {
    jorge: nuevo('L03500020', 'Jorge', 'Aguilar', 'Mora', { clase: { crn: '16710', clave: 'BSMA2001', materia: 'Matemáticas I', dia: 2, inicio: '07:30', fin: '08:59' } }),
    laura: nuevo('L03500021', 'Laura', 'Méndez', 'Ríos', { clase: { crn: '16711', clave: 'BSMA2003', materia: 'Math III', dia: 1, inicio: '08:00', fin: '09:29' } }),
    tomas: nuevo('L03500022', 'Tomás', 'Herrera', 'Gil', { clase: { crn: '16712', clave: 'BSHU1001', materia: 'Historia', dia: 1, inicio: '09:00', fin: '09:59' } }),
    rosa: nuevo('L03500023', 'Rosa', 'Zamora', 'Paz', { recontratable: 0 }),
    beto: nuevo('L03500024', 'Beto', 'Cano', 'Luna', { activo: 0 }),
  };
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;
  const crn = (c) => db.prepare('SELECT id FROM asignaturas WHERE crn = ? AND periodo_id = ?').get(c, periodo).id;
  const falta = db.prepare(`INSERT INTO faltas (docente_id, asignatura_id, fecha, sesion, motivo, horas_texto, cuenta_cargo, monto_descuento, justificacion)
                            VALUES (?, ?, ?, 1, 'Falta por asunto personal', '8 horas= 1 día completo', '5420103000', 54, 'ninguna')`);
  falta.run(pedro, crn('16500'), LUNES);
  const deAna = Number(falta.run(ids.ana, crn('16434'), '2026-08-18').lastInsertRowid);
  db.prepare('INSERT INTO suplencias (falta_id, docente_suplente_id, monto) VALUES (?, ?, 54)').run(deAna, ids.guillermo);
  return { ...e, ids: { ...ids, ...x, pedro }, crn, falta };
}

const nombres = (g) => g.disponibles.map((x) => x.nombre.split(' ')[0]);

test('grupos a suplir del lunes (sin elegir CRN) con su horario', () => {
  const { db, ids } = escenario();
  const r = disponibles(db, { docenteId: ids.maria, fechas: [LUNES] });
  assert.deepEqual(r.gruposASuplir.map((g) => [g.crn, g.materia, g.grupo, g.dia, g.sesion, g.inicio, g.fin]), [
    ['16001', 'Matemáticas I', '611', 'Lunes', 1, '07:30', '08:59'],
    ['16002', 'Math III', '612', 'Lunes', 1, '10:00', '10:59'],
  ]);
  assert.deepEqual(r.avisos, []);
});

test('disponibles: activos, sin empalme ni falta ese día; orden ★ → da clase ese día → menos suplencias → ⚠ al final', () => {
  const { db, ids } = escenario();
  const [g1, g2] = disponibles(db, { docenteId: ids.maria, fechas: [LUNES] }).gruposASuplir;
  // 16001 (07:30–08:59): Laura se empalma (08:00); Tomás entra a las 09:00 y sí puede
  assert.deepEqual(nombres(g1), ['Jorge', 'Tomás', 'Ana', 'Guillermo', 'Rosa']);
  assert.deepEqual([g1.totalDisponibles, g1.conEmpalme], [5, 1]);
  const [jorge, tomas, , guillermo, rosa] = g1.disponibles;
  assert.deepEqual([jorge.mismaMateria, jorge.daClaseEseDia], [true, false]);
  assert.deepEqual([tomas.mismaMateria, tomas.daClaseEseDia], [false, true]);
  assert.equal(guillermo.suplenciasPeriodo, 1);
  assert.deepEqual([rosa.recontratable, rosa.avisos], [0, ['NO_RECONTRATABLE']]);
  assert.equal(g1.disponibles.some((x) => [ids.maria, ids.pedro, ids.beto, ids.laura].includes(x.docenteId)), false);
  // 16002 (10:00–10:59): Laura ★ y da clase ese día
  assert.deepEqual(nombres(g2), ['Laura', 'Tomás', 'Ana', 'Jorge', 'Guillermo', 'Rosa']);
  assert.equal(g2.conEmpalme, 0);
});

test('verTodos: también los que tienen empalme, al final y con la clase que choca', () => {
  const { db, ids, crn } = escenario();
  const [g1] = disponibles(db, { docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [crn('16001')], verTodos: true }).gruposASuplir;
  assert.deepEqual(nombres(g1), ['Jorge', 'Tomás', 'Ana', 'Guillermo', 'Rosa', 'Laura']);
  const laura = g1.disponibles.at(-1);
  assert.equal(laura.empalme, true);
  assert.deepEqual(laura.empalmes, [{ crn: '16711', materia: 'Math III', inicio: '08:00', fin: '09:29', motivo: 'clase' }]);
  assert.equal(g1.totalDisponibles, 5);
});

test('quien ya cubre otro grupo a esa hora ese día cuenta como empalme', () => {
  const { db, ids, crn, falta } = escenario();
  // Laura falta el lunes (08:00–09:29) y la cubre Ana → Ana ya no puede a las 07:30–08:59
  const f = Number(falta.run(ids.laura, crn('16711'), LUNES).lastInsertRowid);
  db.prepare('INSERT INTO suplencias (falta_id, docente_suplente_id, monto) VALUES (?, ?, 54)').run(f, ids.ana);
  const [g1] = disponibles(db, { docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [crn('16001')], verTodos: true }).gruposASuplir;
  assert.deepEqual(nombres(g1), ['Jorge', 'Tomás', 'Guillermo', 'Rosa', 'Ana']); // Laura tiene falta ese día: no aparece
  assert.deepEqual(g1.disponibles.at(-1).empalmes, [{ crn: '16711', materia: 'Math III', inicio: '08:00', fin: '09:29', motivo: 'suplencia' }]);
});

test('CRN con dos sesiones el mismo día → dos grupos a suplir; CRN sin clase ese día → aviso', () => {
  const { db, ids, crn } = escenario();
  const r = disponibles(db, { docenteId: ids.guillermo, fechas: ['2026-08-19', '2026-08-20'], asignaturaIds: [crn('16452')] });
  assert.deepEqual(r.gruposASuplir.map((g) => [g.fecha, g.sesion, g.inicio, g.fin]), [['2026-08-19', 1, '11:00', '12:29'], ['2026-08-19', 2, '13:30', '15:00']]);
  assert.deepEqual(r.avisos, [{ asignaturaId: crn('16452'), fecha: '2026-08-20', tipo: 'SIN_CLASE_ESE_DIA' }]);
});

test('ningún propuesto tiene clase que se empalme (04 §5), en todas las fechas de una semana', () => {
  const { db, ids } = escenario();
  const semana = ['2026-08-17', '2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21'];
  for (const titular of Object.values(ids)) {
    for (const g of disponibles(db, { docenteId: titular, fechas: semana }).gruposASuplir) {
      const sesion = { dia: diaSemana(g.fecha), inicio: g.inicio, fin: g.fin };
      for (const p of g.disponibles) {
        const clases = db.prepare(`SELECT h.dia_semana AS dia, h.hora_inicio AS inicio, h.hora_fin AS fin FROM horarios h
                                   JOIN asignaturas a ON a.id = h.asignatura_id WHERE a.docente_id = ? AND a.periodo_id = 1`).all(p.docenteId);
        assert.equal(clases.some((c) => seEmpalman(c, sesion)), false, `${p.nombre} en ${g.crn} ${g.fecha}`);
      }
    }
  }
});

test('validación: fechas obligatorias, docente inexistente (404) y CRN que no es del titular', () => {
  const { db, ids, crn } = escenario();
  assert.throws(() => disponibles(db, { docenteId: ids.maria }), (e) => e.status === 400 && e.details.some((x) => x.campo === 'fechas'));
  assert.throws(() => disponibles(db, { docenteId: 9999, fechas: [LUNES] }), (e) => e.status === 404);
  assert.throws(() => disponibles(db, { docenteId: ids.maria, fechas: ['17/08/2026'] }), (e) => e.status === 400);
  assert.throws(() => disponibles(db, { docenteId: ids.maria, fechas: [LUNES], asignaturaIds: [crn('16434')] }),
    (e) => e.status === 400 && e.details.some((x) => x.campo === `asignaturaIds.${crn('16434')}`));
});
