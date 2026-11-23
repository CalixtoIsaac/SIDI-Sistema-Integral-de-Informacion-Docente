const test = require('node:test');
const assert = require('node:assert/strict');
const grupos = require('../lib/excel/lectores/grupos');
const { libro, excelGrupos, ENCABEZADOS_GRUPOS } = require('./helpers/excel');

const resultado = grupos.leer(excelGrupos());
const porCrn = Object.fromEntries(resultado.asignaturas.map((a) => [a.crn, a]));

test('detecta el periodo del archivo', () => {
  assert.equal(resultado.periodo.clave, 'AGO-DIC 2026');
  assert.equal(resultado.periodo.etiquetaOpina, '2026 Ago - Dic');
  assert.equal(resultado.periodo.fechaInicio, '2026-08-01');
  assert.equal(resultado.filas, 9);
});

test('omite F61 y F62 (en línea) y los lista aparte', () => {
  assert.deepEqual(resultado.omitidos.map((o) => [o.crn, o.grupo, o.motivo]), [
    ['22023', 'F61', 'En línea'],
    ['22030', 'F62', 'En línea'],
  ]);
  assert.equal(porCrn['22023'], undefined);
  assert.equal(porCrn['22030'], undefined);
  // El docente que solo tiene grupos en línea no aparece como docente a importar
  assert.equal(resultado.docentes.find((d) => d.nomina === 'L03500004'), undefined);
});

test('agrupa filas por CRN: dos sesiones el mismo día', () => {
  const a = porCrn['16452'];
  assert.equal(a.horarios.length, 2);
  assert.deepEqual(a.horarios.map((h) => [h.dia, h.inicio, h.fin]), [[3, '11:00', '12:29'], [3, '13:30', '15:00']]);
  assert.equal(a.horasSemana, 3);
  assert.equal(a.nomina, 'L03500002'); // la nómina numérica se normaliza
});

test('horas/semana, idioma sugerido y plan', () => {
  assert.equal(porCrn['16001'].horasSemana, 3);
  assert.equal(porCrn['16001'].idioma, 'ES');
  assert.equal(porCrn['16002'].horasSemana, 5);
  assert.equal(porCrn['16002'].idioma, 'EN'); // BSMA2003 = versión en inglés
  assert.equal(porCrn['16434'].horasSemana, 3); // 16:00–17:35 = 1.5 h × 2
  assert.equal(porCrn['16434'].idioma, 'EN'); // Bachillerato Intercultural
  assert.equal(porCrn['16434'].plan, 'Bachillerato General Bilingüe');
  assert.equal(porCrn['16500'].horarios[0].inicio, '12:00'); // hora como número de Excel
  assert.equal(porCrn['16500'].horasSemana, 1.5);
});

test('docentes con nombre separado y número de grupos', () => {
  const maria = resultado.docentes.find((d) => d.nomina === 'L03500001');
  assert.deepEqual(
    [maria.nombres, maria.apellidoPaterno, maria.apellidoMaterno, maria.grupos],
    ['María', 'López', 'Ruiz', 2],
  );
  const guillermo = resultado.docentes.find((d) => d.nomina === 'L03500002');
  assert.equal(guillermo.apellidoMaterno, 'Von Putlitz');
  const ana = resultado.docentes.find((d) => d.nomina === 'L03500003');
  assert.deepEqual([ana.nombres, ana.apellidoPaterno, ana.apellidoMaterno], ['Ana Laura', 'De la Cruz', 'Pérez']);
  assert.equal(resultado.docentes.length, 4);
});

test('avisa filas con nómina inválida sin detener la lectura', () => {
  assert.ok(resultado.avisos.some((a) => a.tipo === 'NOMINA_INVALIDA' && a.crn === '16600' && a.fila === 10));
  assert.equal(porCrn['16600'], undefined);
});

test('grupos a omitir configurables', () => {
  const r = grupos.leer(excelGrupos(), { omitirGrupos: 'F61' });
  assert.deepEqual(r.omitidos.map((o) => o.crn), ['22023']);
  assert.ok(r.asignaturas.some((a) => a.crn === '22030'));
});

test('archivo que no es de grupos → ArchivoNoReconocido (422)', () => {
  assert.throws(() => grupos.leer(libro({ Hoja1: [['a', 'b']] })), { name: 'ArchivoNoReconocido', status: 422 });
  assert.throws(
    () => grupos.leer(libro({ Salida: [ENCABEZADOS_GRUPOS.filter((e) => e !== 'CRN')] })),
    (e) => e.status === 422 && e.details.some((d) => d.campo === 'crn'),
  );
  assert.throws(() => grupos.leer(Buffer.from('no es excel')), { status: 422 });
  assert.throws(() => grupos.leer(Buffer.alloc(0)), { status: 422 });
});
