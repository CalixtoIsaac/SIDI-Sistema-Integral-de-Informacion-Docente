/**
 * Gráficas ligeras del Panel y de OPINA (HU-15, HU-16), sin librerías externas.
 * Son HTML + CSS: las barras usan var(--primary), así que cambian solas con el color
 * principal y el modo claro/oscuro (05 §1: "se redibujan al cambiar tema o color").
 * Funcionan sin internet (la app corre local en la oficina).
 *
 *  Graficas.barras(filas, opciones)  → barras horizontales
 *     filas: [{ etiqueta, valor, nota?, tono?: 'primario'|'neutro'|'alerta'|'ok', href?, data? }]
 *     opciones: { formato: (v) => texto, max?: número, vacio?: texto, etiquetaAncho?: '180px', alto?: px máx con scroll }
 *  Graficas.columnas(filas, opciones) → columnas verticales (pocas categorías: género, nivel)
 *  Graficas.leyenda([{ etiqueta, tono }])
 *  Graficas.linea({ etiquetas, series: [{ nombre, valores, punteada? }], formato, min?, max? }) → SVG de línea
 *     (la primera serie va en el color principal con su valor encima de cada punto; las demás, punteadas)
 */
const Graficas = (() => {
  const e = (t) => UI.escape(t);
  const TONOS = ['primario', 'neutro', 'alerta', 'ok', 'suave'];

  function tonoDe(f) { return TONOS.includes(f.tono) ? f.tono : 'primario'; }
  function pct(valor, max) { return max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0; }

  function vacio(texto) {
    return `<p class="muted small grafica-vacia">${e(texto || 'Sin datos para graficar.')}</p>`;
  }

  function barras(filas, { formato = (v) => String(v), max, vacio: textoVacio, etiquetaAncho = '180px', alto } = {}) {
    if (!filas.length) return vacio(textoVacio);
    const tope = max ?? Math.max(...filas.map((f) => Number(f.valor) || 0));
    const items = filas.map((f) => {
      const valor = Number(f.valor) || 0;
      const etiqueta = f.href
        ? `<a href="${e(f.href)}" class="gbar-label" title="${e(f.etiqueta)}"${f.data ? ` ${f.data}` : ''}>${e(f.etiqueta)}</a>`
        : `<span class="gbar-label" title="${e(f.etiqueta)}"${f.data ? ` ${f.data}` : ''}>${e(f.etiqueta)}</span>`;
      return `<li class="gbar" aria-label="${e(`${f.etiqueta}: ${formato(valor)}${f.nota ? ` (${f.nota})` : ''}`)}">
          ${etiqueta}
          <span class="gbar-track"><span class="gbar-fill tono-${tonoDe(f)}" style="width:${pct(valor, tope).toFixed(1)}%"></span></span>
          <span class="gbar-valor">${e(formato(valor))}${f.nota ? ` <small>${e(f.nota)}</small>` : ''}</span>
        </li>`;
    }).join('');
    return `<ul class="gbarras" style="--etiqueta:${e(etiquetaAncho)}${alto ? `;max-height:${Number(alto)}px` : ''}">${items}</ul>`;
  }

  function columnas(filas, { formato = (v) => String(v), max, vacio: textoVacio } = {}) {
    if (!filas.length || filas.every((f) => !Number(f.valor))) return vacio(textoVacio);
    const tope = max ?? Math.max(...filas.map((f) => Number(f.valor) || 0));
    return `<div class="gcols" role="list">${filas.map((f) => {
      const valor = Number(f.valor) || 0;
      return `<div class="gcol" role="listitem" aria-label="${e(`${f.etiqueta}: ${formato(valor)}`)}">
          <span class="gcol-valor">${e(formato(valor))}</span>
          <span class="gcol-track"><span class="gcol-fill tono-${tonoDe(f)}" style="height:${pct(valor, tope).toFixed(1)}%"></span></span>
          <span class="gcol-label" title="${e(f.etiqueta)}">${e(f.etiqueta)}</span>
        </div>`;
    }).join('')}</div>`;
  }

  function leyenda(items) {
    return `<div class="gleyenda">${items.map((i) => `<span><i class="tono-${TONOS.includes(i.tono) ? i.tono : 'primario'}"></i>${e(i.etiqueta)}</span>`).join('')}</div>`;
  }

  function linea({ etiquetas, series, formato = (v) => String(v), min, max, vacio: textoVacio, alto = 230 } = {}) {
    if (!etiquetas || etiquetas.length < 2 || !series.length) return vacio(textoVacio || 'Se necesitan al menos dos puntos para la tendencia.');
    const W = 640; const H = alto; const izq = 44; const der = 16; const arr = 26; const abj = 36;
    const valores = series.flatMap((s) => s.valores).filter((v) => v !== null && v !== undefined).map(Number);
    let lo = min ?? Math.floor(Math.min(...valores) - 2);
    let hi = max ?? Math.ceil(Math.max(...valores) + 2);
    if (hi - lo < 4) { lo -= 2; hi += 2; }
    const margen = 48; // deja espacio para la etiqueta del primer y último punto
    const x = (i) => izq + margen + (i * (W - izq - der - 2 * margen)) / (etiquetas.length - 1);
    const y = (v) => arr + ((hi - v) * (H - arr - abj)) / (hi - lo);
    const puntos = (vals) => vals.map((v, i) => (v === null || v === undefined ? null : `${x(i).toFixed(1)},${y(v).toFixed(1)}`)).filter(Boolean).join(' ');
    const marcas = [0, 1, 2, 3, 4].map((k) => {
      const v = lo + ((hi - lo) * k) / 4;
      return `<line x1="${izq}" x2="${W - der}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}" class="lg-grid"/>
        <text x="${izq - 6}" y="${(y(v) + 4).toFixed(1)}" class="lg-eje" text-anchor="end">${e(formato(Math.round(v)))}</text>`;
    }).join('');
    const [principal, ...otras] = series;
    return `<svg class="linea-grafica" viewBox="0 0 ${W} ${H}" role="img" aria-label="${e(etiquetas.map((t, i) => `${t}: ${principal.valores[i] === null || principal.valores[i] === undefined ? '—' : formato(principal.valores[i])}`).join(', '))}">
        ${marcas}
        ${otras.map((s) => `<polyline points="${puntos(s.valores)}" class="lg-region"/>`).join('')}
        <polyline points="${puntos(principal.valores)}" class="lg-linea"/>
        ${principal.valores.map((v, i) => (v === null || v === undefined ? '' : `
          <circle cx="${x(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="4.5" class="lg-punto"><title>${e(`${etiquetas[i]}: ${formato(v)}`)}</title></circle>
          <text x="${x(i).toFixed(1)}" y="${(y(v) - 10).toFixed(1)}" class="lg-valor" text-anchor="middle">${e(formato(v))}</text>`)).join('')}
        ${etiquetas.map((t, i) => `<text x="${x(i).toFixed(1)}" y="${H - 12}" class="lg-eje" text-anchor="middle">${e(t)}</text>`).join('')}
      </svg>`;
  }

  return { barras, columnas, leyenda, linea };
})();
