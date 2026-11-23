const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const cvService = require('../services/cvService');
const docentesService = require('../services/docentesService');
const { crearEscenario } = require('./helpers/escenario');
const { TEXTO_CV, pdfCv } = require('./helpers/cv');

/** Escenario sin la CURP ni el trabajo externo de María (para que el CV los proponga). */
function escenarioSinDatosCv() {
  const e = crearEscenario();
  e.db.prepare('UPDATE docentes SET curp = NULL, fecha_nacimiento = NULL, genero = NULL, trabajo_externo = NULL WHERE id = ?').run(e.ids.maria);
  e.db.prepare('DELETE FROM titulos_docente').run();
  return e;
}

/** Borra los PDF que la prueba dejó en data/cv/. */
function limpiarCv(db) {
  for (const { ruta } of db.prepare('SELECT ruta FROM cv_archivos').all()) {
    fs.rmSync(path.join(__dirname, '..', ruta), { force: true });
  }
}

const otroCv = () => pdfCv(TEXTO_CV
  .replace('Nombre: María López Ruiz', 'Nombre: Rosa Pérez Gil')
  .replace('LORM950208MVZPZR00', 'GODE561231HDFRRN00'));

test('preview: liga por nombre, propone datos y lista los archivos que no se leen', async () => {
  const { db, ids } = escenarioSinDatosCv();
  const r = await cvService.preview(db, [
    { nombre: 'López Ruiz  María.pdf', buffer: await pdfCv() },
    { nombre: 'Pérez Gil  Rosa.pdf', buffer: await otroCv() },
    { nombre: 'López Ruiz  María.docx', buffer: Buffer.from('x') },
    { nombre: 'escaneo.pdf', buffer: await pdfCv(' ') },
  ]);
  assert.deepEqual([r.total, r.leidos], [4, 2]);
  assert.deepEqual(r.noLeidos.map((n) => n.archivo), ['López Ruiz  María.docx', 'escaneo.pdf']);
  const maria = r.items.find((i) => i.archivo === 'López Ruiz  María.pdf');
  assert.deepEqual(maria.coincidencia, { docenteId: ids.maria, nomina: 'L03500001', nombre: 'María López Ruiz', por: 'nombre' });
  assert.equal(maria.propuesta.curp, 'LORM950208MVZPZR00');
  assert.equal(r.items.find((i) => i.archivo === 'Pérez Gil  Rosa.pdf').coincidencia, null);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cv_archivos').get().n, 0); // no guarda
});

test('preview: liga por CURP y avisa diferencias con lo ya capturado', async () => {
  const { db, ids } = crearEscenario(); // María ya tiene CURP y "Despacho contable"
  const r = await cvService.preview(db, [{ nombre: 'cualquier-nombre.pdf', buffer: await pdfCv() }]);
  assert.equal(r.items[0].coincidencia.por, 'curp');
  assert.equal(r.items[0].coincidencia.docenteId, ids.maria);
  assert.deepEqual(r.items[0].conflictos, [{ campo: 'trabajoExterno', actual: 'Despacho contable', cv: 'Despacho Contable Ejemplo' }]);
});

