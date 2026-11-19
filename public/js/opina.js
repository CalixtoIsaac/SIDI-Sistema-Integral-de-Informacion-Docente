/**
 * Vista OPINA (05 §7).
 *   HU-16  Ranking completo (pestaña por defecto): periodo, Todos / Mejores N / Peores N / Rango de %,
 *          incluir muestra insuficiente, comparar con otro semestre, cuadro de promedios
 *          (promedio de los maestros y calificación del campus) y exportar a Excel.
 *          Clic en un docente → su ficha en Docentes, pestaña OPINA.
 *   HU-08  Importaciones: carga con vista previa e historial.
 *   HU-24  Comparativo del campus: % OPP oficial de Preparatoria Veracruz por semestre (captura manual de
 *          alumnos y opiniones positivas del reporte institucional), variación ▲/▼, gráfica de línea y lo que
 *          SIDI calcula del OPINA por alumno como referencia.
 *
 * API: GET /api/periodos · GET /api/opina/ranking y /ranking/excel (services/rankingService.js) · /api/opina/importaciones
 *      GET/PUT/DELETE /api/opina/campus[/:periodoId] (services/opinaCampusService.js)
 */
const Opina = (() => {
  let el = null;
  let pestana = 'ranking';
  let periodos = [];
  let filtros = null;
  let peticion = 0;
  const VERSION = { v1: 'Formato 2024–2025', v2: 'Formato 2026' };
  const KEY_FILTROS = 'sidi.opina.ranking';

  function filtrosIniciales() {
    const guardado = UI.store.get(KEY_FILTROS, null) || {};
    return {
      periodoId: '', compararCon: '',
      filtro: ['todos', 'mejores', 'peores', 'rango'].includes(guardado.filtro) ? guardado.filtro : 'todos',
      n: Number(guardado.n) || 10, min: guardado.min ?? 80, max: guardado.max ?? 90,
      incluirMuestraInsuficiente: Boolean(guardado.incluirMuestraInsuficiente)
    };
  }

  function mount(container, parametros = {}) {
    el = container;
    pestana = ['importaciones', 'campus'].includes(parametros.tab) ? parametros.tab : 'ranking';
    filtros = filtrosIniciales();
    container.innerHTML = `
      <section class="page-header">
        <div><h2>OPINA</h2><p class="muted">Encuesta de opinión de alumnos sobre sus profesores.</p></div>
        <div class="row">
          <button class="btn btn-outline" type="button" id="opinaExcel" hidden>${UI.icon('download')}Exportar ranking a Excel</button>
          <button class="btn btn-primary" type="button" id="opinaSubir">${UI.icon('upload')}Subir archivo OPINA (.xlsx / .xlsb)</button>
        </div>
      </section>
      <div class="tabs" role="tablist" aria-label="Secciones de OPINA">
        <button type="button" class="tab" role="tab" data-tab="ranking" aria-controls="opinaPanel">Ranking completo</button>
        <button type="button" class="tab" role="tab" data-tab="campus" aria-controls="opinaPanel">Comparativo del campus</button>
        <button type="button" class="tab" role="tab" data-tab="importaciones" aria-controls="opinaPanel">Importaciones</button>
      </div>
      <div id="opinaPanel" role="tabpanel"></div>`;

    el.querySelector('#opinaSubir').addEventListener('click', async () => {
      if (!(await Importar.opina())) return;
      if (pestana === 'ranking') { filtros.periodoId = ''; await cargarPeriodos(); }
      pintarPestana();
    });
    el.querySelector('#opinaExcel').addEventListener('click', exportar);
    el.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => {
      pestana = b.dataset.tab;
      history.replaceState(null, '', pestana === 'ranking' ? '#opina' : `#opina?tab=${pestana}`);
      pintarPestana();
    }));
    cargarPeriodos().then(pintarPestana);
  }

  function pintarPestana() {
    if (!el?.isConnected) return;
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === pestana)));
    el.querySelector('#opinaExcel').hidden = pestana !== 'ranking' || !periodosConOpina().length;
    if (pestana === 'ranking') montarRanking();
    else if (pestana === 'campus') montarCampus();
    else montarImportaciones();
  }

  // ------------------------------------------------------------------ periodos
  async function cargarPeriodos() {
    try { ({ periodos } = await UI.api('/periodos')); } catch (err) { periodos = []; UI.toast(err.message, 'error'); }
  }
  function periodosConOpina() { return periodos.filter((p) => p.tieneOpina); }

  // ------------------------------------------------------------------ ranking (HU-16)
  function opcionesPeriodo(lista, valor, vacio) {
    return (vacio ? `<option value="">${UI.escape(vacio)}</option>` : '')
      + lista.map((p) => `<option value="${p.id}" ${String(p.id) === String(valor) ? 'selected' : ''}>${UI.escape(p.clave)}</option>`).join('');
  }

  function montarRanking() {
    const box = el.querySelector('#opinaPanel');
    const conOpina = periodosConOpina();
    if (!conOpina.length) {
      box.innerHTML = `<section class="card"><div class="empty-state"><span class="empty-icon">${UI.icon('star')}</span>
        <h3>Aún no hay OPINA cargado</h3><p class="muted">Sube el archivo OPINA por alumno del semestre para ver el ranking de los maestros.</p>
        <button class="btn btn-primary" type="button" data-subir>${UI.icon('upload')}Subir archivo OPINA</button></div></section>`;
      box.querySelector('[data-subir]').addEventListener('click', () => el.querySelector('#opinaSubir').click());
      return;
    }
    if (!conOpina.some((p) => String(p.id) === String(filtros.periodoId))) filtros.periodoId = String(conOpina[0].id);
    if (String(filtros.compararCon) === String(filtros.periodoId) || (filtros.compararCon && !conOpina.some((p) => String(p.id) === String(filtros.compararCon)))) filtros.compararCon = '';
    const otros = conOpina.filter((p) => String(p.id) !== String(filtros.periodoId));
    const f = filtros;
    const radio = (valor, texto, extra = '') => `<label><input type="radio" name="rkFiltro" value="${valor}" ${f.filtro === valor ? 'checked' : ''}>${texto}${extra}</label>`;
    box.innerHTML = `
      <section class="card">
        <div class="card-body">
          <div class="ranking-filtros">
            <label class="row"><span class="quincena-label">Periodo</span>
              <span class="select-wrap"><select class="input select" id="rkPeriodo" aria-label="Periodo del ranking">${opcionesPeriodo(conOpina, f.periodoId)}</select></span></label>
            <div class="seg" role="radiogroup" aria-label="Mostrar">
              ${radio('todos', 'Todos')}
              ${radio('mejores', 'Mejores', ` <input class="input input-num" type="number" min="1" max="200" data-rk="n" value="${f.n}" aria-label="Cuántos mejores">`)}
              ${radio('peores', 'Peores', ` <input class="input input-num" type="number" min="1" max="200" data-rk="n" value="${f.n}" aria-label="Cuántos peores">`)}
              ${radio('rango', 'Rango', ` <input class="input input-num" type="number" min="0" max="100" step="0.1" data-rk="min" value="${f.min}" aria-label="Porcentaje mínimo">–<input class="input input-num" type="number" min="0" max="100" step="0.1" data-rk="max" value="${f.max}" aria-label="Porcentaje máximo"> %`)}
            </div>
            <label class="check"><input type="checkbox" class="check-input" id="rkInsuf" ${f.incluirMuestraInsuficiente ? 'checked' : ''}>Incluir muestra insuficiente</label>
            <label class="row"><span class="quincena-label">Comparar con</span>
              <span class="select-wrap"><select class="input select" id="rkComparar" aria-label="Comparar con otro semestre" ${otros.length ? '' : 'disabled title="Solo hay OPINA de un semestre"'}>${opcionesPeriodo(otros, f.compararCon, '— Sin comparar —')}</select></span></label>
          </div>
          <div id="rkPromedios"></div>
          <div id="rkTabla"><span class="skeleton" style="height:120px"></span></div>
        </div>
      </section>
      <p class="muted small mt">La calificación de cada docente junta todas las respuestas de sus grupos del semestre (Σ Sí ÷ Σ respuestas). Los docentes con menos respuestas que la muestra mínima no entran al ranking ni al promedio.</p>`;

    box.querySelector('#rkPeriodo').addEventListener('change', (ev) => { f.periodoId = ev.target.value; montarRanking(); });
    box.querySelector('#rkComparar').addEventListener('change', (ev) => { f.compararCon = ev.target.value; cargarRanking(); });
    box.querySelector('#rkInsuf').addEventListener('change', (ev) => { f.incluirMuestraInsuficiente = ev.target.checked; guardarFiltros(); cargarRanking(); });
    box.querySelectorAll('[name="rkFiltro"]').forEach((r) => r.addEventListener('change', () => { f.filtro = r.value; guardarFiltros(); cargarRanking(); }));
    const alEscribir = UI.debounce((input) => {
      const k = input.dataset.rk;
      f[k] = input.value === '' ? '' : Number(input.value);
      if (k === 'n') box.querySelectorAll('[data-rk="n"]').forEach((i) => { if (i !== input) i.value = input.value; });
      guardarFiltros();
      if ((k === 'n' && ['mejores', 'peores'].includes(f.filtro)) || (k !== 'n' && f.filtro === 'rango')) cargarRanking();
    }, 350);
    box.querySelectorAll('[data-rk]').forEach((i) => {
      i.addEventListener('input', () => alEscribir(i));
      // Escribir en el número elige su opción
      i.addEventListener('focus', () => {
        const radioPadre = i.closest('label').querySelector('[name="rkFiltro"]');
        if (!radioPadre.checked) { radioPadre.checked = true; f.filtro = radioPadre.value; guardarFiltros(); cargarRanking(); }
      });
    });
    box.querySelector('#rkTabla').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-docente]');
      if (b) location.hash = `docentes?search=${encodeURIComponent(b.dataset.nomina || b.dataset.nombre)}&ficha=${b.dataset.docente}&pestana=opina`;
    });
    cargarRanking();
  }

  function guardarFiltros() {
    const { filtro, n, min, max, incluirMuestraInsuficiente } = filtros;
    UI.store.set(KEY_FILTROS, { filtro, n, min, max, incluirMuestraInsuficiente });
  }

  function query() {
    const f = filtros;
    const p = new URLSearchParams({ periodoId: f.periodoId, filtro: f.filtro });
    if (['mejores', 'peores'].includes(f.filtro)) p.set('n', String(Math.max(1, Number(f.n) || 10)));
    if (f.filtro === 'rango') {
      if (f.min !== '' && f.min !== null) p.set('min', String(f.min));
      if (f.max !== '' && f.max !== null) p.set('max', String(f.max));
    }
    if (f.compararCon) p.set('compararCon', f.compararCon);
    if (f.incluirMuestraInsuficiente) p.set('incluirMuestraInsuficiente', 'true');
    return p.toString();
  }

  async function cargarRanking() {
    const n = ++peticion;
    const tabla = el.querySelector('#rkTabla');
    if (!tabla) return;
    tabla.style.opacity = '.55';
    try {
      const r = await UI.api(`/opina/ranking?${query()}`);
      if (n !== peticion || !el.isConnected) return;
      pintarPromedios(r);
      pintarTabla(r);
    } catch (err) {
      if (n !== peticion) return;
      tabla.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`;
    } finally {
      if (n === peticion && tabla.isConnected) tabla.style.opacity = '';
    }
  }

  /** Total con OPINA en el periodo (en el ranking + con muestra insuficiente). */
  const totalDe = (r) => r.docentes + (Number(r.muestraInsuficiente) || 0);

  function pintarPromedios(r) {
    const pct = (v) => (v === null || v === undefined ? '—' : UI.porcentaje(v));
    el.querySelector('#rkPromedios').innerHTML = `
      <dl class="promedios" aria-label="Promedios del periodo">
        <div><dt>Promedio de todos los maestros (${UI.escape(r.periodo?.clave || '')})</dt><dd>${pct(r.promedioMaestros)}</dd></div>
        <div><dt>Calificación del campus (todas las respuestas)</dt><dd>${pct(r.calificacionCampus)}</dd></div>
        <div><dt>Docentes en el ranking</dt><dd>${r.docentes}${totalDe(r) > r.docentes ? ` <small class="muted small">de ${totalDe(r)}</small>` : ''}</dd></div>
      </dl>`;
  }

  function pintarTabla(r) {
    const box = el.querySelector('#rkTabla');
    if (!r.ranking.length) {
      box.innerHTML = `<div class="empty-state small-empty"><span class="empty-icon">${UI.icon('filter')}</span>
        <h3>Ningún docente cumple el filtro</h3><p class="muted">Cambia el rango o la cantidad a mostrar.</p></div>`;
      return;
    }
    // Resaltado: los primeros y los últimos del ranking completo (con ▲/▼ además del color).
    const k = r.docentes >= 20 ? 5 : r.docentes >= 6 ? 3 : 0;
    const ultimaPos = Math.max(0, ...r.ranking.filter((i) => i.posicion).map((i) => i.posicion), r.docentes);
    const esTop = (i) => k && i.posicion && i.posicion <= k;
    const esBottom = (i) => k && i.posicion && i.posicion > r.docentes - k && ultimaPos >= r.docentes - k;
    const comparar = r.compararCon;
    const variacion = (i) => {
      if (i.variacion === null || i.variacion === undefined) return '<span class="cell-muted">—</span>';
      if (i.variacion > 0) return `<span class="var-up">▲ ${i.variacion.toFixed(1)}</span>`;
      if (i.variacion < 0) return `<span class="var-down">▼ ${Math.abs(i.variacion).toFixed(1)}</span>`;
      return '<span class="cell-muted">= 0.0</span>';
    };
    box.innerHTML = `
      <p class="result-count">${r.ranking.length === r.docentes && !r.ranking.some((i) => i.muestraInsuficiente) ? `Ranking completo · ${r.docentes} docentes` : `Mostrando ${r.ranking.length} de ${r.docentes} docentes`}</p>
      <div class="table-wrap"><table class="table ranking-tabla">
        <thead><tr><th scope="col" class="num">#</th><th scope="col">Docente</th><th scope="col">% recomendación</th><th scope="col" class="num">Respuestas</th>
          ${comparar ? `<th scope="col" class="num">${UI.escape(comparar.clave)}</th><th scope="col" class="num">vs. ${UI.escape(comparar.clave)}</th>` : ''}</tr></thead>
        <tbody>${r.ranking.map((i) => {
          const clase = i.muestraInsuficiente ? 'insuficiente' : esTop(i) ? 'top' : esBottom(i) ? 'bottom' : '';
          const marca = i.muestraInsuficiente ? '' : esTop(i) ? '<span class="marca var-up" aria-label="Entre los mejores">▲</span>' : esBottom(i) ? '<span class="marca var-down" aria-label="Entre los más bajos">▼</span>' : '';
          return `<tr class="${clase}">
            <td class="num pos">${i.posicion ?? '—'}${marca}</td>
            <td><button type="button" class="nombre-btn" data-docente="${i.docenteId}" data-nomina="${UI.escape(i.nomina || '')}" data-nombre="${UI.escape(i.nombre)}" title="Ver su ficha (pestaña OPINA)">${UI.escape(i.nombre)}</button>
              ${i.activo ? '' : '<span class="badge badge-outline">Inactivo</span>'}
              ${i.muestraInsuficiente ? `<span class="badge badge-outline" title="Menos de ${r.muestraMinima} respuestas">Muestra insuficiente</span>` : ''}</td>
            <td class="nowrap"><span class="barra-pct" aria-hidden="true"><span style="width:${Math.max(0, Math.min(100, i.porcentaje))}%"></span></span><strong>${UI.porcentaje(i.porcentaje)}</strong></td>
            <td class="num">${i.respuestas}</td>
            ${comparar ? `<td class="num">${i.porcentajeAnterior === null || i.porcentajeAnterior === undefined ? '<span class="cell-muted">—</span>' : UI.porcentaje(i.porcentajeAnterior)}</td><td class="num">${variacion(i)}</td>` : ''}
          </tr>`;
        }).join('')}</tbody>
      </table></div>`;
  }

  async function exportar() {
    const b = el.querySelector('#opinaExcel');
    UI.setBusy(b, true);
    try {
      await UI.descargar(`/opina/ranking/excel?${query()}`, 'OPINA_RANKING.xlsx');
      UI.toast('Ranking descargado.', 'success');
    } catch (err) { UI.toast(err.message, 'error'); } finally { UI.setBusy(b, false); }
  }

  // ------------------------------------------------------------------ comparativo del campus (HU-24)
  const pct1 = (v) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(1)} %`);

  /** Gráfica de línea: % OPP oficial y, si hay, el de la región (punteada). */
  function lineaOpp(semestres) {
    if (semestres.length < 2) return '<p class="muted small grafica-vacia">Captura al menos dos semestres para ver la tendencia.</p>';
    const hayRegion = semestres.some((sm) => sm.regionOpp !== null && sm.regionOpp !== undefined);
    return Graficas.linea({
      etiquetas: semestres.map((sm) => sm.periodo),
      series: [{ nombre: 'Preparatoria Veracruz', valores: semestres.map((sm) => sm.opp) },
        ...(hayRegion ? [{ nombre: 'Región', valores: semestres.map((sm) => sm.regionOpp) }] : [])],
      formato: (v) => `${Number(v).toFixed(1).replace(/\.0$/, '')} %`
    }) + Graficas.leyenda([{ etiqueta: 'Preparatoria Veracruz', tono: 'primario' }, ...(hayRegion ? [{ etiqueta: 'Región', tono: 'neutro' }] : [])]);
  }

  function cambio(sm) {
    if (sm.variacion === null || sm.variacion === undefined) return '<span class="cell-muted">—</span>';
    if (sm.tendencia === 'igual') return '<span class="cambio igual">= 0.0</span>';
    const sube = sm.tendencia === 'sube';
    return `<span class="cambio ${sube ? 'sube' : 'baja'}">${sube ? '▲' : '▼'} ${Math.abs(sm.variacion).toFixed(1)}</span>`;
  }

  async function montarCampus() {
    const box = el.querySelector('#opinaPanel');
    box.innerHTML = '<section class="card"><div class="card-body"><span class="skeleton" style="height:160px"></span></div></section>';
    let datos;
    try { datos = await UI.api('/opina/campus'); } catch (err) {
      box.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`;
      return;
    }
    if (pestana !== 'campus' || !el?.isConnected) return;
    const { semestres, promedio, ultimo, sinCaptura } = datos;
    box.innerHTML = `
      <div class="stats">
        ${Comun.stat('Último semestre', ultimo ? pct1(ultimo.opp) : '—', { sub: ultimo ? UI.escape(ultimo.periodo) : 'Sin captura', icono: 'star' })}
        ${Comun.stat('Cambio', ultimo ? cambio(ultimo) : '—', { sub: 'contra el semestre anterior', icono: 'chart', tono: 'tone-info' })}
        ${Comun.stat('Promedio', pct1(promedio), { sub: `${semestres.length} semestre(s) capturado(s)`, icono: 'chart', tono: 'tone-success' })}
      </div>
      <section class="card mt">
        <div class="card-header"><div><h3>% OPP de Preparatoria Veracruz por semestre</h3>
          <p class="card-sub">Cifra oficial: alumnos y opiniones positivas de la fila Preparatoria → Veracruz del reporte institucional.</p></div>
          <button type="button" class="btn btn-primary" data-campus-nuevo ${sinCaptura.length ? '' : 'disabled title="Todos los semestres ya tienen captura"'}>${UI.icon('plus')}Capturar semestre</button></div>
        <div class="card-body">${lineaOpp(semestres)}</div>
        ${semestres.length ? `
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Semestre</th><th class="num">Alumnos</th><th class="num">Opiniones positivas</th><th class="num">% OPP</th><th>Cambio</th>
            <th class="num">Región</th><th class="num" title="Lo que SIDI calcula del OPINA por alumno (solo presencial Veracruz). Puede diferir un poco de la cifra oficial.">Calculado por SIDI</th><th>Fuente</th><th></th></tr></thead>
          <tbody>${semestres.slice().reverse().map((sm) => `
            <tr>
              <td><strong>${UI.escape(sm.periodo)}</strong></td>
              <td class="num">${sm.alumnos.toLocaleString('es-MX')}</td>
              <td class="num">${sm.positivas.toLocaleString('es-MX')}</td>
              <td class="num"><strong>${pct1(sm.opp)}</strong></td>
              <td>${cambio(sm)}</td>
              <td class="num">${pct1(sm.regionOpp)}</td>
              <td class="num">${sm.opinaAlumnos ? `${pct1(sm.opinaAlumnos.calificacionCampus)}<div class="small muted">prom. maestros ${pct1(sm.opinaAlumnos.promedioMaestros)}</div>` : '<span class="cell-muted" title="No se importó el OPINA por alumno de ese semestre">—</span>'}</td>
              <td class="small">${UI.guion(sm.fuente)}</td>
              <td class="nowrap">
                <button type="button" class="btn btn-ghost btn-icon btn-sm" data-campus-editar="${sm.periodoId}" aria-label="Editar ${UI.escape(sm.periodo)}">${UI.icon('pencil')}</button>
                <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" data-campus-borrar="${sm.periodoId}" aria-label="Borrar ${UI.escape(sm.periodo)}">${UI.icon('trash')}</button></td>
            </tr>`).join('')}</tbody>
        </table></div>` : `<div class="empty-state"><p class="muted">Aún no hay semestres capturados.</p></div>`}
      </section>
      <p class="muted small mt">% OPP = opiniones positivas ÷ alumnos. "Calculado por SIDI" es solo referencia: sale del OPINA por alumno importado y puede no coincidir con la cifra oficial.</p>`;

    box.querySelector('[data-campus-nuevo]').addEventListener('click', () => capturarCampus(null, sinCaptura));
    box.querySelectorAll('[data-campus-editar]').forEach((b) => b.addEventListener('click', () => {
      capturarCampus(semestres.find((sm) => String(sm.periodoId) === b.dataset.campusEditar), sinCaptura);
    }));
    box.querySelectorAll('[data-campus-borrar]').forEach((b) => b.addEventListener('click', async () => {
      const sm = semestres.find((x) => String(x.periodoId) === b.dataset.campusBorrar);
      if (!(await UI.confirm({ title: `¿Borrar el % OPP de ${sm.periodo}?`, message: 'Se quita la captura de ese semestre. Puedes volver a capturarla después.', confirmText: 'Borrar', danger: true }))) return;
      try {
        await UI.api(`/opina/campus/${sm.periodoId}`, { method: 'DELETE' });
        UI.toast(`Se borró ${sm.periodo}.`, 'success');
        montarCampus();
      } catch (err) { UI.toast(err.message, 'error'); }
    }));
  }

  async function capturarCampus(semestre, sinCaptura) {
    const fields = [
      ...(semestre ? [] : [{ name: 'periodoId', label: 'Semestre', type: 'select', required: true, options: sinCaptura.map((p) => ({ value: p.periodoId, label: p.periodo })) }]),
      { name: 'alumnos', label: 'Alumnos (respuestas totales)', type: 'number', min: 1, step: '1', required: true },
      { name: 'positivas', label: 'Opiniones positivas', type: 'number', min: 0, step: '1', required: true },
      { name: 'regionOpp', label: '% OPP de la región (opcional)', type: 'number', min: 0, step: '0.1', hint: 'Para comparar el campus contra la región.' },
      { name: 'fuente', label: 'Fuente (opcional)', maxlength: 120, placeholder: 'Ej. Reporte institucional OPINA ENE-MAY 2026' }
    ];
    const r = await UI.formModal({
      title: semestre ? `% OPP de ${semestre.periodo}` : 'Capturar % OPP del campus',
      description: 'Copia los dos números de la fila Preparatoria → Veracruz del reporte institucional. El % se calcula solo.',
      fields,
      values: semestre
        ? { alumnos: semestre.alumnos, positivas: semestre.positivas, regionOpp: semestre.regionOpp ?? '', fuente: semestre.fuente || '' }
        : { periodoId: sinCaptura.length ? sinCaptura[sinCaptura.length - 1].periodoId : '', alumnos: '', positivas: '', regionOpp: '', fuente: '' },
      onSubmit: (v) => UI.api(`/opina/campus/${semestre ? semestre.periodoId : v.periodoId}`, {
        method: 'PUT',
        body: { alumnos: Number(v.alumnos), positivas: Number(v.positivas), regionOpp: v.regionOpp === '' ? null : Number(v.regionOpp), fuente: v.fuente || null }
      })
    });
    if (r) { UI.toast(`Se guardó el % OPP: ${pct1(r.semestre.opp)}.`, 'success'); montarCampus(); }
  }

  // ------------------------------------------------------------------ importaciones (HU-08)
  function montarImportaciones() {
    const box = el.querySelector('#opinaPanel');
    box.innerHTML = `
      <section class="card">
        <div class="card-header"><div><h3>Importaciones</h3><p class="card-sub">Un archivo por semestre. Volver a subir el mismo semestre lo reemplaza.</p></div></div>
        <div id="opinaLista"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
      </section>
      <p class="muted small mt">El porcentaje de cada docente se ve en la columna OPINA de Docentes y en su ficha (pestaña OPINA).</p>`;
    box.querySelector('#opinaLista').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-eliminar]');
      if (!b) return;
      const ok = await UI.confirm({
        title: `¿Eliminar el OPINA de ${b.dataset.periodo}?`,
        message: 'Se borran todas sus respuestas. Los docentes y grupos que creó se conservan.',
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await UI.api(`/opina/importaciones/${b.dataset.eliminar}`, { method: 'DELETE' });
        UI.toast('Importación eliminada.', 'success');
        await cargarPeriodos();
        filtros.periodoId = '';
        cargarImportaciones();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
    cargarImportaciones();
  }

  async function cargarImportaciones() {
    const box = el.querySelector('#opinaLista');
    if (!box) return;
    try {
      const { importaciones } = await UI.api('/opina/importaciones');
      box.innerHTML = importaciones.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Semestre</th><th>Archivo</th><th>Formato</th><th>Filtro</th><th class="num">Filas</th><th class="num">Descartadas</th><th class="num">Respuestas</th><th>Importado</th><th></th></tr></thead>
            <tbody>${importaciones.map((i) => `<tr>
              <td><strong>${UI.escape(i.periodo)}</strong></td><td>${UI.escape(i.archivo)}</td><td>${UI.escape(VERSION[i.version] || i.version)}</td>
              <td>${i.soloPresencial ? 'Presencial' : 'Todas las modalidades'} · ${UI.escape(i.filtroCampus || 'todos los campus')}</td>
              <td class="num">${Number(i.filas).toLocaleString('es-MX')}</td><td class="num">${Number(i.filasDescartadas).toLocaleString('es-MX')}</td>
              <td class="num">${Number(i.respuestas).toLocaleString('es-MX')}</td><td class="nowrap">${UI.escape(UI.formatDate(i.importadoEn))}</td>
              <td><button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-eliminar="${i.id}" data-periodo="${UI.escape(i.periodo)}">${UI.icon('trash')}Eliminar</button></td>
            </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty-state"><span class="empty-icon">${UI.icon('star')}</span><h3>Aún no hay OPINA cargado</h3>
             <p class="muted">Sube el archivo OPINA por alumno del semestre (.xlsx o .xlsb).</p></div>`;
    } catch (err) {
      box.innerHTML = `<div class="card-body"><div class="alert alert-error">${UI.escape(err.message)}</div></div>`;
    }
  }

  return { mount };
})();
