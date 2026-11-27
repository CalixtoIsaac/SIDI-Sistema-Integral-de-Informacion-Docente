/**
 * Piezas compartidas por las vistas quincenales (Faltas, Incidencias, Reportes) y sus modales.
 *
 *  Fechas       Comun.hoyIso() · Comun.diaDeFecha('2026-08-17') → 1 (lunes) … 7 (domingo) · Comun.fechaLarga(iso)
 *  Quincenas    Comun.selectorQuincena(contenedor, { onChange })  → selector "Q16 · 16–31 ago 2026" + chip Abierta/Cerrada
 *               Comun.etiquetaQuincena(q)
 *  Docentes     Comun.buscadorDocente(contenedor, { onElegir, placeholder })  → buscador con lista (nombre, nómina, CURP o CRN)
 *  Catálogos    await Comun.catalogo('motivo_falta') → ['Falta por asunto personal', …]  (se guarda en memoria)
 *  Avisos       Comun.aviso('SIN_CONTRATO') → texto claro para la usuaria
 *  Otros        Comun.selectHtml(name, opciones, valor, attrs) · Comun.stat(etiqueta, valorHtml, { sub, icono, tono })
 */
const Comun = (() => {
  const DIAS_LARGOS = ['', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
  const DIAS_CORTOS = ['', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const CLAVE_QUINCENA = 'sidi.quincena';
  let uid = 0;

  // ---------- Fechas (sin pasar por la zona horaria) ----------
  function hoyIso() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function partes(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? { anio: +m[1], mes: +m[2], dia: +m[3] } : null;
  }
  /** 1 = lunes … 7 = domingo (igual que horarios.dia_semana). */
  function diaDeFecha(iso) {
    const p = partes(iso);
    if (!p) return null;
    const d = new Date(Date.UTC(p.anio, p.mes - 1, p.dia)).getUTCDay();
    return d === 0 ? 7 : d;
  }
  /** '2026-08-17' → 'lunes 17/08/2026' */
  function fechaLarga(iso) {
    const dia = diaDeFecha(iso);
    return dia ? `${DIAS_LARGOS[dia].toLowerCase()} ${UI.fecha(iso)}` : UI.fecha(iso);
  }

  // ---------- Quincenas ----------
  function etiquetaQuincena(q) {
    if (!q) return '—';
    const i = partes(q.fechaInicio);
    const f = partes(q.fechaFin);
    if (!i || !f) return q.etiqueta;
    const rango = i.mes === f.mes
      ? `${i.dia}–${f.dia} ${MESES[f.mes - 1]} ${f.anio}`
      : `${i.dia} ${MESES[i.mes - 1]}–${f.dia} ${MESES[f.mes - 1]} ${f.anio}`;
    return `${q.etiqueta} · ${rango}`;
  }

  function chipEstado(q) {
    return q && q.cerrada
      ? `<span class="badge badge-plain badge-outline">${UI.icon('check')}Cerrada</span>`
      : '<span class="badge badge-success">Abierta</span>';
  }

  let cacheQuincenas = null;
  async function quincenas(forzar = false) {
    if (!cacheQuincenas || forzar) {
      const [{ quincenas: lista }, actual] = await Promise.all([
        UI.api('/quincenas'),
        UI.api('/quincenas/actual').then((r) => r.quincena).catch(() => null)
      ]);
      cacheQuincenas = { lista, actual };
    }
    return cacheQuincenas;
  }

  /**
   * Selector de quincena con chip Abierta/Cerrada (05 §Layout).
   * Recuerda la elección entre vistas. Devuelve { quincena(), lista(), recargar() }.
   */
  function selectorQuincena(contenedor, { onChange } = {}) {
    const id = `quincena-${++uid}`;
    let datos = { lista: [], actual: null };
    let elegida = null;
    contenedor.classList.add('quincena-bar');
    contenedor.innerHTML = `
      <label for="${id}" class="quincena-label">Quincena:</label>
      <div class="select-wrap"><select class="input select" id="${id}" disabled><option>Cargando…</option></select></div>
      <span data-chip></span>`;
    const select = contenedor.querySelector('select');
    const chip = contenedor.querySelector('[data-chip]');

    function pintar() {
      const porAnio = new Map();
      for (const q of datos.lista) {
        if (!porAnio.has(q.anio)) porAnio.set(q.anio, []);
        porAnio.get(q.anio).push(q);
      }
      select.innerHTML = [...porAnio].map(([anio, qs]) => `<optgroup label="${anio}">${qs.map((q) =>
        `<option value="${q.id}"${elegida && q.id === elegida.id ? ' selected' : ''}>${UI.escape(etiquetaQuincena(q))}${datos.actual && q.id === datos.actual.id ? ' (actual)' : ''}</option>`).join('')}</optgroup>`).join('');
      select.disabled = !datos.lista.length;
      chip.innerHTML = chipEstado(elegida);
    }

    async function recargar({ avisar = false } = {}) {
      try {
        datos = await quincenas(true);
        const guardada = UI.store.get(CLAVE_QUINCENA);
        elegida = datos.lista.find((q) => q.id === (elegida ? elegida.id : guardada))
          || datos.lista.find((q) => datos.actual && q.id === datos.actual.id)
          || datos.lista[datos.lista.length - 1] || null;
        pintar();
        if (avisar && onChange) onChange(elegida);
      } catch (err) {
        select.innerHTML = '<option>Sin quincenas</option>';
        UI.toast(`No se pudieron leer las quincenas: ${err.message}`, 'error');
      }
      return elegida;
    }

    select.addEventListener('change', () => {
      elegida = datos.lista.find((q) => q.id === Number(select.value)) || null;
      if (elegida) UI.store.set(CLAVE_QUINCENA, elegida.id);
      chip.innerHTML = chipEstado(elegida);
      if (onChange) onChange(elegida);
    });

    return {
      quincena: () => elegida,
      lista: () => datos.lista,
      anterior() {
        const i = datos.lista.findIndex((q) => elegida && q.id === elegida.id);
        return i > 0 ? datos.lista[i - 1] : null;
      },
      recargar
    };
  }

  // ---------- Buscador de docentes ----------
  /**
   * Input con lista desplegable. onElegir({ id, nombre, nomina, activo, recontratable }).
   * Devuelve { limpiar(), enfocar(), poner(docente) }.
   */
  function buscadorDocente(contenedor, { onElegir, placeholder = 'Nombre, nómina, CURP o CRN', excluir = () => false } = {}) {
    const listaId = `docentes-lista-${++uid}`;
    contenedor.classList.add('buscador');
    contenedor.innerHTML = `
      <label class="search">
        <span class="sr-only">Buscar docente</span>
        ${UI.icon('search')}
        <input class="input" type="search" autocomplete="off" placeholder="${UI.escape(placeholder)}"
               role="combobox" aria-expanded="false" aria-controls="${listaId}" aria-autocomplete="list">
      </label>
      <ul class="buscador-lista" id="${listaId}" role="listbox" hidden></ul>`;
    const input = contenedor.querySelector('input');
    const lista = contenedor.querySelector('ul');
    let resultados = [];
    let activo = -1;
    let pedido = 0;

    function cerrar() {
      lista.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      activo = -1;
    }
    function marcar(i) {
      activo = i;
      [...lista.children].forEach((li, j) => li.setAttribute('aria-selected', String(j === i)));
      if (lista.children[i]) lista.children[i].scrollIntoView({ block: 'nearest' });
    }
    function pintar() {
      if (!resultados.length) {
        lista.innerHTML = '<li class="buscador-vacio">Sin coincidencias.</li>';
      } else {
        lista.innerHTML = resultados.map((d, i) => `
          <li role="option" aria-selected="false" data-i="${i}">
            <span class="dot ${d.activo ? 'on' : ''}" aria-hidden="true"></span>
            <span class="grow"><strong>${UI.escape(d.nombre)}</strong> <span class="muted">${UI.escape(d.nomina)}</span></span>
            ${d.recontratable === false ? '<span class="badge badge-danger badge-plain">No recontratable</span>' : ''}
            ${d.activo ? '' : '<span class="badge badge-plain badge-outline">Inactivo</span>'}
          </li>`).join('');
      }
      lista.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }
    function elegir(i) {
      const d = resultados[i];
      if (!d) return;
      input.value = d.nombre;
      cerrar();
      if (onElegir) onElegir(d);
    }
    const buscar = UI.debounce(async () => {
      const q = input.value.trim();
      if (q.length < 2) { cerrar(); return; }
      const n = ++pedido;
      try {
        const { docentes } = await UI.api(`/docentes?search=${encodeURIComponent(q)}&limit=8`);
        if (n !== pedido) return;
        resultados = docentes.filter((d) => !excluir(d));
        pintar();
      } catch (err) {
        if (n === pedido) { lista.innerHTML = `<li class="buscador-vacio">${UI.escape(err.message)}</li>`; lista.hidden = false; }
      }
    }, 220);

    input.addEventListener('input', buscar);
    input.addEventListener('keydown', (e) => {
      if (lista.hidden) return;
      if (e.key === 'ArrowDown') { e.preventDefault(); marcar(Math.min(activo + 1, resultados.length - 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); marcar(Math.max(activo - 1, 0)); }
      else if (e.key === 'Enter') { e.preventDefault(); elegir(activo >= 0 ? activo : 0); }
      else if (e.key === 'Escape') { e.stopPropagation(); cerrar(); }
    });
    lista.addEventListener('mousedown', (e) => {
      const li = e.target.closest('[data-i]');
      if (li) { e.preventDefault(); elegir(Number(li.dataset.i)); }
    });
    input.addEventListener('blur', () => setTimeout(cerrar, 120));

    return {
      limpiar() { input.value = ''; cerrar(); },
      enfocar() { input.focus(); },
      poner(d) { input.value = d ? d.nombre : ''; }
    };
  }

  // ---------- Catálogos ----------
  const cacheCatalogos = new Map();
  async function catalogo(tipo) {
    if (!cacheCatalogos.has(tipo)) {
      cacheCatalogos.set(tipo, UI.api(`/catalogos?tipo=${encodeURIComponent(tipo)}`)
        .then((r) => r.catalogos.filter((c) => c.activo))
        .catch((err) => { cacheCatalogos.delete(tipo); throw err; }));
    }
    return cacheCatalogos.get(tipo);
  }

  function selectHtml(name, opciones, valor = '', attrs = '') {
    return `<div class="select-wrap"><select class="input select" name="${UI.escape(name)}" ${attrs}>${opciones.map((o) => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${UI.escape(v)}"${String(v) === String(valor ?? '') ? ' selected' : ''}>${UI.escape(t)}</option>`;
    }).join('')}</select></div>`;
  }

  // ---------- Avisos de la API en lenguaje claro ----------
  const AVISOS = {
    SIN_CONTRATO: 'CRN sin contrato',
    SIN_TARIFA: 'CRN sin tarifa',
    FALTA_REPETIDA: 'Ya hay una falta registrada para ese CRN, día y sesión',
    SIN_CLASE_ESE_DIA: 'No tiene clase ese día',
    SEGUNDA_SESION_SIN_HORARIO: '2ª sesión sin horario ese día',
    IMSS_SOLO_DETALLE: 'Falta justificada: no va en Descuentos, solo en Detalle',
    MONTO_EDITADO: 'Monto editado a mano',
    MONTO_CERO: 'Monto en $0.00',
    SUPLENTE_SIN_CONTRATO: 'Suplencia sin contrato del suplente',
    SUPLENTE_INACTIVO: 'El suplente está inactivo',
    SUPLENTE_NO_RECONTRATABLE: 'El suplente es "No recontratable"',
    NO_RECONTRATABLE: 'No recontratable',
    PEP_MAYOR_A_24: 'Elemento PEP de más de 24 caracteres',
    ORDEN_INTERNA_MAYOR_A_12: 'Orden interna de más de 12 caracteres',
    CECO_INVALIDO: 'CeCo inválido (deben ser 10 dígitos)',
    IMPORTE_CERO: 'Importe en $0.00'
  };
  function aviso(codigo) { return AVISOS[codigo] || codigo; }

  /** Tarjeta de resumen como las del Panel. valorHtml ya debe venir escapado. */
  function stat(etiqueta, valorHtml, { sub = '', icono = '', tono = 'tone-primary' } = {}) {
    return `
      <div class="card stat">
        <div>
          <p class="stat-label">${UI.escape(etiqueta)}</p>
          <p class="stat-value">${valorHtml}</p>
          ${sub ? `<small>${sub}</small>` : ''}
        </div>
        ${icono ? `<span class="stat-icon ${tono}">${UI.icon(icono)}</span>` : ''}
      </div>`;
  }

  const JUSTIFICACION = { ninguna: 'Ninguna (permiso personal)', incapacidad_imss: 'Incapacidad IMSS', cita_imss: 'Cita IMSS', viaje_escolar: 'Viaje escolar' };
  /** Razones de una falta Justificada (la No justificada siempre es 'ninguna'). */
  const JUSTIFICADAS = { incapacidad_imss: JUSTIFICACION.incapacidad_imss, cita_imss: JUSTIFICACION.cita_imss, viaje_escolar: JUSTIFICACION.viaje_escolar };
  /** Solo las justificaciones del IMSS piden folio. */
  const esImss = (justificacion) => justificacion === 'incapacidad_imss' || justificacion === 'cita_imss';

  return {
    DIAS_LARGOS, DIAS_CORTOS, JUSTIFICACION, JUSTIFICADAS, esImss,
    hoyIso, diaDeFecha, fechaLarga,
    etiquetaQuincena, chipEstado, quincenas, selectorQuincena,
    buscadorDocente, catalogo, selectHtml, aviso, stat
  };
})();
