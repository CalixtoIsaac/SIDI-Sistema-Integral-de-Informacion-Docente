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

  return { barras, columnas, leyenda };
})();
