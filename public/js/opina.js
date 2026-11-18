/**
 * Vista OPINA (05 §7).
 *   HU-16  Ranking completo (pestaña por defecto): periodo, Todos / Mejores N / Peores N / Rango de %,
 *          incluir muestra insuficiente, comparar con otro semestre, cuadro de promedios
 *          (promedio de los maestros y calificación del campus) y exportar a Excel.
 *          Clic en un docente → su ficha en Docentes, pestaña OPINA.
 *   HU-08  Importaciones: carga con vista previa e historial.
 *   HU-24  Comparativo del campus → Sprint 3.
 *
 * API: GET /api/periodos · GET /api/opina/ranking y /ranking/excel (services/rankingService.js) · /api/opina/importaciones
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
    pestana = parametros.tab === 'importaciones' ? 'importaciones' : 'ranking';
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
        <button type="button" class="tab" role="tab" aria-selected="false" disabled title="Llega en el Sprint 3 (HU-24)">Comparativo del campus</button>
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
      history.replaceState(null, '', pestana === 'ranking' ? '#opina' : '#opina?tab=importaciones');
      pintarPestana();
    }));
    cargarPeriodos().then(pintarPestana);
  }

  function pintarPestana() {
    if (!el?.isConnected) return;
    el.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === pestana)));
    el.querySelector('#opinaExcel').hidden = pestana !== 'ranking' || !periodosConOpina().length;
    if (pestana === 'ranking') montarRanking();
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
