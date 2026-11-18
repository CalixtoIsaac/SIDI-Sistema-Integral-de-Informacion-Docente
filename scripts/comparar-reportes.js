#!/usr/bin/env node
/**
 * Compara un reporte de Nacional real contra el que genera SIDI (HU-13; 07 §4.3 punto 6).
 *
 *   node scripts/comparar-reportes.js "<original>.xlsx" "<generado por SIDI>.xlsx" [--solo-formato]
 *
 * Detecta solo si son de Descuentos o de Incidencias y revisa:
 *   FORMATO  hojas, encabezados, anchos de columna, fuente/relleno/formato de número de la primera fila de
 *            datos, Tabla17, vínculos externos, calcChain y recálculo al abrir.
 *   DATOS    número de filas, totales y fila por fila (por nómina + fecha + CRN en Descuentos; por nómina +
 *            contrato + importe en Incidencias; por nómina en detalle): montos, contratos, días, cuentas…
 *            Solo tiene sentido si en SIDI se capturó la MISMA quincena que el original.
 *
 * Privacidad: solo imprime conteos, números de fila, CRN y columnas. Nunca nombres, nóminas ni textos de
 * los archivos, así el resultado se puede pegar tal cual en el issue. Los archivos no se copian a ningún lado.
 *
 * Errores de captura conocidos del original (07 §3.3 y §4.4: $53/$68/$69/$107 en vez de la tarifa, C de detalle
 * distinto de 0 en faltas IMSS, Tabla17 mal dimensionada) salen como "diferencia esperada".
 */
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const JSZip = require('jszip');

const MONTOS_DE_CAPTURA = new Set([53, 68, 69, 82, 107]);
const COLS_DESC = 'ABCDEFGHIJKL'.split('');
const COLS_INC = 'ABCDEFGHIJKLMN'.split('');

// ------------------------------------------------------------------ lectura

async function abrir(ruta) {
  const buffer = fs.readFileSync(ruta);
  const zip = await JSZip.loadAsync(buffer);
  const wb = XLSX.read(buffer, { type: 'buffer', cellFormula: true, cellDates: false });
  const libroXml = await zip.file('xl/workbook.xml').async('string');
  return { ruta, zip, wb, libroXml, estilos: await leerEstilos(zip), hojas: await rutasDeHojas(zip, libroXml) };
}

/** nombre de hoja (minúsculas) → ruta del XML */
async function rutasDeHojas(zip, libroXml) {
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const destino = Object.fromEntries([...rels.matchAll(/<Relationship [^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/g)].map((m) => [m[1], m[2]]));
  return Object.fromEntries([...libroXml.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="([^"]+)"/g)]
    .map((m) => [m[1].toLowerCase(), `xl/${destino[m[2]].replace(/^\/?xl\//, '')}`]));
}

