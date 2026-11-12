/**
 * Configuración (05 §9). Sprint 1:
 *   HU-18  Tarifas por tipo de clase (pago al semestre y por día; mensual = semestre ÷ 4, solo lectura)
 *          y catálogos editables (Nacional, nivel de estudios, campo de formación).
 *   HU-27  Contratos: descargar plantilla / subir reporte del periodo + historial.
 *   HU-21  Motivos de baja con recontratable sugerido.
 *   Extras de 05 §9: grupos que se omiten (en línea) y parámetros de OPINA (via /configuracion).
 * Cambiar una tarifa no cambia faltas ya registradas (cada falta guarda su monto).
 */
const Catalogos = (() => {
  let el = null;
  const e = (v) => UI.escape(v);

  const TIPOS = [
    ['nivel_estudios', 'Nivel de estudios', 'Ordena de menor a mayor: define el "nivel de estudios" del docente.'],
    ['campo_formacion', 'Campo de formación', 'Lista para la ficha y los filtros.'],
    ['cc_nomina', 'cc-nómina (Incidencias)', 'Conceptos de pago del formato de Nacional.'],
    ['motivo_incidencia', 'Motivo de incidencia', 'Motivos del formato de Incidencias.'],
    ['cuenta_cargo', 'Cuenta de cargo', 'CeCo de las faltas.'],
    ['motivo_falta', 'Motivo de falta', 'Motivos del formato de Descuentos.'],
    ['horas_falta', 'Horas de la falta', 'Textos de horas (día completo / medio día).'],
    ['situacion', 'Situación (texto)', 'Textos de situación del formato de Descuentos.'],
    ['estatus_falta', 'Estatus de falta (texto)', 'Textos de estatus del formato de Descuentos.'],
    ['tipo_contrato', 'Tipo de contrato', 'Tipos de contrato del docente.']
  ];
  let tipoActual = TIPOS[0][0];
  let verInactivos = false;

  function plantilla() {
    return `
      <section class="page-header">
        <div><h2>Configuración</h2><p class="muted">Tarifas, catálogos, contratos y motivos de baja.</p></div>
      </section>

      <section class="card" id="cfgTarifas">
        <div class="card-header"><div><h3>Tarifas por tipo de clase</h3>
          <p class="card-sub">El pago mensual se calcula solo (semestre ÷ 4). Cambiar una tarifa no modifica faltas ya registradas.</p></div></div>
        <div data-cuerpo><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
      </section>

      <div class="grid-2 mt">
        <section class="card" id="cfgContratos">
          <div class="card-header"><div><h3>Contratos por CRN</h3><p class="card-sub">Del semestre actual.</p></div></div>
          <div class="card-body stack">
            <div class="row">
              <button type="button" class="btn btn-outline" data-accion="plantilla">${UI.icon('download')}Descargar plantilla de contratos</button>
              <button type="button" class="btn btn-primary" data-accion="subir-contratos">${UI.icon('upload')}Subir contratos</button>
            </div>
            <div data-historial></div>
          </div>
        </section>

        <section class="card" id="cfgMotivos">
          <div class="card-header"><div><h3>Motivos de baja</h3><p class="card-sub">El "recontratable sugerido" se propone al dar de baja.</p></div>
            <button type="button" class="btn btn-outline btn-sm" data-accion="nuevo-motivo">${UI.icon('plus')}Agregar</button></div>
          <div data-cuerpo></div>
        </section>
      </div>

      <section class="card mt" id="cfgCatalogos">
        <div class="card-header"><div><h3>Catálogos</h3><p class="card-sub" data-desc></p></div>
          <div class="row">
            <label class="check small"><input type="checkbox" data-inactivos>Ver dados de baja</label>
            <button type="button" class="btn btn-outline btn-sm" data-accion="nuevo-valor">${UI.icon('plus')}Agregar valor</button>
          </div></div>
        <div class="card-body" style="padding-bottom:0"><div class="tabs" role="tablist" data-tipos>
          ${TIPOS.map(([k, t]) => `<button type="button" class="tab" role="tab" data-tipo="${k}" aria-selected="${k === tipoActual}">${e(t)}</button>`).join('')}
        </div></div>
        <div data-cuerpo></div>
      </section>

      <div class="grid-2 mt">
        <section class="card" id="cfgGrupos">
          <div class="card-header"><div><h3>Grupos que se omiten</h3><p class="card-sub">Grupos en línea que se pagan en otro sistema (Excel de grupos).</p></div></div>
          <form class="card-body row" data-form="omitir">
            <input class="input grow" style="max-width:260px" name="omitir" placeholder="F61,F62" aria-label="Grupos a omitir separados por coma">
            <button type="submit" class="btn btn-outline">${UI.icon('check')}Guardar</button>
          </form>
        </section>
        <section class="card" id="cfgOpina">
          <div class="card-header"><div><h3>OPINA</h3><p class="card-sub">Se aplica a las próximas cargas.</p></div></div>
          <form class="card-body form-grid" data-form="opina">
            <div class="field"><label for="cfgMuestra">Muestra mínima</label><input class="input" id="cfgMuestra" name="muestra" type="number" min="1" max="500"></div>
            <div class="field"><label for="cfgCampus">Campus</label><input class="input" id="cfgCampus" name="campus"></div>
            <label class="check full"><input type="checkbox" name="presencial">Solo grupos presenciales</label>
            <div class="full"><button type="submit" class="btn btn-outline">${UI.icon('check')}Guardar</button></div>
          </form>
        </section>
      </div>`;
  }

  // ------------------------------------------------------------------ tarifas (HU-18)
  async function cargarTarifas() {
    const box = el.querySelector('#cfgTarifas [data-cuerpo]');
    try {
      const { tiposClase } = await UI.api('/tipos-clase');
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Tipo de clase</th><th class="num">h/semana</th><th>Idioma</th><th class="num">Pago al semestre</th><th class="num">Pago por día</th>
          <th class="num">Pago mensual</th><th class="num">Grupos</th><th>Activa</th><th></th></tr></thead>
        <tbody>${tiposClase.map((t) => `<tr data-tarifa="${t.id}">
          <td>${e(t.nombre)}</td><td class="num">${t.horasSemana}</td><td>${t.idioma === 'EN' ? 'Inglés' : 'Español'}</td>
          <td class="num"><input class="input num" style="width:120px;margin-left:auto" type="number" min="0" step="0.01" data-c="pagoSemestre" value="${t.pagoSemestre}" aria-label="Pago al semestre de ${e(t.nombre)}"></td>
          <td class="num"><input class="input num" style="width:100px;margin-left:auto" type="number" min="0" step="0.01" data-c="pagoPorDia" value="${t.pagoPorDia}" aria-label="Pago por día de ${e(t.nombre)}"></td>
          <td class="num" data-mensual>${UI.dinero(t.pagoMensual)}</td>
          <td class="num">${t.asignaturas}</td>
          <td><input type="checkbox" data-c="activo" ${t.activo ? 'checked' : ''} aria-label="Activa"></td>
          <td><button type="button" class="btn btn-outline btn-sm" data-guardar-tarifa="${t.id}" disabled>Guardar</button></td>
        </tr>`).join('')}</tbody></table></div>`;
    } catch (err) {
      box.innerHTML = `<div class="card-body"><div class="alert alert-error">${e(err.message)}</div></div>`;
    }
  }

  async function guardarTarifa(id) {
    const tr = el.querySelector(`[data-tarifa="${id}"]`);
    const boton = tr.querySelector('[data-guardar-tarifa]');
    const cuerpo = {
      pagoSemestre: Number(tr.querySelector('[data-c="pagoSemestre"]').value),
      pagoPorDia: Number(tr.querySelector('[data-c="pagoPorDia"]').value),
      activo: tr.querySelector('[data-c="activo"]').checked
    };
    UI.setBusy(boton, true);
    try {
      const { tipoClase } = await UI.api(`/tipos-clase/${id}`, { method: 'PUT', body: cuerpo });
      tr.querySelector('[data-mensual]').textContent = UI.dinero(tipoClase.pagoMensual);
      UI.toast(`Tarifa "${tipoClase.nombre}" guardada.`, 'success');
      UI.setBusy(boton, false);
      boton.disabled = true;
    } catch (err) {
      UI.toast(UI.listaErrores(err).lineas[0] || err.message, 'error');
      UI.setBusy(boton, false);
    }
  }

  // ------------------------------------------------------------------ contratos (HU-27)
  async function cargarContratos() {
    const box = el.querySelector('#cfgContratos [data-historial]');
    try {
      const { importaciones } = await UI.api('/contratos/importaciones');
      box.innerHTML = importaciones.length
        ? `<p class="section-title">Últimas cargas</p><ul class="recent-list">${importaciones.slice(0, 5).map((i) => `
            <li class="recent-item" style="padding:8px 0"><span class="recent-title">${e(i.archivo)} · ${e(i.periodo)}</span>
              <span class="badge badge-success badge-plain">${i.actualizados} actualizados</span>${i.conAviso ? `<span class="badge badge-warning badge-plain">${i.conAviso} avisos</span>` : ''}
              <span class="recent-date">${e(UI.formatDate(i.importadoEn))}</span></li>`).join('')}</ul>`
        : '<p class="muted small">Aún no se han cargado contratos. Los grupos sin contrato aparecen como "Datos incompletos" en Docentes.</p>';
    } catch (err) {
      box.innerHTML = `<div class="alert alert-error">${e(err.message)}</div>`;
    }
  }

  // ------------------------------------------------------------------ motivos de baja (HU-21)
  const SUGERIDO = { 1: 'Sí, recontratable', 0: 'No recontratable', '': 'Sin sugerencia' };
  async function cargarMotivos() {
    const box = el.querySelector('#cfgMotivos [data-cuerpo]');
    try {
      const { catalogos } = await UI.api('/catalogos?tipo=motivo_baja');
      box.innerHTML = `<table class="table table-compact"><thead><tr><th>Motivo</th><th>Recontratable sugerido</th><th></th></tr></thead>
        <tbody>${catalogos.map((c) => `<tr data-motivo="${c.id}">
          <td>${e(c.valor)}</td>
          <td><div class="select-wrap"><select class="input select" data-sugerido="${c.id}" aria-label="Recontratable sugerido para ${e(c.valor)}">
            ${Object.entries(SUGERIDO).map(([v, t]) => `<option value="${v}" ${String(c.descripcion ?? '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div></td>
          <td class="nowrap"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-editar-valor="${c.id}" data-valor="${e(c.valor)}" aria-label="Renombrar">${UI.icon('pencil')}</button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" data-baja-valor="${c.id}" data-valor="${e(c.valor)}" aria-label="Dar de baja">${UI.icon('trash')}</button></td>
        </tr>`).join('')}</tbody></table>`;
    } catch (err) {
      box.innerHTML = `<div class="card-body"><div class="alert alert-error">${e(err.message)}</div></div>`;
    }
  }

  // ------------------------------------------------------------------ catálogos (HU-18)
  async function cargarCatalogo() {
    const sec = el.querySelector('#cfgCatalogos');
    const info = TIPOS.find(([k]) => k === tipoActual);
    sec.querySelector('[data-desc]').textContent = info[2];
    sec.querySelectorAll('[data-tipo]').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.tipo === tipoActual)));
    const box = sec.querySelector('[data-cuerpo]');
    try {
      const { catalogos } = await UI.api(`/catalogos?tipo=${tipoActual}${verInactivos ? '&incluirInactivos=true' : ''}`);
      box.innerHTML = catalogos.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th class="num" style="width:70px">Orden</th><th>Valor</th><th>Descripción</th><th>Estado</th><th></th></tr></thead>
            <tbody>${catalogos.map((c) => `<tr class="${c.activo ? '' : 'cell-muted'}">
              <td class="num">${c.orden}</td><td>${e(c.valor)}</td><td>${UI.guion(c.descripcion)}</td>
              <td>${c.activo ? '<span class="badge badge-success badge-plain">Activo</span>' : '<span class="badge badge-plain">De baja</span>'}</td>
              <td class="nowrap"><button type="button" class="btn btn-ghost btn-icon btn-sm" data-editar-cat="${c.id}" aria-label="Editar ${e(c.valor)}">${UI.icon('pencil')}</button>
                ${c.activo
                  ? `<button type="button" class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" data-baja-valor="${c.id}" data-valor="${e(c.valor)}" aria-label="Dar de baja ${e(c.valor)}">${UI.icon('trash')}</button>`
                  : `<button type="button" class="btn btn-ghost btn-sm" data-reactivar-valor="${c.id}">Reactivar</button>`}</td>
            </tr>`).join('')}</tbody></table></div>`
        : '<div class="card-body"><p class="muted">Sin valores.</p></div>';
      box._catalogos = catalogos;
    } catch (err) {
      box.innerHTML = `<div class="card-body"><div class="alert alert-error">${e(err.message)}</div></div>`;
    }
  }

  function formularioValor(titulo, valores = {}) {
    return UI.formModal({
      title: titulo,
      fields: [
        { name: 'valor', label: 'Valor', required: true, maxlength: 200 },
        { name: 'descripcion', label: 'Descripción (opcional)', maxlength: 300 },
        { name: 'orden', label: 'Orden', type: 'number', min: 0, default: 0 }
      ],
      values: valores,
      onSubmit: (v) => (valores.id
        ? UI.api(`/catalogos/${valores.id}`, { method: 'PUT', body: { valor: v.valor, descripcion: v.descripcion || null, orden: Number(v.orden || 0) } })
        : UI.api('/catalogos', { method: 'POST', body: { tipo: tipoActual, valor: v.valor, descripcion: v.descripcion || null, orden: Number(v.orden || 0) } }))
    });
  }

  // ------------------------------------------------------------------ configuración (grupos y OPINA)
  async function cargarConfig() {
    try {
      const { configuracion: c } = await UI.api('/configuracion');
      el.querySelector('[name="omitir"]').value = c['grupos.omitir_grupos'] || '';
      el.querySelector('[name="muestra"]').value = c['opina.muestra_minima'] || 10;
      el.querySelector('[name="campus"]').value = c['opina.campus'] || '';
      el.querySelector('[name="presencial"]').checked = c['opina.solo_presencial'] === '1';
    } catch { /* se queda vacío */ }
  }

  // ------------------------------------------------------------------ eventos
  async function alClic(ev) {
    const t = ev.target;
    const b = (sel) => t.closest(sel);
    try {
      if (b('[data-guardar-tarifa]')) return guardarTarifa(Number(b('[data-guardar-tarifa]').dataset.guardarTarifa));
      if (b('[data-accion="plantilla"]')) { await UI.descargar('/contratos/plantilla', 'CONTRATOS.xlsx'); return; }
      if (b('[data-accion="subir-contratos"]')) { if (await Importar.contratos()) cargarContratos(); return; }
      if (b('[data-tipo]')) { tipoActual = b('[data-tipo]').dataset.tipo; cargarCatalogo(); return; }
      if (b('[data-accion="nuevo-valor"]')) { if (await formularioValor(`Nuevo valor · ${TIPOS.find(([k]) => k === tipoActual)[1]}`)) { UI.toast('Valor agregado.', 'success'); cargarCatalogo(); } return; }
      if (b('[data-editar-cat]')) {
        const id = Number(b('[data-editar-cat]').dataset.editarCat);
        const c = el.querySelector('#cfgCatalogos [data-cuerpo]')._catalogos.find((x) => x.id === id);
        if (await formularioValor('Editar valor', { id, valor: c.valor, descripcion: c.descripcion || '', orden: c.orden })) { UI.toast('Valor guardado.', 'success'); cargarCatalogo(); }
        return;
      }
      if (b('[data-reactivar-valor]')) {
        await UI.api(`/catalogos/${b('[data-reactivar-valor]').dataset.reactivarValor}`, { method: 'PUT', body: { activo: true } });
        UI.toast('Valor reactivado.', 'success');
        cargarCatalogo();
        return;
      }
      if (b('[data-baja-valor]')) {
        const x = b('[data-baja-valor]');
        const ok = await UI.confirm({ title: `¿Dar de baja "${x.dataset.valor}"?`, message: 'Ya no aparecerá en las listas. Lo que ya lo usa no cambia y puedes reactivarlo después.', confirmText: 'Dar de baja', danger: true });
        if (!ok) return;
        await UI.api(`/catalogos/${x.dataset.bajaValor}`, { method: 'DELETE' });
        UI.toast('Valor dado de baja.', 'success');
        cargarMotivos();
        cargarCatalogo();
        return;
      }
      if (b('[data-editar-valor]')) {
        const x = b('[data-editar-valor]');
        const r = await UI.formModal({ title: 'Renombrar motivo', fields: [{ name: 'valor', label: 'Motivo', required: true, maxlength: 200 }], values: { valor: x.dataset.valor },
          onSubmit: (v) => UI.api(`/catalogos/${x.dataset.editarValor}`, { method: 'PUT', body: { valor: v.valor } }) });
        if (r) { UI.toast('Motivo guardado.', 'success'); cargarMotivos(); }
        return;
      }
      if (b('[data-accion="nuevo-motivo"]')) {
        const r = await UI.formModal({
          title: 'Nuevo motivo de baja',
          fields: [
            { name: 'valor', label: 'Motivo', required: true, maxlength: 200 },
            { name: 'sugerido', label: 'Recontratable sugerido', type: 'select', options: [{ value: '', label: 'Sin sugerencia' }, { value: '1', label: 'Sí, recontratable' }, { value: '0', label: 'No recontratable' }] }
          ],
          onSubmit: (v) => UI.api('/catalogos', { method: 'POST', body: { tipo: 'motivo_baja', valor: v.valor, descripcion: v.sugerido || null, orden: 50 } })
        });
        if (r) { UI.toast('Motivo agregado.', 'success'); cargarMotivos(); }
      }
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  function enlazar() {
    el.addEventListener('click', alClic);
    el.querySelector('#cfgTarifas').addEventListener('input', (ev) => {
      const tr = ev.target.closest('[data-tarifa]');
      if (!tr) return;
      tr.querySelector('[data-guardar-tarifa]').disabled = false;
      if (ev.target.dataset.c === 'pagoSemestre') tr.querySelector('[data-mensual]').textContent = UI.dinero(Math.round((Number(ev.target.value) / 4) * 100) / 100);
    });
    el.querySelector('#cfgTarifas').addEventListener('change', (ev) => {
      if (ev.target.dataset.c === 'activo') ev.target.closest('[data-tarifa]').querySelector('[data-guardar-tarifa]').disabled = false;
    });
    el.querySelector('#cfgMotivos').addEventListener('change', async (ev) => {
      const s = ev.target.closest('[data-sugerido]');
      if (!s) return;
      try {
        await UI.api(`/catalogos/${s.dataset.sugerido}`, { method: 'PUT', body: { descripcion: s.value || null } });
        UI.toast('Sugerencia guardada.', 'success');
      } catch (err) { UI.toast(err.message, 'error'); }
    });
    el.querySelector('[data-inactivos]').addEventListener('change', (ev) => { verInactivos = ev.target.checked; cargarCatalogo(); });
    el.querySelector('[data-form="omitir"]').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const c = await App.guardarConfiguracion({ 'grupos.omitir_grupos': ev.target.omitir.value });
        ev.target.omitir.value = c['grupos.omitir_grupos'];
        UI.toast('Grupos a omitir guardados.', 'success');
      } catch (err) { UI.toast(err.message, 'error'); }
    });
    el.querySelector('[data-form="opina"]').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      try {
        await App.guardarConfiguracion({ 'opina.muestra_minima': f.muestra.value, 'opina.campus': f.campus.value, 'opina.solo_presencial': f.presencial.checked ? '1' : '0' });
        UI.toast('Parámetros de OPINA guardados.', 'success');
      } catch (err) { UI.toast(UI.listaErrores(err).lineas[0] || err.message, 'error'); }
    });
  }

  function mount(container) {
    el = container;
    container.innerHTML = plantilla();
    enlazar();
    cargarTarifas();
    cargarContratos();
    cargarMotivos();
    cargarCatalogo();
    cargarConfig();
  }

  return { mount };
})();
