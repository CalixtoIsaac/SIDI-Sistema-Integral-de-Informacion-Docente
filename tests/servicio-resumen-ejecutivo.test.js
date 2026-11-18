const test = require('node:test');
const assert = require('node:assert/strict');
const { resumen, plantilla, GRAFICAS, SIN_DATOS } = require('../services/resumenEjecutivoService');
const faltas = require('../services/faltasService');
const reportes = require('../services/reporteService');
const { sembrar } = require('../lib/semillas');
const { crearBd } = require('./helpers/bd');
const { crearEscenario } = require('./helpers/escenario');

const HOY = new Date('2026-11-18T18:00:00Z');

/**
 * Semillas (OPP 88.3 → 85.9 → 87.6) + OPINA ENE-MAY 2026 (María 91.7, Ana 90, Laura 66.7; Guillermo con muestra
 * insuficiente) y AGO-DIC 2025 (María 83.3, Ana 100). Faltas de AGO-DIC 2026: María 2 (asunto personal) y Ana 1 (IMSS).
 */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  sembrar(db);
  const periodo = (clave) => db.prepare('SELECT id FROM periodos WHERE clave = ?').get(clave).id;
  const laura = Number(db.prepare("INSERT INTO docentes (nomina, nombres, apellido_paterno, apellido_materno) VALUES ('L03500021', 'Laura', 'Méndez', 'Ríos')").run().lastInsertRowid);
  // una baja con observaciones (no deben salir en el resumen)
  db.prepare("INSERT INTO docente_bajas (docente_id, periodo_id, fecha, motivo, observaciones, recontratable) VALUES (?, ?, '2026-09-01', 'Renuncia', 'texto privado', 1)")
    .run(laura, periodo('AGO-DIC 2026'));
  const resp = db.prepare('INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda, comentario) VALUES (?, ?, ?, ?, ?, ?)');
  const respuestas = (p, docente, crn, si, total) => {
    const imp = Number(db.prepare("INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'x.xlsx', 'v2', 0)").run(p).lastInsertRowid);
    for (let i = 0; i < total; i++) resp.run(imp, p, docente, crn, i < si ? 1 : 0, 'comentario de alumno');
  };
  const ene26 = periodo('ENE-MAY 2026');
  const ago25 = periodo('AGO-DIC 2025');
  respuestas(ene26, ids.ana, '16434', 27, 30);
  respuestas(ene26, laura, '16711', 8, 12);
  respuestas(ago25, ids.maria, '15901', 10, 12);
  respuestas(ago25, ids.ana, '15902', 20, 20);
  db.prepare("UPDATE asignaturas SET num_contrato = '5500003' WHERE docente_id = ?").run(ids.ana);
  const asig = (crn) => db.prepare('SELECT id FROM asignaturas WHERE crn = ? AND periodo_id = 1').get(crn).id;
  faltas.crear(db, { motivo: 'Falta por asunto personal', docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [asig('16001'), asig('16002')] });
  faltas.crear(db, { motivo: 'Falta por asunto personal', docenteId: ids.ana, fechas: ['2026-08-18'], asignaturaIds: [asig('16434')], justificacion: 'incapacidad_imss', folioImss: 'X1',
    suplencias: [{ asignaturaId: asig('16434'), fecha: '2026-08-18', docenteSuplenteId: ids.guillermo }] });
  return { ...e, ids: { ...ids, laura }, periodo };
}

const diapo = (r, id) => r.diapositivas.find((d) => d.id === id);

test('estructura: portada, KPIs, las 8 diapositivas en orden con titular y conclusión, y hallazgos', () => {
  const { db } = escenario();
  const r = resumen(db, {}, HOY);
  assert.equal(r.portada.encabezado, 'Coordinación de Docentes · Preparatoria Veracruz · AGO-DIC 2026');
  assert.equal(r.portada.notaOpina, 'OPINA más reciente: ENE-MAY 2026');
  assert.deepEqual(r.diapositivas.map((d) => d.id), GRAFICAS);
  assert.ok(r.diapositivas.every((d) => d.titulo && d.pregunta && d.conclusion && 'datos' in d));
  assert.deepEqual(r.kpis.map((k) => k.id), ['docentesActivos', 'oppCampus', 'promedioMaestros', 'faltas', 'descontado', 'pagadoSuplentes']);
  assert.deepEqual(r.kpis.find((k) => k.id === 'oppCampus'), { id: 'oppCampus', etiqueta: '% OPP del campus', valor: 87.6, unidad: '%', variacion: 1.7, periodo: 'ENE-MAY 2026' });
  assert.deepEqual([r.kpis.find((k) => k.id === 'faltas').valor, r.kpis.find((k) => k.id === 'descontado').valor, r.kpis.find((k) => k.id === 'pagadoSuplentes').valor], [3, 160, 65]);
});