test('confirm: llena lo vacío, guarda títulos y el PDF; nuevo docente por nómina; omitir', async () => {
  const { db, ids } = escenarioSinDatosCv();
  const p = await cvService.preview(db, [
    { nombre: 'López Ruiz  María.pdf', buffer: await pdfCv() },
    { nombre: 'Pérez Gil  Rosa.pdf', buffer: await otroCv() },
  ]);
  try {
    assert.throws(() => cvService.confirm(db, { previewId: p.previewId, items: [{ archivo: 'Pérez Gil  Rosa.pdf' }] }), { code: 'CV_SIN_DOCENTE' });
    const p2 = await cvService.preview(db, [
      { nombre: 'López Ruiz  María.pdf', buffer: await pdfCv() },
      { nombre: 'Pérez Gil  Rosa.pdf', buffer: await otroCv() },
    ]);
    const r = cvService.confirm(db, {
      previewId: p2.previewId,
      items: [
        { archivo: 'López Ruiz  María.pdf', docenteId: ids.maria, datos: { campoNoUsado: 1 } },
        { archivo: 'Pérez Gil  Rosa.pdf', nomina: '3500099' },
      ],
    });
    assert.deepEqual([r.guardados, r.omitidos], [2, 0]);

    const m = docentesService.detalle(db, ids.maria, { hoy: '2026-11-11' });
    assert.deepEqual(
      [m.curp, m.fechaNacimiento, m.genero, m.trabajoExterno, m.nivelEstudios, m.estudiando.nivel, m.cv.disponible],
      ['LORM950208MVZPZR00', '1995-02-08', 'F', 'Despacho Contable Ejemplo', 'Licenciatura', 'Maestría', true],
    );
    assert.equal(m.primerSemestreTexto, 'AGO-DIC 2022'); // ya lo tenía; no se pisa
    assert.deepEqual(m.idiomas, ['Inglés (Avanzado)', 'Francés (Básico)']);
    assert.ok(fs.existsSync(docentesService.archivoCv(db, ids.maria).ruta));

    const rosa = db.prepare("SELECT * FROM docentes WHERE nomina = 'L03500099'").get();
    assert.deepEqual([rosa.nombres, rosa.apellido_paterno, rosa.genero, rosa.origen], ['Rosa', 'Pérez', 'M', 'cv']);
  } finally {
    limpiarCv(db);
  }
});

test('confirm: lo editado gana; reimportar reemplaza solo los títulos del CV', async () => {
  const { db, ids } = escenarioSinDatosCv();
  db.prepare("INSERT INTO titulos_docente (docente_id, grado, estatus, origen) VALUES (?, 'Doctorado', 'Pasante', 'manual')").run(ids.maria);
  try {
    for (let vez = 0; vez < 2; vez++) {
      const p = await cvService.preview(db, [{ nombre: 'cv.pdf', buffer: await pdfCv() }]);
      cvService.confirm(db, { previewId: p.previewId, items: [{ archivo: 'cv.pdf', docenteId: ids.maria, datos: { trabajoExterno: 'Consultoría propia' } }] });
    }
    const m = docentesService.detalle(db, ids.maria);
    assert.equal(m.trabajoExterno, 'Consultoría propia');
    assert.deepEqual(m.titulos.map((t) => [t.grado, t.origen]).sort(), [['Doctorado', 'manual'], ['Licenciatura', 'cv'], ['Maestría', 'cv']]);
    assert.equal(db.prepare('SELECT COUNT(*) n FROM cv_archivos').get().n, 2); // el mismo PDF dos veces (mismo archivo en disco)
  } finally {
    limpiarCv(db);
  }
});

test('confirm: si algo falla no queda nada (ni en la BD ni PDF sueltos)', async () => {
  const { db, ids } = escenarioSinDatosCv();
  db.prepare("UPDATE docentes SET curp = 'GODE561231HDFRRN00' WHERE id = ?").run(ids.guillermo);
  const p = await cvService.preview(db, [
    { nombre: 'López Ruiz  María.pdf', buffer: await pdfCv() },
    { nombre: 'Pérez Gil  Rosa.pdf', buffer: await otroCv() }, // su CURP es la de Guillermo → 409
  ]);
  const antes = fs.existsSync(cvService.CARPETA_CV) ? fs.readdirSync(cvService.CARPETA_CV).length : 0;
  assert.throws(() => cvService.confirm(db, {
    previewId: p.previewId,
    items: [{ archivo: 'López Ruiz  María.pdf', docenteId: ids.maria }, { archivo: 'Pérez Gil  Rosa.pdf', docenteId: ids.ana }],
  }), (e) => e.status === 409 && e.details[0].archivo === 'Pérez Gil  Rosa.pdf');
  assert.equal(db.prepare('SELECT COUNT(*) n FROM cv_archivos').get().n, 0);
  assert.equal(db.prepare('SELECT curp FROM docentes WHERE id = ?').get(ids.maria).curp, null);
  const despues = fs.existsSync(cvService.CARPETA_CV) ? fs.readdirSync(cvService.CARPETA_CV).length : 0;
  assert.equal(despues, antes);
  assert.throws(() => cvService.confirm(db, { previewId: p.previewId, items: [{ archivo: 'otro.pdf', omitir: true }] }), { code: 'ARCHIVO_DESCONOCIDO' });
});
