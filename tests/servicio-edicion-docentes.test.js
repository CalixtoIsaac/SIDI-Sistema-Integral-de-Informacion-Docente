const test = require('node:test');
const assert = require('node:assert/strict');
const edicion = require('../services/docentesEdicionService');
const titulos = require('../services/titulosService');
const asignaturas = require('../services/asignaturasService');
const gruposService = require('../services/gruposService');
const docentesService = require('../services/docentesService');
const { crearEscenario } = require('./helpers/escenario');
const { excelGrupos } = require('./helpers/excel');

const NUEVO = {
  nomina: '3500010',
  nombres: 'Luisa', apellidoPaterno: 'Martínez', apellidoMaterno: 'Ochoa',
  curp: 'LORM950208MVZPZR00', // CURP ficticia válida
  campoFormacion: 'Educación', trabajoExterno: 'Escuela privada', primerSemestre: 'AGO-DIC 2022',
};

function sinCurpDeMaria(db, ids) {
  db.prepare('UPDATE docentes SET curp = NULL WHERE id = ?').run(ids.maria);
}

test('crear: normaliza la nómina, llena fecha y género desde la CURP y guarda el primer semestre', () => {
  const { db, ids } = crearEscenario();
  sinCurpDeMaria(db, ids);
  const id = edicion.crear(db, NUEVO);
  const d = docentesService.detalle(db, id, { hoy: '2026-11-11' });
  assert.deepEqual(
    [d.nomina, d.fechaNacimiento, d.genero, d.edad, d.campoFormacion, d.primerSemestreTexto, d.antiguedad.texto, d.origen],
    ['L03500010', '1995-02-08', 'F', 31, 'Educación', 'AGO-DIC 2022', '4 años · 9 semestres', 'manual'],
  );
  assert.equal(d.revisar, null);
});

test('crear: errores de validación juntos (400) y duplicados (409)', () => {
  const { db } = crearEscenario();
  assert.throws(
    () => edicion.crear(db, { nomina: 'abc', curp: 'XXX', genero: 'H', primerSemestre: 'otoño' }),
    (e) => e.status === 400 && ['nomina', 'nombres', 'apellidoPaterno', 'curp', 'genero', 'primerSemestre']
      .every((c) => e.details.some((d) => d.campo === c)),
  );
  assert.throws(() => edicion.crear(db, { ...NUEVO, nomina: 'L03500001' }), { status: 409, code: 'NOMINA_DUPLICADA' });
  assert.throws(() => edicion.crear(db, { ...NUEVO, curp: 'LORM950208MVZPZR00' }), { status: 409, code: 'CURP_DUPLICADA' });
  assert.throws(() => edicion.crear(db, { ...NUEVO, curp: null, campoFormacion: 'Astrología' }), (e) => e.details[0].problema === 'NO_ESTA_EN_CATALOGO');
});

test('crear: dígito verificador incorrecto solo con aceptarCurpConAviso', () => {
  const { db, ids } = crearEscenario();
  sinCurpDeMaria(db, ids);
  const malo = { ...NUEVO, curp: 'LORM950208MVZPZR09' };
  assert.throws(() => edicion.crear(db, malo), (e) => e.details[0].problema === 'DIGITO_VERIFICADOR');
  const id = edicion.crear(db, { ...malo, aceptarCurpConAviso: true });
  assert.equal(docentesService.detalle(db, id).curp, 'LORM950208MVZPZR09');
});

test('crear: fecha distinta a la CURP queda para revisar', () => {
  const { db, ids } = crearEscenario();
  sinCurpDeMaria(db, ids);
  const id = edicion.crear(db, { ...NUEVO, fechaNacimiento: '09/02/1995' });
  const d = docentesService.detalle(db, id);
  assert.deepEqual([d.fechaNacimiento, d.revisar], ['1995-02-09', edicion.REVISAR_FECHA]);
  edicion.actualizar(db, id, { fechaNacimiento: '1995-02-08' });
  assert.equal(docentesService.detalle(db, id).revisar, null);
});

