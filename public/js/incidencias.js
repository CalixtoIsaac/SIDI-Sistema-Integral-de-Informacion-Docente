/**
 * Incidencias: pagos adicionales de la quincena (05 §6; HU-11).
 *
 *  - Pendientes de reportar (pagos sin quincena y pagos de suplencias de faltas pendientes) y los de la
 *    quincena elegida, en el orden en que saldrán en el Excel (flechas para reordenar).
 *  - Nuevo pago / editar / borrar (los de suplencia se ven aquí pero se cambian desde la falta: 🔗).
 *  - Copiar los pagos manuales de la quincena anterior (no duplica).
 *
 *  Rutas: GET/POST/PUT/DELETE /incidencias · POST /incidencias/copiar · PATCH /incidencias/orden
 *         GET /docentes/:id/contratos (contrato del docente)
 */
const Incidencias = (() => {
  let el = null;
  let selector = null;
  let datos = { pendientes: [], quincena: [] };

  const LIMITES = { detalle: 500, elementoPep: 24, ordenInterna: 12 };

  // ================================================================== formulario de pago

  async function formulario(incidencia = null) {
    let cat;
    try {
      const [cc, motivos, cecos] = await Promise.all([Comun.catalogo('cc_nomina'), Comun.catalogo('motivo_incidencia'), Comun.catalogo('cuenta_cargo')]);
      cat = { cc, motivos, cecos };
    } catch (err) { UI.toast(err.message, 'error'); return false; }

    const q = selector ? selector.quincena() : null;
    const v = incidencia || {};
    const st = {
      docente: v.docente || null,
      contratos: [],
      contrato: v.numContrato || ''
    };

    return new Promise((resolve) => {
      let guardado = false;
      const dialog = UI.openDialog({
        title: incidencia ? 'Editar pago' : 'Nuevo pago',
        description: 'Tutoreo, PAD, coach, talleres… Va a la hoja Incidencia del Excel de Nacional.',
        size: 'lg',
        as: 'form',
        bodyHtml: `
          <div class="form-grid">
            <div class="field full"><label>Docente <span class="req">*</span></label><div data-buscador></div></div>
            <div class="field"><label>Contrato</label><div data-contrato></div></div>
            <div class="field"><label>Quincena</label>
              ${Comun.selectHtml('quincena', [
                ...(q && !q.cerrada ? [[q.id, `Esta quincena (${q.etiqueta})`]] : []),
                ['', 'Pendiente (se asigna al generar el reporte)']
              ], incidencia ? (incidencia.quincena ? incidencia.quincena.id : '') : (q && !q.cerrada ? q.id : ''))}</div>
            <div class="field"><label>Concepto (cc-nómina) <span class="req">*</span></label>${Comun.selectHtml('ccNomina', cat.cc.map((c) => c.valor), v.ccNomina || (cat.cc[0] && cat.cc[0].valor))}</div>
            <div class="field"><label>Motivo <span class="req">*</span></label>${Comun.selectHtml('motivo', cat.motivos.map((c) => c.valor), v.motivo || (cat.motivos[0] && cat.motivos[0].valor))}</div>
            <div class="field full"><label>Detalle <span class="req">*</span> <span class="contador" data-contador="detalle"></span></label>
              <textarea class="input textarea" name="detalle" rows="2" maxlength="${LIMITES.detalle}" placeholder="Ej. Tutoreo de 48 alumnos del grupo 611">${UI.escape(v.detalle || '')}</textarea></div>
            <div class="field"><label>CeCo <span class="req">*</span></label>${Comun.selectHtml('ceco', cat.cecos.map((c) => [c.valor, `${c.valor}${c.descripcion ? ` · ${c.descripcion}` : ''}`]), v.ceco || (cat.cecos[0] && cat.cecos[0].valor))}</div>
            <div class="field"><label>Elemento PEP <span class="contador" data-contador="elementoPep"></span></label>
              <input class="input" name="elementoPep" maxlength="${LIMITES.elementoPep}" value="${UI.escape(v.elementoPep || '')}" placeholder="Opcional"></div>
            <div class="field"><label>Orden interna <span class="contador" data-contador="ordenInterna"></span></label>
              <input class="input" name="ordenInterna" maxlength="${LIMITES.ordenInterna}" value="${UI.escape(v.ordenInterna || '')}" placeholder="Opcional"></div>
            <div class="field"><label>A partir de</label>
              <input class="input" type="date" name="aPartirDe" value="${UI.escape(v.aPartirDe || '')}">
              <p class="hint">Vacío = fecha de pago de la quincena.</p></div>
            <div class="field"><label>Importe total <span class="req">*</span></label>
              <div class="input-group"><span class="input-addon">$</span><input class="input" type="number" name="importeTotal" min="0.01" step="0.01" required value="${v.importeTotal ?? ''}"></div></div>
            <div class="field"><label>Número de periodos <span class="req">*</span></label>
              <input class="input" type="number" name="numPeriodos" min="1" max="24" step="1" required value="${v.numPeriodos ?? 1}"></div>
            <div class="field full"><p class="por-periodo" data-por-periodo></p></div>
            <div class="alert alert-error full" data-error role="alert" hidden></div>
          </div>`,
        footerHtml: `
          <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">${UI.icon('check')}${incidencia ? 'Guardar cambios' : 'Agregar pago'}</button>`,
        onClose: () => resolve(guardado)
      });
      const f = dialog.el;
      const errorBox = f.querySelector('[data-error]');
      f.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);

      const buscador = Comun.buscadorDocente(f.querySelector('[data-buscador]'), {
        onElegir: (d) => { st.docente = d; st.contrato = ''; cargarContratos(); }
      });
      if (st.docente) buscador.poner(st.docente);

      async function cargarContratos() {
        const box = f.querySelector('[data-contrato]');
        if (!st.docente) { box.innerHTML = '<input class="input" disabled placeholder="Elige al docente">'; return; }
        try { ({ contratos: st.contratos } = await UI.api(`/docentes/${st.docente.id}/contratos`)); } catch { st.contratos = []; }
        if (!st.contrato && st.contratos[0]) st.contrato = st.contratos[0].contrato;
        pintarContrato();
      }
      function pintarContrato() {
        const box = f.querySelector('[data-contrato]');
        const conocido = st.contratos.some((c) => c.contrato === st.contrato);
        const otro = st.contrato && !conocido;
        box.innerHTML = `
          ${Comun.selectHtml('contratoSel', [
            ...st.contratos.map((c) => [c.contrato, `${c.contrato}${c.crn ? ` (CRN ${c.crn})` : ''}`]),
            ['__otro', 'Otro / nuevo…'],
            ['', 'Sin contrato']
          ], otro ? '__otro' : st.contrato)}
          <input class="input mt-xs" name="numContrato" inputmode="numeric" maxlength="15" placeholder="Número de contrato"
                 value="${UI.escape(otro ? st.contrato : '')}"${otro ? '' : ' hidden'}>
          ${!st.contratos.length ? '<p class="hint">Este docente no tiene contratos en sus grupos.</p>' : ''}`;
      }

      function contadores() {
        for (const [campo, max] of Object.entries(LIMITES)) {
          const n = f.elements[campo].value.length;
          const c = f.querySelector(`[data-contador="${campo}"]`);
          c.textContent = `${n}/${max}`;
          c.classList.toggle('lleno', n >= max);
        }
        const total = Number(f.elements.importeTotal.value);
        const periodos = Number(f.elements.numPeriodos.value) || 1;
        f.querySelector('[data-por-periodo]').innerHTML = total > 0
          ? `Importe por periodo: <strong>${UI.dinero(Math.round((total / periodos) * 100) / 100)}</strong>${periodos > 1 ? ` · ${periodos} periodos` : ''}`
          : '<span class="muted">El importe por periodo se calcula solo (importe total ÷ periodos).</span>';
      }

      f.addEventListener('input', contadores);
      f.addEventListener('change', (e) => {
        if (e.target.name === 'contratoSel') {
          const otro = e.target.value === '__otro';
          f.elements.numContrato.hidden = !otro;
          st.contrato = otro ? f.elements.numContrato.value.trim() : e.target.value;
          if (otro) f.elements.numContrato.focus();
        }
        if (e.target.name === 'numContrato') st.contrato = e.target.value.trim();
      });

      f.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        if (!st.docente) { errorBox.textContent = 'Elige al docente.'; errorBox.hidden = false; buscador.enfocar(); return; }
        const sel = f.elements.contratoSel ? f.elements.contratoSel.value : '';
        const numContrato = sel === '__otro' ? f.elements.numContrato.value.trim() : sel;
        const body = {
          docenteId: st.docente.id,
          numContrato: numContrato || null,
          ccNomina: f.elements.ccNomina.value,
          motivo: f.elements.motivo.value,
          detalle: f.elements.detalle.value.trim(),
          ceco: f.elements.ceco.value,
          elementoPep: f.elements.elementoPep.value.trim() || null,
          ordenInterna: f.elements.ordenInterna.value.trim() || null,
          importeTotal: Number(f.elements.importeTotal.value),
          numPeriodos: Number(f.elements.numPeriodos.value) || 1,
          quincenaId: f.elements.quincena.value ? Number(f.elements.quincena.value) : null
        };
        if (f.elements.aPartirDe.value) body.aPartirDe = f.elements.aPartirDe.value;
        const btn = f.querySelector('[type="submit"]');
        UI.setBusy(btn, true);
        try {
          await UI.api(incidencia ? `/incidencias/${incidencia.id}` : '/incidencias', { method: incidencia ? 'PUT' : 'POST', body });
          guardado = true;
          UI.toast(incidencia ? 'Pago actualizado.' : 'Pago agregado.', 'success');
          dialog.close();
        } catch (err) {
          UI.setBusy(btn, false);
          UI.pintarError(errorBox, err);
        }
      });

      cargarContratos();
      contadores();
      if (!st.docente) buscador.enfocar();
    });
  }

  // ================================================================== acciones

  async function eliminar(i) {
    const ok = await UI.confirm({
      title: '¿Eliminar el pago?',
      message: `${i.docente.nombre} · ${i.motivo} · ${UI.dinero(i.importeTotal)}`,
      confirmText: 'Eliminar',
      danger: true
    });
    if (!ok) return false;
    try {
      await UI.api(`/incidencias/${i.id}`, { method: 'DELETE' });
      UI.toast('Pago eliminado.', 'success');
      return true;
    } catch (err) { UI.toast(err.message, 'error'); return false; }
  }

  async function copiarAnterior() {
    const q = selector.quincena();
    const anterior = selector.anterior();
    if (!q || !anterior) { UI.toast('No hay una quincena anterior a la elegida.', 'warning'); return; }
    if (q.cerrada) { UI.toast(`${q.etiqueta} está cerrada: reábrela en Reportes para agregar pagos.`, 'warning'); return; }
    const ok = await UI.confirm({
      title: `¿Copiar los pagos de ${anterior.etiqueta} a ${q.etiqueta}?`,
      message: 'Se copian los pagos manuales (las suplencias no). Los que ya estén en esta quincena no se duplican.',
      confirmText: 'Copiar pagos'
    });
    if (!ok) return;
    try {
      const r = await UI.api('/incidencias/copiar', { method: 'POST', body: { desdeQuincenaId: anterior.id, haciaQuincenaId: q.id } });
      UI.toast(r.copiadas
        ? `Se copiaron ${r.copiadas} pago(s)${r.omitidas ? ` · ${r.omitidas} ya estaban` : ''}.`
        : (r.omitidas ? 'Todos los pagos ya estaban en esta quincena.' : `${anterior.etiqueta} no tiene pagos manuales.`), r.copiadas ? 'success' : 'info');
      cargar();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  /** Mueve una fila dentro de la lista de la quincena y guarda el orden del Excel. */
  async function mover(id, delta) {
    const lista = datos.quincena.slice();
    const i = lista.findIndex((x) => x.id === id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];
    datos.quincena = lista;
    pintar();
    el.querySelector(`[data-mover="${id}"][data-delta="${delta}"]`)?.focus();
    try {
      await UI.api('/incidencias/orden', { method: 'PATCH', body: { ids: lista.map((x) => x.id) } });
    } catch (err) {
      UI.toast(`No se guardó el orden: ${err.message}`, 'error');
      cargar();
    }
  }

  // ================================================================== vista

  function origen(i) {
    return i.origen === 'suplencia'
      ? `<a class="badge badge-info badge-plain" href="#faltas" title="Se genera desde la falta: cámbiala en Faltas">${UI.icon('external')}Suplencia</a>`
      : '<span class="badge badge-plain badge-outline">Manual</span>';
  }

  function tabla(lista, { ordenable = false, bloqueada = false, vacio }) {
    if (!lista.length) return `<div class="empty-state small-empty"><p class="muted">${UI.escape(vacio)}</p></div>`;
    const total = lista.reduce((s, x) => s + x.importeTotal, 0);
    return `
      <div class="table-wrap"><table class="table lista-table">
        <thead><tr>${ordenable ? '<th class="num">#</th>' : ''}<th>Docente · contrato</th><th>Concepto · motivo</th><th>Detalle</th>
          <th>CeCo</th><th class="num">Importe total</th><th class="num">Periodos</th><th class="num">Por periodo</th><th>A partir de</th><th>Origen</th><th></th></tr></thead>
        <tbody>${lista.map((x, n) => `
          <tr data-incidencia="${x.id}">
            ${ordenable ? `<td class="num nowrap">
              <span class="orden-num">${n + 1}</span>
              ${bloqueada ? '' : `<button type="button" class="btn btn-ghost btn-icon btn-sm" data-mover="${x.id}" data-delta="-1" aria-label="Subir"${n === 0 ? ' disabled' : ''}>${UI.icon('arrowUp')}</button><button type="button" class="btn btn-ghost btn-icon btn-sm" data-mover="${x.id}" data-delta="1" aria-label="Bajar"${n === lista.length - 1 ? ' disabled' : ''}>${UI.icon('arrowDown')}</button>`}
            </td>` : ''}
            <td class="col-doc"><strong>${UI.escape(x.docente.nombre)}</strong>
              <div class="small muted">${UI.escape(x.docente.nomina)} · ${x.numContrato ? `Contrato ${UI.escape(x.numContrato)}` : '<span class="badge badge-warning badge-plain">Sin contrato</span>'}</div></td>
            <td>${UI.escape(x.ccNomina)}<div class="small muted">${UI.escape(x.motivo)}</div></td>
            <td class="col-texto small">${UI.escape(x.detalle)}</td>
            <td>${UI.escape(x.ceco)}</td>
            <td class="num">${UI.dinero(x.importeTotal)}</td>
            <td class="num">${x.numPeriodos}</td>
            <td class="num">${UI.dinero(x.importePorPeriodo)}</td>
            <td>${x.aPartirDe ? UI.escape(UI.fecha(x.aPartirDe)) : '<span class="cell-muted">Al generar</span>'}</td>
            <td>${origen(x)}</td>
            <td class="nowrap">${x.editable ? `
              <button type="button" class="btn btn-ghost btn-icon btn-sm" data-accion="editar" aria-label="Editar">${UI.icon('pencil')}</button>
              <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" data-accion="eliminar" aria-label="Eliminar">${UI.icon('trash')}</button>` : ''}</td>
          </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="${ordenable ? 5 : 4}" class="num">Total</td><td class="num">${UI.dinero(total)}</td><td colspan="5"></td></tr></tfoot>
      </table></div>`;
  }

  function pintar() {
    const q = selector.quincena();
    const total = (l) => l.reduce((s, x) => s + x.importeTotal, 0);
    el.querySelector('#incStats').innerHTML = [
      Comun.stat(`Pagos en ${q ? q.etiqueta : '—'}`, String(datos.quincena.length), { sub: UI.dinero(total(datos.quincena)), icono: 'cash' }),
      Comun.stat('Pendientes de reportar', String(datos.pendientes.length), { sub: UI.dinero(total(datos.pendientes)), icono: 'clock', tono: 'tone-warning' }),
      Comun.stat('De suplencias', String([...datos.quincena, ...datos.pendientes].filter((x) => x.origen === 'suplencia').length), { sub: 'Se generan desde Faltas', icono: 'users', tono: 'tone-info' })
    ].join('');
    el.querySelector('#incPendientes').innerHTML = tabla(datos.pendientes, { vacio: 'No hay pagos pendientes de reportar.' });
    el.querySelector('#incTituloQ').textContent = q ? `Pagos de ${Comun.etiquetaQuincena(q)}` : 'Pagos de la quincena';
    el.querySelector('#incCerrada').hidden = !(q && q.cerrada);
    el.querySelector('#incQuincena').innerHTML = q
      ? tabla(datos.quincena, { ordenable: true, bloqueada: q.cerrada, vacio: `Aún no hay pagos en ${q.etiqueta}. Agrega uno o copia los de la quincena anterior.` })
      : '';
    el.querySelector('#incCopiar').disabled = !q || q.cerrada || !selector.anterior();
    el._incidencias = new Map([...datos.pendientes, ...datos.quincena].map((x) => [x.id, x]));
  }

  async function cargar() {
    const q = selector.quincena();
    try {
      const [p, r] = await Promise.all([
        UI.api('/incidencias?pendientes=true'),
        q ? UI.api(`/incidencias?quincenaId=${q.id}`) : Promise.resolve({ incidencias: [] })
      ]);
      datos = { pendientes: p.incidencias, quincena: r.incidencias };
      if (el.isConnected) pintar();
    } catch (err) {
      el.querySelector('#incQuincena').innerHTML = `<div class="card-body"><div class="alert alert-error">${UI.escape(err.message)}</div></div>`;
    }
  }

  function mount(container) {
    container.innerHTML = '<div class="vista" data-vista="incidencias"></div>';
    el = container.firstElementChild;
    el.innerHTML = `
      <section class="page-header">
        <div><h2>Incidencias</h2><p class="muted">Pagos adicionales de la quincena: tutoreo, PAD, coach, talleres y suplencias.</p></div>
        <div class="row">
          <button class="btn btn-outline" type="button" id="incCopiar">${UI.icon('refresh')}Copiar pagos de la quincena anterior</button>
          <button class="btn btn-primary" type="button" id="incNuevo">${UI.icon('plus')}Nuevo pago</button>
        </div>
      </section>
      <div class="toolbar"><div id="incSelector"></div></div>
      <div class="stats" id="incStats"></div>
      <section class="card">
        <div class="card-header"><div><h3 id="incTituloQ">Pagos de la quincena</h3>
          <p class="card-sub">En el orden en que saldrán en la hoja Incidencia. Usa las flechas para reordenar.</p>
          <p class="card-sub" id="incCerrada" hidden>${UI.icon('check')}Quincena cerrada: ya se envió a Nacional y no admite cambios.</p></div></div>
        <div id="incQuincena"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
      </section>
      <section class="card">
        <div class="card-header"><div><h3>Pendientes de reportar</h3>
          <p class="card-sub">Pagos sin quincena y suplencias de faltas pendientes. Entran al generar el Excel de Incidencias (Reportes).</p></div></div>
        <div id="incPendientes"></div>
      </section>`;
    selector = Comun.selectorQuincena(el.querySelector('#incSelector'), { onChange: cargar });
    el.querySelector('#incNuevo').addEventListener('click', async () => { if (await formulario()) cargar(); });
    el.querySelector('#incCopiar').addEventListener('click', copiarAnterior);
    el.addEventListener('click', async (e) => {
      const m = e.target.closest('[data-mover]');
      if (m) { mover(Number(m.dataset.mover), Number(m.dataset.delta)); return; }
      const b = e.target.closest('[data-accion]');
      const tr = e.target.closest('[data-incidencia]');
      if (!b || !tr || !el._incidencias) return;
      const i = el._incidencias.get(Number(tr.dataset.incidencia));
      if (!i) return;
      if (b.dataset.accion === 'editar' && await formulario(i)) cargar();
      if (b.dataset.accion === 'eliminar' && await eliminar(i)) cargar();
    });
    selector.recargar().then(cargar);
  }

  return { mount, nuevo: formulario };
})();
