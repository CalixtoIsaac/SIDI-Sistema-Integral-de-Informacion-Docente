/**
 * Vista Docentes (05 §2 y §4).
 *
 *  HU-03  Tabla con los 12 campos de consulta (+ OPINA y Faltas) y selector de columnas (se recuerda).
 *  HU-04  Resumen al pasar el mouse (nómina, contratos, CRN del semestre) y ficha extendida con pestañas:
 *         tarifa diaria y, a su derecha, la mensual; total mensual; botón Ver CV.
 *  HU-05  Punto verde/gris de estatus; Suspender / Reactivar con confirmación.
 *  HU-21  Modal de baja (motivo, observaciones, recontratable sugerido) e insignia "Recontratable".
 *  HU-06  Filtros combinables con chips (incluye Recontratable) y orden.
 *  HU-07  Búsqueda por nombre, CURP, nómina (con o sin L0) o CRN mientras se escribe.
 *
 * Toda la búsqueda, filtros y orden los resuelve GET /api/docentes (services/filtrosDocentes.js).
 */
const Docentes = (() => {
  const KEY_COLUMNAS = 'sidi.docentes.columnas';
  const DIAS = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const ORIGEN = { excel_grupos: 'Excel de grupos', cv: 'CV', manual: 'Captura manual', opina: 'OPINA', alta_rapida: 'Alta rápida' };
  const FALTANTE = {
    curp: 'CURP', campoFormacion: 'campo de formación', primerSemestre: 'primer semestre', contrato: 'contrato de algún CRN'
  };

  const ORDENES = [
    ['nombre', 'Alfabético'], ['edad', 'Edad'], ['antiguedad', 'Antigüedad'], ['grupos', 'Número de grupos'],
    ['nivelEstudios', 'Nivel de estudios'], ['opina', 'OPINA']
  ];

  /** Filtros de la barra (06 GET /docentes). tipo: uno | varios | rango (rango → <clave>Min/<clave>Max). */
  const FILTROS = [
    { clave: 'activo', etiqueta: 'Estatus', tipo: 'uno', opciones: [['true', 'Activos'], ['false', 'Inactivos']] },
    { clave: 'genero', etiqueta: 'Género', tipo: 'varios', opciones: [['F', 'Femenino'], ['M', 'Masculino'], ['ninguno', 'Sin dato']] },
    { clave: 'nivelEstudios', etiqueta: 'Nivel de estudios', tipo: 'varios', catalogo: 'nivel_estudios', opciones: [] },
    { clave: 'campo', etiqueta: 'Campo de formación', tipo: 'varios', catalogo: 'campo_formacion', opciones: [] },
    { clave: 'antiguedad', etiqueta: 'Antigüedad', tipo: 'rango', opciones: [['1-2', 'Hasta 1 año'], ['3-6', '1 a 3 años'], ['7-10', '3 a 5 años'], ['11-', 'Más de 5 años']] },
    { clave: 'estudiando', etiqueta: 'Estudiando', tipo: 'uno', opciones: [['true', 'Sí'], ['false', 'No']] },
    { clave: 'grupos', etiqueta: 'Grupos', tipo: 'rango', opciones: [['0-0', 'Sin grupos'], ['1-2', '1 o 2'], ['3-4', '3 o 4'], ['5-', '5 o más']] },
    { clave: 'recontratable', etiqueta: 'Recontratable', tipo: 'uno', opciones: [['true', 'Recontratable'], ['false', 'No recontratable']] },
    { clave: 'nivelImparte', etiqueta: 'Nivel que imparte', tipo: 'varios', opciones: [['Bachillerato General', 'Bachillerato General'], ['Bachillerato General Bilingüe', 'Bachillerato General Bilingüe'], ['Profesional', 'Profesional'], ['ninguno', 'Sin dato']] }
  ];

  // ------------------------------------------------------------------ columnas (HU-03)
  const COLUMNAS = [
    { clave: 'nomina', etiqueta: 'Nómina', defecto: true, celda: (d) => `<span class="nowrap">${UI.escape(d.nomina)}</span>` },
    { clave: 'edad', etiqueta: 'Edad', defecto: true, orden: 'edad', num: true, celda: (d) => UI.guion(d.edad) },
    { clave: 'genero', etiqueta: 'Género', defecto: true, celda: (d) => UI.guion(d.genero) },
    { clave: 'curp', etiqueta: 'CURP', defecto: true, celda: (d) => (d.curp ? `<span title="${UI.escape(d.curp)}">${UI.escape(d.curp.slice(0, 10))}…</span>` : '—') },
    { clave: 'numGrupos', etiqueta: 'Grupos', defecto: true, orden: 'grupos', num: true, celda: (d) => d.numGrupos },
    { clave: 'grupos', etiqueta: 'Grupos asignados', defecto: true, celda: celdaGrupos },
    { clave: 'nivelEstudios', etiqueta: 'Nivel de estudios', defecto: true, orden: 'nivelEstudios', celda: (d) => UI.guion(d.nivelEstudios) },
    { clave: 'campoFormacion', etiqueta: 'Campo de formación', defecto: true, celda: (d) => UI.guion(d.campoFormacion) },
    { clave: 'antiguedad', etiqueta: 'Antigüedad', defecto: true, orden: 'antiguedad', celda: celdaAntiguedad },
    { clave: 'estudiando', etiqueta: 'Estudiando', defecto: true, celda: (d) => (d.estudiando.si ? `Sí${d.estudiando.nivel ? ` · ${UI.escape(d.estudiando.nivel)}` : ''}` : 'No') },
    { clave: 'trabajoExterno', etiqueta: 'Trabajo externo', defecto: true, celda: (d) => UI.guion(d.trabajoExterno) },
    { clave: 'opina', etiqueta: 'OPINA', defecto: true, orden: 'opina', num: true, celda: celdaOpina },
    { clave: 'faltas', etiqueta: 'Faltas', defecto: true, num: true, celda: (d) => d.faltas },
    { clave: 'cumpleanos', etiqueta: 'Cumpleaños', defecto: false, celda: (d) => (d.cumpleanos ? UI.escape(cumple(d.cumpleanos)) : '—') },
    { clave: 'nivelImparte', etiqueta: 'Nivel que imparte', defecto: false, celda: (d) => UI.guion(d.nivelImparte) }
  ];

  let el = null;
  let estado = null;
  const cacheResumen = new Map();

  function estadoInicial(parametros = {}) {
    return {
      search: parametros.search || '',
      semestreActual: false,
      filtros: {},
      ordenar: 'nombre',
      orden: 'asc',
      columnas: UI.store.get(KEY_COLUMNAS, null) || COLUMNAS.filter((c) => c.defecto).map((c) => c.clave),
      expandido: null,
      pestana: 'personales',
      datos: null,
      peticion: 0
    };
  }

  // ------------------------------------------------------------------ celdas
  function cumple(mmdd) {
    const [m, d] = mmdd.split('-');
    const mes = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'][Number(m) - 1];
    return `${Number(d)} ${mes}`;
  }

  function celdaGrupos(d) {
    if (!d.grupos.length) return '—';
    const crns = d.grupos.map((g) => g.crn || g.materia);
    const visibles = crns.slice(0, 3).join(', ') + (crns.length > 3 ? '…' : '');
    const lista = d.grupos.map((g) => [g.crn || 'Actividad', g.materia, g.numeroGrupo, g.horario].filter(Boolean).join(' · ')).join('\n');
    return `<span class="crn-list" title="${UI.escape(lista)}">${UI.escape(visibles)}</span>`;
  }

  function celdaAntiguedad(d) {
    if (d.antiguedad) return `<span title="Desde ${UI.escape(d.antiguedad.desde)}">${UI.escape(d.antiguedad.texto)}</span>`;
    return `— <button type="button" class="link-btn small" data-accion="capturar" data-paso="formacion" data-id="${d.id}">Capturar primer semestre</button>`;
  }

  function celdaOpina(d) {
    if (!d.opina) return '—';
    const texto = UI.porcentaje(d.opina.porcentaje);
    return d.opina.muestraInsuficiente
      ? `<span class="opina-baja" title="Muestra insuficiente (${d.opina.respuestas} respuestas)">${texto}</span>`
      : `<span title="${d.opina.respuestas} respuestas">${texto}</span>`;
  }

  function insigniaRecontratable(d) {
    if (d.activo || d.recontratable === null) return '';
    return d.recontratable
      ? '<span class="badge badge-plain">Recontratable</span>'
      : '<span class="badge badge-danger badge-plain">No recontratable</span>';
  }

  function insigniaIncompleto(d) {
    if (!d.incompleto.length) return '';
    const falta = d.incompleto.map((k) => FALTANTE[k] || k).join(', ');
    return `<button type="button" class="badge badge-warning badge-plain" data-accion="incompleto" data-id="${d.id}"
              title="Falta: ${UI.escape(falta)}. Clic para capturarlo.">Datos incompletos</button>`;
  }

  // ------------------------------------------------------------------ plantilla
  function opcionesFiltro(f) {
    return `<option value="">${UI.escape(f.etiqueta)}</option>` + f.opciones.map(([v, t]) => `<option value="${UI.escape(v)}">${UI.escape(t)}</option>`).join('');
  }

  function plantilla() {
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

      <div class="card">
        <div class="card-body" style="padding-bottom:4px">
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
            <div class="dropdown" style="margin-left:auto">
              <button type="button" class="btn btn-outline btn-sm" id="docColumnasBtn" aria-expanded="false" aria-controls="docColumnas">${UI.icon('columns')}Columnas</button>
              <div class="dropdown-panel" id="docColumnas" hidden></div>
            </div>
          </div>
          <div class="filtros" id="docFiltros" aria-label="Filtros"></div>
          <div class="chips" id="docChips" aria-live="polite"></div>
        </div>
        <p class="result-count" id="docConteo" style="padding:0 20px"></p>
        <div class="table-wrap" style="max-height:70vh">
          <table class="table docentes-table" id="docTabla" aria-describedby="docConteo"></table>
        </div>
      </div>`;
  }

  function pintarFiltros() {
    el.querySelector('#docFiltros').innerHTML = FILTROS.map((f) => `
      <div class="select-wrap"><label class="sr-only" for="filtro-${f.clave}">${UI.escape(f.etiqueta)}</label>
        <select class="input select" id="filtro-${f.clave}" data-filtro="${f.clave}">${opcionesFiltro(f)}</select></div>`).join('');
  }

  function pintarColumnasMenu() {
    el.querySelector('#docColumnas').innerHTML = `
      <p class="small muted" style="padding:4px 8px">Columnas visibles</p>
      ${COLUMNAS.map((c) => `<label class="check"><input type="checkbox" value="${c.clave}" ${estado.columnas.includes(c.clave) ? 'checked' : ''}>${UI.escape(c.etiqueta)}</label>`).join('')}
      <hr><button type="button" class="btn btn-ghost btn-sm btn-block" data-accion="columnas-defecto">Restablecer columnas</button>`;
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

  function pintarChips() {
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

  // ------------------------------------------------------------------ consulta
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
    p.set('ordenar', estado.ordenar);
    p.set('orden', estado.orden);
    return p.toString();
  }

  async function cargar() {
    const n = ++estado.peticion;
    pintarChips();
    try {
      const datos = await UI.api(`/docentes?${query()}`);
      if (n !== estado.peticion || !el.isConnected) return; // llegó una respuesta más nueva
      estado.datos = datos;
      pintarTabla();
    } catch (err) {
      if (n !== estado.peticion) return;
      el.querySelector('#docTabla').innerHTML = `<tbody><tr><td><div class="alert alert-error">${UI.escape(err.message)}</div></td></tr></tbody>`;
    }
  }

  // ------------------------------------------------------------------ tabla
  function columnasVisibles() {
    return COLUMNAS.filter((c) => estado.columnas.includes(c.clave));
  }

  function encabezado(etiqueta, clave, num = false) {
    if (!clave) return `<th scope="col" class="${num ? 'num' : ''}">${UI.escape(etiqueta)}</th>`;
    const activo = estado.ordenar === clave;
    const sort = activo ? (estado.orden === 'asc' ? 'ascending' : 'descending') : 'none';
    const icono = activo && estado.orden === 'desc' ? 'arrowDown' : 'arrowUp';
    return `<th scope="col" class="${num ? 'num' : ''}" aria-sort="${sort}"><button type="button" class="th-sort" data-ordenar="${clave}" aria-sort="${sort}">${UI.escape(etiqueta)}${UI.icon(icono)}</button></th>`;
  }

  function fila(d, cols) {
    const expandido = estado.expandido === d.id;
    return `
      <tr class="${d.activo ? '' : 'inactivo'} ${expandido ? 'expandido' : ''}" data-id="${d.id}">
        <td><span class="dot ${d.activo ? 'on' : ''}" role="img" aria-label="${d.activo ? 'Activo' : 'Inactivo'}" title="${d.activo ? 'Activo' : 'Inactivo'}"></span></td>
        <td class="col-nombre">
          <div class="nombre-cell"><div>
            <button type="button" class="nombre-btn" data-accion="ficha" data-id="${d.id}" aria-expanded="${expandido}">${UI.escape(d.nombre)}</button>
            <div class="nombre-meta">${insigniaRecontratable(d)}${insigniaIncompleto(d)}</div>
          </div></div>
        </td>
        ${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${c.celda(d)}</td>`).join('')}
      </tr>
      ${expandido ? `<tr class="ficha-row"><td colspan="${cols.length + 2}"><div class="ficha" id="docFicha"><div class="skeleton" style="height:120px"></div></div></td></tr>` : ''}`;
  }

  function pintarTabla() {
    const { docentes, total, periodo, periodoOpina } = estado.datos;
    const cols = columnasVisibles();
    const tabla = el.querySelector('#docTabla');
    el.querySelector('#docConteo').textContent = [
      `${total} ${total === 1 ? 'docente' : 'docentes'}`,
      periodo ? `Semestre ${periodo}` : null,
      periodoOpina ? `OPINA de ${periodoOpina}` : null
    ].filter(Boolean).join(' · ');

    if (!docentes.length) {
      const hayFiltros = estado.search || estado.semestreActual || Object.keys(estado.filtros).length;
      tabla.innerHTML = `<tbody><tr><td><div class="empty-state">
        <span class="empty-icon">${UI.icon(hayFiltros ? 'search' : 'users')}</span>
        <h3>${hayFiltros ? 'Ningún docente coincide' : 'Todavía no hay docentes'}</h3>
        <p class="muted">${hayFiltros ? 'Prueba con otra búsqueda o quita algún filtro.' : 'Sube el Excel de grupos del semestre o captura un docente.'}</p>
        ${hayFiltros ? '<button type="button" class="btn btn-outline" data-accion="limpiar">Limpiar filtros</button>' : `<button type="button" class="btn btn-primary" data-accion="grupos">${UI.icon('upload')}Subir Excel de grupos</button>`}
      </div></td></tr></tbody>`;
      return;
    }
    tabla.innerHTML = `
      <thead><tr>
        <th scope="col"><span class="sr-only">Estatus</span></th>
        ${encabezado('Nombre', 'nombre')}
        ${cols.map((c) => encabezado(c.etiqueta, c.orden, c.num)).join('')}
      </tr></thead>
      <tbody>${docentes.map((d) => fila(d, cols)).join('')}</tbody>`;
    if (estado.expandido) {
      if (docentes.some((d) => d.id === estado.expandido)) cargarFicha(estado.expandido);
      else estado.expandido = null;
    }
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

  // ------------------------------------------------------------------ ficha extendida (HU-04)
  const PESTANAS = [
    ['personales', 'Datos personales'], ['formacion', 'Formación y trayectoria'], ['asignaturas', 'Asignaturas y horarios'],
    ['faltas', 'Faltas y suplencias'], ['opina', 'OPINA'], ['bajas', 'Historial de bajas']
  ];

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
        ${dato('Cursos (CV)', d.cursos.length ? UI.escape(d.cursos.join(' · ')) : '—')}
        ${dato('Idiomas (CV)', d.idiomas.length ? UI.escape(d.idiomas.join(' · ')) : '—')}
      </dl>
      <p class="section-title">Títulos</p>
      ${titulos}`;
  }

  function tabAsignaturas(d) {
    if (!d.asignaturas.length) return '<p class="muted">No tiene grupos ni actividades en el semestre.</p>';
    const avisos = (a) => [
      a.avisos.includes('SIN_CONTRATO') ? '<span class="badge badge-warning badge-plain">Sin contrato</span>' : '',
      a.avisos.includes('SIN_TARIFA') ? '<span class="badge badge-warning badge-plain">Sin tarifa</span>' : ''
    ].join(' ');
    return `
      <div class="table-wrap"><table class="table table-compact">
        <thead><tr><th>CRN / actividad</th><th>Materia</th><th>Grupo</th><th>Modalidad</th><th>Horario</th><th class="num">h/sem</th>
          <th>Idioma</th><th>Tipo de clase</th><th class="num">Tarifa (diaria)</th><th class="num">Tarifa (mensual)</th><th>Contrato</th></tr></thead>
        <tbody>${d.asignaturas.map((a) => `
          <tr><td class="nowrap">${UI.escape(a.crn || a.nombreActividad || '—')}</td><td>${UI.escape(a.materia || '—')}</td>
            <td>${UI.guion(a.numeroGrupo)}</td><td>${UI.guion(a.modalidad)}</td><td class="nowrap">${UI.escape(horarioTexto(a.horarios))}</td>
            <td class="num">${UI.guion(a.horasSemana)}</td><td>${a.idioma === 'EN' ? 'Inglés' : a.idioma === 'ES' ? 'Español' : '—'}</td>
            <td>${UI.guion(a.tipoClase)}</td><td class="num">${UI.dinero(a.tarifaDiaria)}</td><td class="num">${UI.dinero(a.tarifaMensual)}</td>
            <td class="nowrap">${a.numContrato ? UI.escape(a.numContrato) : ''} ${avisos(a)}</td></tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="9" class="num">Total mensual</td><td class="num">${UI.dinero(d.totalMensual)}</td><td></td></tr></tfoot>
      </table></div>
      <p class="small muted mt">La tarifa mensual es el pago al semestre entre 4. La vista semanal de horarios llega con HU-19.</p>`;
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

  function tabOpina(d) {
    if (!d.opinaPeriodos.length) return '<p class="muted">Sin respuestas de OPINA.</p>';
    return d.opinaPeriodos.map((p) => `
      <div class="repeat-item">
        <div class="repeat-head"><span>${UI.escape(p.periodo)}</span>
          <span>${UI.porcentaje(p.porcentaje)} · ${p.respuestas} respuestas</span></div>
        <table class="table table-compact"><thead><tr><th>CRN</th><th>Materia</th><th class="num">Respuestas</th><th class="num">% recomendación</th></tr></thead>
          <tbody>${p.porCrn.map((c) => `<tr><td>${UI.escape(c.crn)}</td><td>${UI.guion(c.materia)}</td><td class="num">${c.respuestas}</td><td class="num">${UI.porcentaje(c.porcentaje)}</td></tr>`).join('')}</tbody></table>
      </div>`).join('');
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

  const CONTENIDO = { personales: tabPersonales, formacion: tabFormacion, asignaturas: tabAsignaturas, faltas: tabFaltas, opina: tabOpina, bajas: tabBajas };

  function pintarFicha(d) {
    const box = el.querySelector('#docFicha');
    if (!box) return;
    box.innerHTML = `
      <div class="ficha-head">
        <span class="dot ${d.activo ? 'on' : ''}" aria-hidden="true"></span>
        <h3>${UI.escape(d.nombre)}</h3>
        <span class="muted">${UI.escape(d.nomina)}</span>
        ${insigniaRecontratable(d)}
        <div class="row">
          <button type="button" class="btn btn-outline btn-sm" data-accion="editar" data-id="${d.id}">${UI.icon('pencil')}Editar</button>
          ${d.cv.disponible
            ? `<a class="btn btn-outline btn-sm" href="/api/docentes/${d.id}/cv" target="_blank" rel="noopener">${UI.icon('file')}Ver CV</a>`
            : `<button type="button" class="btn btn-outline btn-sm" disabled title="Sin CV cargado">${UI.icon('file')}Ver CV</button>`}
          ${d.activo
            ? `<button type="button" class="btn btn-outline btn-sm btn-danger-ghost" data-accion="baja" data-id="${d.id}">${UI.icon('userX')}Suspender</button>`
            : `<button type="button" class="btn btn-outline btn-sm" data-accion="reactivar" data-id="${d.id}">${UI.icon('userCheck')}Reactivar</button>`}
          <button type="button" class="btn btn-ghost btn-icon btn-sm" data-accion="cerrar-ficha" aria-label="Cerrar ficha">${UI.icon('x')}</button>
        </div>
      </div>
      <div class="tabs" role="tablist">
        ${PESTANAS.map(([k, t]) => `<button type="button" class="tab" role="tab" id="tab-${k}" aria-controls="panel-ficha" aria-selected="${estado.pestana === k}" data-pestana="${k}">${t}${k === 'bajas' && d.bajas.length ? ` (${d.bajas.length})` : ''}</button>`).join('')}
      </div>
      <div id="panel-ficha" role="tabpanel" aria-labelledby="tab-${estado.pestana}">${CONTENIDO[estado.pestana](d)}</div>`;
    box._docente = d;
    ajustarFicha();
  }

  /** La ficha vive dentro de la tabla ancha: se fija al ancho visible para no tener que desplazarse. */
  function ajustarFicha() {
    const box = el && el.querySelector('#docFicha');
    const wrap = el && el.querySelector('.table-wrap');
    if (box && wrap) box.style.width = `${wrap.clientWidth}px`;
  }

  async function cargarFicha(id) {
    try {
      const { docente } = await UI.api(`/docentes/${id}`);
      if (estado.expandido === id) pintarFicha(docente);
    } catch (err) {
      const box = el.querySelector('#docFicha');
      if (box) box.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`;
    }
  }

  function alternarFicha(id, pestana) {
    estado.expandido = estado.expandido === id && !pestana ? null : id;
    if (pestana) estado.pestana = pestana;
    pintarTabla();
    if (estado.expandido) {
      const filaEl = el.querySelector(`tr[data-id="${id}"]`);
      if (filaEl) filaEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  // ------------------------------------------------------------------ eventos
  function docentePorId(id) {
    const box = el.querySelector('#docFicha');
    if (box && box._docente && box._docente.id === id) return box._docente;
    return estado.datos.docentes.find((d) => d.id === id);
  }

  async function despues(promesa, recargarFicha = true) {
    if (await promesa) {
      cacheResumen.clear();
      await cargar();
      if (recargarFicha && estado.expandido) cargarFicha(estado.expandido);
    }
  }

  const PASO_FALTANTE = { curp: 'personales', campoFormacion: 'formacion', primerSemestre: 'formacion', contrato: 'asignaturas' };

  function alClic(e) {
    const quitar = e.target.closest('[data-quitar]');
    if (quitar) { quitarChip(quitar.dataset.quitar); return; }
    const orden = e.target.closest('[data-ordenar]');
    if (orden) {
      const clave = orden.dataset.ordenar;
      estado.orden = estado.ordenar === clave && estado.orden === 'asc' ? 'desc' : 'asc';
      estado.ordenar = clave;
      pintarOrden();
      cargar();
      return;
    }
    const tab = e.target.closest('[data-pestana]');
    if (tab) {
      estado.pestana = tab.dataset.pestana;
      const box = el.querySelector('#docFicha');
      if (box && box._docente) pintarFicha(box._docente);
      el.querySelector(`#tab-${estado.pestana}`)?.focus();
      return;
    }
    const b = e.target.closest('[data-accion]');
    if (!b) {
      if (!e.target.closest('.dropdown')) cerrarColumnas();
      return;
    }
    const id = Number(b.dataset.id);
    switch (b.dataset.accion) {
      case 'ficha': ocultarResumen(); alternarFicha(id); break;
      case 'cerrar-ficha': estado.expandido = null; pintarTabla(); break;
      case 'nuevo': despues(DocenteForm.nuevo(), false); break;
      case 'rapida': despues(DocenteForm.altaRapida(), false); break;
      case 'editar': despues(DocenteForm.editar(id)); break;
      case 'capturar': despues(DocenteForm.editar(id, { paso: b.dataset.paso })); break;
      case 'incompleto': {
        const d = docentePorId(id);
        despues(DocenteForm.editar(id, { paso: PASO_FALTANTE[d.incompleto[0]] || 'personales' }));
        break;
      }
      case 'grupos': despues(Importar.grupos(), false); break;
      case 'cv': despues(Importar.cv(), false); break;
      case 'baja': despues(darDeBaja(docentePorId(id))); break;
      case 'reactivar': despues(reactivar(docentePorId(id))); break;
      case 'limpiar': limpiar(); break;
      case 'columnas-defecto':
        estado.columnas = COLUMNAS.filter((c) => c.defecto).map((c) => c.clave);
        UI.store.set(KEY_COLUMNAS, estado.columnas);
        pintarColumnasMenu();
        pintarTabla();
        break;
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
    cargar();
  }

  function limpiar() {
    estado.search = '';
    estado.semestreActual = false;
    estado.filtros = {};
    el.querySelector('#docBuscar').value = '';
    el.querySelector('#docSemestre').checked = false;
    App.sincronizarBusqueda('');
    cargar();
  }

  function cerrarColumnas() {
    const panel = el.querySelector('#docColumnas');
    if (panel && !panel.hidden) {
      panel.hidden = true;
      el.querySelector('#docColumnasBtn').setAttribute('aria-expanded', 'false');
    }
  }

  function enlazar() {
    el.addEventListener('click', alClic);
    const buscar = UI.debounce((q) => { estado.search = q; App.sincronizarBusqueda(q); cargar(); }, 250);
    el.querySelector('#docBuscar').addEventListener('input', (e) => buscar(e.target.value.trim()));
    el.querySelector('#docSemestre').addEventListener('change', (e) => { estado.semestreActual = e.target.checked; cargar(); });
    el.querySelector('#docOrdenar').addEventListener('change', (e) => { estado.ordenar = e.target.value; pintarOrden(); cargar(); });
    el.querySelector('#docOrden').addEventListener('click', () => { estado.orden = estado.orden === 'asc' ? 'desc' : 'asc'; pintarOrden(); cargar(); });
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
      cargar();
    });
    const btnCols = el.querySelector('#docColumnasBtn');
    btnCols.addEventListener('click', (e) => {
      e.stopPropagation();
      const panel = el.querySelector('#docColumnas');
      panel.hidden = !panel.hidden;
      btnCols.setAttribute('aria-expanded', String(!panel.hidden));
    });
    el.querySelector('#docColumnas').addEventListener('change', (e) => {
      if (e.target.type !== 'checkbox') return;
      estado.columnas = COLUMNAS.map((c) => c.clave).filter((k) => (k === e.target.value ? e.target.checked : estado.columnas.includes(k)));
      UI.store.set(KEY_COLUMNAS, estado.columnas);
      pintarTabla();
    });
    // Resumen al pasar el mouse o al enfocar el nombre (HU-04)
    const tabla = el.querySelector('#docTabla');
    tabla.addEventListener('mouseover', (e) => { const b = e.target.closest('.nombre-btn'); if (b) programarResumen(b); });
    tabla.addEventListener('mouseout', (e) => { if (e.target.closest('.nombre-btn')) ocultarResumen(); });
    tabla.addEventListener('focusin', (e) => { const b = e.target.closest('.nombre-btn'); if (b) programarResumen(b); });
    tabla.addEventListener('focusout', (e) => { if (e.target.closest('.nombre-btn')) ocultarResumen(); });
    el.querySelector('.table-wrap').addEventListener('scroll', ocultarResumen, { passive: true });
    window.addEventListener('hashchange', ocultarResumen, { once: true });
  }

  window.addEventListener('resize', UI.debounce(() => ajustarFicha(), 150));

  // Escape cierra el resumen y el menú de columnas (se registra una sola vez).
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && el && el.isConnected) { ocultarResumen(); cerrarColumnas(); }
  });

  async function cargarCatalogos() {
    const conCatalogo = FILTROS.filter((f) => f.catalogo);
    await Promise.all(conCatalogo.map(async (f) => {
      try {
        const { catalogos } = await UI.api(`/catalogos?tipo=${f.catalogo}`);
        f.opciones = [...catalogos.map((c) => [c.valor, c.valor]), ['ninguno', 'Sin dato']];
      } catch { f.opciones = [['ninguno', 'Sin dato']]; }
    }));
    if (el.isConnected) pintarFiltros();
  }

  function mount(container, parametros = {}) {
    el = container;
    estado = estadoInicial(parametros);
    cacheResumen.clear();
    container.innerHTML = plantilla();
    el.querySelector('#docBuscar').value = estado.search;
    pintarFiltros();
    pintarColumnasMenu();
    pintarOrden();
    enlazar();
    cargarCatalogos();
    cargar();
  }

  /** La barra superior escribe aquí cuando ya estamos en Docentes. */
  function buscar(q) {
    if (!el || !el.isConnected) return;
    estado.search = q;
    el.querySelector('#docBuscar').value = q;
    cargar();
  }

  /** Abre la ficha de un docente (otras vistas, p. ej. el ranking de OPINA). */
  function abrir(id, pestana) {
    if (!el || !el.isConnected) return;
    alternarFicha(id, pestana || 'personales');
  }

  return { mount, buscar, abrir, horarioTexto, DIAS };
})();
