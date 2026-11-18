const test = require('node:test');
const assert = require('node:assert/strict');
const XLSX = require('xlsx');
const faltas = require('../services/faltasService');
const incidencias = require('../services/incidenciasService');
const configuracion = require('../services/configuracionService');
const envio = require('../services/envioService');
const eml = require('../lib/correo/eml');
const { crearEscenario } = require('./helpers/escenario');

const BASE = { motivo: 'Falta por asunto personal' };

/** Q16 como en las pruebas de HU-13: María (2 días, la cubre Guillermo + un CRN sin suplente), Ana IMSS, tutoreo de Pedro. */
function escenario() {
  const e = crearEscenario();
  const { db, ids } = e;
  const cat = db.prepare('INSERT OR IGNORE INTO catalogos (tipo, valor, orden) VALUES (?, ?, 0)');
  [['cc_nomina', 'Sueldo Carga Académica'], ['motivo_incidencia', 'BB_Tutoreo (Preparatoria).']].forEach(([t, v]) => cat.run(t, v));
  const q16 = Number(db.prepare("INSERT INTO quincenas (anio, numero, fecha_inicio, fecha_fin, fecha_pago) VALUES (2026, 16, '2026-08-16', '2026-08-31', '2026-08-30')").run().lastInsertRowid);
  db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE docente_id = ?').run('5500002', ids.guillermo);
  db.prepare('UPDATE asignaturas SET num_contrato = ? WHERE docente_id = ?').run('5500003', ids.ana);
  const asig = (crn) => db.prepare('SELECT id FROM asignaturas WHERE crn = ?').get(crn).id;
  const pedro = db.prepare("SELECT id FROM docentes WHERE nomina = 'L03500005'").get().id;
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17', '2026-08-20'], asignaturaIds: [asig('16001')],
    suplencias: ['2026-08-17', '2026-08-20'].map((fecha) => ({ asignaturaId: asig('16001'), fecha, docenteSuplenteId: ids.guillermo })) });
  faltas.crear(db, { ...BASE, docenteId: ids.maria, fechas: ['2026-08-17'], asignaturaIds: [asig('16002')] });
  faltas.crear(db, { ...BASE, docenteId: ids.ana, fechas: ['2026-08-18'], asignaturaIds: [asig('16434')], justificacion: 'incapacidad_imss', folioImss: 'UW465897',
    suplencias: [{ asignaturaId: asig('16434'), fecha: '2026-08-18', docenteSuplenteId: ids.guillermo }] });
  incidencias.crear(db, { docenteId: pedro, numContrato: '3077466', ccNomina: 'Sueldo Carga Académica', motivo: 'BB_Tutoreo (Preparatoria).',
    detalle: 'Tutoreo de 48 alumnos', ceco: '5420103000', importeTotal: 10960, numPeriodos: 9 });
  return { ...e, q16, asig };
}

/** Separa un .eml en encabezados y partes (suficiente para estas pruebas). */
function leerEml(buffer) {
  const texto = buffer.toString('utf8');
  const [cabecera, ...resto] = texto.split('\r\n\r\n');
  const limite = cabecera.match(/boundary="([^"]+)"/)[1];
  const partes = resto.join('\r\n\r\n').split(`--${limite}`).slice(1, -1).map((p) => {
    const [h, ...c] = p.replace(/^\r\n/, '').split('\r\n\r\n');
    return { encabezados: h, contenido: Buffer.from(c.join('').replace(/\r\n/g, ''), 'base64') };
  });
  const asunto = cabecera.match(/Subject: ([\s\S]*?)\r\n(?=\S)/)[1].split(/\r\n /)
    .map((t) => (t.startsWith('=?UTF-8?B?') ? Buffer.from(t.slice(10, -2), 'base64').toString('utf8') : t)).join('');
  return { texto, cabecera, partes, asunto };
}