async function leerEstilos(zip) {
  const xml = await zip.file('xl/styles.xml').async('string');
  const bloque = (tag) => (xml.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)) ?? [])[1] ?? '';
  const numFmts = Object.fromEntries([...bloque('numFmts').matchAll(/<numFmt [^>]*numFmtId="(\d+)"[^>]*formatCode="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&quot;/g, '"').replace(/&amp;/g, '&')]));
  const fonts = [...bloque('fonts').matchAll(/<font>([\s\S]*?)<\/font>|<font\/>/g)].map((m) => {
    const f = m[1] ?? '';
    return `${(f.match(/<name val="([^"]+)"/) ?? [])[1] ?? '?'} ${(f.match(/<sz val="([^"]+)"/) ?? [])[1] ?? '?'}${/<b\/>|<b val="1"\/>/.test(f) ? ' negrita' : ''}`;
  });
  const fills = [...bloque('fills').matchAll(/<fill>([\s\S]*?)<\/fill>/g)].map((m) => (m[1].match(/<fgColor [^>]*rgb="([^"]+)"/) ?? [])[1] ?? 'sin relleno');
  const xfs = [...bloque('cellXfs').matchAll(/<xf ([^>]*)\/?>/g)].map((m) => {
    const a = (k) => (m[1].match(new RegExp(`${k}="(\\d+)"`)) ?? [])[1] ?? '0';
    const id = a('numFmtId');
    return { fuente: fonts[Number(a('fontId'))] ?? '?', relleno: fills[Number(a('fillId'))] ?? '?', formato: numFmts[id] ?? XLSX.SSF._table[Number(id)] ?? `#${id}` };
  });
  return { xfs };
}

async function xmlHoja(libro, nombre) {
  const ruta = libro.hojas[nombre.toLowerCase()];
  return ruta && libro.zip.file(ruta) ? libro.zip.file(ruta).async('string') : null;
}

function anchos(xml) {
  return Object.fromEntries([...(xml ?? '').matchAll(/<col [^>]*min="(\d+)"[^>]*max="(\d+)"[^>]*width="([\d.]+)"/g)]
    .flatMap((m) => Array.from({ length: Number(m[2]) - Number(m[1]) + 1 }, (_, i) => [XLSX.utils.encode_col(Number(m[1]) - 1 + i), Math.round(Number(m[3]) * 10) / 10])));
}

function estiloDe(libro, xml, ref) {
  const m = (xml ?? '').match(new RegExp(`<c r="${ref}"[^>]*?(?: s="(\\d+)")?[^>]*>`));
  const s = m ? Number((m[0].match(/ s="(\d+)"/) ?? [])[1] ?? 0) : null;
  return s === null ? null : libro.estilos.xfs[s];
}

const valor = (hoja, ref) => (hoja[ref] ? hoja[ref].v : undefined);
const texto = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const numero = (v) => (v === undefined || v === '' || v === null ? null : Math.round(Number(v) * 100) / 100);
const nomina = (v) => String(v ?? '').replace(/\D/g, '').replace(/^0+/, '');

// ------------------------------------------------------------------ reporte

const salida = { formato: [], datos: [], esperadas: [] };
const ok = (lista, msg) => lista.push(`  ✔ ${msg}`);
const mal = (lista, msg) => lista.push(`  ✘ ${msg}`);
const esperada = (msg) => salida.esperadas.push(`  • ${msg}`);

function compararFormatoHoja(orig, gen, nombre, filaEnc, filaDatos, cols) {
  return Promise.all([xmlHoja(orig, nombre), xmlHoja(gen, nombre)]).then(([xo, xg]) => {
    if (!xo || !xg) return mal(salida.formato, `falta la hoja "${nombre}" en ${xo ? 'el generado' : 'el original'}`);
    const ho = orig.wb.Sheets[Object.keys(orig.wb.Sheets).find((k) => k.toLowerCase() === nombre.toLowerCase())];
    const hg = gen.wb.Sheets[Object.keys(gen.wb.Sheets).find((k) => k.toLowerCase() === nombre.toLowerCase())];
    const encDistintos = cols.filter((c) => texto(valor(ho, `${c}${filaEnc}`)) !== texto(valor(hg, `${c}${filaEnc}`)));
    if (encDistintos.length) mal(salida.formato, `${nombre}: encabezados distintos en ${encDistintos.join(', ')}`);
    else ok(salida.formato, `${nombre}: encabezados iguales (${cols[0]}–${cols.at(-1)})`);
    const ao = anchos(xo);
    const ag = anchos(xg);
    const anchoDistinto = cols.filter((c) => ao[c] !== ag[c]);
    if (anchoDistinto.length) mal(salida.formato, `${nombre}: anchos distintos en ${anchoDistinto.map((c) => `${c} (${ao[c] ?? '-'} vs ${ag[c] ?? '-'})`).join(', ')}`);
    else ok(salida.formato, `${nombre}: anchos de columna iguales`);
    for (const [fila, etiqueta] of [[filaEnc, 'encabezado'], [filaDatos, 'primera fila de datos']]) {
      const distintos = cols.map((c) => [c, estiloDe(orig, xo, `${c}${fila}`), estiloDe(gen, xg, `${c}${fila}`)])
        .filter(([, a, b]) => a && b && JSON.stringify(a) !== JSON.stringify(b));
      if (distintos.length) {
        mal(salida.formato, `${nombre}: estilo distinto en ${etiqueta}: ${distintos.map(([c, a, b]) =>
          `${c} [${Object.keys(a).filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} → ${b[k]}`).join('; ')}]`).join(' · ')}`);
      } else ok(salida.formato, `${nombre}: fuente, relleno y formato de número iguales en ${etiqueta}`);
    }
    return { ho, hg, xo, xg };
  });
}

async function revisarArchivoGenerado(gen) {
  const archivos = Object.keys(gen.zip.files);
  if (archivos.some((f) => f.includes('externalLink'))) mal(salida.formato, 'el generado tiene vínculos externos (Excel pediría "Actualizar vínculos")');
  else ok(salida.formato, 'sin vínculos externos');
  if (archivos.includes('xl/calcChain.xml')) mal(salida.formato, 'el generado conserva calcChain.xml');
  if (/fullCalcOnLoad="1"/.test(gen.libroXml)) ok(salida.formato, 'Excel recalcula al abrir (fullCalcOnLoad)');
  else mal(salida.formato, 'falta fullCalcOnLoad: Excel podría mostrar valores viejos');
}

// ------------------------------------------------------------------ Descuentos

function filasDescuentos(hoja) {
  const filas = [];
  const fin = XLSX.utils.decode_range(hoja['!ref']).e.r + 1;
  for (let r = 2; r <= fin; r++) {
    const a = valor(hoja, `A${r}`);
    if (a === undefined || a === '') continue; // la fila de total solo tiene K
    const crn = (texto(valor(hoja, `I${r}`)).match(/CRN\s*(\d+)/i) ?? [])[1] ?? texto(valor(hoja, `I${r}`)).split(' de ')[0].slice(0, 25);
    const e = valor(hoja, `E${r}`);
    const fecha = typeof e === 'number' ? XLSX.SSF.format('yyyy-mm-dd', e) : texto(e);
    filas.push({ fila: r, clave: `${nomina(a)}|${fecha}|${crn}`, crn, contrato: texto(valor(hoja, `B${r}`)), dias: numero(valor(hoja, `D${r}`)),
      motivo: texto(valor(hoja, `F${r}`)), horas: texto(valor(hoja, `G${r}`)), cuenta: texto(valor(hoja, `H${r}`)), monto: numero(valor(hoja, `K${r}`)) });
  }
  return filas;
}

function filaTotal(hoja) {
  const fin = XLSX.utils.decode_range(hoja['!ref']).e.r + 1;
  for (let r = fin; r >= 2; r--) {
    const k = hoja[`K${r}`];
    if (k && (valor(hoja, `A${r}`) === undefined || valor(hoja, `A${r}`) === '')) return { fila: r, formula: k.f ?? null, valor: numero(k.v) };
  }
  return null;
}

function emparejar(lo, lg) {
  const porClave = new Map();
  for (const f of lg) { if (!porClave.has(f.clave)) porClave.set(f.clave, []); porClave.get(f.clave).push(f); }
  const pares = [];
  const soloOriginal = [];
  for (const f of lo) {
    const g = porClave.get(f.clave)?.shift();
    if (g) pares.push([f, g]); else soloOriginal.push(f);
  }
  const soloGenerado = [...porClave.values()].flat();
  return { pares, soloOriginal, soloGenerado };
}

async function compararDescuentos(orig, gen, soloFormato) {
  const r = await compararFormatoHoja(orig, gen, 'Descuentos', 1, 2, COLS_DESC);
  if (!r || soloFormato) return;
  const lo = filasDescuentos(r.ho);
  const lg = filasDescuentos(r.hg);
  (lo.length === lg.length ? ok : mal)(salida.datos, `filas: original ${lo.length} · generado ${lg.length}`);
  const tot = filaTotal(r.hg);
  if (tot && /SUM\(K2:K\d+\)/i.test(tot.formula ?? '')) ok(salida.datos, `fila de total en ${tot.fila} con ${tot.formula}`);
  else mal(salida.datos, 'el generado no tiene la fila de total con =SUM(K…)');
  if (!filaTotal(r.ho)) esperada('el original no trae fila de total (SIDI siempre la agrega, 07 §3.2)');

  const { pares, soloOriginal, soloGenerado } = emparejar(lo, lg);
  let iguales = 0;
  for (const [o, g] of pares) {
    const dif = ['contrato', 'dias', 'motivo', 'horas', 'cuenta', 'monto'].filter((k) => o[k] !== g[k]);
    if (!dif.length) { iguales += 1; continue; }
    if (dif.length === 1 && dif[0] === 'monto' && MONTOS_DE_CAPTURA.has(o.monto)) {
      esperada(`fila ${o.fila} (CRN ${o.crn}): monto ${o.monto} en el original es error de captura; SIDI pone ${g.monto}`);
      continue;
    }
    mal(salida.datos, `fila ${o.fila} → ${g.fila} (CRN ${o.crn}): distinto en ${dif.map((k) => (k === 'monto' || k === 'dias' ? `${k} ${o[k]} vs ${g[k]}` : k)).join(', ')}`);
  }
  ok(salida.datos, `${iguales} de ${lo.length} filas idénticas (contrato, días, motivo, horas, cuenta y monto)`);
  // Total: si solo difiere por los errores de captura conocidos, es diferencia esperada
  const to = lo.reduce((s, f) => s + (f.monto ?? 0), 0);
  const tg = lg.reduce((s, f) => s + (f.monto ?? 0), 0);
  const ajuste = pares.filter(([o, g]) => o.monto !== g.monto && MONTOS_DE_CAPTURA.has(o.monto)).reduce((s, [o, g]) => s + g.monto - o.monto, 0);
  const totalTexto = `total de K: original ${to.toFixed(2)} · generado ${tg.toFixed(2)}`;
  if (Math.abs(to - tg) < 0.005) ok(salida.datos, totalTexto);
  else if (ajuste && Math.abs(to + ajuste - tg) < 0.005) esperada(`${totalTexto} (la diferencia es solo por los errores de captura)`);
  else mal(salida.datos, totalTexto);
  for (const f of soloOriginal) mal(salida.datos, `fila ${f.fila} del original (CRN ${f.crn}) no está en el generado`);
  for (const f of soloGenerado) mal(salida.datos, `fila ${f.fila} del generado (CRN ${f.crn}) no está en el original`);
}

// ------------------------------------------------------------------ Incidencias

function filasIncidencia(hoja) {
  const filas = [];
  const fin = XLSX.utils.decode_range(hoja['!ref']).e.r + 1;
  for (let r = 3; r <= fin; r++) {
    const a = valor(hoja, `A${r}`);
    if (a === undefined || a === '') continue;
    filas.push({ fila: r, clave: `${nomina(a)}|${texto(valor(hoja, `B${r}`))}|${numero(valor(hoja, `K${r}`))}`, contrato: texto(valor(hoja, `B${r}`)),
      tipo: texto(valor(hoja, `D${r}`)), cc: texto(valor(hoja, `E${r}`)), motivo: texto(valor(hoja, `F${r}`)), ceco: texto(valor(hoja, `H${r}`)),
      importe: numero(valor(hoja, `K${r}`)), periodos: numero(valor(hoja, `L${r}`)), porPeriodo: numero(valor(hoja, `M${r}`)),
      crn: (texto(valor(hoja, `G${r}`)).match(/CRN\s*(\d+)/i) ?? [])[1] ?? '-' });
  }
  return filas;
}

function filasDetalle(hoja) {
  const filas = new Map();
  const fin = XLSX.utils.decode_range(hoja['!ref']).e.r + 1;
  for (let r = 2; r <= fin; r++) {
    const a = valor(hoja, `A${r}`);
    if (a === undefined || a === '' || /total/i.test(texto(valor(hoja, `B${r}`)))) continue;
    filas.set(nomina(a), { fila: r, c: numero(valor(hoja, `C${r}`)) ?? 0, d: numero(valor(hoja, `D${r}`)) ?? 0, e: numero(valor(hoja, `E${r}`)) ?? 0,
      situacion: texto(valor(hoja, `F${r}`)), estatus: texto(valor(hoja, `G${r}`)) });
  }
  return filas;
}

async function compararIncidencias(orig, gen, soloFormato) {
  const r = await compararFormatoHoja(orig, gen, 'Incidencia', 2, 4, COLS_INC);
  const d = await compararFormatoHoja(orig, gen, 'detalle', 1, 2, 'ABCDEFG'.split(''));
  const tabla = async (libro) => {
    const archivo = Object.keys(libro.zip.files).find((f) => /xl\/tables\/table\d+\.xml$/.test(f));
    return archivo ? (await libro.zip.file(archivo).async('string')).match(/ ref="([^"]+)"/)[1] : null;
  };
  const [to, tg] = [await tabla(orig), await tabla(gen)];
  if (r) {
    const ultima = Math.max(3, ...filasIncidencia(r.hg).map((f) => f.fila));
    (tg === `A2:N${ultima}` ? ok : mal)(salida.formato, `Tabla17 del generado: ${tg} (datos hasta la fila ${ultima})`);
    const ultimaO = Math.max(3, ...filasIncidencia(r.ho).map((f) => f.fila));
    if (to !== `A2:N${ultimaO}`) esperada(`Tabla17 del original mal dimensionada: ${to} con datos hasta la fila ${ultimaO} (SIDI la corrige)`);
  }
  if (!r || soloFormato) return;

  const lo = filasIncidencia(r.ho);
  const lg = filasIncidencia(r.hg);
  (lo.length === lg.length ? ok : mal)(salida.datos, `Incidencia: filas original ${lo.length} · generado ${lg.length}`);
  const so = lo.reduce((s, f) => s + (f.importe ?? 0), 0);
  const sg = lg.reduce((s, f) => s + (f.importe ?? 0), 0);
  (Math.abs(so - sg) < 0.005 ? ok : mal)(salida.datos, `Incidencia: suma de K original ${so.toFixed(2)} · generado ${sg.toFixed(2)}`);
  const { pares, soloOriginal, soloGenerado } = emparejar(lo, lg);
  let iguales = 0;
  for (const [o, g] of pares) {
    const dif = ['tipo', 'cc', 'motivo', 'ceco', 'periodos', 'porPeriodo'].filter((k) => o[k] !== g[k]);
    if (dif.length) mal(salida.datos, `Incidencia fila ${o.fila} → ${g.fila} (CRN ${o.crn}): distinto en ${dif.join(', ')}`);
    else iguales += 1;
  }
  ok(salida.datos, `Incidencia: ${iguales} de ${lo.length} filas idénticas (contrato, importe, cc, motivo, CeCo, periodos)`);
  for (const f of soloOriginal) mal(salida.datos, `Incidencia fila ${f.fila} del original (CRN ${f.crn}, importe ${f.importe}) no está en el generado`);
  for (const f of soloGenerado) mal(salida.datos, `Incidencia fila ${f.fila} del generado (CRN ${f.crn}, importe ${f.importe}) no está en el original`);

  if (!d) return;
  const dO = filasDetalle(d.ho);
  const dG = filasDetalle(d.hg);
  (dO.size === dG.size ? ok : mal)(salida.datos, `detalle: docentes original ${dO.size} · generado ${dG.size}`);
  let igualesD = 0;
  for (const [n, o] of dO) {
    const g = dG.get(n);
    if (!g) { mal(salida.datos, `detalle fila ${o.fila} del original no está en el generado`); continue; }
    const dif = ['c', 'd', 'e'].filter((k) => Math.abs(o[k] - g[k]) >= 0.005);
    if (!dif.length) { igualesD += 1; continue; }
    if (dif.includes('c') && g.c === 0 && /IMSS/i.test(o.situacion)) {
      esperada(`detalle fila ${o.fila}: C = ${o.c} en el original con falta IMSS; SIDI pone 0 (07 §4.4)`);
      continue;
    }
    mal(salida.datos, `detalle fila ${o.fila} → ${g.fila}: distinto en ${dif.map((k) => `${k.toUpperCase()} ${o[k]} vs ${g[k]}`).join(', ')}`);
  }
  ok(salida.datos, `detalle: ${igualesD} de ${dO.size} docentes con C, D y E iguales`);
  for (const [n, g] of dG) if (!dO.has(n)) mal(salida.datos, `detalle fila ${g.fila} del generado no está en el original`);
}

// ------------------------------------------------------------------ main

async function main() {
  const args = process.argv.slice(2);
  const soloFormato = args.includes('--solo-formato');
  const [rutaO, rutaG] = args.filter((a) => !a.startsWith('--'));
  if (!rutaO || !rutaG) {
    console.log('Uso: node scripts/comparar-reportes.js "<original>.xlsx" "<generado por SIDI>.xlsx" [--solo-formato]');
    process.exit(2);
  }
  const [orig, gen] = await Promise.all([abrir(rutaO), abrir(rutaG)]);
  const esIncidencias = (libro) => Boolean(libro.hojas.incidencia);
  if (esIncidencias(orig) !== esIncidencias(gen)) {
    console.log('✘ Los dos archivos no son del mismo tipo (uno es de Descuentos y el otro de Incidencias).');
    process.exit(1);
  }
  const tipo = esIncidencias(orig) ? 'Incidencias' : 'Descuentos';
  await revisarArchivoGenerado(gen);
  if (tipo === 'Incidencias') await compararIncidencias(orig, gen, soloFormato);
  else await compararDescuentos(orig, gen, soloFormato);

  const fallas = [...salida.formato, ...salida.datos].filter((l) => l.includes('✘')).length;
  console.log(`\nComparación de ${tipo}: ${path.basename(rutaO).replace(/[^\w .-]/g, '')} vs archivo generado por SIDI`);
  console.log('\nFORMATO');
  console.log(salida.formato.join('\n'));
  if (!soloFormato) {
    console.log('\nDATOS');
    console.log(salida.datos.join('\n') || '  (sin datos)');
  }
  if (salida.esperadas.length) {
    console.log('\nDIFERENCIAS ESPERADAS (errores de captura del original, 07 §3.3 y §4.4)');
    console.log(salida.esperadas.join('\n'));
  }
  console.log(`\nResultado: ${fallas ? `✘ ${fallas} diferencia(s) por revisar` : '✔ sin diferencias'}`);
  console.log('Falta la parte manual: abrir el generado en Excel de escritorio (sin aviso de reparar) y compararlo lado a lado.');
  process.exit(fallas ? 1 : 0);
}

if (require.main === module) main().catch((e) => { console.error(e.message); process.exit(2); });

module.exports = { filasDescuentos, filasIncidencia, filasDetalle };
