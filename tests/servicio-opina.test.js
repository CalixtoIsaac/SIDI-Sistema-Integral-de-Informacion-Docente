const test = require('node:test');
const assert = require('node:assert/strict');
const opinaService = require('../services/opinaService');
const gruposService = require('../services/gruposService');
const { crearBd } = require('./helpers/bd');
const { libro, excelGrupos, ENC_OPINA_V1, filaOpinaV1 } = require('./helpers/excel');

function archivoOpina() {
  return {
    nombre: 'OPINA AGO-DIC 24.xlsx',
    buffer: libro({
      Hoja1: [
        ENC_OPINA_V1,
        filaOpinaV1({ id: 'R1' }),
        filaOpinaV1({ id: 'R2', rec: 'No' }),
        filaOpinaV1({ id: 'R3', crn: '16002' }),
        filaOpinaV1({ id: 'R4', nomina: 'L03599999', profesor: 'Nuevo Apellido  Docente', crn: '16999' }),
        filaOpinaV1({ id: 'R5', campus: 'Tecmilenio Online' }),
      ],
    }),
  };
}

test('preview: profesores nuevos y descartes, sin escribir', () => {
  const db = crearBd();
  const p = opinaService.preview(db, archivoOpina());
  assert.equal(p.version, 'v1');
  assert.equal(p.periodo, 'AGO-DIC 2024');
  assert.deepEqual([p.filas, p.filasFiltradas, p.profesores, p.grupos], [5, 4, 2, 3]);
  assert.equal(p.descartadas.campus, 1);
  assert.equal(p.profesoresNuevos.length, 2);
  assert.equal(p.yaImportado, false);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM opina_respuestas').get().n, 0);
});

test('confirm: guarda respuestas, crea docentes y asignaturas faltantes; vistas calculan el %', () => {
  const db = crearBd();
  const r = opinaService.confirm(db, { previewId: opinaService.preview(db, archivoOpina()).previewId });
  assert.deepEqual([r.respuestas, r.docentesNuevos, r.asignaturasNuevas, r.reemplazadas], [4, 2, 3, 0]);

  const v = db.prepare(`SELECT v.* FROM v_opina_docente v JOIN docentes d ON d.id = v.docente_id WHERE d.nomina = 'L03500001'`).get();
  assert.deepEqual([v.respuestas, v.positivas, v.porcentaje], [3, 2, 66.7]);
  const nuevo = db.prepare("SELECT * FROM docentes WHERE nomina = 'L03599999'").get();
  assert.deepEqual([nuevo.nombres, nuevo.apellido_paterno, nuevo.origen], ['Docente', 'Nuevo', 'opina']);
  const asig = db.prepare("SELECT * FROM asignaturas WHERE crn = '16001'").get();
  assert.deepEqual([asig.clave_grupo, asig.numero_grupo, asig.origen], ['Veracruz_BSMA2001_611', '611', 'opina']);
});

test('reimportar el mismo periodo pide confirmar y luego reemplaza', () => {
  const db = crearBd();
  opinaService.confirm(db, { previewId: opinaService.preview(db, archivoOpina()).previewId });
  const p = opinaService.preview(db, archivoOpina());
  assert.equal(p.yaImportado, true);
  assert.throws(() => opinaService.confirm(db, { previewId: p.previewId }), { status: 409, code: 'OPINA_YA_IMPORTADO' });
  const r = opinaService.confirm(db, { previewId: p.previewId, reemplazar: true });
  assert.equal(r.reemplazadas, 1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM opina_respuestas').get().n, 4);
  assert.equal(opinaService.importaciones(db).length, 1);
});

test('no duplica asignaturas que ya vienen del Excel de grupos y completa clave_grupo', () => {
  const db = crearBd();
  // Mismo periodo en ambos archivos para la prueba: se importa grupos AGO-DIC 2026 y OPINA con el mismo periodo
  gruposService.confirm(db, { previewId: gruposService.preview(db, { buffer: excelGrupos(), nombre: 'g.xlsx' }).previewId });
  db.prepare("UPDATE periodos SET etiqueta_opina = '2024 Ago - Dic', clave = 'AGO-DIC 2024'").run();
  const r = opinaService.confirm(db, { previewId: opinaService.preview(db, archivoOpina()).previewId });
  assert.equal(r.asignaturasNuevas, 1); // solo 16999
  assert.equal(db.prepare("SELECT clave_grupo FROM asignaturas WHERE crn = '16001'").get().clave_grupo, 'Veracruz_BSMA2001_611');
});

test('eliminar una importación borra sus respuestas', () => {
  const db = crearBd();
  const r = opinaService.confirm(db, { previewId: opinaService.preview(db, archivoOpina()).previewId });
  opinaService.eliminarImportacion(db, r.importacion.id);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM opina_respuestas').get().n, 0);
  assert.throws(() => opinaService.eliminarImportacion(db, 999), { status: 404 });
});