test('borrador: .eml con X-Unsent, los 3 destinatarios de Nacional, asunto y cuerpo con variables y los 2 Excel', async () => {
  const { db, q16 } = escenario();
  const r = await envio.enviar(db, { quincenaId: q16 });
  assert.equal(r.nombre, 'Reportes PREPA Q16.eml');
  const m = leerEml(r.eml);
  assert.match(m.cabecera, /^X-Unsent: 1\r\n/);
  assert.match(m.cabecera, /\r\nTo: garcia\.sandra@tecmilenio\.mx, ruben\.salas@tecmilenio\.mx, jjbarradas@tecmilenio\.mx\r\n/);
  assert.doesNotMatch(m.cabecera, /\r\nFrom:/);
  assert.equal(m.asunto, 'Reportes PREPA Veracruz Q16 — Descuentos e Incidencias');
  const cuerpo = m.partes[0].contenido.toString('utf8');
  assert.match(cuerpo, /quincena Q16 \(16–31 ago 2026\)/);
  assert.match(cuerpo, /Descuentos: 3 faltas, total descontado \$214\.00\./);
  assert.match(cuerpo, /Incidencias: 3 pagos\./);
  assert.match(cuerpo, /Fecha de pago: 30\/08\/2026\./);
  assert.deepEqual(m.partes.slice(1).map((p) => p.encabezados.match(/filename="([^"]+)"/)[1]), ['DESCUENTO-PREPA Q16.xlsx', 'INCIDENCIAS PREPA Q16.xlsx']);
  assert.deepEqual(XLSX.read(m.partes[2].contenido, { type: 'buffer' }).SheetNames, ['Incidencia', 'detalle']);
  assert.ok(m.texto.split('\r\n').every((l) => l.length <= 998));
});

test('al generar quedan asignadas las faltas a la quincena y el envío en la bitácora', async () => {
  const { db, q16 } = escenario();
  await envio.enviar(db, { quincenaId: q16 });
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM faltas WHERE quincena_id IS NULL').get().n, 0);
  const [e] = envio.envios(db, { quincenaId: q16 }).envios;
  assert.deepEqual([e.quincena, e.modo, e.resultado, e.reportes, e.para.length], ['Q16 2026', 'borrador', 'borrador_generado', ['DESCUENTO-PREPA Q16.xlsx', 'INCIDENCIAS PREPA Q16.xlsx'], 3]);
  assert.equal(e.asunto, 'Reportes PREPA Veracruz Q16 — Descuentos e Incidencias');
});

test('mailto (respaldo): enlace con destinatarios, asunto y cuerpo + URLs de los 2 archivos; datos del cuerpo pisan la configuración', async () => {
  const { db, q16 } = escenario();
  const r = await envio.enviar(db, { quincenaId: q16, modo: 'mailto', para: 'yo@tecmilenio.mx', cc: ['a@x.mx', 'b@x.mx'], asunto: 'Q {quincena}' });
  assert.match(r.mailto, /^mailto:yo@tecmilenio\.mx\?cc=a%40x\.mx%2Cb%40x\.mx&subject=Q%20Q16&body=Buen%20d%C3%ADa%2C%0D%0A/);
  assert.deepEqual(r.archivos, [
    { nombre: 'DESCUENTO-PREPA Q16.xlsx', url: `/api/reportes/descuentos?quincenaId=${q16}` },
    { nombre: 'INCIDENCIAS PREPA Q16.xlsx', url: `/api/reportes/incidencias?quincenaId=${q16}` },
  ]);
  assert.equal(envio.envios(db, {}).envios[0].resultado, 'mailto_abierto');
});

test('con avisos rojos no se genera nada (400 AVISOS_ROJOS); excluyendo la falta sí se envía', async () => {
  const { db, ids, q16, asig } = escenario();
  db.prepare('UPDATE asignaturas SET num_contrato = NULL WHERE docente_id = ?').run(ids.maria);
  await assert.rejects(envio.enviar(db, { quincenaId: q16 }), (e) => e.status === 400 && e.code === 'AVISOS_ROJOS'
    && e.details.every((a) => a.reporte === 'descuentos' && a.tipo === 'SIN_CONTRATO'));
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM faltas WHERE quincena_id IS NOT NULL').get().n, 0);
  assert.deepEqual(envio.envios(db, {}).envios, []);
  const deMaria = db.prepare('SELECT id FROM faltas WHERE docente_id = ? AND asignatura_id = ?').all(ids.maria, asig('16002')).map((f) => f.id);
  const sinContrato = db.prepare('SELECT id FROM faltas WHERE docente_id = ?').all(ids.maria).map((f) => f.id);
  assert.ok(deMaria.length);
  const r = await envio.enviar(db, { quincenaId: q16, excluir: sinContrato.join(',') });
  assert.match(leerEml(r.eml).partes[0].contenido.toString('utf8'), /Descuentos: 0 faltas/);
});

test('validación del correo: quincena obligatoria, correos con formato, modo válido', async () => {
  const { db, q16 } = escenario();
  const campo = (c) => (e) => e.status === 400 && e.details.some((x) => x.campo === c);
  await assert.rejects(envio.enviar(db, {}), campo('quincenaId'));
  await assert.rejects(envio.enviar(db, { quincenaId: q16, para: 'no-es-correo' }), campo('para'));
  await assert.rejects(envio.enviar(db, { quincenaId: q16, para: '' }), campo('para'));
  await assert.rejects(envio.enviar(db, { quincenaId: q16, modo: 'smtp' }), campo('modo'));
});

test('Configuración → Correo: claves correo.* editables y validadas (lista normalizada con ";")', () => {
  const { db } = escenario();
  assert.equal(configuracion.listar(db)['correo.modo'], 'borrador');
  const c = configuracion.actualizar(db, { 'correo.para': 'A@Tecmilenio.mx, b@tecmilenio.mx', 'correo.cc': '', 'correo.enviar_al_cerrar': true });
  assert.deepEqual([c['correo.para'], c['correo.cc'], c['correo.enviar_al_cerrar']], ['a@tecmilenio.mx;b@tecmilenio.mx', '', '1']);
  assert.throws(() => configuracion.actualizar(db, { 'correo.cc': 'sin arroba', 'correo.asunto': '' }),
    (e) => e.status === 400 && e.details.length === 2);
});

test('eml: nombres con acento usan filename*, asunto ASCII sin codificar, CRLF', () => {
  const b = eml.construir({ para: 'a@x.mx', asunto: 'Hola', cuerpo: 'uno\ndos', adjuntos: [{ nombre: 'Resumen ñ.xlsx', contenido: Buffer.from('x') }] }).toString();
  assert.match(b, /Subject: Hola\r\n/);
  assert.match(b, /filename\*=UTF-8''Resumen%20%C3%B1\.xlsx/);
  assert.equal(b.replace(/\r\n/g, '').includes('\n'), false);
});