test('conclusiones generadas de los datos (G1, G2, G3, G4, G9, G15, G16)', () => {
  const { db } = escenario();
  const r = resumen(db, {}, HOY);
  assert.equal(diapo(r, 'G1').conclusion, 'El campus subió 1.7 pts en OPINA respecto a AGO-DIC 2025 (85.9 % → 87.6 %)');
  assert.equal(diapo(r, 'G2').conclusion, '2 de 3 maestros (67 %) están en 90–100 % en ENE-MAY 2026; 1 está en zona de riesgo (< 70 %)');
  assert.equal(diapo(r, 'G3').conclusion, 'Los 3 mejores promedian 82.8 % en ENE-MAY 2026');
  assert.equal(diapo(r, 'G4').conclusion, '1 maestro mejoró y 1 bajó respecto a AGO-DIC 2025; el mayor avance fue de +8.4 pts');
  assert.equal(diapo(r, 'G9').conclusion, '67 % de las faltas de AGO-DIC 2026 fueron por asunto personal (2 de 3)');
  assert.match(diapo(r, 'G15').conclusion, /docentes activos en AGO-DIC 2026|La plantilla pasó de/);
  assert.match(diapo(r, 'G16').conclusion, /% de la plantilla tiene posgrado/);
});

test('sin datos: la diapositiva lo dice y nunca inventa (G10 sin quincenas reportadas); con el reporte generado ya tiene datos', async () => {
  const { db } = escenario();
  const g10 = diapo(resumen(db, {}, HOY), 'G10');
  assert.deepEqual([g10.sinDatos, g10.conclusion], [true, SIN_DATOS]);
  const q16 = db.prepare('SELECT id FROM quincenas WHERE anio = 2026 AND numero = 16').get().id;
  await reportes.generarIncidencias(db, q16);
  assert.equal(diapo(resumen(db, {}, HOY), 'G10').conclusion,
    'Se descontaron $160.00 y se pagaron $65.00 a suplentes en 1 quincena: quedan $95.00 a favor');

  const vacia = crearBd();
  sembrar(vacia);
  const r = resumen(vacia, {}, HOY);
  assert.deepEqual(r.diapositivas.filter((d) => d.sinDatos).map((d) => d.id), ['G2', 'G3', 'G4', 'G9', 'G10', 'G15', 'G16']);
  assert.equal(diapo(r, 'G1').sinDatos, false); // el % OPP oficial viene de la semilla
});

test('comparar con otro semestre y elegir gráficas; 400 con gráfica desconocida y 404 con semestre inexistente', () => {
  const { db, periodo } = escenario();
  const r = resumen(db, { compararCon: periodo('ENE-MAY 2025'), graficas: 'g1,G4' }, HOY);
  assert.deepEqual(r.diapositivas.map((d) => d.id), ['G1', 'G4']);
  assert.equal(diapo(r, 'G1').conclusion, 'El campus bajó 0.7 pts en OPINA respecto a ENE-MAY 2025 (88.3 % → 87.6 %)');
  assert.equal(diapo(r, 'G4').sinDatos, true); // nadie con muestra suficiente en ENE-MAY 2025
  assert.throws(() => resumen(db, { graficas: 'G1,G99' }), (e) => e.status === 400);
  assert.throws(() => resumen(db, { periodoId: 999 }), (e) => e.status === 404);
});

test('hallazgos: OPINA < 70 %, variación del campus, faltas pendientes; sin comentarios ni observaciones', () => {
  const { db, ids } = escenario();
  const r = resumen(db, {}, HOY);
  const h = Object.fromEntries(r.hallazgos.map((x) => [x.id, x]));
  assert.equal(h.opinaBaja.texto, '1 docente tiene OPINA menor a 70 % en ENE-MAY 2026');
  assert.deepEqual(h.opinaBaja.docentes.map((d) => [d.docenteId, d.porcentaje]), [[ids.laura, 66.7]]);
  assert.equal(h.oppSube.nivel, 'positivo');
  assert.equal(h.faltasPendientes.total, 3);
  const json = JSON.stringify(r);
  assert.doesNotMatch(json, /comentario de alumno|texto privado/);
});

test('GET /analitica/plantilla: G15 por semestre (todos o los pedidos); 400 si la lista no es válida', () => {
  const { db, periodo } = escenario();
  const ago26 = periodo('AGO-DIC 2026');
  assert.deepEqual(plantilla(db, { periodos: String(ago26) }).semestres.map((s) => [s.periodo, s.activos]), [['AGO-DIC 2026', 4]]);
  assert.ok(plantilla(db, {}).semestres.length >= 5);
  assert.throws(() => plantilla(db, { periodos: '1,x' }), (e) => e.status === 400);
});
