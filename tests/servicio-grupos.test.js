const test = require('node:test');
const assert = require('node:assert/strict');
const gruposService = require('../services/gruposService');
const { crearBd } = require('./helpers/bd');
const { libro, excelGrupos, filaGrupo, ENCABEZADOS_GRUPOS } = require('./helpers/excel');

const archivo = () => ({ buffer: excelGrupos(), nombre: 'GRUPOS_DOCENTES_PRUEBA.xlsx' });

test('preview no escribe en la BD y resume lo que se agregará', () => {
  const db = crearBd();
  const p = gruposService.preview(db, archivo());
  assert.equal(p.periodo, 'AGO-DIC 2026');
  assert.equal(p.periodoExiste, false);
  assert.equal(p.crn, 5);
  assert.equal(p.docentes.nuevos.length, 4);
  assert.equal(p.grupos.nuevos, 5);
  assert.deepEqual(p.omitidos.map((o) => o.grupo), ['F61', 'F62']);
  assert.equal(p.idiomaSugeridoEN, 2);
  assert.equal(p.sinContrato, 5);
  assert.deepEqual(p.sinTarifa, []);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM docentes').get().n, 0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM periodos').get().n, 0);
});

test('confirm crea periodo, docentes, asignaturas con tarifa y horarios', () => {
  const db = crearBd();
  const { previewId } = gruposService.preview(db, archivo());
  const r = gruposService.confirm(db, { previewId });
  assert.deepEqual([r.docentesNuevos, r.gruposNuevos, r.gruposActualizados], [4, 5, 0]);

  const asig = db.prepare(`SELECT a.*, t.pago_por_dia FROM asignaturas a LEFT JOIN tipos_clase t ON t.id = a.tipo_clase_id
                           WHERE crn = '16452'`).get();
  assert.deepEqual([asig.horas_semana, asig.idioma, asig.pago_por_dia, asig.origen], [3, 'ES', 54, 'excel_grupos']);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM horarios WHERE asignatura_id = ?').get(asig.id).n, 2);

  const ana = db.prepare("SELECT * FROM docentes WHERE nomina = 'L03500003'").get();
  assert.deepEqual([ana.nombres, ana.apellido_paterno, ana.nivel_imparte], ['Ana Laura', 'De la Cruz', 'Bachillerato General Bilingüe']);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM asignaturas WHERE crn IN ('22023','22030')").get().n, 0);
  assert.equal(gruposService.importaciones(db).length, 1);
  // La vista previa se consume
  assert.throws(() => gruposService.confirm(db, { previewId }), { status: 404 });
});

test('reimportar no pisa lo editado a mano ni el contrato', () => {
  const db = crearBd();
  gruposService.confirm(db, { previewId: gruposService.preview(db, archivo()).previewId });
  db.prepare(`UPDATE asignaturas SET num_contrato = '5500001', idioma = 'EN', editado_a_mano = '["idioma"]'
              WHERE crn = '16001'`).run();

  const p = gruposService.preview(db, archivo());
  assert.equal(p.periodoExiste, true);
  assert.equal(p.docentes.existentes, 4);
  assert.equal(p.grupos.nuevos, 0);
  assert.equal(p.sinContrato, 4);
  const r = gruposService.confirm(db, { previewId: p.previewId });
  assert.equal(r.gruposActualizados, 5);

  const a = db.prepare(`SELECT a.idioma, a.num_contrato, t.pago_por_dia FROM asignaturas a JOIN tipos_clase t ON t.id = a.tipo_clase_id
                        WHERE crn = '16001'`).get();
  assert.deepEqual([a.idioma, a.num_contrato, a.pago_por_dia], ['EN', '5500001', 65]); // 3 h EN
  assert.equal(db.prepare('SELECT COUNT(*) n FROM horarios').get().n, 2 + 5 + 2 + 2 + 1); // no se duplican
});

test('detecta cambio de docente, grupos que ya no vienen y ausentes', () => {
  const db = crearBd();
  gruposService.confirm(db, { previewId: gruposService.preview(db, archivo()).previewId });
  const otro = libro({
    Salida: [
      ENCABEZADOS_GRUPOS,
      filaGrupo({ clave: 'BSMA2001', materia: 'Matemáticas I', crn: '16001', grupo: '611', nomina: 'L03500002', profesor: 'Sosa Von Putlitz  Guillermo', dias: 'LJ', inicio: '07:30', fin: '08:59' }),
    ],
  });
  const p = gruposService.preview(db, { buffer: otro, nombre: 'otro.xlsx' });
  assert.deepEqual(p.grupos.cambianDocente, [{ crn: '16001', materia: 'Matemáticas I', antes: 'L03500001', despues: 'L03500002' }]);
  assert.equal(p.grupos.yaNoVienen.length, 4);
  assert.deepEqual(p.sugeridosInactivo.map((d) => d.nomina).sort(), ['L03500001', 'L03500003', 'L03500005']);

  // HU-21: dar de baja a los ausentes exige motivo y recontratable
  assert.throws(() => gruposService.confirm(db, { previewId: p.previewId, inactivarAusentes: true }), { status: 400, code: 'BAJA_INCOMPLETA' });
  assert.throws(
    () => gruposService.confirm(db, { previewId: p.previewId, inactivarAusentes: true, baja: { motivo: 'Inventado', recontratable: true } }),
    (e) => e.status === 400 && e.details.some((d) => d.problema === 'NO_ESTA_EN_CATALOGO'),
  );
  const r = gruposService.confirm(db, {
    previewId: p.previewId, inactivarAusentes: true, baja: { motivo: 'Sin disponibilidad de horario', recontratable: true },
  });
  assert.equal(r.inactivados, 3);
  const baja = db.prepare(`SELECT b.* FROM docente_bajas b JOIN docentes d ON d.id = b.docente_id WHERE d.nomina = 'L03500001'`).get();
  assert.deepEqual([baja.motivo, baja.recontratable, baja.observaciones],
    ['Sin disponibilidad de horario', 1, 'No aparece en el Excel de grupos de AGO-DIC 2026.']);
  assert.equal(db.prepare("SELECT activo FROM docentes WHERE nomina = 'L03500001'").get().activo, 0);
});

test('avisa docentes inactivos que reaparecen en el archivo (no los reactiva)', () => {
  const db = crearBd();
  gruposService.confirm(db, { previewId: gruposService.preview(db, archivo()).previewId });
  db.prepare("UPDATE docentes SET activo = 0, recontratable = 1 WHERE nomina = 'L03500003'").run();
  const p = gruposService.preview(db, archivo());
  assert.deepEqual(p.reaparecenInactivos.map((d) => [d.nomina, d.recontratable]), [['L03500003', true]]);
  gruposService.confirm(db, { previewId: p.previewId });
  assert.equal(db.prepare("SELECT activo FROM docentes WHERE nomina = 'L03500003'").get().activo, 0);
});

test('avisa docentes no recontratables', () => {
  const db = crearBd();
  gruposService.confirm(db, { previewId: gruposService.preview(db, archivo()).previewId });
  db.prepare("UPDATE docentes SET recontratable = 0 WHERE nomina = 'L03500005'").run();
  const p = gruposService.preview(db, archivo());
  assert.deepEqual(p.noRecontratables.map((d) => d.nomina), ['L03500005']);
});
