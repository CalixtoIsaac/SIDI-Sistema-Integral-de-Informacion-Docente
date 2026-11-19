/**
 * Resumen ejecutivo en diapositivas (HU-26; 05 §1.1). Se abre desde el Panel (botón "Resumen ejecutivo").
 *
 *  - Usa SOLO lo registrado en SIDI: GET /api/analitica/resumen-ejecutivo?periodoId=&compararCon=
 *    → { portada, kpis: [{ id, etiqueta, valor, unidad?, variacion?, periodo?, detalle? }],
 *        diapositivas: [G1, G2, G3, G4, G9, G10, G15, G16], hallazgos: [{ nivel, texto, docentes? }] }
 *    (services/resumenEjecutivoService.js).
 *  - Diapositivas 16:9: portada, indicadores, una por gráfica (titular-conclusión arriba) y hallazgos.
 *  - Sin datos → "Sin datos registrados" (nunca datos de ejemplo).
 *  - Selector de semestre y "comparar con" (cambia la referencia de G1 y G4).
 *  - Exportar PDF: imprime una diapositiva por página (horizontal) con el diálogo del navegador.
 *  - Colores con las variables del tema: se ve bien en claro y oscuro (al imprimir se fuerza claro).
 *  - Sin datos sensibles: solo conteos y calificaciones (sin comentarios de alumnos ni observaciones de baja).
 */
