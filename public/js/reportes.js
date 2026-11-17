/**
 * Reportes de Nacional (05 §8; HU-12 Descuentos, HU-13 Incidencias con hoja Detalle).
 *
 *  - Selector de quincena con chip Abierta/Cerrada.
 *  - Tarjeta DESCUENTO-PREPA Qnn.xlsx: lo que se incluirá (pendientes con fecha ≤ fin de la quincena),
 *    "Revisar / quitar alguna" (las quitadas pasan a la siguiente quincena) y avisos antes de descargar.
 *  - Tarjeta INCIDENCIAS PREPA Qnn.xlsx: pagos que se incluirán (se pueden quitar los manuales pendientes)
 *    y avisos. Las suplencias siguen a su falta: si se quita la falta, su pago también se queda fuera.
 *  - Cerrar / reabrir la quincena (impide cambios en sus faltas e incidencias).
 *
 *  Rutas: GET /quincenas · GET /quincenas/actual · PATCH /quincenas/:id
 *         GET /reportes/descuentos/validar · GET /reportes/descuentos (descarga)
 *         GET /reportes/incidencias/validar · GET /reportes/incidencias (descarga)
 */
const Reportes = (() => {
  let el = null;
  let selector = null;
  let val = { descuentos: null, incidencias: null };
  const excluirFaltas = new Set();
  const excluirIncidencias = new Set();
  const abiertos = { descuentos: false, incidencias: false };

  // ------------------------------------------------------------------ avisos agrupados
  function avisosAgrupados(avisos, etiquetaDe) {
    const porTipo = new Map();
    for (const a of avisos) {
      if (!porTipo.has(a.tipo)) porTipo.set(a.tipo, []);
      porTipo.get(a.tipo).push(etiquetaDe(a));
    }
    if (!porTipo.size) return `<ul class="aviso-lista"><li class="ok">${UI.icon('check')}<span>Sin avisos: listo para descargar.</span></li></ul>`;
    return `<ul class="aviso-lista">${[...porTipo].map(([tipo, quienes]) => {
      const unicos = [...new Set(quienes.filter(Boolean))];
      return `<li class="warn">${UI.icon('warning')}<span><strong>${UI.escape(Comun.aviso(tipo))}</strong> (${quienes.length})${unicos.length ? `<br><span class="small">${UI.escape(unicos.slice(0, 6).join(' · '))}${unicos.length > 6 ? ` y ${unicos.length - 6} más` : ''}</span>` : ''}</span></li>`;
    }).join('')}</ul>`;
  }

  // ------------------------------------------------------------------ tarjeta Descuentos
  function tarjetaDescuentos(q) {
    const v = val.descuentos;
    if (!v) return '<div class="card-body"><span class="skeleton" style="height:18px"></span></div>';
    const incluidas = v.filas.filter((f) => !excluirFaltas.has(f.faltaId));
    const enExcel = incluidas.filter((f) => f.vaEnDescuentos);
    const total = enExcel.reduce((s, f) => s + f.monto, 0);
    const docentes = new Set(enExcel.map((f) => f.nombre)).size;
    const imss = incluidas.length - enExcel.length;
    const pendientes = v.filas.filter((f) => f.pendiente);
    const pendientesIncluidas = pendientes.filter((f) => !excluirFaltas.has(f.faltaId));
    const porFalta = new Map(v.filas.map((f) => [f.faltaId, f]));
    const avisos = v.avisos.filter((a) => !excluirFaltas.has(a.faltaId));
    return `
      <div class="card-body stack">
        <div class="reporte-cifras">
          <div><strong>${enExcel.length}</strong><span>falta(s)</span></div>
          <div><strong>${docentes}</strong><span>docente(s)</span></div>
          <div><strong>${UI.dinero(total)}</strong><span>a descontar</span></div>
        </div>
        ${imss ? `<p class="small muted">${UI.icon('info')}${imss} falta(s) justificadas IMSS no van en Descuentos: salen en la hoja Detalle de Incidencias.</p>` : ''}
        ${q.cerrada
          ? `<p class="small muted">${UI.icon('check')}Quincena cerrada: el Excel se vuelve a generar con lo que ya se reportó.</p>`
          : `<p class="small">Incluirá <strong>${pendientesIncluidas.length}</strong> falta(s) pendientes con fecha ≤ ${UI.escape(UI.fecha(q.fechaFin))}${excluirFaltas.size ? ` · <strong>${excluirFaltas.size}</strong> quitada(s) para la siguiente quincena` : ''}
              ${pendientes.length ? `<button type="button" class="link-btn" data-revisar="descuentos">${abiertos.descuentos ? 'Ocultar' : 'Revisar / quitar alguna'}</button>` : ''}</p>`}
        ${abiertos.descuentos && !q.cerrada ? `
          <div class="table-wrap revisar-lista"><table class="table table-compact">
            <thead><tr><th>Incluir</th><th>Docente</th><th>Fecha</th><th>CRN</th><th class="num">Monto</th><th></th></tr></thead>
            <tbody>${pendientes.map((f) => `<tr>
              <td><input type="checkbox" class="check-input" data-excluir-falta="${f.faltaId}"${excluirFaltas.has(f.faltaId) ? '' : ' checked'} aria-label="Incluir falta de ${UI.escape(f.nombre)}"></td>
              <td>${UI.escape(f.nombre)}</td><td class="nowrap">${f.fecha ? UI.escape(UI.fecha(f.fecha)) : UI.escape(f.fechaTexto || '—')}</td>
              <td>${UI.guion(f.crn)}</td><td class="num">${UI.dinero(f.monto)}</td>
              <td>${f.vaEnDescuentos ? '' : '<span class="badge badge-info badge-plain">IMSS · solo Detalle</span>'}</td></tr>`).join('')}</tbody>
          </table></div>` : ''}
        <div><p class="section-title">Avisos antes de descargar</p>
          ${avisosAgrupados(avisos, (a) => { const f = porFalta.get(a.faltaId); return f ? `${f.nombre}${a.crn ? ` (CRN ${a.crn})` : ''}` : ''; })}</div>
        <div class="row"><button type="button" class="btn btn-primary" data-descargar="descuentos">${UI.icon('download')}Descargar</button>
          <span class="small muted">Las faltas incluidas quedan reportadas en ${UI.escape(q.etiqueta)}.</span></div>
      </div>`;
  }

  // ------------------------------------------------------------------ tarjeta Incidencias
  /** Las suplencias no se quitan aquí: siguen a su falta (si la falta se quita en Descuentos, su pago también). */
  function tarjetaIncidencias(q) {
    const v = val.incidencias;
    if (!v) return '<div class="card-body"><span class="skeleton" style="height:18px"></span></div>';
    const incluidas = v.incidencias.filter((i) => !excluirIncidencias.has(i.id));
    const total = incluidas.reduce((s, i) => s + i.importeTotal, 0);
    const suplencias = incluidas.filter((i) => i.origen === 'suplencia').length;
    const manualesPendientes = v.incidencias.filter((i) => i.pendiente && i.origen === 'manual');
    const detalle = val.descuentos ? new Set(val.descuentos.filas.filter((f) => !excluirFaltas.has(f.faltaId)).map((f) => f.nombre)).size : 0;
    const porId = new Map(v.incidencias.map((i) => [i.id, i]));
    const avisos = v.avisos.filter((a) => !excluirIncidencias.has(a.incidenciaId));
    return `
      <div class="card-body stack">
        <div class="reporte-cifras">
          <div><strong>${incluidas.length}</strong><span>pago(s)${suplencias ? ` · ${suplencias} de suplencias` : ''}</span></div>
          <div><strong>${detalle}</strong><span>docente(s) en Detalle</span></div>
          <div><strong>${UI.dinero(total)}</strong><span>importe total</span></div>
        </div>
        ${q.cerrada ? '' : `<p class="small">Incluye los pagos de la quincena, los manuales pendientes y las suplencias de las faltas que se reporten.
          ${manualesPendientes.length ? `<button type="button" class="link-btn" data-revisar="incidencias">${abiertos.incidencias ? 'Ocultar' : 'Revisar / quitar alguno'}</button>` : ''}</p>`}
        ${abiertos.incidencias && !q.cerrada ? `
          <div class="table-wrap revisar-lista"><table class="table table-compact">
            <thead><tr><th>Incluir</th><th>Docente</th><th>Detalle</th><th class="num">Importe</th></tr></thead>
            <tbody>${manualesPendientes.map((i) => `<tr>
              <td><input type="checkbox" class="check-input" data-excluir-incidencia="${i.id}"${excluirIncidencias.has(i.id) ? '' : ' checked'} aria-label="Incluir pago de ${UI.escape(i.nombre)}"></td>
              <td>${UI.escape(i.nombre)}</td><td class="small" style="white-space:normal">${UI.escape(i.detalle)}</td><td class="num">${UI.dinero(i.importeTotal)}</td></tr>`).join('')}</tbody>
          </table></div>` : ''}
        <div><p class="section-title">Avisos antes de descargar</p>
          ${avisosAgrupados(avisos, (a) => { const i = porId.get(a.incidenciaId); return i ? i.nombre : ''; })}</div>
        <div class="row"><button type="button" class="btn btn-primary" data-descargar="incidencias">${UI.icon('download')}Descargar</button>
          <span class="small muted">Hojas Incidencia y detalle, con valores.</span></div>
      </div>`;
  }

  // ------------------------------------------------------------------ pintar
  function pintar() {
    const q = selector.quincena();
    if (!q) { el.querySelector('#repTarjetas').innerHTML = '<div class="card"><div class="empty-state"><p class="muted">No hay quincenas cargadas.</p></div></div>'; return; }
    el.querySelector('#repTarjetas').innerHTML = `
      <section class="card reporte-card">
        <div class="card-header"><div><h3>${UI.icon('file')}DESCUENTO-PREPA ${UI.escape(q.etiqueta)}.xlsx</h3><p class="card-sub">Faltas a descontar (con fila de total).</p></div></div>
        ${tarjetaDescuentos(q)}
      </section>
      <section class="card reporte-card">
        <div class="card-header"><div><h3>${UI.icon('file')}INCIDENCIAS PREPA ${UI.escape(q.etiqueta)}.xlsx</h3><p class="card-sub">Pagos adicionales y suplencias + hoja detalle.</p></div></div>
        ${tarjetaIncidencias(q)}
      </section>`;
    el.querySelector('#repCierre').innerHTML = q.cerrada
      ? `<div class="cierre-box cerrada"><div><strong>${UI.icon('check')}${UI.escape(q.etiqueta)} está cerrada.</strong>
           <p class="small muted">Ya se envió a Nacional: sus faltas e incidencias no se pueden cambiar.</p></div>
           <button type="button" class="btn btn-outline" data-cerrar="false">Reabrir quincena</button></div>`
      : `<div class="cierre-box"><div><strong>¿Ya enviaste los dos archivos a Nacional?</strong>
           <p class="small muted">Al cerrar ${UI.escape(q.etiqueta)} ya no se pueden cambiar sus faltas ni sus pagos. Fecha de pago: ${UI.escape(UI.fecha(q.fechaPago))}.</p></div>
           <button type="button" class="btn btn-outline" data-cerrar="true">${UI.icon('check')}Cerrar quincena</button></div>`;
  }

  async function cargar() {
    const q = selector.quincena();
    val = { descuentos: null, incidencias: null };
    if (!q) { pintar(); return; }
    pintar();
    try {
      const [d, i] = await Promise.all([
        UI.api(`/reportes/descuentos/validar?quincenaId=${q.id}`),
        UI.api(`/reportes/incidencias/validar?quincenaId=${q.id}`)
      ]);
      if (selector.quincena() !== q || !el.isConnected) return;
      val = { descuentos: d, incidencias: i };
      // Lo excluido que ya no aparece se olvida
      const faltas = new Set(d.filas.map((f) => f.faltaId));
      [...excluirFaltas].forEach((id) => { if (!faltas.has(id)) excluirFaltas.delete(id); });
      const incs = new Set(i.incidencias.map((x) => x.id));
      [...excluirIncidencias].forEach((id) => { if (!incs.has(id)) excluirIncidencias.delete(id); });
      pintar();
    } catch (err) {
      el.querySelector('#repTarjetas').innerHTML = `<div class="card"><div class="card-body"><div class="alert alert-error">${UI.escape(err.message)}</div></div></div>`;
    }
  }

  // ------------------------------------------------------------------ acciones
  async function descargar(tipo, boton) {
    const q = selector.quincena();
    const params = new URLSearchParams({ quincenaId: q.id });
    if (excluirFaltas.size) params.set('excluir', [...excluirFaltas].join(','));
    if (tipo === 'incidencias' && excluirIncidencias.size) params.set('excluirIncidencias', [...excluirIncidencias].join(','));
    const pendientes = tipo === 'descuentos'
      ? val.descuentos.filas.filter((f) => f.pendiente && !excluirFaltas.has(f.faltaId)).length
      : val.incidencias.incidencias.filter((i) => i.pendiente && !excluirIncidencias.has(i.id)).length;
    if (pendientes && !q.cerrada) {
      const ok = await UI.confirm({
        title: `¿Generar el Excel de ${tipo === 'descuentos' ? 'Descuentos' : 'Incidencias'}?`,
        message: `${pendientes} ${tipo === 'descuentos' ? 'falta(s) pendientes' : 'pago(s) pendientes'} quedarán reportados en ${q.etiqueta}. Puedes volver a descargarlo después.`,
        confirmText: 'Generar y descargar'
      });
      if (!ok) return;
    }
    UI.setBusy(boton, true);
    try {
      const nombre = await UI.descargar(`/reportes/${tipo}?${params}`, `${tipo}.xlsx`);
      UI.toast(`Se descargó ${nombre}.`, 'success');
    } catch (err) {
      UI.toast(err.message, 'error');
    } finally {
      UI.setBusy(boton, false);
      await selector.recargar();
      cargar();
    }
  }

  async function cerrar(cerrada) {
    const q = selector.quincena();
    const ok = await UI.confirm(cerrada
      ? { title: `¿Cerrar ${q.etiqueta}?`, message: 'Hazlo cuando ya se hayan enviado los reportes a Nacional. Sus faltas e incidencias ya no se podrán cambiar.', confirmText: 'Cerrar quincena' }
      : { title: `¿Reabrir ${q.etiqueta}?`, message: 'Se podrán volver a cambiar sus faltas e incidencias. Si cambias algo, vuelve a enviar los archivos a Nacional.', confirmText: 'Reabrir', danger: true });
    if (!ok) return;
    try {
      await UI.api(`/quincenas/${q.id}`, { method: 'PATCH', body: { cerrada } });
      UI.toast(cerrada ? `${q.etiqueta} quedó cerrada.` : `${q.etiqueta} se reabrió.`, 'success');
      await selector.recargar();
      cargar();
    } catch (err) { UI.toast(err.message, 'error'); }
  }

  function mount(container) {
    container.innerHTML = '<div class="vista" data-vista="reportes"></div>';
    el = container.firstElementChild;
    excluirFaltas.clear();
    excluirIncidencias.clear();
    el.innerHTML = `
      <section class="page-header">
        <div><h2>Reportes de Nacional</h2><p class="muted">Los dos Excel de la quincena, con el formato de la plantilla de Nacional.</p></div>
      </section>
      <div class="toolbar"><div id="repSelector"></div></div>
      <div class="grid-2" id="repTarjetas"></div>
      <div class="mt" id="repCierre"></div>`;
    selector = Comun.selectorQuincena(el.querySelector('#repSelector'), {
      onChange: () => { excluirFaltas.clear(); excluirIncidencias.clear(); cargar(); }
    });
    el.addEventListener('click', (e) => {
      const r = e.target.closest('[data-revisar]');
      if (r) { abiertos[r.dataset.revisar] = !abiertos[r.dataset.revisar]; pintar(); return; }
      const d = e.target.closest('[data-descargar]');
      if (d) { descargar(d.dataset.descargar, d); return; }
      const c = e.target.closest('[data-cerrar]');
      if (c) cerrar(c.dataset.cerrar === 'true');
    });
    el.addEventListener('change', (e) => {
      const f = e.target.closest('[data-excluir-falta]');
      if (f) { const id = Number(f.dataset.excluirFalta); if (f.checked) excluirFaltas.delete(id); else excluirFaltas.add(id); pintar(); return; }
      const i = e.target.closest('[data-excluir-incidencia]');
      if (i) { const id = Number(i.dataset.excluirIncidencia); if (i.checked) excluirIncidencias.delete(id); else excluirIncidencias.add(id); pintar(); }
    });
    selector.recargar().then(cargar);
  }

  return { mount };
})();