test('crear con títulos y asignaturas (CRN y actividad) en una sola transacción', () => {
  const { db } = crearEscenario();
  const id = edicion.crear(db, {
    ...NUEVO, curp: null,
    titulos: [{ grado: 'Licenciatura', estatus: 'Titulado' }, { grado: 'Maestría', estatus: 'Estudios en curso' }],
    asignaturas: [
      { crn: '17001', materia: 'Química II', numContrato: '5500010', horarios: [{ dia: 2, inicio: '07:30', fin: '08:59' }, { dia: 5, inicio: '07:30', fin: '08:59' }] },
      { nombreActividad: 'Ruta exploratoria', horasSemana: 1.5 },
    ],
  });
  const d = docentesService.detalle(db, id, { hoy: '2026-11-11' });
  assert.deepEqual([d.nivelEstudios, d.estudiando], ['Licenciatura', { si: true, nivel: 'Maestría' }]);
  assert.deepEqual(d.asignaturas.map((a) => [a.crn, a.materia, a.horasSemana, a.idioma, a.tarifaDiaria, a.numContrato]), [
    ['17001', 'Química II', 3, 'ES', 54, '5500010'],
    [null, 'Ruta exploratoria', 1.5, 'ES', 26, null],
  ]);
  // Si algo falla, no queda nada a medias
  assert.throws(() => edicion.crear(db, { ...NUEVO, nomina: '3500011', curp: null, asignaturas: [{ crn: '17001', materia: 'X' }] }), { code: 'CRN_DUPLICADO' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM docentes WHERE nomina = 'L03500011'").get().n, 0);
});

test('actualizar: parcial, sin tocar lo que no se manda; 404 si no existe', () => {
  const { db, ids } = crearEscenario();
  edicion.actualizar(db, ids.guillermo, { campoFormacion: 'Educación', curp: 'GODE561231HDFRRN00' });
  const d = docentesService.detalle(db, ids.guillermo, { hoy: '2026-11-11' });
  assert.deepEqual([d.campoFormacion, d.genero, d.fechaNacimiento, d.nombres], ['Educación', 'M', '1956-12-31', 'Guillermo']);
  assert.throws(() => edicion.actualizar(db, ids.guillermo, { nombres: '' }), { status: 400 });
  assert.throws(() => edicion.actualizar(db, ids.guillermo, { nomina: 'L03500001' }), { status: 409 });
  assert.throws(() => edicion.actualizar(db, 9999, {}), { status: 404 });
});

test('alta rápida: nómina y nombre en cualquier formato', () => {
  const { db } = crearEscenario();
  const id = edicion.altaRapida(db, { nomina: 22464, nombre: 'Dora Vega Aquino' });
  const d = docentesService.detalle(db, id);
  assert.deepEqual([d.nomina, d.nombres, d.apellidoPaterno, d.apellidoMaterno, d.origen], ['L00022464', 'Dora', 'Vega', 'Aquino', 'alta_rapida']);
  assert.deepEqual(edicion.separarNombreRapido({ nombre: 'Vega Aquino  Dora Elena' }).nombres, 'Dora Elena');
  assert.throws(() => edicion.altaRapida(db, { nomina: 22464, nombre: 'Otra Persona' }), { status: 409 });
  assert.throws(() => edicion.altaRapida(db, { nomina: 22465, nombre: 'Dora' }), { status: 400 });
});

test('títulos: alta, edición parcial y baja; recalculan nivel de estudios', () => {
  const { db, ids } = crearEscenario();
  const t = titulos.crear(db, ids.maria, { grado: 'Doctorado', institucion: 'U. Ficticia', estatus: 'Pasante' });
  assert.equal(docentesService.detalle(db, ids.maria).nivelEstudios, 'Licenciatura');
  titulos.actualizar(db, t.id, { estatus: 'Titulado', cedula: '123456' });
  assert.equal(docentesService.detalle(db, ids.maria).nivelEstudios, 'Doctorado');
  assert.throws(() => titulos.actualizar(db, t.id, { estatus: 'Casi' }), { status: 400 });
  assert.throws(() => titulos.crear(db, ids.maria, { grado: 'Bachillerato' }), { status: 400 });
  titulos.eliminar(db, t.id);
  assert.throws(() => titulos.eliminar(db, t.id), { status: 404 });
});

test('asignaturas: editar contrato e idioma recalcula la tarifa y no se pisa al reimportar', () => {
  const { db, ids } = crearEscenario();
  const a16434 = docentesService.detalle(db, ids.ana).asignaturas[0];
  assert.throws(() => asignaturas.actualizar(db, a16434.id, { numContrato: '55-00' }), { status: 400 });
  const r = asignaturas.actualizar(db, a16434.id, { numContrato: '5500003', idioma: 'ES' });
  assert.deepEqual([r.numContrato, r.idioma, r.tarifaDiaria, r.tarifaMensual], ['5500003', 'ES', 54, 1764]);
  assert.deepEqual(r.editadoAMano, ['idioma']);

  gruposService.confirm(db, { previewId: gruposService.preview(db, { buffer: excelGrupos(), nombre: 'g.xlsx' }).previewId });
  const despues = docentesService.asignaturaPorId(db, a16434.id);
  assert.deepEqual([despues.idioma, despues.numContrato, despues.tarifaDiaria], ['ES', '5500003', 54]);
});

test('asignaturas: horarios nuevos recalculan horas; CRN duplicado y borrar con faltas', () => {
  const { db, ids } = crearEscenario();
  const a = asignaturas.crear(db, ids.ana, { crn: '18001', materia: 'Física', claveMateria: 'bscn2004' });
  assert.deepEqual([a.idioma, a.horasSemana, a.tipoClaseId], ['EN', null, null]); // BSCN2004 = inglés; sin horario = sin tarifa
  assert.deepEqual(a.avisos, ['SIN_CONTRATO', 'SIN_TARIFA']);
  const b = asignaturas.actualizar(db, a.id, { horarios: [{ dia: 1, inicio: '9:00', fin: '10:29' }, { dia: 3, inicio: '9:00', fin: '10:29' }] });
  assert.deepEqual([b.horasSemana, b.tarifaDiaria, b.horario], [3, 65, 'Lu-Mi 09:00–10:29']);
  assert.throws(() => asignaturas.crear(db, ids.maria, { crn: '18001', materia: 'Y' }), { status: 409 });
  assert.throws(() => asignaturas.crear(db, ids.maria, { materia: 'Sin CRN ni actividad' }), { status: 400 });
  assert.throws(() => asignaturas.crear(db, ids.maria, { crn: '18002', materia: 'Z', horarios: [{ dia: 9, inicio: '10:00', fin: '09:00' }] }), { status: 400 });

  db.prepare("INSERT INTO faltas (docente_id, asignatura_id, fecha, motivo) VALUES (?, ?, '2026-11-09', 'Falta por asunto personal')").run(ids.ana, a.id);
  assert.throws(() => asignaturas.eliminar(db, a.id), { status: 409, code: 'TIENE_FALTAS' });
  const c = asignaturas.crear(db, ids.ana, { nombreActividad: 'Club de lectura' });
  asignaturas.eliminar(db, c.id);
  assert.throws(() => docentesService.asignaturaPorId(db, c.id), { status: 404 });
});
