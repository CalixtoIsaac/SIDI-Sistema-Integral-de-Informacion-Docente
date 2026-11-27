/**
 * Faltas y descuentos (05 §5).
 *
 *  Vista       Pendientes de reportar (de cualquier fecha) arriba y, abajo, las ya reportadas en la quincena
 *              elegida. Totales: descontado, pagado a suplentes y diferencia. Asignar/cambiar/quitar quién
 *              cubrió, editar y borrar (423 si la quincena está cerrada).
 *  Modal       Faltas.registrar() → "Registrar falta"
 *    HU-09     CRN que el docente tiene ese día (según su horario), varios días, monto editable (✎),
 *              justificación IMSS (+ folio) → descuento 0, contrato del CRN si falta, 2ª sesión con
 *              confirmación y descuento manual.
 *    HU-22     Grupos a suplir por CRN, día y sesión con los docentes disponibles (sin empalme).
 *    HU-10     ¿Quién cubre? (opcional) + alta rápida + contrato del suplente (se propone el primero).
 *
 *  Rutas: GET /faltas · POST /faltas/preview · POST /faltas/disponibles · POST /faltas · PUT/DELETE /faltas/:id
 *         PUT/DELETE /faltas/:id/suplencia · GET /docentes/:id · GET /docentes/:id/contratos
 */
