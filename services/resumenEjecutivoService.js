/**
 * Resumen ejecutivo en diapositivas (HU-26; 06 §Analítica · GET /analitica/resumen-ejecutivo; 05 §1.1).
 *
 *   resumen(db, { periodoId?, compararCon?, graficas? }, hoy?)
 *     → { portada, kpis: [...], diapositivas: [{ id, titulo, pregunta, conclusion, sinDatos, datos }], hallazgos: [...] }
 *   plantilla(db, { periodos? })   GET /analitica/plantilla → { semestres } (G15)
 *
 * Los datos de cada gráfica salen de lib/analitica.js (#64); aquí se arma el titular con la conclusión
 * ("El campus subió 1.7 pts…"), generado de los mismos números. Sin datos → sinDatos: true y la conclusión
 * "Sin datos registrados en este semestre" (nunca datos de ejemplo).
 *
 * Semestre: periodoId (por defecto el actual) para faltas, pagos y plantilla. Las gráficas de OPINA usan ese
 * semestre si ya tiene OPINA importado; si no (el semestre en curso), el último con OPINA anterior a él, y lo dicen.
 * compararCon: semestre contra el que se comparan G1, G2 y G4 (por defecto, el anterior con datos).
 * Sin comentarios de alumnos ni observaciones de baja: solo conteos y nombres de docentes (G3, G4, hallazgos).
 */
const { HttpError } = require('../lib/errores');
const analitica = require('../lib/analitica');
const config = require('../lib/configuracion');
const { nombreCompleto } = require('../lib/nombres');
const inasistencias = require('./inasistenciasService');
const campus = require('./opinaCampusService');

const GRAFICAS = ['G1', 'G2', 'G3', 'G4', 'G9', 'G10', 'G15', 'G16'];
const TITULOS = {
  G1: ['% OPP de Preparatoria Veracruz por semestre', '¿Mejoramos o empeoramos?'],
  G2: ['Docentes por rango de calificación OPINA', '¿Cuántos maestros están en zona de riesgo?'],
  G3: ['Los 5 mejores y los 5 más bajos', '¿Quiénes destacan y quiénes necesitan apoyo?'],
  G4: ['Cambio por docente entre dos semestres', '¿Quién mejoró o bajó más?'],
  G9: ['Faltas por tipo', '¿Por qué faltan?'],
  G10: ['Descontado vs. pagado a suplentes por quincena', '¿Cuánto cuesta realmente cubrir faltas?'],
  G15: ['Docentes activos, nuevos y bajas por semestre', '¿Cómo cambia la plantilla?'],
  G16: ['Perfil de la plantilla', '¿Cómo está formada la plantilla?'],
};
const SIN_DATOS = 'Sin datos registrados en este semestre';
const POSGRADOS = ['Especialidad', 'Maestría', 'Doctorado'];

