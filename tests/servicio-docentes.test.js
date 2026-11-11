const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const docentesService = require('../services/docentesService');
const { crearEscenario } = require('./helpers/escenario');

const HOY = '2026-11-11';

test('listar: 12 campos de consulta + OPINA y faltas', () => {
  const { db } = crearEscenario();
  const r = docentesService.listar(db, {}, { hoy: HOY });
  assert.equal(r.periodo, 'AGO-DIC 2026');
  assert.equal(r.periodoOpina, 'ENE-MAY 2026');
  assert.equal(r.total, 4);
  const maria = r.docentes.find((d) => d.nomina === 'L03500001');
  assert.deepEqual(
    {
      nombre: maria.nombre, edad: maria.edad, genero: maria.genero, curp: maria.curp, numGrupos: maria.numGrupos,
      nivelEstudios: maria.nivelEstudios, campoFormacion: maria.campoFormacion, antiguedad: maria.antiguedad.texto,
      estudiando: maria.estudiando, trabajoExterno: maria.trabajoExterno, cumpleanos: maria.cumpleanos,
      opina: maria.opina, faltas: maria.faltas, incompleto: maria.incompleto, activo: maria.activo,
    },
    {
      nombre: 'María López Ruiz', edad: 31, genero: 'F', curp: 'LORM950208MVZPZR00', numGrupos: 2,
      nivelEstudios: 'Licenciatura', campoFormacion: 'Ingeniería y Tecnología', antiguedad: '4 años · 9 semestres',
      estudiando: { si: true, nivel: 'Maestría' }, trabajoExterno: 'Despacho contable', cumpleanos: '02-08',
      opina: { porcentaje: 91.7, respuestas: 12, muestraInsuficiente: false }, faltas: 0, incompleto: [], activo: true,
    },
  );
  assert.deepEqual(maria.grupos.map((g) => [g.crn, g.horario]), [
    ['16001', 'Lu-Ju 07:30–08:59'],
    ['16002', 'Lu-Ma-Mi-Ju-Vi 10:00–10:59'],
  ]);
});

test('listar: datos incompletos, antigüedad desde el primer periodo y muestra insuficiente', () => {
  const { db } = crearEscenario();
  const g = docentesService.listar(db, {}, { hoy: HOY }).docentes.find((d) => d.nomina === 'L03500002');
  assert.deepEqual(g.incompleto, ['curp', 'campoFormacion', 'contrato']);
  assert.equal(g.antiguedad.desde, 'ENE-MAY 2026'); // por su OPINA de ENE-MAY 2026
  assert.equal(g.opina.muestraInsuficiente, true);
  assert.equal(g.edad, null);
  assert.deepEqual(g.estudiando, { si: false, nivel: null });
});

test('listar: orden alfabético por apellido y paginación', () => {
  const { db } = crearEscenario();
  const todos = docentesService.listar(db, {}, { hoy: HOY }).docentes.map((d) => d.apellidoPaterno);
  assert.deepEqual(todos, ['De la Cruz', 'López', 'Ramírez', 'Sosa']);
  const p2 = docentesService.listar(db, { page: '2', limit: '3' }, { hoy: HOY });
  assert.deepEqual([p2.docentes.length, p2.total, p2.page, p2.limit], [1, 4, 2, 3]);
});

test('detalle: ficha con tarifa diaria y mensual por CRN y total mensual', () => {
  const { db, ids } = crearEscenario();
  const d = docentesService.detalle(db, ids.maria, { hoy: HOY });
  assert.deepEqual(d.asignaturas.map((a) => [a.crn, a.horasSemana, a.idioma, a.tarifaDiaria, a.tarifaMensual, a.numContrato, a.avisos]), [
    ['16001', 3, 'ES', 54, 1764, '5500001', []],
    ['16002', 5, 'EN', 106, 3528, '5500001', []],
  ]);
  assert.equal(d.totalMensual, 5292);
  assert.equal(d.titulos.length, 2);
  assert.deepEqual(d.idiomas, ['Inglés C1']);
  assert.equal(d.fechaNacimiento, '1995-02-08');
  assert.deepEqual(d.cv, { disponible: false });
  assert.equal(d.opinaPeriodos[0].periodo, 'ENE-MAY 2026');
  assert.equal(d.opinaPeriodos[0].porCrn[0].respuestas, 12);
  assert.deepEqual(d.bajas, []);
});

test('detalle: avisos de CRN sin contrato y 404 si no existe', () => {
  const { db, ids } = crearEscenario();
  const d = docentesService.detalle(db, ids.ana, { hoy: HOY });
  assert.deepEqual(d.asignaturas[0].avisos, ['SIN_CONTRATO']);
  assert.equal(d.asignaturas[0].tarifaMensual, 2116.75); // 3 h EN
  assert.throws(() => docentesService.detalle(db, 9999), { status: 404, code: 'DOCENTE_NO_EXISTE' });
});

test('resumen: nómina, contratos y CRN del semestre', () => {
  const { db, ids } = crearEscenario();
  const r = docentesService.resumen(db, ids.maria);
  assert.equal(r.nomina, 'L03500001');
  assert.deepEqual(r.contratos, ['5500001']);
  assert.deepEqual(r.crn.map((c) => c.crn), ['16001', '16002']);
  assert.equal(r.periodo, 'AGO-DIC 2026');
});

test('archivoCv: 404 sin CV, ruta dentro de data/cv y bloqueo de rutas fuera', () => {
  const { db, ids } = crearEscenario();
  assert.throws(() => docentesService.archivoCv(db, ids.maria), { status: 404, code: 'SIN_CV' });

  const carpeta = path.join(__dirname, '..', 'data', 'cv');
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, 'PRUEBA-L03500001.pdf');
  fs.writeFileSync(archivo, '%PDF-1.4 prueba');
  try {
    const ins = db.prepare("INSERT INTO cv_archivos (docente_id, nombre_original, ruta, sha256) VALUES (?, ?, ?, 'x')");
    ins.run(ids.maria, 'López Ruiz  María.pdf', 'data/cv/PRUEBA-L03500001.pdf');
    assert.equal(docentesService.archivoCv(db, ids.maria).ruta, archivo);
    ins.run(ids.ana, 'malo.pdf', 'data/cv/../../package.json');
    assert.throws(() => docentesService.archivoCv(db, ids.ana), { code: 'CV_NO_ENCONTRADO' });
  } finally {
    fs.rmSync(archivo, { force: true });
  }
});
