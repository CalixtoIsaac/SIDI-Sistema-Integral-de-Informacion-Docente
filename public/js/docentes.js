/**
 * Vista Docentes (05 §2 y §4).
 *
 *  Lista (revisión de equipo 19/11):
 *    - Solo lo más relevante: nombre, nómina, grupos, antigüedad, OPINA, faltas y estado.
 *      El resto (CURP, edad, formación, trabajo externo…) vive en la ficha.
 *    - Paginada: las filas por página se calculan con el alto de la ventana para que la tabla
 *      se vea completa sin desplazarse (mínimo 5, máximo 30). Pestañas Todos · Activos · Inactivos ·
 *      Datos incompletos con sus conteos (GET /docentes → conteos, paginas).
 *  Ficha a pantalla completa (#docentes?ficha=<id>&pestana=<clave>): encabezado con avatar, acciones e
 *  indicadores; pestañas Asignaturas y horario · Datos personales · Formación · OPINA · Faltas · Bajas.
 *  "Volver a docentes" regresa a la misma página, filtros y búsqueda.
 *
 *  HU-03/04  consulta y ficha extendida (tarifa diaria y mensual, total mensual, Ver CV)
 *  HU-05/21  punto verde/gris, Suspender / Reactivar con motivo, observaciones y recontratable
 *  HU-06/07  filtros con chips, orden y búsqueda por nombre, CURP, nómina (con o sin L0) o CRN
 *  HU-19     asignaturas y vista semanal del horario
 *  OPINA     GET /docentes/:id/opina (global, por CRN, reactivos v2, razones y comentarios)
 */