const un = (n) => Math.round(n * 10) / 10;
const pct = (parte, total) => (total ? Math.round((100 * parte) / total) : 0);
const pts = (n) => `${Math.abs(n).toFixed(1)} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`;
const dinero = (n) => `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const vacio = (v) => v === undefined || v === null || v === '';

// ------------------------------------------------------------------ periodos

function periodoPorId(db, id, campo) {
  const p = db.prepare('SELECT id, clave, fecha_inicio FROM periodos WHERE id = ?').get(Number(id));
  if (!p) throw new HttpError(404, 'Ese semestre no existe.', 'PERIODO_NO_EXISTE', [{ campo, problema: 'NO_EXISTE' }]);
  return p;
}

function elegirPeriodos(db, query) {
  const periodo = vacio(query.periodoId)
    ? db.prepare('SELECT id, clave, fecha_inicio FROM periodos WHERE actual = 1').get() ?? null
    : periodoPorId(db, query.periodoId, 'periodoId');
  const compararCon = vacio(query.compararCon) ? null : periodoPorId(db, query.compararCon, 'compararCon');
  // OPINA: el semestre elegido si ya lo tiene; si no, el último con OPINA anterior a él
  const opina = db.prepare(`SELECT p.id, p.clave, p.fecha_inicio FROM periodos p
                            WHERE EXISTS (SELECT 1 FROM opina_respuestas r WHERE r.periodo_id = p.id)
                              AND (@inicio IS NULL OR p.fecha_inicio <= @inicio)
                            ORDER BY p.fecha_inicio DESC, p.id DESC LIMIT 1`).get({ inicio: periodo?.fecha_inicio ?? null }) ?? null;
  return { periodo, compararCon, opina };
}

function graficasPedidas(valor) {
  if (vacio(valor)) return GRAFICAS;
  const pedidas = String(valor).split(',').map((g) => g.trim().toUpperCase()).filter(Boolean);
  const malas = pedidas.filter((g) => !GRAFICAS.includes(g));
  if (malas.length) throw new HttpError(400, `Gráficas desconocidas: ${malas.join(', ')}.`, 'VALIDACION', [{ campo: 'graficas', problema: 'VALOR_INVALIDO' }]);
  return GRAFICAS.filter((g) => pedidas.includes(g));
}

// ------------------------------------------------------------------ diapositivas

function diapositiva(id, conclusion, datos, sinDatos = false) {
  const [titulo, pregunta] = TITULOS[id];
  return { id, titulo, pregunta, conclusion: sinDatos ? SIN_DATOS : conclusion, sinDatos, datos };
}

/** G1: el último semestre capturado hasta el elegido, contra compararCon o el anterior capturado. */
function g1(db, ctx) {
  const todos = analitica.oppCampus(db);
  const hasta = ctx.periodo ? todos.filter((s) => {
    const p = db.prepare('SELECT fecha_inicio FROM periodos WHERE id = ?').get(s.periodoId);
    return p.fecha_inicio <= ctx.periodo.fecha_inicio;
  }) : todos;
  if (!hasta.length) return diapositiva('G1', null, { semestres: todos }, true);
  const ultimo = hasta.at(-1);
  const base = ctx.compararCon ? todos.find((s) => s.periodoId === ctx.compararCon.id) : hasta.at(-2);
  let conclusion = `El campus tiene ${ultimo.opp} % de opinión positiva en ${ultimo.periodo}`;
  if (base && base.periodoId !== ultimo.periodoId) {
    const d = un(ultimo.opp - base.opp);
    conclusion = d === 0
      ? `El campus se mantuvo en ${ultimo.opp} % de opinión positiva respecto a ${base.periodo}`
      : `El campus ${d > 0 ? 'subió' : 'bajó'} ${pts(d)} en OPINA respecto a ${base.periodo} (${base.opp} % → ${ultimo.opp} %)`;
  }
  return diapositiva('G1', conclusion, { semestres: todos, ultimo: ultimo.periodoId, comparadoCon: base?.periodoId ?? null });
}

/** G2: semestre de OPINA (y el de comparación) por rangos. */
function g2(db, ctx) {
  if (!ctx.opina) return diapositiva('G2', null, { semestres: [] }, true);
  const ids = [ctx.compararCon?.id, ctx.opina.id].filter(Boolean);
  const todos = analitica.distribucionOpina(db, {});
  const semestres = ctx.compararCon ? analitica.distribucionOpina(db, { periodoIds: ids }) : todos.filter((s) => {
    const p = db.prepare('SELECT fecha_inicio FROM periodos WHERE id = ?').get(s.periodoId);
    return p.fecha_inicio <= ctx.opina.fecha_inicio;
  }).slice(-3);
  const actual = semestres.find((s) => s.periodoId === ctx.opina.id);
  if (!actual || !actual.docentes) return diapositiva('G2', null, { semestres }, true);
  const rango = (r) => actual.rangos.find((x) => x.rango === r).docentes;
  const riesgo = rango('< 70');
  const conclusion = `${rango('90–100')} de ${actual.docentes} maestros (${pct(rango('90–100'), actual.docentes)} %) están en 90–100 % en ${actual.periodo}; `
    + (riesgo ? `${plural(riesgo, 'está', 'están')} en zona de riesgo (< 70 %)` : 'ninguno está en zona de riesgo (< 70 %)');
  return diapositiva('G2', conclusion, { semestres, rangos: analitica.RANGOS_OPINA });
}

function g3(db, ctx) {
  const datos = ctx.opina ? analitica.topBottomOpina(db, { periodoId: ctx.opina.id, n: 5 }) : { top: [], bottom: [] };
  if (!datos.top.length) return diapositiva('G3', null, datos, true);
  const prom = (l) => un(l.reduce((s, d) => s + d.porcentaje, 0) / l.length);
  const conclusion = datos.bottom.length
    ? `Los ${datos.top.length} mejores promedian ${prom(datos.top)} % y los ${datos.bottom.length} más bajos ${prom(datos.bottom)} % en ${datos.periodo}`
    : `Los ${datos.top.length} mejores promedian ${prom(datos.top)} % en ${datos.periodo}`;
  return diapositiva('G3', conclusion, datos);
}

function g4(db, ctx) {
  const datos = ctx.opina ? analitica.cambioOpina(db, { periodoId: ctx.opina.id, compararCon: ctx.compararCon?.id }) : { antes: null, despues: null, docentes: [] };
  if (!datos.docentes.length) return diapositiva('G4', null, datos, true);
  const suben = datos.docentes.filter((d) => d.cambio > 0).length;
  const bajan = datos.docentes.filter((d) => d.cambio < 0).length;
  const mayor = datos.docentes[0];
  let conclusion = `${plural(suben, 'maestro mejoró', 'maestros mejoraron')} y ${plural(bajan, 'bajó', 'bajaron')} respecto a ${datos.antes.periodo}`;
  if (mayor.cambio > 0) conclusion += `; el mayor avance fue de +${mayor.cambio.toFixed(1)} pts`;
  return diapositiva('G4', conclusion, datos);
}

function g9(db, ctx) {
  const datos = analitica.faltasPorTipo(db, { periodoId: ctx.periodo?.id });
  const total = datos.tipos.reduce((s, t) => s + t.faltas, 0);
  if (!total) return diapositiva('G9', null, datos, true);
  const [personal, medica] = datos.tipos;
  const mayor = personal.faltas >= medica.faltas ? personal : medica;
  const conclusion = `${pct(mayor.faltas, total)} % de las faltas de ${datos.periodo} fueron por ${mayor.tipo.toLowerCase()} (${mayor.faltas} de ${total})`;
  return diapositiva('G9', conclusion, { ...datos, total });
}

function g10(db, ctx) {
  const datos = analitica.descontadoVsPagado(db, { periodoId: ctx.periodo?.id });
  if (!datos.quincenas.length) return diapositiva('G10', null, datos, true);
  const { descontado, pagado, diferencia } = datos.totales;
  let conclusion = `Se descontaron ${dinero(descontado)} y se pagaron ${dinero(pagado)} a suplentes en ${plural(datos.quincenas.length, 'quincena', 'quincenas')}`;
  if (diferencia < 0) conclusion += `: cubrir faltas costó ${dinero(-diferencia)} más de lo descontado`;
  else if (diferencia > 0) conclusion += `: quedan ${dinero(diferencia)} a favor`;
  return diapositiva('G10', conclusion, datos);
}

/** G15: semestres con grupos o bajas hasta el elegido (o los pedidos). */
function semestresPlantilla(db, ctx) {
  return analitica.plantillaPorSemestre(db, {})
    .filter((s) => s.activos || s.bajas)
    .filter((s) => {
      if (!ctx.periodo) return true;
      const p = db.prepare('SELECT fecha_inicio FROM periodos WHERE id = ?').get(s.periodoId);
      return p.fecha_inicio <= ctx.periodo.fecha_inicio;
    });
}

function g15(db, ctx) {
  const semestres = semestresPlantilla(db, ctx);
  const actual = semestres.find((s) => s.periodoId === ctx.periodo?.id) ?? semestres.at(-1);
  if (!actual) return diapositiva('G15', null, { semestres }, true);
  const anterior = semestres[semestres.indexOf(actual) - 1];
  let conclusion = anterior
    ? `La plantilla pasó de ${anterior.activos} a ${actual.activos} docentes activos`
    : `${actual.activos} docentes activos en ${actual.periodo}`;
  const partes = [];
  if (!actual.sinHistorial) partes.push(plural(actual.nuevos, 'nuevo', 'nuevos'));
  partes.push(plural(actual.bajas, 'baja', 'bajas'));
  conclusion += `; ${partes.join(' y ')} en ${actual.periodo}`;
  if (actual.bajasNoRecontratables) conclusion += ` (${actual.bajasNoRecontratables} no recontratable${actual.bajasNoRecontratables === 1 ? '' : 's'})`;
  return diapositiva('G15', conclusion, { semestres });
}

function g16(db) {
  const datos = analitica.perfilDocentes(db, {});
  const total = datos.genero.reduce((s, g) => s + g.docentes, 0);
  if (!total) return diapositiva('G16', null, datos, true);
  const posgrado = datos.nivelEstudios.filter((n) => POSGRADOS.includes(n.nivelEstudios)).reduce((s, n) => s + n.docentes, 0);
  const m = datos.genero.find((g) => g.genero === 'F')?.docentes ?? 0;
  const h = datos.genero.find((g) => g.genero === 'M')?.docentes ?? 0;
  const conclusion = `${pct(posgrado, total)} % de la plantilla tiene posgrado y ${plural(datos.estudiando.si, 'docente está', 'docentes están')} estudiando; ${plural(m, 'mujer', 'mujeres')} y ${plural(h, 'hombre', 'hombres')}`;
  return diapositiva('G16', conclusion, { ...datos, total });
}

const CONSTRUCTORES = { G1: g1, G2: g2, G3: g3, G4: g4, G9: g9, G10: g10, G15: g15, G16: g16 };

// ------------------------------------------------------------------ KPIs y hallazgos

function kpis(db, ctx, semestre) {
  const activos = db.prepare('SELECT COUNT(*) FROM docentes WHERE activo = 1').pluck().get();
  const opp = analitica.oppCampus(db).filter((s) => !ctx.periodo || db.prepare('SELECT fecha_inicio FROM periodos WHERE id = ?').get(s.periodoId).fecha_inicio <= ctx.periodo.fecha_inicio).at(-1);
  const prom = ctx.opina ? campus.promedioMaestros(db, ctx.opina.id) : { promedio: null, docentes: 0 };
  const ind = semestre?.indicadores;
  return [
    { id: 'docentesActivos', etiqueta: 'Docentes activos', valor: activos },
    { id: 'oppCampus', etiqueta: '% OPP del campus', valor: opp?.opp ?? null, unidad: '%', variacion: opp?.variacion ?? null, periodo: opp?.periodo ?? null },
    { id: 'promedioMaestros', etiqueta: 'Promedio OPINA de maestros', valor: prom.promedio, unidad: '%', periodo: ctx.opina?.clave ?? null },
    { id: 'faltas', etiqueta: 'Faltas del semestre', valor: ind?.faltas ?? 0, detalle: ind ? `${plural(ind.profesores, 'profesor', 'profesores')}` : null },
    { id: 'descontado', etiqueta: 'Descontado en el semestre', valor: ind?.montoDescontado ?? 0, unidad: '$' },
    { id: 'pagadoSuplentes', etiqueta: 'Pagado a suplentes', valor: ind?.pagadoSuplentes ?? 0, unidad: '$' },
  ];
}

function hallazgos(db, ctx, semestre) {
  const lista = [];
  if (ctx.opina) {
    const minimo = campus.muestraMinima(db);
    const bajos = db.prepare(`SELECT v.docente_id, v.respuestas, v.porcentaje, d.nombres, d.apellido_paterno, d.apellido_materno
                              FROM v_opina_docente v JOIN docentes d ON d.id = v.docente_id
                              WHERE v.periodo_id = ? AND v.respuestas >= ? AND v.porcentaje < 70 ORDER BY v.porcentaje`).all(ctx.opina.id, minimo);
    if (bajos.length) {
      lista.push({
        id: 'opinaBaja', nivel: 'alerta',
        texto: `${plural(bajos.length, 'docente tiene', 'docentes tienen')} OPINA menor a 70 % en ${ctx.opina.clave}`,
        docentes: bajos.map((b) => ({ docenteId: b.docente_id, nombre: nombreCompleto({ nombres: b.nombres, apellidoPaterno: b.apellido_paterno, apellidoMaterno: b.apellido_materno }), porcentaje: b.porcentaje })),
      });
    }
  }
  const opp = analitica.oppCampus(db).filter((s) => !ctx.periodo || db.prepare('SELECT fecha_inicio FROM periodos WHERE id = ?').get(s.periodoId).fecha_inicio <= ctx.periodo.fecha_inicio).at(-1);
  if (opp?.variacion) {
    lista.push(opp.variacion < 0
      ? { id: 'oppBaja', nivel: 'alerta', texto: `El % OPP del campus bajó ${pts(opp.variacion)} en ${opp.periodo}` }
      : { id: 'oppSube', nivel: 'positivo', texto: `El % OPP del campus subió ${pts(opp.variacion)} en ${opp.periodo}` });
  }
  const masFaltas = (semestre?.porDocente ?? []).filter((d) => d.faltas >= 3).slice(0, 3);
  if (masFaltas.length) {
    lista.push({
      id: 'masFaltas', nivel: 'aviso',
      texto: `${plural(masFaltas.length, 'docente acumula', 'docentes acumulan')} 3 o más faltas en ${semestre.periodo.clave}`,
      docentes: masFaltas.map((d) => ({ docenteId: d.docenteId, nombre: d.nombre, faltas: d.faltas })),
    });
  }
  if (ctx.periodo) {
    const sinContrato = db.prepare("SELECT COUNT(*) FROM asignaturas WHERE periodo_id = ? AND crn IS NOT NULL AND (num_contrato IS NULL OR num_contrato = '')").pluck().get(ctx.periodo.id);
    if (sinContrato) lista.push({ id: 'crnSinContrato', nivel: 'aviso', texto: `${plural(sinContrato, 'CRN no tiene', 'CRN no tienen')} contrato capturado en ${ctx.periodo.clave}`, total: sinContrato });
  }
  const pendientes = db.prepare('SELECT COUNT(*) FROM faltas WHERE quincena_id IS NULL').pluck().get();
  if (pendientes) lista.push({ id: 'faltasPendientes', nivel: 'aviso', texto: `${plural(pendientes, 'falta está pendiente', 'faltas están pendientes')} de reportar a Nacional`, total: pendientes });
  const suplenteSinContrato = db.prepare("SELECT COUNT(*) FROM incidencias WHERE origen = 'suplencia' AND num_contrato IS NULL AND quincena_id IS NULL").pluck().get();
  if (suplenteSinContrato) lista.push({ id: 'suplenteSinContrato', nivel: 'aviso', texto: `${plural(suplenteSinContrato, 'pago a suplente no tiene', 'pagos a suplentes no tienen')} contrato`, total: suplenteSinContrato });
  if (!lista.length) lista.push({ id: 'sinAlertas', nivel: 'positivo', texto: 'Sin alertas en este semestre' });
  return lista;
}

// ------------------------------------------------------------------ rutas

/** GET /analitica/resumen-ejecutivo?periodoId=&compararCon=&graficas=G1,G2,… */
function resumen(db, query = {}, hoy = new Date()) {
  const graficas = graficasPedidas(query.graficas);
  const ctx = elegirPeriodos(db, query);
  const semestre = ctx.periodo ? inasistencias.resumenSemestral(db, { periodoId: ctx.periodo.id }) : null;
  const clave = ctx.periodo?.clave ?? 'Sin semestre';
  return {
    portada: {
      titulo: 'Resumen ejecutivo',
      encabezado: `Coordinación de Docentes · Preparatoria Veracruz · ${clave}`,
      periodo: ctx.periodo && { id: ctx.periodo.id, clave: ctx.periodo.clave },
      compararCon: ctx.compararCon && { id: ctx.compararCon.id, clave: ctx.compararCon.clave },
      periodoOpina: ctx.opina && { id: ctx.opina.id, clave: ctx.opina.clave },
      notaOpina: ctx.opina && ctx.periodo && ctx.opina.id !== ctx.periodo.id ? `OPINA más reciente: ${ctx.opina.clave}` : null,
      preparadoPor: config.obtener(db, 'perfil.nombre') ?? 'Coordinación de Docentes',
      generadoEn: hoy.toISOString(),
    },
    kpis: kpis(db, ctx, semestre),
    diapositivas: graficas.map((id) => CONSTRUCTORES[id](db, ctx)),
    hallazgos: hallazgos(db, ctx, semestre),
  };
}

/** GET /analitica/plantilla?periodos=1,2,3 → G15 por semestre (sin periodos: todos) */
function plantilla(db, query = {}) {
  let periodoIds;
  if (!vacio(query.periodos)) {
    periodoIds = String(query.periodos).split(',').map((x) => x.trim()).filter(Boolean).map(Number);
    if (periodoIds.some((n) => !Number.isInteger(n) || n <= 0)) {
      throw new HttpError(400, 'periodos debe ser una lista de ids separada por comas.', 'VALIDACION', [{ campo: 'periodos', problema: 'VALOR_INVALIDO' }]);
    }
  }
  return { semestres: analitica.plantillaPorSemestre(db, { periodoIds }) };
}

module.exports = { resumen, plantilla, GRAFICAS, SIN_DATOS };
