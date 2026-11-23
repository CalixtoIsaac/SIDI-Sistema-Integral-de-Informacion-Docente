const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const contratos = require('../services/contratosService');
const asignaturas = require('../services/asignaturasService');
const { crearEscenario } = require('./helpers/escenario');
const { libro } = require('./helpers/excel');

/** Lee la plantilla generada como arreglo de filas. */
function filasDe(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  return { hojas: wb.SheetNames, filas: XLSX.utils.sheet_to_json(wb.Sheets.Contratos, { header: 1, defval: '' }) };
}

test('plantilla: CRN del periodo prellenados, actividades al final y contrato actual', () => {
  const { db, ids } = crearEscenario();
  asignaturas.crear(db, ids.ana, { nombreActividad: 'Ruta exploratoria' });
  const p = contratos.plantilla(db);
  assert.equal(p.nombre, 'CONTRATOS_AGO-DIC_2026.xlsx');
  const { hojas, filas } = filasDe(p.buffer);
  assert.deepEqual(hojas, ['Contratos']);
  assert.deepEqual(filas[0], ['CRN', 'Materia', 'Grupo', 'Nómina', 'Docente', 'Contrato']);
  assert.deepEqual(filas[1], ['16001', 'Matemáticas I', '611', 'L03500001', 'María López Ruiz', '5500001']);
  assert.deepEqual(filas.map((f) => f[0]).slice(1), ['16001', '16002', '16434', '16452', '16500', '']);
  assert.equal(filas.at(-1)[1], 'Ruta exploratoria');
  assert.throws(() => contratos.plantilla(db, 999), { status: 404 });
});

test('preview: nuevos, cambian, iguales, sin contrato y avisos (no guarda)', () => {
  const { db } = crearEscenario();
  const archivo = libro({
    Contratos: [
      ['CRN', 'Materia', 'Grupo', 'Nómina', 'Docente', 'Contrato'],
      ['16001', '', '', 'L03500001', '', '5500001'], // igual
      ['16002', '', '', '3500001', '', 5599999], // cambia (número de Excel, nómina sin L0)
      ['16434', '', '', 'L03500003', '', '5500003'], // nuevo
      ['16452', '', '', 'L03500001', '', '5500002'], // nómina que no corresponde
      ['16500', '', '', '', '', '55-00'], // contrato inválido
      ['99999', '', '', '', '', '5500009'], // CRN que no existe
      ['16434', '', '', '', '', '5500004'], // repetido
    ],
  });
  const r = contratos.preview(db, { buffer: archivo, nombre: 'CONTRATOS.xlsx' });
  assert.equal(r.periodo, 'AGO-DIC 2026');
  assert.deepEqual(r.nuevos.map((n) => [n.crn, n.contrato]), [['16434', '5500003']]);
  assert.deepEqual(r.cambian, [{ crn: '16002', materia: 'Math III', antes: '5500001', despues: '5599999' }]);
  assert.equal(r.iguales, 1);
  assert.deepEqual(r.sinContrato, ['16452', '16500']);
  assert.deepEqual(r.avisos.map((a) => [a.crn, a.tipo]), [
    ['16452', 'NOMINA_NO_CORRESPONDE'], ['16500', 'CONTRATO_INVALIDO'], ['99999', 'CRN_NO_EXISTE'], ['16434', 'CRN_REPETIDO'],
  ]);
  assert.equal(db.prepare("SELECT num_contrato FROM asignaturas WHERE crn = '16434'").get().num_contrato, null);
});

test('confirm: aplica los cambios y respeta conservarManual', () => {
  const { db } = crearEscenario();
  const archivo = libro({ Hoja1: [['No. de contrato', 'CRN'], ['5599999', '16002'], ['5500003', '16434']] }); // archivo propio, otro orden
  const p = contratos.preview(db, { buffer: archivo, nombre: 'mio.xlsx' });
  assert.equal(p.validaNomina, false);
  const r = contratos.confirm(db, { previewId: p.previewId, conservarManual: ['16002'] });
  assert.deepEqual([r.actualizados, r.conservados], [1, 1]);
  const contrato = (crn) => db.prepare('SELECT num_contrato FROM asignaturas WHERE crn = ?').get(crn).num_contrato;
  assert.deepEqual([contrato('16002'), contrato('16434')], ['5500001', '5500003']);
  assert.equal(contratos.importaciones(db)[0].actualizados, 1);
  assert.throws(() => contratos.confirm(db, { previewId: p.previewId }), { status: 404 });
});

test('la plantilla llena se vuelve a subir sin avisos', () => {
  const { db } = crearEscenario();
  const { filas } = filasDe(contratos.plantilla(db).buffer);
  filas.slice(1).forEach((f, i) => { if (!f[5]) f[5] = String(5600000 + i); });
  const p = contratos.preview(db, { buffer: libro({ Contratos: filas }), nombre: 'CONTRATOS_AGO-DIC_2026.xlsx' });
  assert.deepEqual([p.avisos.length, p.nuevos.length, p.iguales, p.sinContrato.length], [0, 3, 2, 0]);
});

test('archivo sin columnas CRN y Contrato → 422', () => {
  const { db } = crearEscenario();
  assert.throws(() => contratos.preview(db, { buffer: libro({ H: [['A', 'B'], [1, 2]] }), nombre: 'x.xlsx' }), { status: 422 });
});