const Resumen = (() => {
  let el = null;
  let periodos = [];
  let filtros = { periodoId: '', compararCon: '' };
  const e = (t) => UI.escape(t);
  const pct = (v) => (v === null || v === undefined ? '—' : `${Number(v).toLocaleString('es-MX', { maximumFractionDigits: 1 })} %`);
  const pts = (v) => `${v > 0 ? '▲' : v < 0 ? '▼' : '='} ${Math.abs(Number(v)).toLocaleString('es-MX', { maximumFractionDigits: 1 })} pts`;

  // ------------------------------------------------------------------ gráficas por tipo
  function sinDatos() {
    return `<div class="slide-vacia">${UI.icon('inbox')}<p>Sin datos registrados</p></div>`;
  }

  function g1(d) {
    const s = d.semestres || [];
    const hayRegion = s.some((x) => x.regionOpp !== null && x.regionOpp !== undefined);
    return Graficas.linea({
      etiquetas: s.map((x) => x.periodo),
      series: [{ nombre: 'Preparatoria Veracruz', valores: s.map((x) => x.opp) }, ...(hayRegion ? [{ nombre: 'Región', valores: s.map((x) => x.regionOpp) }] : [])],
      formato: (v) => pct(v), alto: 250
    }) + Graficas.leyenda([{ etiqueta: 'Preparatoria Veracruz', tono: 'primario' }, ...(hayRegion ? [{ etiqueta: 'Región', tono: 'neutro' }] : [])]);
  }

  /** G2: barra 100 % por semestre con los 4 rangos de calificación. */
  function g2(d) {
    const tonos = ['alerta', 'suave', 'neutro', 'primario'];
    return `<div class="apilada-lista">${(d.semestres || []).map((s) => {
      const total = s.rangos.reduce((t, r) => t + r.docentes, 0) || 1;
      return `<div class="apilada-fila"><span class="apilada-etq">${e(s.periodo)}<small>${s.docentes} docentes</small></span>
        <span class="apilada-barra">${s.rangos.map((r, i) => (r.docentes ? `<span class="tono-${tonos[i]}" style="width:${(100 * r.docentes / total).toFixed(1)}%" title="${e(`${r.rango} %: ${r.docentes}`)}">${r.docentes}</span>` : '')).join('')}</span></div>`;
    }).join('')}</div>${Graficas.leyenda(d.rangos.map((r, i) => ({ etiqueta: `${r} %`, tono: tonos[i] })))}`;
  }

  function g3(d) {
    const fila = (x, tono) => ({ etiqueta: x.nombre, valor: x.porcentaje, nota: `${x.respuestas} resp.`, tono });
    return `<div class="slide-2col">
      <div><p class="slide-sub">Top 5</p>${Graficas.barras((d.top || []).map((x) => fila(x, 'ok')), { max: 100, formato: pct, etiquetaAncho: '190px' })}</div>
      <div><p class="slide-sub">Bottom 5</p>${Graficas.barras((d.bottom || []).map((x) => fila(x, 'alerta')), { max: 100, formato: pct, etiquetaAncho: '190px' })}</div>
    </div>`;
  }

  /** G4: puntos conectados antes → después; los 5 que más subieron y los 5 que más bajaron. */
  function g4(d) {
    const lista = d.docentes || [];
    const suben = lista.filter((x) => x.cambio > 0).slice(0, 5);
    const bajan = lista.filter((x) => x.cambio < 0).slice(-5).reverse();
    const fila = (x) => {
      const a = Math.min(x.antes, x.despues); const b = Math.max(x.antes, x.despues);
      return `<li class="conectados-fila"><span class="conectados-etq" title="${e(x.nombre)}">${e(x.nombre)}</span>
        <span class="conectados-pista"><span class="conectados-linea ${x.cambio >= 0 ? 'sube' : 'baja'}" style="left:${a}%;width:${b - a}%"></span>
          <span class="conectados-punto antes" style="left:${x.antes}%" title="${e(`${d.antes ? d.antes.periodo : 'Antes'}: ${pct(x.antes)}`)}"></span>
          <span class="conectados-punto despues ${x.cambio >= 0 ? 'sube' : 'baja'}" style="left:${x.despues}%" title="${e(`${d.despues ? d.despues.periodo : 'Después'}: ${pct(x.despues)}`)}"></span></span>
        <span class="cambio ${x.cambio >= 0 ? 'sube' : 'baja'}">${pts(x.cambio)}</span></li>`;
    };
    return `<div class="slide-2col">
      <div><p class="slide-sub">Más mejoraron</p><ul class="conectados">${suben.map(fila).join('') || '<li class="muted small">Nadie subió.</li>'}</ul></div>
      <div><p class="slide-sub">Más bajaron</p><ul class="conectados">${bajan.map(fila).join('') || '<li class="muted small">Nadie bajó.</li>'}</ul></div>
    </div><p class="small muted">${e(d.antes ? d.antes.periodo : '')} (○) → ${e(d.despues ? d.despues.periodo : '')} (●) · ${lista.length} docentes con muestra suficiente en ambos semestres</p>`;
  }

  function g9(d) {
    return `${Graficas.barras((d.tipos || []).map((t, i) => ({ etiqueta: t.tipo, valor: t.faltas, nota: `${t.docentes} docente(s)`, tono: i === 0 ? 'primario' : 'neutro' })), { formato: (v) => `${v} falta(s)`, etiquetaAncho: '170px' })}
      <p class="small muted">Total: ${d.total} falta(s) en ${e(d.periodo || '')}</p>`;
  }

  /** G10: descontado y pagado por quincena (columnas agrupadas) + totales. */
  function g10(d) {
    const qs = d.quincenas || [];
    const max = Math.max(1, ...qs.flatMap((q) => [q.descontado, q.pagado]));
    return `<div class="agrupadas">${qs.map((q) => `
        <div class="agrupada" title="${e(`${q.quincena}: descontado ${UI.dinero(q.descontado)} · pagado ${UI.dinero(q.pagado)}`)}">
          <span class="agrupada-cols"><span class="tono-primario" style="height:${(100 * q.descontado / max).toFixed(1)}%"></span><span class="tono-neutro" style="height:${(100 * q.pagado / max).toFixed(1)}%"></span></span>
          <span class="agrupada-etq">${e(q.quincena)}</span></div>`).join('')}</div>
      ${Graficas.leyenda([{ etiqueta: 'Descontado', tono: 'primario' }, { etiqueta: 'Pagado a suplentes', tono: 'neutro' }])}
      <p class="small"><strong>Totales:</strong> descontado ${UI.dinero(d.totales.descontado)} · pagado ${UI.dinero(d.totales.pagado)} · diferencia ${UI.dinero(d.totales.diferencia)}</p>`;
  }

  function g15(d) {
    const s = d.semestres || [];
    const max = Math.max(1, ...s.flatMap((x) => [x.activos, x.nuevos, x.bajas]));
    return `<div class="agrupadas">${s.map((x) => `
        <div class="agrupada" title="${e(`${x.periodo}: ${x.activos} activos, ${x.nuevos} nuevos, ${x.bajas} bajas`)}">
          <span class="agrupada-cols tres">
            <span class="tono-primario" style="height:${(100 * x.activos / max).toFixed(1)}%"><b>${x.activos}</b></span>
            <span class="tono-ok" style="height:${(100 * x.nuevos / max).toFixed(1)}%"><b>${x.nuevos}</b></span>
            <span class="tono-alerta" style="height:${(100 * x.bajas / max).toFixed(1)}%"><b>${x.bajas}</b></span></span>
          <span class="agrupada-etq">${e(x.periodo)}${x.sinHistorial ? '<small>sin semestre previo</small>' : ''}</span></div>`).join('')}</div>
      ${Graficas.leyenda([{ etiqueta: 'Activos', tono: 'primario' }, { etiqueta: 'Nuevos', tono: 'ok' }, { etiqueta: 'Bajas', tono: 'alerta' }])}`;
  }

  function g16(d) {
    const genero = { M: 'Hombres', F: 'Mujeres', ninguno: 'Sin dato' };
    return `<div class="slide-3col">
      <div><p class="slide-sub">Género</p>${Graficas.columnas((d.genero || []).map((g) => ({ etiqueta: genero[g.genero] || g.genero, valor: g.docentes, tono: g.genero === 'ninguno' ? 'neutro' : 'primario' })))}</div>
      <div><p class="slide-sub">Nivel de estudios</p>${Graficas.barras((d.nivelEstudios || []).map((n) => ({ etiqueta: n.nivelEstudios === 'ninguno' ? 'Sin dato' : n.nivelEstudios, valor: n.docentes, tono: n.nivelEstudios === 'ninguno' ? 'neutro' : 'primario' })), { etiquetaAncho: '110px' })}</div>
      <div><p class="slide-sub">¿Está estudiando?</p>${Graficas.columnas([{ etiqueta: 'Sí', valor: d.estudiando.si, tono: 'ok' }, { etiqueta: 'No', valor: d.estudiando.no, tono: 'neutro' }])}
        ${d.estudiando.porNivel.length ? `<p class="small muted">${d.estudiando.porNivel.map((n) => `${e(n.nivel)}: ${n.docentes}`).join(' · ')}</p>` : ''}</div>
    </div>`;
  }

  const GRAFICA = { G1: g1, G2: g2, G3: g3, G4: g4, G9: g9, G10: g10, G15: g15, G16: g16 };

  // ------------------------------------------------------------------ diapositivas
  function slide(contenido, { clase = '', numero, total } = {}) {
    return `<section class="slide ${clase}">${contenido}
      <footer class="slide-pie"><span>SIDI · Coordinación de Docentes</span><span>${numero} / ${total}</span></footer></section>`;
  }

  function portada(r) {
    const p = r.portada;
    const fecha = p.generadoEn ? UI.fecha(String(p.generadoEn).slice(0, 10)) : '';
    return `<div class="slide-portada">
      <span class="brand-mark" aria-hidden="true">${UI.icon('logo')}</span>
      <h1>${e(p.titulo)}</h1>
      <p class="slide-portada-sub">${e(p.encabezado)}</p>
      ${p.compararCon ? `<p class="muted">Comparado con ${e(p.compararCon.clave)}</p>` : ''}
      ${p.notaOpina ? `<p class="muted small">${e(p.notaOpina)}</p>` : ''}
      <p class="muted small">Elaborado por ${e(p.preparadoPor || '')}${fecha ? ` · ${e(fecha)}` : ''} · Datos registrados en SIDI</p>
    </div>`;
  }

  function valorKpi(k) {
    if (k.valor === null || k.valor === undefined) return '—';
    if (k.unidad === '%') return pct(k.valor);
    if (k.unidad === '$') return UI.dinero(k.valor);
    return e(Number(k.valor).toLocaleString('es-MX'));
  }

  function kpis(r) {
    const lista = r.kpis || [];
    return `<header class="slide-titulo"><p class="slide-pregunta">Indicadores del semestre</p><h2>${e(r.portada.periodo ? r.portada.periodo.clave : '')} en números</h2></header>
      <div class="kpis">${lista.map((k) => {
        const sub = [
          k.variacion !== null && k.variacion !== undefined ? `<span class="cambio ${k.variacion >= 0 ? 'sube' : 'baja'}">${pts(k.variacion)}</span>` : '',
          k.periodo ? e(k.periodo) : '',
          k.detalle ? e(k.detalle) : ''
        ].filter(Boolean).join(' · ');
        return `<div class="kpi"><strong>${valorKpi(k)}</strong><span>${e(k.etiqueta)}</span>${sub ? `<small>${sub}</small>` : ''}</div>`;
      }).join('')}</div>`;
  }

  function grafica(dp) {
    return `<header class="slide-titulo"><p class="slide-pregunta">${e(dp.id)} · ${e(dp.titulo)} — ${e(dp.pregunta)}</p>
        <h2>${e(dp.conclusion)}</h2></header>
      <div class="slide-cuerpo">${dp.sinDatos ? sinDatos() : GRAFICA[dp.id] ? GRAFICA[dp.id](dp.datos) : sinDatos()}</div>`;
  }

  function hallazgos(r) {
    const iconos = { alerta: 'warning', aviso: 'info', positivo: 'check' };
    return `<header class="slide-titulo"><p class="slide-pregunta">Hallazgos</p><h2>Lo que conviene atender</h2></header>
      ${r.hallazgos.length
        ? `<ul class="hallazgos">${r.hallazgos.map((h) => {
          const quienes = (h.docentes || []).map((d) => `${d.nombre}${d.porcentaje !== undefined ? ` (${pct(d.porcentaje)})` : d.faltas !== undefined ? ` (${d.faltas})` : ''}`);
          return `<li class="hallazgo ${e(h.nivel)}">${UI.icon(iconos[h.nivel] || 'info')}<span>${e(h.texto)}${quienes.length ? `<br><small>${e(quienes.join(' · '))}</small>` : ''}</span></li>`;
        }).join('')}</ul>`
        : sinDatos()}`;
  }

  function pintar(r) {
    const partes = [
      { html: portada(r), clase: 'es-portada' },
      { html: kpis(r) },
      ...r.diapositivas.map((dp) => ({ html: grafica(dp) })),
      { html: hallazgos(r) }
    ];
    el.querySelector('#resSlides').innerHTML = partes.map((p, i) => slide(p.html, { clase: p.clase || '', numero: i + 1, total: partes.length })).join('');
  }

  async function cargar() {
    const box = el.querySelector('#resSlides');
    box.innerHTML = '<div class="slide slide-cargando"><span class="spinner"></span> Armando el resumen…</div>';
    const p = new URLSearchParams();
    if (filtros.periodoId) p.set('periodoId', filtros.periodoId);
    if (filtros.compararCon) p.set('compararCon', filtros.compararCon);
    try {
      const r = await UI.api(`/analitica/resumen-ejecutivo?${p}`);
      if (!el.isConnected) return;
      if (!filtros.periodoId && r.portada.periodo) {
        filtros.periodoId = String(r.portada.periodo.id);
        el.querySelector('#resPeriodo').value = filtros.periodoId;
      }
      pintar(r);
    } catch (err) {
      box.innerHTML = `<div class="alert alert-error">${e(err.message)}</div>`;
    }
  }

  function opciones(valor, vacio) {
    return (vacio ? `<option value="">${e(vacio)}</option>` : '')
      + periodos.map((x) => `<option value="${x.id}" ${String(x.id) === String(valor) ? 'selected' : ''}>${e(x.clave)}</option>`).join('');
  }

  async function mount(container) {
    el = container;
    filtros = { periodoId: '', compararCon: '' };
    container.innerHTML = `
      <section class="page-header no-imprimir">
        <div><h2>Resumen ejecutivo</h2><p class="muted">Presentación con los datos registrados en SIDI. "Exportar PDF" imprime una diapositiva por página.</p></div>
        <div class="row">
          <a class="btn btn-ghost" href="#panel">${UI.icon('chart')}Volver al Panel</a>
          <button class="btn btn-primary" type="button" id="resPdf">${UI.icon('download')}Exportar PDF</button>
        </div>
      </section>
      <div class="toolbar no-imprimir">
        <label class="row"><span class="quincena-label">Semestre</span>
          <span class="select-wrap"><select class="input select" id="resPeriodo" aria-label="Semestre del resumen"><option value="">—</option></select></span></label>
        <label class="row"><span class="quincena-label">Comparar con</span>
          <span class="select-wrap"><select class="input select" id="resComparar" aria-label="Comparar con"><option value="">Semestre anterior</option></select></span></label>
      </div>
      <div class="slides" id="resSlides"></div>`;
    try { ({ periodos } = await UI.api('/periodos')); } catch { periodos = []; }
    periodos = periodos.slice().sort((a, b) => String(b.fechaInicio || '').localeCompare(String(a.fechaInicio || '')) || b.id - a.id);
    el.querySelector('#resPeriodo').innerHTML = opciones(filtros.periodoId, 'Semestre actual');
    el.querySelector('#resComparar').innerHTML = opciones(filtros.compararCon, 'Semestre anterior');
    el.querySelector('#resPeriodo').addEventListener('change', (ev) => { filtros.periodoId = ev.target.value; cargar(); });
    el.querySelector('#resComparar').addEventListener('change', (ev) => { filtros.compararCon = ev.target.value; cargar(); });
    el.querySelector('#resPdf').addEventListener('click', () => window.print());
    cargar();
  }

  return { mount };
})();