const Faltas = (() => {
  let el = null;
  let selector = null;
  let datos = { pendientes: [], reportadas: [] };

  // ================================================================== utilidades

  const clave = (...partes) => partes.join('|');

  function horasDe(a, fecha) {
    const dia = Comun.diaDeFecha(fecha);
    return (a.horarios || []).filter((h) => h.dia === dia).sort((x, y) => x.inicio.localeCompare(y.inicio));
  }

  function etiquetaAsignatura(a) {
    return a.crn ? `CRN ${a.crn}` : (a.nombreActividad || a.materia || 'Actividad');
  }

  /** Lo que cobra el suplente: lo descontado; si no hubo descuento (justificada), la tarifa del día. */
  function pagoSuplente(fila) {
    if (!fila) return 0;
    return fila.montoDescuento > 0 ? fila.montoDescuento : (fila.tarifaAplicada ?? 0);
  }

  async function catalogosFalta() {
    // Motivo (No justificada / Justificada) y horas (siempre 8 h = 1 día) ya no salen de catálogo
    return { cuentas: await Comun.catalogo('cuenta_cargo') };
  }

  // ================================================================== selector de suplente (HU-10, HU-22)

  /**
   * Lista de docentes disponibles para una sesión + "Ver todos" + alta rápida + contrato del suplente.
   *   grupo: elemento de gruposASuplir (con verTodos: true, así trae también a quienes tienen empalme)
   *   inicial: { docenteId, nombre, numContrato, contratos }
   * onChange(elegido | null)
   */
  function selectorSuplente(cont, { grupo, inicial = null, onChange }) {
    // El suplente actual aparece "con empalme" por su propia suplencia de esta sesión: no cuenta.
    if (grupo && inicial) {
      grupo = { ...grupo, disponibles: grupo.disponibles.map((d) => {
        if (d.docenteId !== inicial.docenteId || !d.empalme) return d;
        const otros = (d.empalmes || []).filter((x) => !(x.motivo === 'suplencia' && x.crn === grupo.crn && x.inicio === grupo.inicio));
        return { ...d, empalme: otros.length > 0, empalmes: otros };
      }) };
    }
    let verTodos = Boolean(inicial && grupo && grupo.disponibles.some((d) => d.docenteId === inicial.docenteId && d.empalme));
    let elegido = inicial ? { ...inicial } : null;
    let extra = null; // suplente elegido que no está en la lista (alta rápida o buscado)
    const listaId = `contratos-suplente-${Math.random().toString(36).slice(2, 9)}`;
    const lista = grupo ? grupo.disponibles : [];
    if (elegido && !lista.some((d) => d.docenteId === elegido.docenteId)) extra = { docenteId: elegido.docenteId, nombre: elegido.nombre };

    function etiqueta(d) {
      return [
        `${d.mismaMateria ? '★ ' : ''}${d.nombre}`,
        d.mismaMateria ? 'misma materia' : '',
        d.daClaseEseDia ? 'da clase ese día' : '',
        `${d.suplenciasPeriodo} supl.`,
        d.recontratable === 0 ? '⚠ No recontratable' : '',
        d.empalme && d.empalmes ? `empalme: ${d.empalmes.map((x) => `${x.crn || ''} ${x.inicio}–${x.fin}`).join(', ')}` : ''
      ].filter(Boolean).join(' · ');
    }

    function pintar() {
      const libres = lista.filter((d) => !d.empalme);
      const conEmpalme = lista.filter((d) => d.empalme);
      const sel = elegido ? String(elegido.docenteId) : '';
      const opcion = (d) => `<option value="${d.docenteId}"${String(d.docenteId) === sel ? ' selected' : ''}>${UI.escape(etiqueta(d))}</option>`;
      const contratos = elegido ? (elegido.contratos || []) : [];
      cont.innerHTML = `
        <div class="suplente-picker">
          <div class="select-wrap"><select class="input select" data-suplente aria-label="¿Quién cubre?">
            <option value="">— Elegir (opcional) —</option>
            ${extra ? `<option value="${extra.docenteId}"${String(extra.docenteId) === sel ? ' selected' : ''}>${UI.escape(extra.nombre)}</option>` : ''}
            ${grupo ? `<optgroup label="Disponibles (${libres.length})">${libres.map(opcion).join('')}</optgroup>` : ''}
            ${verTodos && conEmpalme.length ? `<optgroup label="Con empalme (${conEmpalme.length})">${conEmpalme.map(opcion).join('')}</optgroup>` : ''}
            <option value="__alta">+ Alta rápida (suplente nuevo)…</option>
          </select></div>
          ${elegido ? `
            <div class="suplente-contrato" title="Contrato del suplente">
              <input class="input" data-contrato inputmode="numeric" maxlength="15" autocomplete="off"
                     list="${listaId}" placeholder="Nº de contrato" aria-label="Contrato del suplente"
                     value="${UI.escape(elegido.numContrato || '')}">
              <datalist id="${listaId}">${contratos.map((c) => `<option value="${UI.escape(c.contrato)}">${c.crn ? `CRN ${UI.escape(c.crn)}` : 'Usado antes'}</option>`).join('')}</datalist>
            </div>` : ''}
          ${grupo && conEmpalme.length ? `<label class="check small"><input type="checkbox" data-ver-todos${verTodos ? ' checked' : ''}>Ver todos</label>` : ''}
        </div>
        ${elegido ? `<p class="small muted" data-contrato-hint>${contratos.length
          ? 'Contrato del suplente: se propone el de sus grupos; puedes escribir otro.'
          : 'Escribe el contrato del suplente (no viene en los archivos). Si lo dejas vacío, aparece como aviso en Reportes.'}</p>` : ''}
        <p class="small aviso-inline" data-contrato-error hidden>${UI.icon('warning')}El contrato solo lleva números.</p>
        ${elegido && elegido.avisoNoRecontratable ? `<p class="small aviso-inline">${UI.icon('warning')}Este docente es "No recontratable".</p>` : ''}`;
    }

    async function elegir(docenteId, nombre, extraInfo = {}) {
      let contratos = [];
      try { ({ contratos } = await UI.api(`/docentes/${docenteId}/contratos`)); } catch { /* sin contratos */ }
      elegido = { docenteId, nombre, contratos, numContrato: contratos[0] ? contratos[0].contrato : null, ...extraInfo };
      pintar();
      if (onChange) onChange(elegido);
    }

    /** Contrato escrito a mano (o elegido de la lista): solo dígitos. No se repinta para no perder el foco. */
    function tomarContrato(input) {
      const v = input.value.trim();
      const valido = v === '' || /^\d+$/.test(v);
      input.classList.toggle('input-invalida', !valido);
      input.setAttribute('aria-invalid', String(!valido));
      const err = cont.querySelector('[data-contrato-error]');
      if (err) err.hidden = valido;
      elegido.numContrato = valido && v ? v : null;
      elegido.contratoInvalido = !valido;
      if (onChange) onChange(elegido);
    }

    cont.addEventListener('input', (e) => {
      if (e.target.matches('[data-contrato]')) tomarContrato(e.target);
    });

    cont.addEventListener('change', async (e) => {
      if (e.target.matches('[data-ver-todos]')) { verTodos = e.target.checked; pintar(); return; }
      if (e.target.matches('[data-contrato]')) { tomarContrato(e.target); return; }
      if (!e.target.matches('[data-suplente]')) return;
      const v = e.target.value;
      if (v === '') { elegido = null; pintar(); if (onChange) onChange(null); return; }
      if (v === '__alta') {
        const nuevo = await DocenteForm.altaRapida();
        if (nuevo) { extra = { docenteId: nuevo.id, nombre: nuevo.nombre }; await elegir(nuevo.id, nuevo.nombre); }
        else pintar();
        return;
      }
      const id = Number(v);
      const d = lista.find((x) => x.docenteId === id) || (extra && extra.docenteId === id ? extra : null);
      if (!d) return;
      if (d.empalme) {
        const ok = await UI.confirm({
          title: `${d.nombre} tiene clase a esa hora`,
          message: 'Se empalma con su horario. ¿Elegirlo de todos modos?',
          detailHtml: d.empalmes ? `<ul class="small">${d.empalmes.map((x) => `<li>${UI.escape(x.crn || '')} ${UI.escape(x.materia || '')} · ${UI.escape(x.inicio)}–${UI.escape(x.fin)}${x.motivo === 'suplencia' ? ' (ya cubre otra suplencia)' : ''}</li>`).join('')}</ul>` : '',
          confirmText: 'Elegir de todos modos'
        });
        if (!ok) { pintar(); return; }
      }
      if (d.recontratable === 0) {
        const ok = await UI.confirm({
          title: `${d.nombre} es "No recontratable"`,
          message: '¿Quieres que cubra esta falta de todos modos?',
          confirmText: 'Sí, elegirlo'
        });
        if (!ok) { pintar(); return; }
      }
      await elegir(d.docenteId, d.nombre, d.recontratable === 0 ? { avisoNoRecontratable: true } : {});
    });

    pintar();
    return { valor: () => elegido };
  }

  // ================================================================== modal "Registrar falta"

  async function registrar({ docenteId = null } = {}) {
    let cat;
    try { cat = await catalogosFalta(); } catch (err) { UI.toast(err.message, 'error'); return false; }

    const st = {
      docente: null,
      modo: 'tarifa',
      fechas: [Comun.hoyIso()],
      sel: new Map(),          // fecha → Set(asignaturaId) marcados
      segundas: new Set(),     // 'asignaturaId|fecha'
      montos: {},              // asignaturaId → monto editado
      contratos: {},           // asignaturaId → contrato capturado
      suplencias: new Map(),   // 'asignaturaId|fecha|sesion' → { docenteId, nombre, numContrato, contratos }
      grupos: [],              // gruposASuplir (con verTodos)
      firmaSuplir: '',
      preview: null
    };
    let guardado = false;
    let resolver;
    const terminado = new Promise((r) => { resolver = r; });

    const opcionesCuenta = [['', 'Automática (según la materia)'], ...cat.cuentas.map((c) => [c.valor, `${c.valor}${c.descripcion ? ` · ${c.descripcion}` : ''}`])];

    const dialog = UI.openDialog({
      title: 'Registrar falta',
      description: 'Elige al docente, los días y los CRN a los que faltó. El descuento se calcula solo.',
      size: 'xl',
      as: 'form',
      bodyHtml: `
        <div class="rf">
          <section class="rf-sec">
            <p class="section-title">1. Docente</p>
            <div class="rf-docente">
              <div data-buscador class="grow"></div>
              <div class="seg" role="radiogroup" aria-label="Tipo de registro">
                <label><input type="radio" name="modo" value="tarifa" checked>Por día y CRN</label>
                <label><input type="radio" name="modo" value="manual">Descuento manual</label>
              </div>
            </div>
            <div data-docente-info></div>
          </section>

          <div data-tarifa>
            <section class="rf-sec">
              <p class="section-title">2. Día(s) de la falta</p>
              <div class="row">
                <input class="input rf-fecha" type="date" data-nueva-fecha aria-label="Fecha de la falta">
                <button type="button" class="btn btn-outline btn-sm" data-agregar-fecha>${UI.icon('plus')}Agregar día</button>
                <div class="chips rf-fechas" data-fechas></div>
              </div>
            </section>
            <section class="rf-sec">
              <p class="section-title">3. CRN a los que faltó</p>
              <div data-crn><p class="muted small">Primero elige al docente.</p></div>
            </section>
          </div>

          <div data-manual hidden>
            <section class="rf-sec">
              <p class="section-title">2. Descuento manual <span class="muted small">(casos especiales, p. ej. varios días de un coach)</span></p>
              <div class="form-grid">
                <div class="field"><label>Periodo (texto) <span class="req">*</span></label>
                  <input class="input" name="fechaTexto" maxlength="60" placeholder="03/08/2026 al 16/08/2026"></div>
                <div class="field"><label>Número de días <span class="req">*</span></label>
                  <input class="input" name="dias" type="number" min="1" max="366" step="1" value="1"></div>
                <div class="field"><label>Horas (texto) <span class="req">*</span></label>
                  <input class="input" name="horasManual" maxlength="60" placeholder="6 horas= 14 días"></div>
                <div class="field"><label>Monto a descontar <span class="req">*</span></label>
                  <div class="input-group"><span class="input-addon">$</span><input class="input" name="monto" type="number" min="0" step="0.01"></div></div>
                <div class="field"><label>CRN / actividad (opcional)</label><div data-manual-asig>${Comun.selectHtml('asignaturaId', [['', '— Ninguno —']])}</div></div>
                <div class="field"><label>Comentario (opcional)</label>
                  <input class="input" name="comentario" maxlength="300" placeholder="Se arma solo si lo dejas vacío"></div>
              </div>
            </section>
          </div>

          <section class="rf-sec">
            <p class="section-title" data-num-detalle>4. Motivo y justificación</p>
            <div class="form-grid">
              <div class="field full"><label>Motivo <span class="req">*</span></label>
                <div class="seg" role="radiogroup" aria-label="Motivo">
                  <label><input type="radio" name="motivoTipo" value="no" checked>No justificada</label>
                  <label><input type="radio" name="motivoTipo" value="si">Justificada</label>
                </div>
                <p class="hint" data-hint-nojust>Se registra como <strong>${UI.escape(Comun.JUSTIFICACION.ninguna)}</strong> y se descuenta. Horas: <strong>8 horas = 1 día completo</strong>.</p>
              </div>
              <div class="field full" data-campo-justificacion hidden><label>Justificación <span class="req">*</span></label>
                <div class="radio-list">
                  ${Object.entries(Comun.JUSTIFICADAS).map(([v, t], i) => `<label><input type="radio" name="justificacion" value="${v}"${i === 0 ? ' checked' : ''}>${UI.escape(t)}</label>`).join('')}
                  <input class="input rf-folio" name="folioImss" maxlength="30" placeholder="Folio IMSS *" aria-label="Folio IMSS">
                </div>
                <p class="hint" data-hint-imss>Justificada: no se descuenta, pero al suplente sí se le paga la tarifa del día. Horas: 8 horas = 1 día completo.</p>
              </div>
              <div class="field"><label>Cuenta de cargo</label>${Comun.selectHtml('cuentaCargo', opcionesCuenta, '')}</div>
              <div class="field"><label>Ticket (opcional)</label><input class="input" name="ticket" maxlength="50"></div>
              <div class="field full"><label>Observaciones (van al texto de la suplencia)</label>
                <input class="input" name="observaciones" maxlength="500" placeholder="Ej. Viaja a CDMX por examen"></div>
            </div>
          </section>

          <section class="rf-sec" data-sec-suplir>
            <p class="section-title">5. Grupos a suplir y docentes disponibles</p>
            <div data-suplir><p class="muted small">Aparecen al marcar los CRN.</p></div>
          </section>

          <section class="rf-sec">
            <p class="section-title" data-num-preview>6. Vista previa</p>
            <div data-preview><p class="muted small">Aún no hay faltas por registrar.</p></div>
          </section>

          <div class="alert alert-error" data-error role="alert" hidden></div>
        </div>`,
      footerHtml: `
        <p class="rf-resumen grow" data-resumen></p>
        <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" data-guardar disabled>${UI.icon('check')}Guardar</button>`,
      onClose: () => resolver(guardado)
    });

    const f = dialog.el;
    const $ = (s) => f.querySelector(s);
    const errorBox = $('[data-error]');
    const btnGuardar = $('[data-guardar]');
    $('[data-action="cancel"]').addEventListener('click', dialog.close);
    $('[data-nueva-fecha]').value = Comun.hoyIso();

    const buscador = Comun.buscadorDocente($('[data-buscador]'), {
      placeholder: 'Docente que faltó: nombre, nómina, CURP o CRN',
      onElegir: (d) => cargarDocente(d.id)
    });

    // ---------------------------------------------------------- docente
    async function cargarDocente(id) {
      $('[data-docente-info]').innerHTML = '<p class="muted small"><span class="spinner"></span> Cargando horario…</p>';
      try {
        const { docente } = await UI.api(`/docentes/${id}`);
        st.docente = docente;
        st.sel.clear(); st.segundas.clear(); st.montos = {}; st.contratos = {}; st.suplencias.clear(); st.firmaSuplir = '';
        buscador.poner(docente);
        st.fechas.forEach(proponer);
        pintarDocente();
        pintarManualAsig();
        pintarTodo();
      } catch (err) {
        $('[data-docente-info]').innerHTML = `<p class="alert alert-error">${UI.escape(err.message)}</p>`;
      }
    }

    function pintarDocente() {
      const d = st.docente;
      $('[data-docente-info]').innerHTML = d ? `
        <div class="rf-docente-info">
          <span class="dot ${d.activo ? 'on' : ''}" aria-hidden="true"></span>
          <strong>${UI.escape(d.nombre)}</strong> <span class="muted">${UI.escape(d.nomina)}</span>
          <span class="muted">· ${d.asignaturas.length} grupo(s) o actividad(es) en el semestre</span>
          <button type="button" class="link-btn small" data-agregar-grupo>+ Agregar grupo / actividad</button>
        </div>` : '';
    }

    function pintarManualAsig() {
      const d = st.docente;
      $('[data-manual-asig]').innerHTML = Comun.selectHtml('asignaturaId', [['', '— Ninguno —'],
        ...(d ? d.asignaturas.map((a) => [a.id, `${etiquetaAsignatura(a)} · ${a.materia || ''}`]) : [])]);
    }

    /** Marca los CRN que el docente tiene ese día de la semana (si aún no se tocó esa fecha). */
    function proponer(fecha) {
      if (!st.docente || st.sel.has(fecha)) return;
      st.sel.set(fecha, new Set(st.docente.asignaturas.filter((a) => horasDe(a, fecha).length).map((a) => a.id)));
    }

    // ---------------------------------------------------------- fechas
    function pintarFechas() {
      $('[data-fechas]').innerHTML = st.fechas.map((x) => `
        <span class="chip">${UI.escape(Comun.fechaLarga(x))}
          <button type="button" data-quitar-fecha="${x}" aria-label="Quitar ${UI.escape(UI.fecha(x))}">${UI.icon('x')}</button></span>`).join('');
    }

    // ---------------------------------------------------------- CRN por día
    function filaCrn(a, fecha, marcado, delDia) {
      const horas = horasDe(a, fecha);
      const k = clave(a.id, fecha);
      const sinContrato = a.crn && !a.numContrato;
      const sinTarifa = a.tarifaDiaria === null || a.tarifaDiaria === undefined;
      return `
        <li class="rf-crn${marcado ? ' marcado' : ''}">
          <label class="check">
            <input type="checkbox" data-crn="${a.id}" data-fecha="${fecha}"${marcado ? ' checked' : ''}>
            <span><strong>${UI.escape(etiquetaAsignatura(a))}</strong> · ${UI.escape(a.materia || '')}${a.numeroGrupo ? ` · ${UI.escape(a.numeroGrupo)}` : ''}
              <span class="muted">· ${horas.length ? UI.escape(horas.map((h) => `${h.inicio}–${h.fin}`).join(' y ')) : 'sin clase ese día'}
              · ${UI.escape(a.tipoClase || 'Sin tipo de clase')} · ${UI.dinero(a.tarifaDiaria)}</span></span>
          </label>
          <span class="rf-crn-extra">
            ${!delDia ? '<span class="badge badge-warning badge-plain">No tiene clase ese día</span>' : ''}
            ${sinTarifa ? '<span class="badge badge-warning badge-plain">Sin tarifa: captura el monto abajo</span>' : ''}
            ${marcado && sinContrato ? `<input class="input rf-contrato" data-contrato-crn="${a.id}" inputmode="numeric" maxlength="15"
                placeholder="Contrato del CRN *" value="${UI.escape(st.contratos[a.id] || '')}" aria-label="Contrato del CRN ${UI.escape(a.crn)}">` : ''}
            ${marcado && a.crn ? `<button type="button" class="btn btn-ghost btn-sm" data-segunda="${k}" aria-pressed="${st.segundas.has(k)}">
                ${st.segundas.has(k) ? `${UI.icon('check')}2ª sesión` : '+ 2ª sesión'}</button>` : ''}
          </span>
        </li>`;
    }

    function pintarCrn() {
      const box = $('[data-crn]');
      const d = st.docente;
      if (!d) { box.innerHTML = '<p class="muted small">Primero elige al docente.</p>'; return; }
      if (!st.fechas.length) { box.innerHTML = '<p class="muted small">Agrega al menos un día.</p>'; return; }
      if (!d.asignaturas.length) {
        box.innerHTML = `<p class="alert alert-warning">${UI.icon('warning')}No tiene grupos ni actividades en el semestre. Usa "+ Agregar grupo / actividad" o el descuento manual.</p>`;
        return;
      }
      box.innerHTML = st.fechas.map((fecha) => {
        const marcados = st.sel.get(fecha) || new Set();
        const delDia = d.asignaturas.filter((a) => horasDe(a, fecha).length);
        const otros = d.asignaturas.filter((a) => !horasDe(a, fecha).length);
        const otrosMarcados = otros.filter((a) => marcados.has(a.id));
        return `
          <div class="rf-dia">
            <p class="rf-dia-titulo">${UI.escape(Comun.fechaLarga(fecha))} <span class="muted">· ${marcados.size} marcado(s)</span></p>
            ${delDia.length
              ? `<ul class="rf-crn-lista">${delDia.map((a) => filaCrn(a, fecha, marcados.has(a.id), true)).join('')}</ul>`
              : '<p class="muted small">Ese día no tiene clases según su horario.</p>'}
            ${otrosMarcados.length ? `<ul class="rf-crn-lista">${otrosMarcados.map((a) => filaCrn(a, fecha, true, false)).join('')}</ul>` : ''}
            ${otros.length > otrosMarcados.length ? `
              <details class="mas"><summary>Marcar otro CRN (${otros.length - otrosMarcados.length})</summary>
                <ul class="rf-crn-lista">${otros.filter((a) => !marcados.has(a.id)).map((a) => filaCrn(a, fecha, false, false)).join('')}</ul>
              </details>` : ''}
          </div>`;
      }).join('');
    }

    // ---------------------------------------------------------- campos comunes
    /** 'ninguna' si es No justificada; si es Justificada, la razón elegida (IMSS o viaje escolar). */
    function justificacionActual() {
      if (f.querySelector('[name="motivoTipo"]:checked').value === 'no') return 'ninguna';
      return f.querySelector('[name="justificacion"]:checked').value;
    }

    function comunes() {
      const justificacion = justificacionActual();
      const c = {
        justificacion,
        observaciones: f.elements.observaciones.value.trim() || null,
        ticket: f.elements.ticket.value.trim() || null
      };
      if (f.elements.cuentaCargo.value) c.cuentaCargo = f.elements.cuentaCargo.value;
      if (Comun.esImss(justificacion)) c.folioImss = f.elements.folioImss.value.trim() || null;
      return c;
    }

    function pintarJustificacion() {
      const justificada = justificacionActual() !== 'ninguna';
      $('[data-campo-justificacion]').hidden = !justificada;
      $('[data-hint-nojust]').hidden = justificada;
      f.elements.folioImss.hidden = !Comun.esImss(justificacionActual());
    }

    // ---------------------------------------------------------- peticiones por grupo de días
    /**
     * La API aplica los mismos CRN a todas las fechas de una petición. Si cada día tiene CRN distintos,
     * se agrupan los días con la misma selección y se manda una petición por grupo.
     */
    function lotes() {
      const porFirma = new Map();
      for (const fecha of st.fechas) {
        const ids = [...(st.sel.get(fecha) || [])].sort((x, y) => x - y);
        if (!ids.length) continue;
        const segundas = ids.filter((id) => st.segundas.has(clave(id, fecha)));
        const firma = `${ids.join(',')}|${segundas.join(',')}`;
        if (!porFirma.has(firma)) porFirma.set(firma, { fechas: [], ids, segundas });
        porFirma.get(firma).fechas.push(fecha);
      }
      return [...porFirma.values()];
    }

    function cuerpoTarifa(lote, { conSuplencias = false } = {}) {
      const solo = (obj) => Object.fromEntries(Object.entries(obj).filter(([id, v]) => lote.ids.includes(Number(id)) && v !== '' && v !== null && v !== undefined));
      const body = {
        docenteId: st.docente.id,
        modo: 'tarifa',
        fechas: lote.fechas,
        asignaturaIds: lote.ids,
        // Siempre 8 horas = 1 día completo (retro de la cliente: ya no hay medio día)
        ...comunes(),
        montos: solo(st.montos),
        contratos: solo(st.contratos),
        segundasSesiones: lote.fechas.flatMap((fecha) => lote.segundas.map((id) => ({ asignaturaId: id, fecha })))
      };
      if (conSuplencias) {
        body.suplencias = [...st.suplencias].filter(([k]) => {
          const [id, fecha] = k.split('|');
          return lote.ids.includes(Number(id)) && lote.fechas.includes(fecha);
        }).filter(([, s]) => s).map(([k, s]) => {
          const [id, fecha, sesion] = k.split('|');
          return { asignaturaId: Number(id), fecha, sesion: Number(sesion), docenteSuplenteId: s.docenteId, numContrato: s.numContrato || null };
        });
      }
      return body;
    }

    function cuerpoManual() {
      const asig = f.elements.asignaturaId.value;
      return {
        docenteId: st.docente.id,
        modo: 'manual',
        fechaTexto: f.elements.fechaTexto.value.trim(),
        dias: f.elements.dias.value === '' ? null : Number(f.elements.dias.value),
        horasTexto: f.elements.horasManual.value.trim(),
        monto: f.elements.monto.value === '' ? null : Number(f.elements.monto.value),
        comentario: f.elements.comentario.value.trim() || null,
        asignaturaId: asig ? Number(asig) : null,
        ...comunes()
      };
    }

    // ---------------------------------------------------------- grupos a suplir (HU-22)
    async function actualizarSuplir() {
      const box = $('[data-suplir]');
      if (st.modo !== 'tarifa' || !st.docente) { box.innerHTML = '<p class="muted small">Aparecen al marcar los CRN.</p>'; st.grupos = []; return; }
      const ls = lotes();
      const firma = JSON.stringify([st.docente.id, ls]);
      if (firma === st.firmaSuplir) return;
      st.firmaSuplir = firma;
      if (!ls.length) { box.innerHTML = '<p class="muted small">Aparecen al marcar los CRN.</p>'; st.grupos = []; return; }
      box.innerHTML = '<p class="muted small"><span class="spinner"></span> Buscando docentes disponibles…</p>';
      try {
        const respuestas = await Promise.all(ls.map((l) => UI.api('/faltas/disponibles', {
          method: 'POST', body: { docenteId: st.docente.id, fechas: l.fechas, asignaturaIds: l.ids, verTodos: true }
        })));
        if (firma !== st.firmaSuplir) return;
        // Solo la 1ª sesión del día, salvo que se marque la 2ª sesión
        st.grupos = respuestas.flatMap((r) => r.gruposASuplir)
          .filter((g) => g.sesion === 1 || st.segundas.has(clave(g.asignaturaId, g.fecha)))
          .sort((x, y) => x.fecha.localeCompare(y.fecha) || x.inicio.localeCompare(y.inicio));
        // Quita suplentes elegidos para sesiones que ya no están
        const vigentes = new Set(st.grupos.map((g) => clave(g.asignaturaId, g.fecha, g.sesion)));
        for (const k of [...st.suplencias.keys()]) if (!vigentes.has(k)) st.suplencias.delete(k);
        pintarSuplir();
      } catch (err) {
        st.firmaSuplir = '';
        box.innerHTML = `<p class="alert alert-error">${UI.escape(err.message)}</p>`;
      }
    }

    function pintarSuplir() {
      const box = $('[data-suplir]');
      if (!st.grupos.length) {
        box.innerHTML = '<p class="muted small">Ninguno de los CRN marcados tiene clase en esos días: no hay grupos que suplir.</p>';
        return;
      }
      const porFecha = new Map();
      for (const g of st.grupos) {
        if (!porFecha.has(g.fecha)) porFecha.set(g.fecha, []);
        porFecha.get(g.fecha).push(g);
      }
      box.innerHTML = [...porFecha].map(([fecha, gs]) => `
        <p class="rf-dia-titulo">Grupos a suplir · ${UI.escape(Comun.fechaLarga(fecha))}</p>
        <div class="rf-suplir">${gs.map((g) => `
          <div class="rf-suplir-fila">
            <div class="rf-suplir-grupo">
              <strong>${g.crn ? `CRN ${UI.escape(g.crn)}` : 'Actividad'} · ${UI.escape(g.materia || '')}${g.grupo ? ` · ${UI.escape(g.grupo)}` : ''}</strong>
              <span class="muted small">${UI.escape(g.inicio)}–${UI.escape(g.fin)}${g.sesion === 2 ? ' · 2ª sesión' : ''} · ${g.totalDisponibles} disponible(s)${g.conEmpalme ? ` · ${g.conEmpalme} con empalme` : ''}</span>
            </div>
            <div class="rf-suplir-quien" data-sup-key="${clave(g.asignaturaId, g.fecha, g.sesion)}"></div>
          </div>`).join('')}</div>`).join('') +
        '<p class="small muted mt">Orden: ★ misma materia → ya da clases ese día → menos suplencias en el semestre. ¿Quién cubre? es opcional: se puede asignar después desde la lista.</p>';
      box.querySelectorAll('[data-sup-key]').forEach((c) => {
        const k = c.dataset.supKey;
        const g = st.grupos.find((x) => clave(x.asignaturaId, x.fecha, x.sesion) === k);
        selectorSuplente(c, {
          grupo: g,
          inicial: st.suplencias.get(k) || null,
          onChange: (s) => { if (s) st.suplencias.set(k, s); else st.suplencias.delete(k); pintarResumen(); }
        });
      });
    }

    // ---------------------------------------------------------- vista previa
    let pedidoPreview = 0;
    async function actualizarPreview() {
      const box = $('[data-preview]');
      errorBox.hidden = true;
      if (!st.docente) { st.preview = null; box.innerHTML = '<p class="muted small">Aún no hay faltas por registrar.</p>'; pintarResumen(); return; }
      const n = ++pedidoPreview;
      try {
        let filas = [];
        let avisosLote = [];
        if (st.modo === 'manual') {
          const b = cuerpoManual();
          if (!b.fechaTexto || !b.dias || b.monto === null || !b.horasTexto) {
            st.preview = null;
            box.innerHTML = '<p class="muted small">Llena periodo, días, horas y monto para ver la vista previa.</p>';
            pintarResumen();
            return;
          }
          const r = await UI.api('/faltas/preview', { method: 'POST', body: b });
          filas = r.filas;
        } else {
          const ls = lotes();
          if (!ls.length) { st.preview = null; box.innerHTML = '<p class="muted small">Marca al menos un CRN.</p>'; pintarResumen(); return; }
          const rs = await Promise.all(ls.map((l) => UI.api('/faltas/preview', { method: 'POST', body: cuerpoTarifa(l) })));
          filas = rs.flatMap((r) => r.filas);
          avisosLote = rs.flatMap((r) => r.repetidas || []);
        }
        if (n !== pedidoPreview) return;
        st.preview = { filas, repetidas: avisosLote };
        pintarPreview();
      } catch (err) {
        if (n !== pedidoPreview) return;
        st.preview = null;
        box.innerHTML = '';
        UI.pintarError(errorBox, err);
        pintarResumen();
      }
    }

    function pintarPreview() {
      const box = $('[data-preview]');
      const filas = st.preview.filas.slice().sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)) || String(x.crn).localeCompare(String(y.crn)) || x.sesion - y.sesion);
      const manual = st.modo === 'manual';
      box.innerHTML = `
        <div class="table-wrap"><table class="table table-compact rf-preview">
          <thead><tr><th>Fecha</th><th>CRN / actividad</th><th>Materia</th>${manual ? '<th class="num">Días</th>' : '<th class="num">Tarifa</th>'}
            <th class="num">Descuento</th><th>Cuenta</th><th>Comentario</th><th>Avisos</th></tr></thead>
          <tbody>${filas.map((x) => {
            const editable = !manual && justificacionActual() === 'ninguna';
            const avisos = x.avisos.filter((a) => a !== 'SIN_CONTRATO' || !st.contratos[x.asignaturaId]);
            return `<tr>
              <td class="nowrap">${x.fecha ? UI.escape(UI.fecha(x.fecha)) : UI.escape(x.fechaTexto || '')}${x.sesion === 2 ? ' <span class="badge badge-info badge-plain">2ª sesión</span>' : ''}</td>
              <td class="nowrap">${UI.escape(x.crn || x.materia || '—')}</td>
              <td>${UI.escape(x.materia || '—')}${x.numeroGrupo ? ` · ${UI.escape(x.numeroGrupo)}` : ''}</td>
              ${manual ? `<td class="num">${x.dias}</td>` : `<td class="num">${UI.dinero(x.tarifaAplicada)}</td>`}
              <td class="num nowrap">${editable
                ? `<span class="rf-monto"><input class="input" type="number" min="0" step="0.01" data-monto="${x.asignaturaId}" value="${x.montoDescuento}" aria-label="Descuento de ${UI.escape(x.crn || '')}">
                   ${x.montoEditado ? `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-restaurar="${x.asignaturaId}" title="Volver a la tarifa" aria-label="Volver a la tarifa">✎</button>` : ''}</span>`
                : `${UI.dinero(x.montoDescuento)}${x.montoEditado && !manual ? ' ✎' : ''}`}</td>
              <td class="nowrap">${UI.escape(x.cuentaCargo || '—')}</td>
              <td class="small rf-comentario">${UI.escape(x.comentario || '')}</td>
              <td>${avisos.map((a) => `<span class="badge ${a === 'FALTA_REPETIDA' ? 'badge-danger' : 'badge-warning'} badge-plain">${UI.escape(Comun.aviso(a))}</span>`).join(' ') || '<span class="cell-muted">—</span>'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table></div>`;
      pintarResumen();
    }

    function pintarResumen() {
      const r = $('[data-resumen]');
      const p = st.preview;
      if (!p || !p.filas.length) { r.textContent = ''; btnGuardar.disabled = true; return; }
      const descuento = p.filas.reduce((s, x) => s + x.montoDescuento, 0);
      const porKey = new Map(p.filas.map((x) => [clave(x.asignaturaId, x.fecha, x.sesion), x]));
      let pagado = 0;
      const suplentes = new Set();
      for (const [k, s] of st.suplencias) {
        if (!s || !porKey.has(k)) continue;
        pagado += pagoSuplente(porKey.get(k));
        suplentes.add(s.docenteId);
      }
      const repetidas = p.filas.some((x) => x.avisos.includes('FALTA_REPETIDA'));
      r.innerHTML = `Se registrarán <strong>${p.filas.length}</strong> falta(s) · Descuento <strong>${UI.dinero(descuento)}</strong>`
        + (suplentes.size ? ` · Se pagarán <strong>${UI.dinero(pagado)}</strong> a ${suplentes.size} suplente(s)` : '')
        + (repetidas ? ` · <span class="danger-text">${UI.icon('warning')}Hay faltas repetidas</span>` : '');
      btnGuardar.disabled = repetidas;
    }

    // ---------------------------------------------------------- pintar todo
    const refrescar = UI.debounce(() => { actualizarPreview(); actualizarSuplir(); }, 300);
    function pintarTodo() {
      pintarFechas();
      pintarCrn();
      refrescar();
    }

    // ---------------------------------------------------------- eventos
    f.addEventListener('click', async (e) => {
      if (e.target.closest('[data-agregar-fecha]')) {
        const v = $('[data-nueva-fecha]').value;
        if (!v) return;
        if (!st.fechas.includes(v)) { st.fechas.push(v); st.fechas.sort(); proponer(v); }
        pintarTodo();
        return;
      }
      const qf = e.target.closest('[data-quitar-fecha]');
      if (qf) {
        const x = qf.dataset.quitarFecha;
        st.fechas = st.fechas.filter((y) => y !== x);
        st.sel.delete(x);
        pintarTodo();
        return;
      }
      const sg = e.target.closest('[data-segunda]');
      if (sg) {
        const k = sg.dataset.segunda;
        if (st.segundas.has(k)) st.segundas.delete(k);
        else {
          const ok = await UI.confirm({
            title: '¿Registrar la 2ª sesión?',
            message: 'Es un caso especial: se registran dos faltas del mismo CRN el mismo día (p. ej. clase doble).',
            confirmText: 'Sí, agregar 2ª sesión'
          });
          if (!ok) return;
          st.segundas.add(k);
        }
        pintarTodo();
        return;
      }
      const rs = e.target.closest('[data-restaurar]');
      if (rs) { delete st.montos[rs.dataset.restaurar]; refrescar(); return; }
      if (e.target.closest('[data-agregar-grupo]') && st.docente) {
        const ok = await DocenteForm.editar(st.docente.id, { paso: 'asignaturas' });
        if (ok) {
          const id = st.docente.id;
          const sel = new Map(st.sel);
          await cargarDocente(id);
          for (const [fecha, s] of sel) st.sel.set(fecha, s);
          pintarTodo();
        }
      }
    });

    f.addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'modo') {
        st.modo = t.value;
        $('[data-tarifa]').hidden = st.modo !== 'tarifa';
        $('[data-manual]').hidden = st.modo !== 'manual';
        $('[data-sec-suplir]').hidden = st.modo !== 'tarifa';
        $('[data-num-detalle]').textContent = st.modo === 'tarifa' ? '4. Motivo y justificación' : '3. Motivo y justificación';
        $('[data-num-preview]').textContent = st.modo === 'tarifa' ? '6. Vista previa' : '4. Vista previa';
        st.firmaSuplir = '';
        refrescar();
        return;
      }
      if (t.matches('[data-crn]')) {
        const fecha = t.dataset.fecha;
        const id = Number(t.dataset.crn);
        if (!st.sel.has(fecha)) st.sel.set(fecha, new Set());
        if (t.checked) st.sel.get(fecha).add(id);
        else { st.sel.get(fecha).delete(id); st.segundas.delete(clave(id, fecha)); }
        pintarTodo();
        return;
      }
      if (t.matches('[data-monto]')) {
        st.montos[t.dataset.monto] = t.value === '' ? undefined : Number(t.value);
        refrescar();
        return;
      }
      if (t.matches('[data-contrato-crn]')) {
        st.contratos[t.dataset.contratoCrn] = t.value.trim();
        refrescar();
        return;
      }
      if (t.name === 'justificacion' || t.name === 'motivoTipo') pintarJustificacion();
      if (t.closest('[data-suplir]')) return; // lo maneja el selector de suplente
      if (t.closest('.form-grid') || t.name === 'justificacion' || t.name === 'motivoTipo') refrescar();
    });
    f.addEventListener('input', (e) => {
      if (e.target.closest('[data-manual]') || ['folioImss', 'observaciones', 'ticket'].includes(e.target.name)) refrescar();
    });

    // ---------------------------------------------------------- guardar
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!st.docente) { UI.toast('Elige al docente que faltó.', 'warning'); buscador.enfocar(); return; }
      if ([...st.suplencias.values()].some((s) => s && s.contratoInvalido)) { UI.toast('El contrato del suplente solo lleva números.', 'warning'); return; }
      errorBox.hidden = true;
      UI.setBusy(btnGuardar, true);
      let creadas = 0;
      let pagos = 0;
      try {
        if (st.modo === 'manual') {
          const r = await UI.api('/faltas', { method: 'POST', body: cuerpoManual() });
          creadas += r.faltas.length;
        } else {
          const ls = lotes();
          const haySegundas = ls.some((l) => l.segundas.length);
          for (const l of ls) {
            const body = cuerpoTarifa(l, { conSuplencias: true });
            if (haySegundas) body.confirmarSegundaSesion = true;
            const r = await UI.api('/faltas', { method: 'POST', body });
            creadas += r.faltas.length;
            pagos += r.faltas.filter((x) => x.suplencia).length;
            // Lo ya guardado sale del formulario por si el siguiente lote falla
            for (const fecha of l.fechas) { st.fechas = st.fechas.filter((y) => y !== fecha); st.sel.delete(fecha); }
            for (const a of r.avisos || []) if (a.aviso === 'SUPLENTE_SIN_CONTRATO') UI.toast('Una suplencia quedó sin contrato del suplente (aviso en Reportes).', 'warning');
          }
        }
        guardado = true;
        UI.toast(`Se registraron ${creadas} falta(s)${pagos ? ` y ${pagos} suplencia(s)` : ''}.`, 'success');
        dialog.close();
      } catch (err) {
        UI.setBusy(btnGuardar, false);
        if (creadas) {
          guardado = true;
          UI.toast(`Se guardaron ${creadas} falta(s); revisa el resto.`, 'warning');
          st.firmaSuplir = '';
          pintarTodo();
        }
        UI.pintarError(errorBox, err);
        const extra = (err.details || []).filter((d) => d && (d.crn || d.fecha)).map((d) => `${d.crn ? `CRN ${d.crn}` : 'Actividad'}${d.fecha ? ` · ${UI.fecha(d.fecha)}` : ''}${d.sesion === 2 ? ' · 2ª sesión' : ''}`);
        if (extra.length) errorBox.insertAdjacentHTML('beforeend', `<ul>${extra.map((x) => `<li>${UI.escape(x)}</li>`).join('')}</ul>`);
        errorBox.scrollIntoView({ block: 'nearest' });
      }
    });

    pintarFechas();
    if (docenteId) cargarDocente(docenteId); else buscador.enfocar();

    return terminado;
  }

  // ================================================================== asignar / cambiar suplente desde la lista

  async function asignarSuplente(falta) {
    const conHorario = falta.fecha && falta.asignatura;
    let grupo = null;
    if (conHorario) {
      try {
        const r = await UI.api('/faltas/disponibles', {
          method: 'POST', body: { docenteId: falta.docente.id, fechas: [falta.fecha], asignaturaIds: [falta.asignatura.id], verTodos: true }
        });
        grupo = r.gruposASuplir.find((g) => g.sesion === falta.sesion) || r.gruposASuplir[0] || null;
      } catch (err) { UI.toast(err.message, 'error'); return false; }
    }
    return new Promise((resolve) => {
      let elegido = null;
      let hecho = false;
      const dialog = UI.openDialog({
        title: falta.suplencia ? 'Cambiar quién cubrió' : '¿Quién cubrió la falta?',
        description: `${falta.docente.nombre} · ${falta.fecha ? Comun.fechaLarga(falta.fecha) : falta.fechaTexto || ''} · ${falta.asignatura ? `${falta.asignatura.crn ? `CRN ${falta.asignatura.crn}` : ''} ${falta.asignatura.materia || ''}` : 'Descuento manual'}`,
        size: 'lg',
        as: 'form',
        bodyHtml: `
          <div class="stack">
            ${grupo ? `<p class="small muted">${UI.escape(grupo.inicio)}–${UI.escape(grupo.fin)} · ${grupo.totalDisponibles} docente(s) sin empalme. Orden: ★ misma materia → da clase ese día → menos suplencias.</p>`
              : `<p class="small muted">${conHorario ? 'Ese CRN no tiene horario ese día: busca al suplente por nombre.' : 'Busca al suplente por nombre o nómina.'}</p><div data-buscar></div>`}
            <div data-picker></div>
            <div class="field"><label>Monto a pagar (opcional)</label>
              <div class="input-group"><span class="input-addon">$</span><input class="input" name="monto" type="number" min="0" step="0.01" placeholder="Igual a lo descontado (o la tarifa si es justificada)"></div></div>
            <div class="alert alert-error" data-error role="alert" hidden></div>
          </div>`,
        footerHtml: `
          ${falta.suplencia ? `<button type="button" class="btn btn-ghost btn-danger-ghost" data-quitar>${UI.icon('trash')}Quitar suplencia</button><span class="grow"></span>` : ''}
          <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">${UI.icon('check')}Guardar</button>`,
        onClose: () => resolve(hecho)
      });
      const f = dialog.el;
      const errorBox = f.querySelector('[data-error]');
      f.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);
      const inicial = falta.suplencia ? { docenteId: falta.suplencia.docenteSuplenteId, nombre: falta.suplencia.suplente, numContrato: falta.suplencia.numContrato } : null;
      const montarPicker = (g, ini) => selectorSuplente(f.querySelector('[data-picker]'), { grupo: g, inicial: ini, onChange: (s) => { elegido = s; } });
      if (inicial) {
        UI.api(`/docentes/${inicial.docenteId}/contratos`).then(({ contratos }) => {
          elegido = { ...inicial, contratos };
          montarPicker(grupo, elegido);
        }).catch(() => montarPicker(grupo, inicial));
      } else montarPicker(grupo, null);
      if (!grupo) {
        Comun.buscadorDocente(f.querySelector('[data-buscar]'), {
          placeholder: 'Suplente: nombre, nómina o CRN',
          excluir: (d) => d.id === falta.docente.id,
          onElegir: async (d) => {
            let contratos = [];
            try { ({ contratos } = await UI.api(`/docentes/${d.id}/contratos`)); } catch { /* sin contratos */ }
            elegido = { docenteId: d.id, nombre: d.nombre, contratos, numContrato: contratos[0] ? contratos[0].contrato : null };
            montarPicker(null, elegido);
          }
        });
      }
      const quitar = f.querySelector('[data-quitar]');
      if (quitar) {
        quitar.addEventListener('click', async () => {
          try {
            await UI.api(`/faltas/${falta.id}/suplencia`, { method: 'DELETE' });
            hecho = true;
            UI.toast('Se quitó la suplencia y su pago.', 'success');
            dialog.close();
          } catch (err) { UI.pintarError(errorBox, err); }
        });
      }
      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        if (!elegido) { errorBox.textContent = 'Elige al docente que cubrió.'; errorBox.hidden = false; return; }
        if (elegido.contratoInvalido) { errorBox.textContent = 'El contrato del suplente solo lleva números.'; errorBox.hidden = false; return; }
        const btn = f.querySelector('[type="submit"]');
        UI.setBusy(btn, true);
        const body = { docenteSuplenteId: elegido.docenteId, numContrato: elegido.numContrato || null };
        if (f.elements.monto.value !== '') body.monto = Number(f.elements.monto.value);
        try {
          const r = await UI.api(`/faltas/${falta.id}/suplencia`, { method: 'PUT', body });
          hecho = true;
          UI.toast(`${elegido.nombre} cubrió la falta.${(r.avisos || []).includes('SUPLENTE_SIN_CONTRATO') ? ' Quedó sin contrato del suplente.' : ''}`, 'success');
          dialog.close();
        } catch (err) {
          UI.setBusy(btn, false);
          UI.pintarError(errorBox, err);
        }
      });
    });
  }

  // ================================================================== editar una falta

  async function editar(falta) {
    let cat;
    try { cat = await catalogosFalta(); } catch (err) { UI.toast(err.message, 'error'); return false; }
    const manual = falta.modo === 'manual';
    const fields = [
      // Motivo: No justificada (permiso personal, se descuenta) o Justificada (IMSS o viaje escolar)
      { name: 'justificacion', label: 'Motivo', type: 'select', required: true, options: [
        { value: 'ninguna', label: `No justificada · ${Comun.JUSTIFICACION.ninguna}` },
        ...Object.entries(Comun.JUSTIFICADAS).map(([value, label]) => ({ value, label: `Justificada · ${label}` }))
      ] },
      ...(manual ? [{ name: 'horasTexto', label: 'Horas (texto)', required: true, maxlength: 60 }] : []),
      { name: 'cuentaCargo', label: 'Cuenta de cargo', type: 'select', options: cat.cuentas.map((c) => ({ value: c.valor, label: `${c.valor}${c.descripcion ? ` · ${c.descripcion}` : ''}` })) },
      { name: 'folioImss', label: 'Folio IMSS (solo incapacidad o cita IMSS)', maxlength: 30 },
      { name: 'monto', label: manual ? 'Monto a descontar' : 'Descuento (vacío = tarifa del día)', type: 'number', step: '0.01', min: 0 },
      ...(manual ? [
        { name: 'fechaTexto', label: 'Periodo (texto)', required: true, maxlength: 60 },
        { name: 'dias', label: 'Número de días', type: 'number', min: 1, required: true }
      ] : []),
      { name: 'ticket', label: 'Ticket', maxlength: 50 },
      { name: 'observaciones', label: 'Observaciones', type: 'textarea', rows: 2, maxlength: 500 }
    ];
    const r = await UI.formModal({
      title: 'Editar falta',
      description: `${falta.docente.nombre} · ${falta.fecha ? Comun.fechaLarga(falta.fecha) : falta.fechaTexto || ''}${falta.asignatura && falta.asignatura.crn ? ` · CRN ${falta.asignatura.crn}` : ''}. Si alguien la cubrió, su pago se actualiza.`,
      fields,
      values: {
        ...falta,
        monto: manual || falta.montoEditado ? falta.montoDescuento : '',
        folioImss: falta.folioImss || '', ticket: falta.ticket || '', observaciones: falta.observaciones || ''
      },
      onSubmit: (v) => {
        const body = {
          cuentaCargo: v.cuentaCargo, justificacion: v.justificacion,
          folioImss: Comun.esImss(v.justificacion) ? v.folioImss || null : null, ticket: v.ticket || null, observaciones: v.observaciones || null
        };
        if (manual) { body.horasTexto = v.horasTexto; body.fechaTexto = v.fechaTexto; body.dias = Number(v.dias); }
        if (v.monto !== '') body.monto = Number(v.monto);
        else if (!manual && falta.montoEditado) body.restaurarMonto = true;
        return UI.api(`/faltas/${falta.id}`, { method: 'PUT', body });
      }
    });
    if (r) UI.toast('Falta actualizada.', 'success');
    return Boolean(r);
  }

  async function eliminar(falta) {
    const ok = await UI.confirm({
      title: '¿Eliminar la falta?',
      message: `${falta.docente.nombre} · ${falta.fecha ? UI.fecha(falta.fecha) : falta.fechaTexto || ''}${falta.asignatura && falta.asignatura.crn ? ` · CRN ${falta.asignatura.crn}` : ''}.${falta.suplencia ? ` También se quita el pago a ${falta.suplencia.suplente}.` : ''}`,
      confirmText: 'Eliminar',
      danger: true
    });
    if (!ok) return false;
    try {
      await UI.api(`/faltas/${falta.id}`, { method: 'DELETE' });
      UI.toast('Falta eliminada.', 'success');
      return true;
    } catch (err) { UI.toast(err.message, 'error'); return false; }
  }

  // ================================================================== vista

  function totales(faltas) {
    const descontado = faltas.reduce((s, x) => s + (x.montoDescuento || 0), 0);
    const pagado = faltas.reduce((s, x) => s + (x.suplencia ? x.suplencia.monto || 0 : 0), 0);
    return { descontado, pagado, diferencia: descontado - pagado };
  }

  function tablaFaltas(faltas, { bloqueada = false, vacio }) {
    if (!faltas.length) return `<div class="empty-state small-empty"><p class="muted">${UI.escape(vacio)}</p></div>`;
    const t = totales(faltas);
    return `
      <div class="table-wrap"><table class="table lista-table">
        <thead><tr><th>Docente</th><th>Fecha</th><th>CRN</th><th>Materia</th><th>Motivo</th><th>Justificación</th>
          <th class="num">Descuento</th><th>Cubrió</th><th></th></tr></thead>
        <tbody>${faltas.map((x) => `
          <tr data-falta="${x.id}">
            <td class="col-doc"><strong>${UI.escape(x.docente.nombre)}</strong><div class="small muted">${UI.escape(x.docente.nomina)}</div></td>
            <td class="nowrap">${x.fecha ? UI.escape(UI.fecha(x.fecha)) : UI.escape(x.fechaTexto || '—')}${x.sesion === 2 ? ' <span class="badge badge-info badge-plain">2ª</span>' : ''}${x.modo === 'manual' ? ' <span class="badge badge-outline badge-plain">Manual</span>' : ''}</td>
            <td class="nowrap">${UI.guion(x.asignatura && x.asignatura.crn)}</td>
            <td>${UI.guion(x.asignatura && x.asignatura.materia)}</td>
            <td>${x.justificacion === 'ninguna' ? 'No justificada' : 'Justificada'}</td>
            <td>${x.justificacion === 'ninguna' ? '<span class="cell-muted">—</span>' : `<span class="badge badge-info badge-plain">${UI.escape(Comun.JUSTIFICACION[x.justificacion])}</span>`}</td>
            <td class="num">${UI.dinero(x.montoDescuento)}${x.montoEditado ? ' <span title="Monto editado">✎</span>' : ''}</td>
            <td class="nowrap">${x.suplencia
              ? `${UI.escape(x.suplencia.suplente)} <span class="small muted">${UI.dinero(x.suplencia.monto)}</span>${bloqueada ? '' : ` <button type="button" class="link-btn small" data-accion="suplente">Cambiar</button>`}${x.suplencia.numContrato || bloqueada ? '' : ' <button type="button" class="link-btn small" data-accion="suplente" title="Escribe el contrato del suplente">Capturar contrato</button>'}`
              : bloqueada ? '<span class="cell-muted">—</span>' : `<span class="cell-muted">—</span> <button type="button" class="btn btn-outline btn-sm" data-accion="suplente">Asignar</button>`}</td>
            <td class="nowrap">${bloqueada ? '' : `
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-accion="editar" aria-label="Editar">${UI.icon('pencil')}</button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" data-accion="eliminar" aria-label="Eliminar">${UI.icon('trash')}</button>`}</td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="6" class="num">Total descontado</td><td class="num">${UI.dinero(t.descontado)}</td><td colspan="2"></td></tr></tfoot>
      </table></div>`;
  }

  function pintar() {
    const q = selector.quincena();
    const todas = [...datos.pendientes, ...datos.reportadas];
    const t = totales(datos.reportadas);
    el.querySelector('#faltasPendientes').innerHTML = tablaFaltas(datos.pendientes, { vacio: 'No hay faltas pendientes de reportar.' });
    el.querySelector('#faltasReportadas').innerHTML = q
      ? tablaFaltas(datos.reportadas, { bloqueada: q.cerrada, vacio: `Aún no se reporta ninguna falta en ${q.etiqueta}.` })
      : '';
    el.querySelector('#faltasTituloRep').textContent = q ? `Reportadas en ${Comun.etiquetaQuincena(q)}` : 'Reportadas';
    el.querySelector('#faltasCerrada').hidden = !(q && q.cerrada);
    el.querySelector('#faltasTotales').innerHTML = [
      Comun.stat('Pendientes de reportar', String(datos.pendientes.length), { sub: `${UI.dinero(totales(datos.pendientes).descontado)} por descontar · ${UI.dinero(totales(datos.pendientes).pagado)} a suplentes`, icono: 'clock', tono: 'tone-warning' }),
      Comun.stat(`Total descontado${q ? ` · ${q.etiqueta}` : ''}`, UI.dinero(t.descontado), { icono: 'calendar' }),
      Comun.stat('Pagado a suplentes', UI.dinero(t.pagado), { icono: 'cash', tono: 'tone-info' }),
      Comun.stat('Diferencia', UI.dinero(t.diferencia), { icono: 'chart', tono: 'tone-success' })
    ].join('');
    el._faltas = new Map(todas.map((x) => [x.id, x]));
  }

  async function cargar() {
    const q = selector.quincena();
    try {
      const [p, r] = await Promise.all([
        UI.api('/faltas?pendientes=true'),
        q ? UI.api(`/faltas?quincenaId=${q.id}`) : Promise.resolve({ faltas: [] })
      ]);
      datos = { pendientes: p.faltas, reportadas: r.faltas };
      if (el.isConnected) pintar();
    } catch (err) {
      el.querySelector('#faltasPendientes').innerHTML = `<div class="card-body"><div class="alert alert-error">${UI.escape(err.message)}</div></div>`;
    }
  }

  function mount(container, parametros = {}) {
    container.innerHTML = '<div class="vista" data-vista="faltas"></div>';
    el = container.firstElementChild;
    el.innerHTML = `
      <section class="page-header">
        <div><h2>Faltas y descuentos</h2><p class="muted">Una falta por CRN y día. Quedan pendientes hasta generar el reporte de la quincena.</p></div>
        <button class="btn btn-primary" type="button" id="faltasNueva">${UI.icon('plus')}Registrar falta</button>
      </section>
      <div class="toolbar"><div id="faltasQuincena"></div></div>
      <div class="stats stats-5" id="faltasTotales"></div>
      <section class="card mt">
        <div class="card-header"><div><h3>Pendientes de reportar</h3><p class="card-sub">De cualquier fecha. Entran al generar el Excel de Descuentos de la quincena (Reportes).</p></div></div>
        <div id="faltasPendientes"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
      </section>
      <section class="card">
        <div class="card-header"><div><h3 id="faltasTituloRep">Reportadas</h3>
          <p class="card-sub" id="faltasCerrada" hidden>${UI.icon('check')}Quincena cerrada: ya se envió a Nacional y no admite cambios.</p></div></div>
        <div id="faltasReportadas"></div>
      </section>`;
    selector = Comun.selectorQuincena(el.querySelector('#faltasQuincena'), { onChange: cargar });
    el.querySelector('#faltasNueva').addEventListener('click', async () => { if (await registrar()) cargar(); });
    el.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-accion]');
      const tr = e.target.closest('[data-falta]');
      if (!b || !tr || !el._faltas) return;
      const falta = el._faltas.get(Number(tr.dataset.falta));
      if (!falta) return;
      const acciones = { suplente: asignarSuplente, editar, eliminar };
      if (acciones[b.dataset.accion] && await acciones[b.dataset.accion](falta)) cargar();
    });
    selector.recargar().then(cargar);
    if (parametros.nueva) registrar({ docenteId: Number(parametros.docente) || null }).then((ok) => ok && cargar());
  }

  return { mount, registrar, asignarSuplente, editar };
})();