const Docentes = (() => {
  const DIAS = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const ORIGEN = { excel_grupos: 'Excel de grupos', cv: 'CV', manual: 'Captura manual', opina: 'OPINA', alta_rapida: 'Alta rápida' };
  const FALTANTE = {
    curp: 'CURP', campoFormacion: 'campo de formación', primerSemestre: 'primer semestre', contrato: 'contrato de algún CRN'
  };
  const PASO_FALTANTE = { curp: 'personales', campoFormacion: 'formacion', primerSemestre: 'formacion', contrato: 'asignaturas' };

  const ORDENES = [
    ['nombre', 'Alfabético'], ['edad', 'Edad'], ['antiguedad', 'Antigüedad'], ['grupos', 'Número de grupos'],
    ['nivelEstudios', 'Nivel de estudios'], ['opina', 'OPINA']
  ];

  /** Pestañas de estado sobre la tabla (el conteo lo da GET /docentes → conteos). */
  const ESTADOS = [
    { clave: 'todos', etiqueta: 'Todos', conteo: 'todos', query: {} },
    { clave: 'activos', etiqueta: 'Activos', conteo: 'activos', query: { activo: 'true' }, icono: 'userCheck' },
    { clave: 'inactivos', etiqueta: 'Inactivos', conteo: 'inactivos', query: { activo: 'false' }, icono: 'userX' },
    { clave: 'incompletos', etiqueta: 'Datos incompletos', conteo: 'incompletos', query: { incompleto: 'true' }, icono: 'warning' }
  ];

  /** Filtros de la barra (06 GET /docentes). tipo: uno | varios | rango (rango → <clave>Min/<clave>Max). */
  const FILTROS = [
    { clave: 'genero', etiqueta: 'Género', tipo: 'varios', opciones: [['F', 'Femenino'], ['M', 'Masculino'], ['ninguno', 'Sin dato']] },
    { clave: 'nivelEstudios', etiqueta: 'Nivel de estudios', tipo: 'varios', catalogo: 'nivel_estudios', opciones: [] },
    { clave: 'campo', etiqueta: 'Campo de formación', tipo: 'varios', catalogo: 'campo_formacion', opciones: [] },
    { clave: 'antiguedad', etiqueta: 'Antigüedad', tipo: 'rango', opciones: [['1-2', 'Hasta 1 año'], ['3-6', '1 a 3 años'], ['7-10', '3 a 5 años'], ['11-', 'Más de 5 años']] },
    { clave: 'estudiando', etiqueta: 'Estudiando', tipo: 'uno', opciones: [['true', 'Sí'], ['false', 'No']] },
    { clave: 'grupos', etiqueta: 'Grupos', tipo: 'rango', opciones: [['0-0', 'Sin grupos'], ['1-2', '1 o 2'], ['3-4', '3 o 4'], ['5-', '5 o más']] },
    { clave: 'recontratable', etiqueta: 'Recontratable', tipo: 'uno', opciones: [['true', 'Recontratable'], ['false', 'No recontratable']] },
    { clave: 'nivelImparte', etiqueta: 'Nivel que imparte', tipo: 'varios', opciones: [['Bachillerato General', 'Bachillerato General'], ['Bachillerato General Bilingüe', 'Bachillerato General Bilingüe'], ['Profesional', 'Profesional'], ['ninguno', 'Sin dato']] }
  ];

  const PESTANAS = [
    ['asignaturas', 'Asignaturas y horario'], ['personales', 'Datos personales'], ['formacion', 'Formación y trayectoria'],
    ['opina', 'OPINA'], ['faltas', 'Faltas y suplencias'], ['bajas', 'Historial de bajas']
  ];

  // Alto de fila fijo (CSS .docentes-table tbody td) para calcular cuántas caben en pantalla
  const ALTO_FILA = 49;
  const FILAS_MIN = 4;
  const FILAS_MAX = 30;

  let el = null;
  let estado = null;      // estado de la vista montada (lista o ficha)
  /** Lo que se recuerda al ir a una ficha y volver: búsqueda, filtros, orden, pestaña y página. */
  const memoria = { lista: null, desdeLista: false };
  const cacheResumen = new Map();
  const cacheOpina = new Map();

  function estadoLista(parametros = {}) {
    const previo = memoria.lista;
    const base = previo && parametros.search === undefined
      ? { ...previo, filtros: { ...previo.filtros } }
      : { search: parametros.search || '', semestreActual: false, filtros: {}, ordenar: 'nombre', orden: 'asc', estado: 'todos', page: 1, verFiltros: false };
    return { ...base, limit: FILAS_MIN, datos: null, peticion: 0 };
  }

  function recordarLista() {
    if (!estado || estado.vista !== 'lista') return;
    const { search, semestreActual, filtros, ordenar, orden, page, verFiltros } = estado;
    memoria.lista = { search, semestreActual, filtros: { ...filtros }, ordenar, orden, estado: estado.estado, page, verFiltros };
  }

  // ------------------------------------------------------------------ celdas
  function cumple(mmdd) {
    const [m, d] = mmdd.split('-');
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1];
    return `${Number(d)} ${mes}`;
  }

  /** OPINA con punto de color: < 70 rojo (zona de riesgo, G2), 70–84.9 ámbar, ≥ 85 verde. */
  function tonoOpina(p) { return p < 70 ? 'alerta' : p < 85 ? 'pendiente' : 'ok'; }
  /** Faltas del semestre: 0 gris, 1–2 ámbar, 3 o más rojo. */
  function tonoFaltas(n) { return n >= 3 ? 'alerta' : n > 0 ? 'pendiente' : 'neutro'; }

  function valorOpina(d) {
    if (!d.opina) return '<span class="cell-muted">—</span>';
    if (d.opina.muestraInsuficiente) {
      return `<span class="valor-tono neutro" title="Muestra insuficiente (${d.opina.respuestas} respuestas)">${UI.porcentaje(d.opina.porcentaje)}*</span>`;
    }
    return `<span class="valor-tono ${tonoOpina(d.opina.porcentaje)}" title="${d.opina.respuestas} respuestas">${UI.porcentaje(d.opina.porcentaje)}</span>`;
  }

  function valorFaltas(n) {
    return `<span class="valor-tono ${tonoFaltas(n)}">${n}</span>`;
  }

  function insigniaEstado(d) {
    if (d.activo) return `<span class="badge badge-success">${UI.icon('userCheck')}Activo</span>`;
    if (d.recontratable === false) return `<span class="badge badge-danger">${UI.icon('userX')}No recontratable</span>`;
    return `<span class="badge badge-neutro">${UI.icon('userX')}Inactivo${d.recontratable ? ' · Recontratable' : ''}</span>`;
  }

  function avisoIncompleto(d) {
    if (!d.incompleto.length) return '';
    const falta = d.incompleto.map((k) => FALTANTE[k] || k).join(', ');
    return `<button type="button" class="aviso-incompleto" data-accion="incompleto" data-id="${d.id}"
              title="Falta: ${UI.escape(falta)}. Clic para capturarlo." aria-label="Datos incompletos: falta ${UI.escape(falta)}">${UI.icon('warning')}</button>`;
  }

  // ================================================================== LISTA
  function opcionesFiltro(f) {
    // El rótulo solo se ve con el select cerrado; `hidden` lo quita de la lista desplegable
    return `<option value="" selected hidden>${UI.escape(f.etiqueta)}</option>` + f.opciones.map(([v, t]) => `<option value="${UI.escape(v)}">${UI.escape(t)}</option>`).join('');
  }

  function plantillaLista() {
    return `
      <section class="page-header">
        <div>
          <h2>Docentes</h2>
          <p class="muted">Consulta, filtra y captura la información de la plantilla docente.</p>
        </div>
        <div class="toolbar-actions">
          <button class="btn btn-primary" type="button" data-accion="nuevo">${UI.icon('plus')}Nuevo docente</button>
          <button class="btn btn-outline" type="button" data-accion="rapida" title="Solo nómina y nombre (p. ej. suplentes)">${UI.icon('zap')}Alta rápida</button>
          <button class="btn btn-outline" type="button" data-accion="grupos">${UI.icon('upload')}Subir Excel de grupos</button>
          <button class="btn btn-outline" type="button" data-accion="cv">${UI.icon('upload')}Subir CV (PDF)</button>
        </div>
      </section>

      <div class="toolbar">
        <label class="search">
          <span class="sr-only">Buscar por nombre, CURP, nómina o CRN</span>
          ${UI.icon('search')}
          <input class="input" type="search" id="docBuscar" autocomplete="off" placeholder="Nombre, CURP, Nómina o CRN">
        </label>
        <label class="check"><input type="checkbox" id="docSemestre">Solo semestre actual</label>
        <div class="row">
          <label class="sr-only" for="docOrdenar">Ordenar por</label>
          <div class="select-wrap"><select class="input select" id="docOrdenar" style="height:34px;font-size:13px">
            ${ORDENES.map(([v, t]) => `<option value="${v}">Ordenar: ${t}</option>`).join('')}
          </select></div>
          <button type="button" class="btn btn-outline btn-icon btn-sm" id="docOrden" aria-label="Cambiar dirección del orden"></button>
        </div>
        <button type="button" class="btn btn-outline btn-sm" id="docFiltrosBtn" aria-expanded="false" aria-controls="docFiltros">${UI.icon('filter')}Filtros<span class="estado-num" id="docFiltrosNum"></span></button>
      </div>
      <div class="filtros" id="docFiltros" aria-label="Filtros" hidden></div>
      <div class="chips" id="docChips" aria-live="polite"></div>

      <div class="estado-tabs" id="docEstados" role="tablist" aria-label="Estado del docente"></div>

      <div class="card lista-card">
        <div class="table-wrap" id="docWrap">
          <table class="table docentes-table" id="docTabla" aria-describedby="docConteo"></table>
        </div>
        <div class="lista-pie">
          <p class="small muted" id="docConteo" aria-live="polite"></p>
          <nav class="paginador" id="docPaginas" aria-label="Páginas"></nav>
        </div>
      </div>`;
  }

  function pintarFiltros() {
    el.querySelector('#docFiltros').innerHTML = FILTROS.map((f) => `
      <div class="select-wrap"><label class="sr-only" for="filtro-${f.clave}">${UI.escape(f.etiqueta)}</label>
        <select class="input select" id="filtro-${f.clave}" data-filtro="${f.clave}">${opcionesFiltro(f)}</select></div>`).join('');
  }

  function pintarOrden() {
    el.querySelector('#docOrdenar').value = estado.ordenar;
    const b = el.querySelector('#docOrden');
    b.innerHTML = UI.icon(estado.orden === 'asc' ? 'arrowUp' : 'arrowDown');
    b.title = estado.orden === 'asc' ? 'Ascendente' : 'Descendente';
  }

  function etiquetaOpcion(f, valor) {
    return (f.opciones.find(([v]) => v === valor) || [valor, valor])[1];
  }

  function pintarBotonFiltros() {
    const n = Object.values(estado.filtros).reduce((s, v) => s + (Array.isArray(v) ? v.length : 1), 0);
    el.querySelector('#docFiltrosNum').textContent = n ? ` ${n}` : '';
    el.querySelector('#docFiltros').hidden = !estado.verFiltros;
    el.querySelector('#docFiltrosBtn').setAttribute('aria-expanded', String(estado.verFiltros));
  }

  function pintarChips() {
    pintarBotonFiltros();
    const chips = [];
    if (estado.search) chips.push({ texto: `Búsqueda: "${estado.search}"`, quitar: 'search' });
    if (estado.semestreActual) chips.push({ texto: 'Solo semestre actual', quitar: 'semestre' });
    for (const f of FILTROS) {
      const v = estado.filtros[f.clave];
      if (v === undefined) continue;
      const valores = Array.isArray(v) ? v : [v];
      for (const x of valores) chips.push({ texto: `${f.etiqueta}: ${etiquetaOpcion(f, x)}`, quitar: `${f.clave}|${x}` });
    }
    el.querySelector('#docChips').innerHTML = chips.length
      ? chips.map((c) => `<span class="chip">${UI.escape(c.texto)}<button type="button" data-quitar="${UI.escape(c.quitar)}" aria-label="Quitar ${UI.escape(c.texto)}">${UI.icon('x')}</button></span>`).join('')
        + '<button type="button" class="btn btn-ghost btn-sm" data-accion="limpiar">Limpiar filtros</button>'
      : '';
  }

  function pintarEstados() {
    const conteos = estado.datos?.conteos || {};
    el.querySelector('#docEstados').innerHTML = ESTADOS.map((e) => `
      <button type="button" role="tab" class="estado-tab ${e.clave === 'incompletos' ? 'tono-pendiente' : ''}" data-estado="${e.clave}"
              aria-selected="${estado.estado === e.clave}">
        ${e.icono ? UI.icon(e.icono) : ''}${UI.escape(e.etiqueta)}<span class="estado-num">${conteos[e.conteo] ?? '…'}</span>
      </button>`).join('');
  }

  // ------------------------------------------------------------------ consulta
  /**
   * Filas que caben sin desplazar la página. Con la tabla ya pintada se mide todo lo demás
   * (encabezados, filtros, pie) y el espacio que queda se divide entre el alto de fila; antes del
   * primer pintado se estima.
   */
  function filasQueCaben() {
    const wrap = el.querySelector('#docWrap');
    if (!wrap) return FILAS_MIN;
    // aire debajo de la tarjeta: el padding inferior del contenedor de vistas (main.content)
    const MARGEN = (parseFloat(getComputedStyle(el.parentElement).paddingBottom) || 24) + 1;
    const tbody = el.querySelector('#docTabla tbody');
    const filas = tbody ? tbody.querySelectorAll('tr.fila-docente').length : 0;
    let disponible;
    if (filas) {
      const finContenido = el.getBoundingClientRect().bottom + window.scrollY;
      const otros = finContenido - tbody.offsetHeight;
      disponible = window.innerHeight - otros - MARGEN;
    } else {
      const pie = el.querySelector('.lista-pie')?.offsetHeight || 56;
      const arriba = wrap.getBoundingClientRect().top + window.scrollY;
      disponible = window.innerHeight - arriba - pie - 44 /* encabezado */ - MARGEN;
    }
    return Math.min(FILAS_MAX, Math.max(FILAS_MIN, Math.floor(disponible / ALTO_FILA)));
  }

  /** Ajusta el tamaño de página conservando visible el primer docente de la página actual. */
  function ajustarLimite() {
    const nuevo = filasQueCaben();
    if (nuevo === estado.limit) return false;
    const primero = (estado.page - 1) * estado.limit;
    estado.limit = nuevo;
    estado.page = Math.floor(primero / nuevo) + 1;
    return true;
  }

  function query() {
    const p = new URLSearchParams();
    if (estado.search) p.set('search', estado.search);
    if (estado.semestreActual) p.set('semestreActual', 'true');
    for (const f of FILTROS) {
      const v = estado.filtros[f.clave];
      if (v === undefined) continue;
      if (f.tipo === 'rango') {
        const [min, max] = v.split('-');
        if (min !== '') p.set(`${f.clave}Min`, min);
        if (max !== '' && max !== undefined) p.set(`${f.clave}Max`, max);
      } else {
        p.set(f.clave, Array.isArray(v) ? v.join(',') : v);
      }
    }
    for (const [k, v] of Object.entries(ESTADOS.find((e) => e.clave === estado.estado).query)) p.set(k, v);
    p.set('ordenar', estado.ordenar);
    p.set('orden', estado.orden);
    p.set('page', String(estado.page));
    p.set('limit', String(estado.limit));
    return p.toString();
  }

  /** Recarga la tabla. `reiniciar` vuelve a la página 1 (cambió búsqueda, filtro u orden). */
  async function cargar({ reiniciar = false } = {}) {
    if (reiniciar) estado.page = 1;
    const n = ++estado.peticion;
    pintarChips();
    ajustarLimite();
    try {
      let datos = await UI.api(`/docentes?${query()}`);
      if (n !== estado.peticion || !el.isConnected) return; // llegó una respuesta más nueva
      if (datos.page > datos.paginas) { // p. ej. se borró el último docente de la última página
        estado.page = datos.paginas;
        datos = await UI.api(`/docentes?${query()}`);
        if (n !== estado.peticion || !el.isConnected) return;
      }
      estado.datos = datos;
      recordarLista();
      pintarEstados();
      pintarTabla();
      pintarPie();
      if (ajustarLimite()) cargar(); // los chips o filtros cambiaron el espacio disponible
    } catch (err) {
      if (n !== estado.peticion) return;
      el.querySelector('#docTabla').innerHTML = `<tbody><tr><td><div class="alert alert-error">${UI.escape(err.message)}</div></td></tr></tbody>`;
    }
  }

  // ------------------------------------------------------------------ tabla
  function encabezado(etiqueta, clave, clase = '') {
    if (!clave) return `<th scope="col" class="${clase}">${UI.escape(etiqueta)}</th>`;
    const activo = estado.ordenar === clave;
    const sort = activo ? (estado.orden === 'asc' ? 'ascending' : 'descending') : 'none';
    const icono = activo && estado.orden === 'desc' ? 'arrowDown' : 'arrowUp';
    return `<th scope="col" class="${clase}" aria-sort="${sort}"><button type="button" class="th-sort" data-ordenar="${clave}" aria-sort="${sort}">${UI.escape(etiqueta)}${UI.icon(icono)}</button></th>`;
  }

  function fila(d) {
    return `
      <tr class="fila-docente ${d.activo ? '' : 'inactivo'}" data-fila="${d.id}">
        <td class="col-nombre">
          <div class="nombre-cell">
            <span class="dot ${d.activo ? 'on' : ''}" role="img" aria-label="${d.activo ? 'Activo' : 'Inactivo'}"></span>
            <button type="button" class="nombre-btn" data-accion="ficha" data-id="${d.id}">${UI.escape(d.nombre)}</button>
            ${avisoIncompleto(d)}
          </div>
        </td>
        <td class="mono cell-muted">${UI.escape(d.nomina)}</td>
        <td class="num">${d.numGrupos}</td>
        <td>${d.antiguedad ? `<span title="Desde ${UI.escape(d.antiguedad.desde)}">${UI.escape(d.antiguedad.texto)}</span>` : '<span class="cell-muted">—</span>'}</td>
        <td class="num">${valorOpina(d)}</td>
        <td class="num">${valorFaltas(d.faltas)}</td>
        <td>${insigniaEstado(d)}</td>
      </tr>`;
  }

  function pintarTabla() {
    const { docentes } = estado.datos;
    const tabla = el.querySelector('#docTabla');
    if (!docentes.length) {
      const hayFiltros = estado.search || estado.semestreActual || Object.keys(estado.filtros).length || estado.estado !== 'todos';
      tabla.innerHTML = `<tbody><tr><td><div class="empty-state">
        <span class="empty-icon">${UI.icon(hayFiltros ? 'search' : 'users')}</span>
        <h3>${hayFiltros ? 'Ningún docente coincide' : 'Todavía no hay docentes'}</h3>
        <p class="muted">${hayFiltros ? 'Prueba con otra búsqueda, otra pestaña o quita algún filtro.' : 'Sube el Excel de grupos del semestre o captura un docente.'}</p>
        ${hayFiltros ? '<button type="button" class="btn btn-outline" data-accion="limpiar">Limpiar filtros</button>' : `<button type="button" class="btn btn-primary" data-accion="grupos">${UI.icon('upload')}Subir Excel de grupos</button>`}
      </div></td></tr></tbody>`;
      return;
    }
    tabla.innerHTML = `
      <thead><tr>
        ${encabezado('Nombre', 'nombre')}
        <th scope="col">Nómina</th>
        ${encabezado('Grupos', 'grupos', 'num')}
        ${encabezado('Antigüedad', 'antiguedad')}
        ${encabezado('OPINA', 'opina', 'num')}
        <th scope="col" class="num">Faltas</th>
        <th scope="col">Estado</th>
      </tr></thead>
      <tbody>${docentes.map(fila).join('')}</tbody>`;
  }

  /** Números de página con elipsis: 1 … 4 5 6 … 12 */
  function numerosDePagina(actual, total) {
    const set = new Set([1, total, actual - 1, actual, actual + 1].filter((p) => p >= 1 && p <= total));
    const lista = [...set].sort((a, b) => a - b);
    const salida = [];
    lista.forEach((p, i) => {
      if (i && p - lista[i - 1] > 1) salida.push(null);
      salida.push(p);
    });
    return salida;
  }

  function pintarPie() {
    const { total, page, limit, paginas, periodo, periodoOpina, docentes } = estado.datos;
    const desde = total ? (page - 1) * limit + 1 : 0;
    const hasta = (page - 1) * limit + docentes.length;
    el.querySelector('#docConteo').textContent = [
      total ? `Mostrando ${desde}–${hasta} de ${total}` : 'Sin resultados',
      periodo ? `Semestre ${periodo}` : null,
      periodoOpina ? `OPINA de ${periodoOpina}` : null
    ].filter(Boolean).join(' · ');
    const nav = el.querySelector('#docPaginas');
    if (paginas <= 1) { nav.innerHTML = ''; return; }
    nav.innerHTML = `
      <button type="button" class="pag-btn" data-pagina="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Página anterior">${UI.icon('chevronLeft')}</button>
      ${numerosDePagina(page, paginas).map((p) => (p === null
        ? '<span class="pag-gap" aria-hidden="true">…</span>'
        : `<button type="button" class="pag-btn" data-pagina="${p}" ${p === page ? 'aria-current="page"' : ''} aria-label="Página ${p}">${p}</button>`)).join('')}
      <button type="button" class="pag-btn" data-pagina="${page + 1}" ${page === paginas ? 'disabled' : ''} aria-label="Página siguiente">${UI.icon('chevronRight')}</button>`;
  }

  // ------------------------------------------------------------------ resumen al pasar el mouse (HU-04)
  let popover = null;
  let temporizador = null;

  function ocultarResumen() {
    clearTimeout(temporizador);
    if (popover) { popover.remove(); popover = null; }
  }

  async function mostrarResumen(boton) {
    const id = Number(boton.dataset.id);
    let r = cacheResumen.get(id);
    if (!r) {
      try { ({ resumen: r } = await UI.api(`/docentes/${id}/resumen`)); cacheResumen.set(id, r); } catch { return; }
    }
    if (!boton.matches(':hover') && document.activeElement !== boton) return;
    ocultarResumen();
    popover = document.createElement('div');
    popover.className = 'popover';
    popover.setAttribute('role', 'tooltip');
    popover.innerHTML = `
      <strong>${UI.escape(r.nombre)}</strong>
      <dl>
        <dt>Nómina</dt><dd>${UI.escape(r.nomina)}</dd>
        <dt>Contrato(s)</dt><dd>${r.contratos.length ? UI.escape(r.contratos.join(', ')) : '<span class="cell-muted">Sin contrato registrado</span>'}</dd>
        <dt>CRN ${UI.escape(r.periodo || '')}</dt>
        <dd>${r.crn.length ? `<ul>${r.crn.map((c) => `<li>${UI.escape(c.crn || 'Actividad')} · ${UI.escape(c.materia || '')}${c.numeroGrupo ? ` · ${UI.escape(c.numeroGrupo)}` : ''}</li>`).join('')}</ul>` : '—'}</dd>
      </dl>`;
    document.body.appendChild(popover);
    const rect = boton.getBoundingClientRect();
    const top = rect.bottom + 8 + popover.offsetHeight > window.innerHeight ? rect.top - popover.offsetHeight - 8 : rect.bottom + 8;
    popover.style.top = `${Math.max(8, top)}px`;
    popover.style.left = `${Math.min(rect.left, window.innerWidth - popover.offsetWidth - 12)}px`;
  }

  function programarResumen(boton) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => mostrarResumen(boton), 350);
  }

  // ================================================================== FICHA (pantalla completa)
  function dato(etiqueta, valor) {
    return `<div><dt>${UI.escape(etiqueta)}</dt><dd>${valor}</dd></div>`;
  }

  function horarioTexto(horarios) {
    if (!horarios || !horarios.length) return '—';
    const grupos = new Map();
    for (const h of horarios) {
      const k = `${h.inicio}–${h.fin}`;
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(DIAS[h.dia]);
    }
    return [...grupos].map(([horas, dias]) => `${dias.join('-')} ${horas}`).join(' · ');
  }

  function tabPersonales(d) {
    return `
      <p class="small muted" style="margin-bottom:10px">Origen del registro: <span class="badge badge-outline badge-plain">${UI.escape(ORIGEN[d.origen] || d.origen || '—')}</span></p>
      ${d.revisar ? `<p class="alert alert-warning" style="margin-bottom:12px">${UI.icon('warning')}Revisar: ${UI.escape(d.revisar)}</p>` : ''}
      <dl class="datos">
        ${dato('Nómina', UI.escape(d.nomina))}
        ${dato('CURP', UI.guion(d.curp))}
        ${dato('Fecha de nacimiento', d.fechaNacimiento ? UI.escape(UI.fecha(d.fechaNacimiento)) : '—')}
        ${dato('Edad', d.edad === null ? '—' : `${d.edad} años`)}
        ${dato('Género', d.genero === 'F' ? 'Femenino' : d.genero === 'M' ? 'Masculino' : '—')}
        ${dato('Cumpleaños', d.cumpleanos ? UI.escape(cumple(d.cumpleanos)) : '—')}
        ${dato('Correo institucional', UI.guion(d.correoInstitucional))}
        ${dato('Nivel que imparte', UI.guion(d.nivelImparte))}
      </dl>`;
  }

  function tabFormacion(d) {
    const titulos = d.titulos.length
      ? `<div class="table-wrap"><table class="table table-compact"><thead><tr><th>Grado</th><th>Título</th><th>Institución</th><th>Periodo</th><th>Estatus</th><th>Cédula</th></tr></thead>
         <tbody>${d.titulos.map((t) => `<tr><td>${UI.escape(t.grado)}</td><td>${UI.guion(t.nombreTitulo)}</td><td>${UI.guion(t.institucion)}</td>
           <td>${UI.guion(t.periodoTexto)}</td><td><span class="badge ${t.estatus === 'Estudios en curso' ? 'badge-info' : t.estatus === 'Titulado' ? 'badge-success' : ''} badge-plain">${UI.escape(t.estatus)}</span></td>
           <td>${UI.guion(t.cedula)}</td></tr>`).join('')}</tbody></table></div>`
      : '<p class="muted">Sin títulos capturados.</p>';
    return `
      <dl class="datos" style="margin-bottom:16px">
        ${dato('Nivel de estudios', UI.guion(d.nivelEstudios))}
        ${dato('Campo de formación', UI.guion(d.campoFormacion))}
        ${dato('¿Está estudiando?', d.estudiando.si ? `Sí${d.estudiando.nivel ? ` · ${UI.escape(d.estudiando.nivel)}` : ''}` : 'No')}
        ${dato('Trabajo externo', UI.guion(d.trabajoExterno))}
        ${dato('Departamento', UI.guion(d.departamento))}
        ${dato('Tipo de contrato', UI.guion(d.tipoContrato))}
        ${dato('Antigüedad', d.antiguedad ? UI.escape(d.antiguedad.texto) : '—')}
        ${dato('Primer semestre', UI.guion(d.antiguedad ? d.antiguedad.desde : d.primerSemestreTexto))}
        ${dato('Idiomas (CV)', d.idiomas.length ? UI.escape(d.idiomas.join(' · ')) : '—')}
      </dl>
      <p class="section-title">Títulos</p>
      ${titulos}
      <p class="section-title mt">Cursos y certificados (CV)</p>
      ${d.cursos.length
        ? `<ul class="lista-cv">${d.cursos.map((c) => `<li>${UI.escape(c)}</li>`).join('')}</ul>`
        : '<p class="muted">Sin cursos leídos del CV.</p>'}
      <p class="section-title mt">Experiencia (CV)</p>
      ${(d.experiencia || []).length
        ? `<ul class="lista-cv">${d.experiencia.map((x) => `<li>
            <strong>${UI.escape(x.cargo || (x.asignaturas && x.asignaturas.length ? 'Docente' : 'Puesto sin nombre'))}</strong>${x.institucion ? ` · ${UI.escape(x.institucion)}` : ''}
            ${x.periodo ? `<span class="muted"> · ${UI.escape(x.periodo)}</span>` : ''}
            ${x.vigente ? ' <span class="badge badge-success badge-plain" title="El CV dice “a la fecha”: sigue trabajando ahí">Actual</span>' : ''}
            ${x.asignaturas && x.asignaturas.length ? `<div class="small muted">${UI.escape(x.asignaturas.join(' · '))}</div>` : ''}</li>`).join('')}</ul>`
        : '<p class="muted">Sin experiencia leída del CV.</p>'}`;
  }

  // ------------------------------------------------------------------ vista semanal (HU-19)
  const DIAS_LARGOS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const aMin = (hhmm) => { const [h, m] = String(hhmm).split(':').map(Number); return h * 60 + (m || 0); };

  /** Reparte en carriles los bloques que se empalman el mismo día (para dibujarlos lado a lado). */
  function carriles(bloques) {
    const ordenados = bloques.slice().sort((x, y) => x.ini - y.ini || y.fin - x.fin);
    let grupo = [];
    let finGrupo = -1;
    const cerrarGrupo = () => { const n = Math.max(...grupo.map((b) => b.carril)) + 1; grupo.forEach((b) => { b.carriles = n; }); grupo = []; };
    for (const b of ordenados) {
      if (grupo.length && b.ini >= finGrupo) cerrarGrupo();
      const ocupados = new Set(grupo.filter((g) => g.fin > b.ini).map((g) => g.carril));
      let c = 0;
      while (ocupados.has(c)) c += 1;
      b.carril = c;
      grupo.push(b);
      finGrupo = Math.max(finGrupo, b.fin);
    }
    if (grupo.length) cerrarGrupo();
    return ordenados;
  }

  function vistaSemanal(asignaturas) {
    const bloques = [];
    asignaturas.forEach((a, i) => (a.horarios || []).forEach((h) => bloques.push({ a, i, dia: h.dia, inicio: h.inicio, termina: h.fin, ini: aMin(h.inicio), fin: aMin(h.fin) })));
    if (!bloques.length) return '<p class="muted">Sin horario capturado (llega con el Excel de grupos o se captura en Editar → Asignaturas).</p>';
    const dias = [1, 2, 3, 4, 5, ...[6, 7].filter((d) => bloques.some((b) => b.dia === d))];
    const desde = Math.floor(Math.min(...bloques.map((b) => b.ini)) / 60);
    const hasta = Math.ceil(Math.max(...bloques.map((b) => b.fin)) / 60);
    const horas = Array.from({ length: hasta - desde }, (_, k) => desde + k);
    const minutos = (hasta - desde) * 60;
    const pct = (m) => `${((m - desde * 60) / minutos) * 100}%`;
    const columna = (dia) => carriles(bloques.filter((b) => b.dia === dia)).map((b) => {
      const etiqueta = b.a.crn || b.a.nombreActividad || 'Actividad';
      const titulo = `${etiqueta} · ${b.a.materia || ''}${b.a.numeroGrupo ? ` · grupo ${b.a.numeroGrupo}` : ''} · ${DIAS_LARGOS[b.dia]} ${b.inicio}–${b.termina}`;
      return `<div class="semana-bloque tono-${b.i % 6}${b.a.crn ? '' : ' actividad'}${b.fin - b.ini < 45 ? ' corto' : ''}" title="${UI.escape(titulo)}"
                  style="top:${pct(b.ini)};height:calc(${((b.fin - b.ini) / minutos) * 100}% - 2px);left:calc(${(b.carril / b.carriles) * 100}% + 2px);width:calc(${100 / b.carriles}% - 4px)">
                <strong>${UI.escape(etiqueta)}</strong>
                <span>${UI.escape(b.a.materia || '')}</span>
                <span class="semana-hora">${UI.escape(b.inicio)}–${UI.escape(b.termina)}${b.a.numeroGrupo ? ` · ${UI.escape(b.a.numeroGrupo)}` : ''}</span>
              </div>`;
    }).join('');
    return `
      <div class="semana" style="--filas:${horas.length};--dias:${dias.length}" role="img" aria-label="Horario semanal: ${bloques.length} sesiones">
        <div class="semana-head"><span></span>${dias.map((d) => `<span>${DIAS_LARGOS[d]}</span>`).join('')}</div>
        <div class="semana-body">
          <div class="semana-horas">${horas.map((h) => `<span>${String(h).padStart(2, '0')}:00</span>`).join('')}</div>
          ${dias.map((d) => `<div class="semana-dia">${columna(d)}</div>`).join('')}
        </div>
      </div>
      <p class="small muted mt">${bloques.length} sesión(es) a la semana. Pasa el mouse sobre un bloque para ver el detalle.</p>`;
  }

  function tabFaltas(d) {
    const faltas = d.faltasDetalle.length
      ? `<table class="table table-compact"><thead><tr><th>Fecha</th><th>CRN</th><th>Motivo</th><th class="num">Descuento</th><th>Cubrió</th><th>Quincena</th></tr></thead>
         <tbody>${d.faltasDetalle.map((f) => `<tr><td>${UI.escape(f.fecha ? UI.fecha(f.fecha) : f.fechaTexto)}</td><td>${UI.guion(f.crn)}</td><td>${UI.guion(f.motivo)}</td>
           <td class="num">${UI.dinero(f.montoDescuento)}</td><td>${UI.guion(f.suplente)}</td><td>${f.quincena ? `Q${f.quincena}` : 'Pendiente'}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">Sin faltas registradas.</p>';
    const sup = d.suplenciasCubiertas.length
      ? `<table class="table table-compact"><thead><tr><th>Fecha</th><th>CRN</th><th>Titular</th><th class="num">Pago</th></tr></thead>
         <tbody>${d.suplenciasCubiertas.map((s) => `<tr><td>${UI.escape(UI.fecha(s.fecha))}</td><td>${UI.guion(s.crn)}</td><td>${UI.guion(s.titular)}</td><td class="num">${UI.dinero(s.monto)}</td></tr>`).join('')}</tbody></table>`
      : '<p class="muted">No ha cubierto suplencias.</p>';
    return `<p class="section-title">Faltas y descuentos</p>${faltas}<p class="section-title mt">Suplencias que cubrió</p>${sup}`;
  }

  function tabBajas(d) {
    if (!d.bajas.length) return '<p class="muted">Nunca se ha dado de baja.</p>';
    return `<div class="table-wrap"><table class="table table-compact">
      <thead><tr><th>Fecha</th><th>Semestre</th><th>Motivo</th><th>Observaciones</th><th>Recontratable</th><th>Reactivación</th></tr></thead>
      <tbody>${d.bajas.map((b) => `<tr><td class="nowrap">${UI.escape(UI.fecha(b.fecha))}</td><td>${UI.guion(b.periodo)}</td><td>${UI.escape(b.motivo)}</td>
        <td style="white-space:normal;min-width:240px">${UI.escape(b.observaciones)}</td>
        <td>${b.recontratable ? '<span class="badge badge-plain">Sí</span>' : '<span class="badge badge-danger badge-plain">No</span>'}</td>
        <td>${b.fechaReactivacion ? UI.escape(UI.fecha(b.fechaReactivacion)) : '—'}</td></tr>`).join('')}</tbody></table></div>
      <p class="small muted mt">Las observaciones solo se ven aquí.</p>`;
  }

  function tabAsignaturas(d) {
    if (!d.asignaturas.length) return '<p class="muted">No tiene grupos ni actividades en el semestre.</p>';
    const tarjeta = (a) => {
      const avisos = [
        a.avisos.includes('SIN_CONTRATO') ? '<span class="badge badge-warning">Sin contrato</span>' : '',
        a.avisos.includes('SIN_TARIFA') ? '<span class="badge badge-warning">Sin tarifa</span>' : ''
      ].join('');
      const sub = [a.crn ? `CRN ${a.crn}` : 'Actividad', a.numeroGrupo ? `Grupo ${a.numeroGrupo}` : null,
        a.horarios && a.horarios.length ? horarioTexto(a.horarios) : null, a.modalidad].filter(Boolean).join(' · ');
      return `
        <article class="materia-card">
          <header class="materia-head">
            <div><h4>${UI.escape(a.materia || a.nombreActividad || '—')}</h4><p class="small muted">${UI.escape(sub)}</p></div>
            <div class="row">${avisos}</div>
          </header>
          <dl class="materia-datos">
            <div><dt>Idioma</dt><dd>${a.idioma === 'EN' ? 'Inglés' : a.idioma === 'ES' ? 'Español' : '—'}</dd></div>
            <div><dt>Tipo de clase</dt><dd>${UI.guion(a.tipoClase)}</dd></div>
            <div><dt>Horas / semana</dt><dd>${UI.guion(a.horasSemana)}</dd></div>
            <div><dt>Tarifa diaria</dt><dd>${UI.dinero(a.tarifaDiaria)}</dd></div>
            <div><dt>Tarifa mensual</dt><dd>${UI.dinero(a.tarifaMensual)}</dd></div>
            <div><dt>Contrato</dt><dd>${a.numContrato ? UI.escape(a.numContrato) : '<span class="cell-muted">—</span>'}</dd></div>
          </dl>
        </article>`;
    };
    return `
      <div class="seccion-head">
        <p class="section-title">${d.asignaturas.length} ${d.asignaturas.length === 1 ? 'grupo o actividad' : 'grupos y actividades'}${d.departamento ? ` · ${UI.escape(d.departamento)}` : ''}</p>
        <p class="small muted">Total mensual <strong>${UI.dinero(d.totalMensual)}</strong> · la tarifa mensual es el pago al semestre entre 4</p>
      </div>
      <div class="materias">${d.asignaturas.map(tarjeta).join('')}</div>
      <p class="section-title mt">Vista semanal</p>
      ${vistaSemanal(d.asignaturas)}`;
  }

  // ------------------------------------------------------------------ pestaña OPINA (GET /docentes/:id/opina)
  function barra(etiqueta, pct, detalle) {
    return `<div class="barra-fila"><span>${UI.escape(etiqueta)}</span>
      <div class="barra" role="img" aria-label="${UI.escape(etiqueta)}: ${pct} %"><span class="barra-relleno tono-${tonoOpina(pct)}" style="width:${Math.max(0, Math.min(100, pct))}%"></span></div>
      <strong>${UI.porcentaje(pct)}</strong><span class="small muted">${UI.escape(detalle || '')}</span></div>`;
  }

  function tabOpina(d) {
    const clave = `${d.id}|${estado.opinaPeriodo || ''}`;
    const r = cacheOpina.get(clave);
    if (!r) {
      UI.api(`/docentes/${d.id}/opina${estado.opinaPeriodo ? `?periodoId=${estado.opinaPeriodo}` : ''}`)
        .then((res) => { cacheOpina.set(clave, res); if (estado.vista === 'ficha' && estado.pestana === 'opina') pintarPanel(); })
        .catch((err) => { const p = el.querySelector('#panel-ficha'); if (p) p.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`; });
      return '<div class="skeleton" style="height:160px"></div>';
    }
    if (!r.periodos.length) return '<p class="muted">Sin respuestas de OPINA.</p>';
    const selector = `
      <div class="select-wrap" style="max-width:240px"><label class="sr-only" for="opinaPeriodo">Semestre</label>
        <select class="input select" id="opinaPeriodo">${r.periodos.map((p) => `<option value="${p.id}" ${r.periodo && p.id === r.periodo.id ? 'selected' : ''}>${UI.escape(p.clave)} · ${UI.porcentaje(p.porcentaje)}</option>`).join('')}</select></div>`;
    if (!r.global) return `${selector}<p class="muted mt">Sin respuestas en ese semestre.</p>`;
    const g = r.global;
    return `
      <div class="seccion-head">${selector}
        <p class="small muted">Calificación global = Σ "Sí" ÷ Σ respuestas de todos sus grupos${g.muestraSuficiente ? '' : ` · <strong>muestra insuficiente</strong> (menos de ${r.muestraMinima})`}</p></div>
      <div class="kpis-mini">
        <div><span class="kpi-label">Calificación global</span><strong class="valor-tono ${g.muestraSuficiente ? tonoOpina(g.porcentaje) : 'neutro'}">${UI.porcentaje(g.porcentaje)}</strong></div>
        <div><span class="kpi-label">Respuestas</span><strong>${g.respuestas}</strong></div>
        <div><span class="kpi-label">Recomiendan</span><strong>${g.positivas}</strong></div>
      </div>
      <p class="section-title mt">Por grupo</p>
      <div class="barras">${r.porCrn.map((c) => barra(`${c.crn} · ${c.materia || ''}${c.grupo ? ` · ${c.grupo}` : ''}`, c.porcentaje, `${c.respuestas} resp.`)).join('')}</div>
      ${r.reactivos ? `<p class="section-title mt">Reactivos (% de "Sí")</p>
        <div class="barras">${r.reactivos.map((x) => barra(x.etiqueta, x.porcentajeSi, x.noSeguro ? `${x.noSeguro} no seguro(s)` : '')).join('')}</div>` : ''}
      ${r.razones.porQueSi.length || r.razones.porQueNo.length ? `<p class="section-title mt">Razones</p>
        <div class="razones">
          <div><p class="small muted">¿Por qué sí?</p><ul>${r.razones.porQueSi.map((x) => `<li>${UI.escape(x.razon)} <span class="muted">(${x.alumnos})</span></li>`).join('') || '<li class="muted">—</li>'}</ul></div>
          <div><p class="small muted">¿Por qué no?</p><ul>${r.razones.porQueNo.map((x) => `<li>${UI.escape(x.razon)} <span class="muted">(${x.alumnos})</span></li>`).join('') || '<li class="muted">—</li>'}</ul></div>
        </div>` : ''}
      <p class="section-title mt">Comentarios de alumnos <span class="badge badge-outline badge-plain">Confidencial</span></p>
      ${r.comentarios.length
        ? `<ul class="comentarios">${r.comentarios.map((c) => `<li class="${c.recomienda ? '' : 'negativo'}"><span class="small muted">${UI.escape(c.crn)} · ${c.recomienda ? 'Recomienda' : 'No recomienda'}</span><p>${UI.escape(c.texto)}</p></li>`).join('')}</ul>`
        : '<p class="muted">Sin comentarios.</p>'}`;
  }

  const CONTENIDO = { personales: tabPersonales, formacion: tabFormacion, asignaturas: tabAsignaturas, faltas: tabFaltas, opina: tabOpina, bajas: tabBajas };

  function kpi(etiqueta, valor, tono = '', nota = '') {
    return `<div class="perfil-kpi"><span class="kpi-label">${UI.escape(etiqueta)}</span><strong class="${tono ? `valor-tono ${tono}` : ''}">${valor}</strong>${nota ? `<span class="small muted">${nota}</span>` : ''}</div>`;
  }

  function lineaAviso(d) {
    if (!d.activo && d.bajas.length) {
      const b = d.bajas[0];
      return `<p class="perfil-aviso tono-neutro">${UI.icon('userX')}Dado de baja el ${UI.escape(UI.fecha(b.fecha))} · ${UI.escape(b.motivo)} · ${b.recontratable ? 'Recontratable' : 'No recontratable'}</p>`;
    }
    if (d.incompleto.length) {
      return `<p class="perfil-aviso tono-pendiente">${UI.icon('warning')}Faltan datos: ${UI.escape(d.incompleto.map((k) => FALTANTE[k] || k).join(', '))}
        <button type="button" class="link-btn" data-accion="incompleto" data-id="${d.id}">Completar</button></p>`;
    }
    return '';
  }

  function plantillaFicha(d) {
    const horas = d.asignaturas.reduce((s, a) => s + (Number(a.horasSemana) || 0), 0);
    const meta = [d.nomina, d.nivelImparte, d.departamento, d.campoFormacion].filter(Boolean).map(UI.escape).join(' · ');
    const opina = d.opina
      ? kpi('OPINA', `${UI.porcentaje(d.opina.porcentaje)}${d.opina.muestraInsuficiente ? '*' : ''}`, d.opina.muestraInsuficiente ? 'neutro' : tonoOpina(d.opina.porcentaje))
      : kpi('OPINA', '—');
    return `
      <button type="button" class="volver" data-accion="volver">${UI.icon('chevronLeft')}Volver a docentes</button>

      <section class="card perfil-card">
        <div class="perfil-head">
          <span class="avatar-lg ${d.activo ? '' : 'inactivo'}" aria-hidden="true">${UI.escape(UI.initials(`${d.nombres || ''} ${d.apellidoPaterno || ''}`))}</span>
          <div class="perfil-info">
            <h2>${UI.escape(d.nombre)}</h2>
            <p class="muted">${meta}</p>
            ${lineaAviso(d)}
          </div>
          <div class="perfil-acciones">
            ${insigniaEstado(d)}
            <div class="row">
              <button type="button" class="btn btn-outline btn-sm" data-accion="editar" data-id="${d.id}">${UI.icon('pencil')}Editar</button>
              ${d.cv.disponible
                ? `<a class="btn btn-outline btn-sm" href="/api/docentes/${d.id}/cv" target="_blank" rel="noopener">${UI.icon('file')}Ver CV</a>`
                : `<button type="button" class="btn btn-outline btn-sm" disabled title="Sin CV cargado">${UI.icon('file')}Ver CV</button>`}
              ${d.activo
                ? `<button type="button" class="btn btn-outline btn-sm btn-danger-ghost" data-accion="baja" data-id="${d.id}">${UI.icon('userX')}Suspender</button>`
                : `<button type="button" class="btn btn-outline btn-sm" data-accion="reactivar" data-id="${d.id}">${UI.icon('userCheck')}Reactivar</button>`}
            </div>
          </div>
        </div>
        <div class="perfil-kpis">
          ${opina}
          ${kpi('Faltas del semestre', String(d.faltas), tonoFaltas(d.faltas))}
          ${kpi('Grupos', String(d.numGrupos))}
          ${kpi('Horas / semana', String(horas))}
          ${d.antiguedad
            ? kpi('Antigüedad', `${d.antiguedad.anios} ${d.antiguedad.anios === 1 ? 'año' : 'años'}`, '', `${d.antiguedad.semestres} semestres · desde ${UI.escape(d.antiguedad.desde)}`)
            : kpi('Antigüedad', '—')}
          ${kpi('Total mensual', UI.dinero(d.totalMensual))}
        </div>
      </section>

      <div class="tabs perfil-tabs" role="tablist">
        ${PESTANAS.map(([k, t]) => `<button type="button" class="tab" role="tab" id="tab-${k}" aria-controls="panel-ficha" aria-selected="${estado.pestana === k}" data-pestana="${k}">${t}${k === 'bajas' && d.bajas.length ? ` (${d.bajas.length})` : ''}</button>`).join('')}
      </div>
      <section class="card"><div class="card-body" id="panel-ficha" role="tabpanel" aria-labelledby="tab-${estado.pestana}"></div></section>`;
  }

  function pintarPanel() {
    const panel = el.querySelector('#panel-ficha');
    if (!panel || !estado.docente) return;
    el.querySelectorAll('[data-pestana]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.pestana === estado.pestana)));
    panel.setAttribute('aria-labelledby', `tab-${estado.pestana}`);
    panel.innerHTML = CONTENIDO[estado.pestana](estado.docente);
  }

  async function cargarFicha() {
    try {
      const { docente } = await UI.api(`/docentes/${estado.id}`);
      if (!el.isConnected || estado.vista !== 'ficha') return;
      estado.docente = docente;
      document.title = `${docente.nombre} · SIDI`;
      el.innerHTML = plantillaFicha(docente);
      pintarPanel();
    } catch (err) {
      el.innerHTML = `
        <button type="button" class="volver" data-accion="volver">${UI.icon('chevronLeft')}Volver a docentes</button>
        <div class="alert alert-error">${UI.escape(err.message)}</div>`;
    }
  }

  // ------------------------------------------------------------------ estatus y baja (HU-05, HU-21)
  async function darDeBaja(docente) {
    let motivos = [];
    try { ({ motivos } = await UI.api('/docentes/motivos-baja')); } catch (err) { UI.toast(err.message, 'error'); return; }
    return new Promise((resolve) => {
      const dlg = UI.openDialog({
        title: `Dar de baja a ${docente.nombre} (${docente.nomina})`,
        description: 'El docente quedará inactivo (punto gris). Podrás reactivarlo después.',
        as: 'form',
        bodyHtml: `
          <div class="form">
            <div class="field"><label for="bajaMotivo">Motivo <span class="req">*</span></label>
              <div class="select-wrap"><select class="input select" id="bajaMotivo" required>
                <option value="">— Elige un motivo —</option>
                ${motivos.map((m) => `<option value="${UI.escape(m.motivo)}">${UI.escape(m.motivo)}</option>`).join('')}
              </select></div>
              <p class="hint">El catálogo de motivos se edita en Configuración.</p></div>
            <div class="field"><label for="bajaObs">Observaciones <span class="req">*</span></label>
              <textarea class="input textarea" id="bajaObs" maxlength="1000" rows="4" required placeholder="Por ejemplo: no tiene disponibilidad para el turno matutino en ENE-MAY 2027"></textarea>
              <p class="hint" id="bajaContador">0 / 1000 · Solo se verán en la ficha del docente.</p></div>
            <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-size:13px;font-weight:500;margin-bottom:6px">¿Recontratable? <span class="req">*</span></legend>
              <div class="radio-list">
                <label><input type="radio" name="recontratable" value="true">Sí, recontratable</label>
                <label><input type="radio" name="recontratable" value="false">No recontratable</label>
              </div>
              <p class="hint" id="bajaSugerencia"></p></fieldset>
            <div class="alert alert-error" id="bajaError" role="alert" hidden></div>
          </div>`,
        footerHtml: `<button type="button" class="btn btn-outline" data-accion="cancelar">Cancelar</button>
          <button type="submit" class="btn btn-destructive">${UI.icon('userX')}Dar de baja</button>`,
        onClose: () => resolve(false)
      });
      const f = dlg.el;
      f.noValidate = true; // los mensajes en español vienen del servidor (details por campo)
      let tocado = false;
      f.querySelectorAll('input[name="recontratable"]').forEach((r) => r.addEventListener('change', () => { tocado = true; }));
      f.querySelector('#bajaMotivo').addEventListener('change', (e) => {
        const m = motivos.find((x) => x.motivo === e.target.value);
        const hint = f.querySelector('#bajaSugerencia');
        if (!m || m.recontratableSugerido === null) { hint.textContent = ''; return; }
        hint.textContent = `Sugerido para "${m.motivo}": ${m.recontratableSugerido ? 'Sí, recontratable' : 'No recontratable'}.`;
        if (!tocado) f.querySelector(`input[name="recontratable"][value="${m.recontratableSugerido}"]`).checked = true;
      });
      f.querySelector('#bajaObs').addEventListener('input', (e) => {
        f.querySelector('#bajaContador').textContent = `${e.target.value.length} / 1000 · Solo se verán en la ficha del docente.`;
      });
      f.querySelector('[data-accion="cancelar"]').addEventListener('click', dlg.close);
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = f.querySelector('#bajaError');
        err.hidden = true;
        const marcado = f.querySelector('input[name="recontratable"]:checked');
        const cuerpo = {
          activo: false,
          motivo: f.querySelector('#bajaMotivo').value,
          observaciones: f.querySelector('#bajaObs').value.trim(),
          recontratable: marcado ? marcado.value === 'true' : undefined
        };
        const boton = f.querySelector('[type="submit"]');
        UI.setBusy(boton, true);
        try {
          await UI.api(`/docentes/${docente.id}/estatus`, { method: 'PATCH', body: cuerpo });
          UI.toast(`${docente.nombre} quedó dado de baja.`, 'success');
          resolve(true);
          dlg.close();
        } catch (ex) {
          UI.pintarError(err, ex);
          UI.setBusy(boton, false);
        }
      });
      f.querySelector('#bajaMotivo').focus();
    });
  }

  async function reactivar(docente) {
    const ok = await UI.confirm({
      title: `¿Reactivar a ${docente.nombre}?`,
      message: 'Volverá a aparecer como activo (punto verde).',
      confirmText: 'Reactivar'
    });
    if (!ok) return false;
    try {
      await UI.api(`/docentes/${docente.id}/estatus`, { method: 'PATCH', body: { activo: true } });
    } catch (err) {
      if (err.code !== 'CONFIRMAR_NO_RECONTRATABLE') { UI.toast(err.message, 'error'); return false; }
      const b = err.details[0] || {};
      const seguro = await UI.confirm({
        title: 'Este docente es "No recontratable"',
        message: `Se dio de baja el ${UI.fecha(b.fecha)} por "${b.motivo || ''}". ¿Reactivarlo de todos modos?`,
        detailHtml: `<div class="alert alert-warning"><strong>Observaciones:</strong> ${UI.escape(b.observaciones || '—')}</div>`,
        confirmText: 'Sí, reactivar',
        danger: true
      });
      if (!seguro) return false;
      try {
        await UI.api(`/docentes/${docente.id}/estatus`, { method: 'PATCH', body: { activo: true, confirmarNoRecontratable: true } });
      } catch (ex) { UI.toast(ex.message, 'error'); return false; }
    }
    UI.toast(`${docente.nombre} está activo de nuevo.`, 'success');
    return true;
  }

  // ------------------------------------------------------------------ navegación
  function irAFicha(id, pestana) {
    memoria.desdeLista = estado && estado.vista === 'lista';
    recordarLista();
    ocultarResumen();
    location.hash = `docentes?ficha=${id}${pestana ? `&pestana=${pestana}` : ''}`;
  }

  function volver() {
    if (memoria.desdeLista) { memoria.desdeLista = false; history.back(); }
    else location.hash = 'docentes';
  }

  function docentePorId(id) {
    if (estado.vista === 'ficha' && estado.docente && estado.docente.id === id) return estado.docente;
    return estado.datos?.docentes.find((d) => d.id === id);
  }

  /** Después de editar, dar de baja o importar: recarga lo que se está viendo. */
  async function despues(promesa) {
    if (!(await promesa)) return;
    cacheResumen.clear();
    cacheOpina.clear();
    if (estado.vista === 'ficha') cargarFicha();
    else cargar();
  }

  // ------------------------------------------------------------------ eventos
  function alClic(e) {
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) { quitarChip(quitar.dataset.quitar); return; }
    const orden = e.target.closest('[data-ordenar]');
    if (orden) {
      const clave = orden.dataset.ordenar;
      estado.orden = estado.ordenar === clave && estado.orden === 'asc' ? 'desc' : 'asc';
      estado.ordenar = clave;
      pintarOrden();
      cargar({ reiniciar: true });
      return;
    }
    const pagina = e.target.closest('[data-pagina]');
    if (pagina) {
      if (pagina.disabled) return;
      estado.page = Number(pagina.dataset.pagina);
      cargar();
      el.querySelector('#docEstados')?.scrollIntoView({ block: 'nearest' });
      return;
    }
    const est = e.target.closest('[data-estado]');
    if (est) { estado.estado = est.dataset.estado; cargar({ reiniciar: true }); return; }
    const tab = e.target.closest('[data-pestana]');
    if (tab) {
      estado.pestana = tab.dataset.pestana;
      history.replaceState(null, '', `#docentes?ficha=${estado.id}&pestana=${estado.pestana}`);
      pintarPanel();
      el.querySelector(`#tab-${estado.pestana}`)?.focus();
      return;
    }
    const b = e.target.closest('[data-accion]');
    if (!b) {
      // Clic en cualquier parte de la fila abre la ficha
      const filaEl = e.target.closest('[data-fila]');
      if (filaEl && !e.target.closest('a, button, input, select')) irAFicha(Number(filaEl.dataset.fila));
      return;
    }
    const id = Number(b.dataset.id);
    switch (b.dataset.accion) {
      case 'ficha': irAFicha(id); break;
      case 'volver': volver(); break;
      case 'nuevo': despues(DocenteForm.nuevo()); break;
      case 'rapida': despues(DocenteForm.altaRapida()); break;
      case 'editar': despues(DocenteForm.editar(id)); break;
      case 'capturar': despues(DocenteForm.editar(id, { paso: b.dataset.paso })); break;
      case 'incompleto': {
        const d = docentePorId(id);
        despues(DocenteForm.editar(id, { paso: PASO_FALTANTE[d?.incompleto[0]] || 'personales' }));
        break;
      }
      case 'grupos': despues(Importar.grupos()); break;
      case 'cv': despues(Importar.cv()); break;
      case 'baja': despues(darDeBaja(docentePorId(id))); break;
      case 'reactivar': despues(reactivar(docentePorId(id))); break;
      case 'limpiar': limpiar(); break;
      default: break;
    }
  }

  function quitarChip(clave) {
    if (clave === 'search') { estado.search = ''; el.querySelector('#docBuscar').value = ''; App.sincronizarBusqueda(''); }
    else if (clave === 'semestre') { estado.semestreActual = false; el.querySelector('#docSemestre').checked = false; }
    else {
      const [f, valor] = clave.split('|');
      const actual = estado.filtros[f];
      if (Array.isArray(actual)) {
        const resto = actual.filter((v) => v !== valor);
        if (resto.length) estado.filtros[f] = resto; else delete estado.filtros[f];
      } else delete estado.filtros[f];
    }
    cargar({ reiniciar: true });
  }

  function limpiar() {
    estado.search = '';
    estado.semestreActual = false;
    estado.filtros = {};
    estado.estado = 'todos';
    el.querySelector('#docBuscar').value = '';
    el.querySelector('#docSemestre').checked = false;
    App.sincronizarBusqueda('');
    cargar({ reiniciar: true });
  }

  function enlazarLista() {
    const buscar = UI.debounce((q) => { estado.search = q; App.sincronizarBusqueda(q); cargar({ reiniciar: true }); }, 250);
    el.querySelector('#docBuscar').addEventListener('input', (e) => buscar(e.target.value.trim()));
    el.querySelector('#docSemestre').addEventListener('change', (e) => { estado.semestreActual = e.target.checked; cargar({ reiniciar: true }); });
    el.querySelector('#docOrdenar').addEventListener('change', (e) => { estado.ordenar = e.target.value; pintarOrden(); cargar({ reiniciar: true }); });
    el.querySelector('#docOrden').addEventListener('click', () => { estado.orden = estado.orden === 'asc' ? 'desc' : 'asc'; pintarOrden(); cargar({ reiniciar: true }); });
    el.querySelector('#docFiltrosBtn').addEventListener('click', () => {
      estado.verFiltros = !estado.verFiltros;
      pintarBotonFiltros();
      recordarLista();
      if (ajustarLimite()) cargar(); // mostrar u ocultar filtros cambia cuántas filas caben
    });
    el.querySelector('#docFiltros').addEventListener('change', (e) => {
      const s = e.target.closest('[data-filtro]');
      if (!s || !s.value) return;
      const f = FILTROS.find((x) => x.clave === s.dataset.filtro);
      if (f.tipo === 'varios') {
        const actual = estado.filtros[f.clave] || [];
        if (!actual.includes(s.value)) estado.filtros[f.clave] = [...actual, s.value];
      } else {
        estado.filtros[f.clave] = s.value;
      }
      s.value = '';
      cargar({ reiniciar: true });
    });
    // Resumen al pasar el mouse o al enfocar el nombre (HU-04)
    const tabla = el.querySelector('#docTabla');
    tabla.addEventListener('mouseover', (e) => { const b = e.target.closest('.nombre-btn'); if (b) programarResumen(b); });
    tabla.addEventListener('mouseout', (e) => { if (e.target.closest('.nombre-btn')) ocultarResumen(); });
    tabla.addEventListener('focusin', (e) => { const b = e.target.closest('.nombre-btn'); if (b) programarResumen(b); });
    tabla.addEventListener('focusout', (e) => { if (e.target.closest('.nombre-btn')) ocultarResumen(); });
    window.addEventListener('hashchange', ocultarResumen, { once: true });
  }

  // Al cambiar el tamaño de la ventana se recalculan las filas por página (se registra una sola vez).
  window.addEventListener('resize', UI.debounce(() => {
    if (el && el.isConnected && estado && estado.vista === 'lista' && estado.datos && ajustarLimite()) cargar();
  }, 200));

  // Escape cierra el resumen (se registra una sola vez).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el && el.isConnected) ocultarResumen();
  });

  // Cambio de semestre en la pestaña OPINA de la ficha
  document.addEventListener('change', (e) => {
    if (e.target.id !== 'opinaPeriodo' || !el || !el.contains(e.target)) return;
    estado.opinaPeriodo = Number(e.target.value);
    pintarPanel();
  });

  async function cargarCatalogos() {
    const conCatalogo = FILTROS.filter((f) => f.catalogo);
    await Promise.all(conCatalogo.map(async (f) => {
      try {
        const { catalogos } = await UI.api(`/catalogos?tipo=${f.catalogo}`);
        f.opciones = [...catalogos.map((c) => [c.valor, c.valor]), ['ninguno', 'Sin dato']];
      } catch { f.opciones = [['ninguno', 'Sin dato']]; }
    }));
    if (el.isConnected && estado.vista === 'lista') pintarFiltros();
  }

  function montarLista(parametros) {
    estado = { vista: 'lista', ...estadoLista(parametros) };
    el.innerHTML = plantillaLista();
    el.querySelector('#docBuscar').value = estado.search;
    el.querySelector('#docSemestre').checked = estado.semestreActual;
    pintarFiltros();
    pintarOrden();
    pintarEstados();
    enlazarLista();
    cargarCatalogos();
    cargar();
  }

  function montarFicha(parametros) {
    estado = {
      vista: 'ficha',
      id: Number(parametros.ficha),
      pestana: PESTANAS.some(([k]) => k === parametros.pestana) ? parametros.pestana : 'asignaturas',
      opinaPeriodo: null,
      docente: null
    };
    el.innerHTML = '<div class="skeleton" style="height:220px"></div>';
    cargarFicha();
  }

  function mount(container, parametros = {}) {
    // Raíz propia en cada montaje: sus listeners desaparecen cuando App monta otra vista en #view
    el = document.createElement('div');
    el.className = 'docentes-vista';
    container.appendChild(el);
    el.addEventListener('click', alClic);
    cacheResumen.clear();
    if (Number(parametros.ficha) > 0) montarFicha(parametros);
    else montarLista(parametros);
  }

  /** La barra superior escribe aquí cuando ya estamos en Docentes. */
  function buscar(q) {
    if (!el || !el.isConnected) return;
    if (estado.vista !== 'lista') { memoria.lista = { ...(memoria.lista || {}), search: q, page: 1 }; location.hash = `docentes?search=${encodeURIComponent(q)}`; return; }
    estado.search = q;
    el.querySelector('#docBuscar').value = q;
    cargar({ reiniciar: true });
  }

  /** Abre la ficha de un docente (otras vistas, p. ej. el ranking de OPINA). */
  function abrir(id, pestana) {
    irAFicha(id, pestana);
  }

  return { mount, buscar, abrir, horarioTexto, DIAS };
})();
