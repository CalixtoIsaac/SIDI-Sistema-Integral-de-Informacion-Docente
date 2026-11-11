const test = require('node:test');
const assert = require('node:assert/strict');
const opina = require('../lib/excel/lectores/opina');
const { libro, ENC_OPINA_V1, filaOpinaV1, ENC_OPINA_V2, filaOpinaV2 } = require('./helpers/excel');

function archivoV1(bookType = 'xlsx') {
  return libro({
    Hoja1: [
      ENC_OPINA_V1,
      filaOpinaV1({ id: 'R1' }),
      filaOpinaV1({ id: 'R2', rec: 'No' }),
      filaOpinaV1({ id: 'R3', crn: '16002' }),
      filaOpinaV1({ id: 'R4', nomina: 3500002, profesor: 'Sosa Von Putlitz  Guillermo', crn: '16452' }),
      filaOpinaV1({ id: 'R5', campus: 'Monterrey' }), // otro campus
      filaOpinaV1({ id: 'R6', campus: 'Tecmilenio Online' }), // online
      filaOpinaV1({ id: 'R7', formato: 'En línea' }), // modalidad no presencial
      filaOpinaV1({ id: 'R8', rec: null }), // sin respuesta
    ],
  }, bookType);
}

test('v1: detecta versión, periodo y filtra presencial + Veracruz', () => {
  const r = opina.leer(archivoV1());
  assert.equal(r.version, 'v1');
  assert.equal(r.periodo.clave, 'AGO-DIC 2024');
  assert.equal(r.filas, 8);
  assert.equal(r.filasFiltradas, 4);
  assert.deepEqual(r.descartadas, { campus: 2, modalidad: 1, sinDatos: 0, sinRespuesta: 1 });
  assert.equal(r.formatos.Presencial, 7);
  assert.equal(r.grupos, 3);
});

test('v1: calificación global ponderada por alumnos (Σ Sí ÷ Σ respuestas)', () => {
  const r = opina.leer(archivoV1());
  const maria = r.profesores.find((p) => p.nomina === 'L03500001');
  assert.deepEqual([maria.respuestas, maria.positivas, maria.porcentaje, maria.grupos], [3, 2, 66.7, 2]);
  assert.equal(maria.apellidoPaterno, 'López');
  const g = r.profesores.find((p) => p.nomina === 'L03500002');
  assert.equal(g.porcentaje, 100);
});

test('v1: campos crudos de cada respuesta', () => {
  const r = opina.leer(archivoV1());
  const resp = r.respuestas.find((x) => x.responseId === 'R2');
  assert.equal(resp.recomienda, 0);
  assert.equal(resp.porQueNo, 'No explica');
  assert.equal(resp.claveGrupo, 'Veracruz_BSMA2001_611'); // encabezado con espacio inicial
  assert.equal(resp.claveMateria, 'BSMA2001');
  assert.equal(resp.items, null);
});

test('acepta .xlsb', () => {
  const r = opina.leer(archivoV1('xlsb'));
  assert.equal(r.filasFiltradas, 4);
});

test('v2: reactivos, comentario y clave de materia derivada de la clave de grupo', () => {
  const buf = libro({
    Datos: [
      ['Reporte OPINA'], // título arriba de los encabezados
      ENC_OPINA_V2,
      filaOpinaV2({}),
      filaOpinaV2({ rec: 'No' }),
      filaOpinaV2({ formato: 'Online' }),
    ],
  });
  const r = opina.leer(buf);
  assert.equal(r.version, 'v2');
  assert.equal(r.periodo.clave, 'ENE-MAY 2026');
  assert.equal(r.filasFiltradas, 2);
  assert.equal(r.descartadas.modalidad, 1);
  const no = r.respuestas.find((x) => x.recomienda === 0);
  assert.deepEqual(no.items, {
    conocimiento: 'Sí', retos: 'No estoy seguro', colaboracion: 'Sí', confianza: 'No', inspiracion: 'Sí',
  });
  assert.equal(no.comentario, 'Llega tarde');
  assert.equal(no.claveMateria, 'BSCN1006');
  assert.equal(no.materia, 'Química I');
});

test('opciones: se puede desactivar el filtro presencial', () => {
  const r = opina.leer(archivoV1(), { soloPresencial: false });
  assert.equal(r.filasFiltradas, 5);
});

test('archivo que no es OPINA → 422', () => {
  assert.throws(() => opina.leer(libro({ Hoja1: [['CRN', 'Otra']] })), { status: 422 });
});

test('claveMateriaDeGrupo', () => {
  assert.equal(opina.claveMateriaDeGrupo('Veracruz_bscn1006_611'), 'BSCN1006');
  assert.equal(opina.claveMateriaDeGrupo('raro'), null);
});
