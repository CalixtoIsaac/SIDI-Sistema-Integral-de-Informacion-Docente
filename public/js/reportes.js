/**
 * Reportes de Nacional (05 §8; HU-12 Descuentos, HU-13 Incidencias con hoja Detalle).
 *
 *  - Selector de quincena con chip Abierta/Cerrada.
 *  - Tarjeta DESCUENTO-PREPA Qnn.xlsx: lo que se incluirá (pendientes con fecha ≤ fin de la quincena),
 *    "Revisar / quitar alguna" (las quitadas pasan a la siguiente quincena) y avisos antes de descargar.
 *  - Tarjeta INCIDENCIAS PREPA Qnn.xlsx: pagos que se incluirán (se pueden quitar los manuales pendientes)
 *    y avisos. Las suplencias siguen a su falta: si se quita la falta, su pago también se queda fuera.
 *  - Avisos con botón "Corregir" (abre ahí mismo la falta, la suplencia o el pago) y el error de la última
 *    descarga visible en la tarjeta.
 *  - Enviar a Nacional (HU-25): vista previa del correo (para, asunto, cuerpo con variables, adjuntos), se puede
 *    editar solo para este envío; borrador de Outlook (.eml) o mailto; bloqueado con avisos rojos; historial.
 *  - Cerrar / reabrir la quincena (impide cambios en sus faltas e incidencias).
 *  - Debajo: inasistencias por semestre (HU-14, public/js/inasistencias.js).
 *
 *  Rutas: GET /quincenas · GET /quincenas/actual · PATCH /quincenas/:id
 *         GET /reportes/descuentos/validar · GET /reportes/descuentos (descarga)
 *         GET /reportes/incidencias/validar · GET /reportes/incidencias (descarga)
 *         GET /reportes/enviar/vista-previa · POST /reportes/enviar · GET /reportes/envios
 */
const Reportes = (() => {
  let el = null;
  let selector = null;
  let val = { descuentos: null, incidencias: null };
  const excluirFaltas = new Set();
  const excluirIncidencias = new Set();
  const abiertos = { descuentos: false, incidencias: false };
  const errores = { descuentos: null, incidencias: null };
  let correoEditado = null; // { para, cc, asunto, cuerpo } solo para el próximo envío
  let ultimaVista = null;
  let pidiendoVista = 0;

  // ------------------------------------------------------------------ avisos agrupados
  /**
   * Avisos agrupados por tipo. `itemDe(aviso)` → { etiqueta, clave } ; `clave` ('falta:ID:TIPO' o
   * 'incidencia:ID:TIPO') abre ahí mismo el formulario para corregirlo (botón "Corregir").
   */
  function avisosAgrupados(avisos, itemDe, { bloqueada = false } = {}) {
    const porTipo = new Map();
    for (const a of avisos) {
      if (!porTipo.has(a.tipo)) porTipo.set(a.tipo, new Map());
      const it = itemDe(a);
      if (it && !porTipo.get(a.tipo).has(it.clave)) porTipo.get(a.tipo).set(it.clave, it);
    }
    if (!porTipo.size) return `<ul class="aviso-lista"><li class="ok">${UI.icon('check')}<span>Sin avisos: listo para descargar.</span></li></ul>`;
    const MAX = 8;
    return `<ul class="aviso-lista">${[...porTipo].map(([tipo, items]) => {
      const lista = [...items.values()];
      return `<li class="warn">${UI.icon('warning')}<span class="grow"><strong>${UI.escape(Comun.aviso(tipo))}</strong> (${lista.length})
        ${lista.length ? `<span class="aviso-items">${lista.slice(0, MAX).map((it) => bloqueada
          ? `<span class="small">${UI.escape(it.etiqueta)}</span>`
          : `<button type="button" class="aviso-corregir" data-corregir="${UI.escape(it.clave)}" title="Corregir">${UI.escape(it.etiqueta)} <span class="aviso-corregir-txt">${UI.icon('pencil')}Corregir</span></button>`).join('')}
          ${lista.length > MAX ? `<span class="small muted">y ${lista.length - MAX} más</span>` : ''}</span>` : ''}</span></li>`;
    }).join('')}</ul>`;
  }

  /** Error de la última descarga: se queda visible en la tarjeta hasta volver a intentar. */
  function errorHtml(tipo) {
    const e = errores[tipo];
    if (!e) return '';
    return `<div class="alert alert-error alert-flex" role="alert">${UI.icon('warning')}<div><strong>No se pudo generar el archivo.</strong>
      <p class="small">${UI.escape(e)}</p><p class="small muted">Corrige el dato y vuelve a descargar. Nada quedó reportado.</p></div></div>`;
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
          ${avisosAgrupados(avisos, (a) => {
            const f = porFalta.get(a.faltaId);
            return f ? { etiqueta: `${f.nombre}${a.crn ? ` · CRN ${a.crn}` : ''}${f.fecha ? ` · ${UI.fecha(f.fecha)}` : ''}`, clave: `falta:${a.faltaId}:${a.tipo}` } : null;
          }, { bloqueada: q.cerrada })}</div>
        ${errorHtml('descuentos')}
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
          ${avisosAgrupados(avisos, (a) => {
            const i = porId.get(a.incidenciaId);
            return i ? { etiqueta: `${i.nombre}${i.origen === 'suplencia' ? ' · suplencia' : ''}`, clave: `incidencia:${a.incidenciaId}:${a.tipo}` } : null;
          }, { bloqueada: q.cerrada })}</div>
        ${errorHtml('incidencias')}
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

  // ------------------------------------------------------------------ Enviar a Nacional (HU-25)
  function paramsExcluidos() {
    const p = new URLSearchParams({ quincenaId: selector.quincena().id });
    if (excluirFaltas.size) p.set('excluir', [...excluirFaltas].join(','));
    if (excluirIncidencias.size) p.set('excluirIncidencias', [...excluirIncidencias].join(','));
    return p;
  }

  async function cargarEnvio() {
    const box = el.querySelector('#repEnvio');
    const q = selector.quincena();
    if (!box || !q) return;
    const n = ++pidiendoVista;
    const p = paramsExcluidos();
    if (correoEditado) Object.entries(correoEditado).forEach(([k, v]) => p.set(k, v));
    try {
      const [vista, hist] = await Promise.all([UI.api(`/reportes/enviar/vista-previa?${p}`), UI.api(`/reportes/envios?quincenaId=${q.id}`)]);
      if (n !== pidiendoVista || !el.isConnected) return;
      ultimaVista = vista;
      box.innerHTML = tarjetaEnvio(q, vista, hist.envios);
    } catch (err) {
      if (n === pidiendoVista) box.innerHTML = `<div class="card-body"><div class="alert alert-error">${UI.escape(err.message)}</div></div>`;
    }
  }

  function tarjetaEnvio(q, v, envios) {
    const rojos = v.rojos || [];
    const resultado = { borrador_generado: 'Borrador de Outlook', mailto_abierto: 'Correo (mailto)', error: 'Error' };
    return `
      <div class="card-header"><div><h3>${UI.icon('mail')}Enviar a Nacional</h3>
        <p class="card-sub">Vista previa del correo con los dos archivos. Se arma con lo de Configuración → Correo a Nacional.</p></div>
        <button type="button" class="btn btn-outline btn-sm" data-envio="editar">${UI.icon('pencil')}Editar este correo</button></div>
      <div class="card-body stack">
        <div class="correo-preview">
          <dl class="correo-campos">
            <dt>Para</dt><dd>${v.para.length ? v.para.map(UI.escape).join(', ') : '<span class="cell-muted">— sin destinatarios —</span>'}</dd>
            ${v.cc.length ? `<dt>CC</dt><dd>${v.cc.map(UI.escape).join(', ')}</dd>` : ''}
            ${v.cco.length ? `<dt>CCO</dt><dd>${v.cco.map(UI.escape).join(', ')}</dd>` : ''}
            <dt>Asunto</dt><dd><strong>${UI.escape(v.asunto)}</strong></dd>
            <dt>Adjuntos</dt><dd>${v.archivos.map((a) => `<span class="chip">${UI.icon('file')}${UI.escape(a)}</span>`).join(' ')}</dd>
          </dl>
          <div class="correo-cuerpo">${UI.escape(v.cuerpo)}</div>
          ${correoEditado ? `<p class="small muted">${UI.icon('info')}Editado solo para este envío. <button type="button" class="link-btn small" data-envio="restaurar">Volver al de Configuración</button></p>` : ''}
        </div>
        ${rojos.length
          ? `<div class="alert alert-warning alert-flex">${UI.icon('warning')}<div><strong>No se puede enviar todavía: hay ${rojos.length} aviso(s) que corregir.</strong>
              <p class="small">${[...new Set(rojos.map((r) => Comun.aviso(r.tipo)))].map(UI.escape).join(' · ')}. Usa los botones "Corregir" de las tarjetas de arriba.</p></div></div>`
          : ''}
        <div class="row">
          <button type="button" class="btn btn-primary" data-envio="borrador" ${rojos.length || !v.para.length ? 'disabled' : ''}>${UI.icon('mail')}Abrir borrador de Outlook</button>
          <button type="button" class="btn btn-outline" data-envio="mailto" ${rojos.length || !v.para.length ? 'disabled' : ''}>Usar mi programa de correo</button>
          <span class="small muted">${q.cerrada ? 'Quincena cerrada: se adjuntan los archivos tal como se reportaron.' : `Al generar el correo, las faltas incluidas quedan reportadas en ${UI.escape(q.etiqueta)}.`}</span>
        </div>
        <details class="mas" ${envios.length ? '' : 'hidden'}><summary>Historial de envíos de ${UI.escape(q.etiqueta)} (${envios.length})</summary>
          <div class="table-wrap"><table class="table table-compact">
            <thead><tr><th>Fecha</th><th>Cómo</th><th>Para</th><th>Asunto</th></tr></thead>
            <tbody>${envios.map((x) => `<tr>
              <td class="nowrap">${UI.escape(x.enviadoEn)}</td>
              <td>${x.resultado === 'error' ? `<span class="badge badge-danger badge-plain" title="${UI.escape(x.detalleError || '')}">Error</span>` : UI.escape(resultado[x.resultado] || x.resultado)}</td>
              <td class="small" style="white-space:normal">${x.para.map(UI.escape).join(', ')}</td>
              <td class="small" style="white-space:normal">${UI.escape(x.asunto)}</td></tr>`).join('')}</tbody>
          </table></div>
        </details>
      </div>`;
  }

  async function editarCorreo() {
    if (!ultimaVista) return;
    const base = correoEditado || { para: ultimaVista.para.join('; '), cc: ultimaVista.cc.join('; '), asunto: ultimaVista.plantilla.asunto, cuerpo: ultimaVista.plantilla.cuerpo };
    const r = await UI.formModal({
      title: 'Editar este correo',
      description: 'Solo cambia este envío. Para cambiarlo siempre, ve a Configuración → Correo a Nacional. Variables: {quincena} {periodo} {fecha_pago} {total_descontado} {num_faltas} {num_pagos}.',
      fields: [
        { name: 'para', label: 'Para (separados por ;)', required: true },
        { name: 'cc', label: 'CC (opcional)' },
        { name: 'asunto', label: 'Asunto', required: true, maxlength: 200 },
        { name: 'cuerpo', label: 'Cuerpo', type: 'textarea', rows: 9, maxlength: 5000 }
      ],
      values: base,
      submitText: 'Ver vista previa',
      onSubmit: (v) => v
    });
    if (!r) return;
    correoEditado = { para: r.para, cc: r.cc || '', asunto: r.asunto, cuerpo: r.cuerpo || '' };
    cargarEnvio();
  }

  /** Genera el correo: borrador .eml (se descarga y Outlook lo abre listo para Enviar) o mailto + descarga de los 2 Excel. */
  async function enviar(modo, boton) {
    const q = selector.quincena();
    if (!q.cerrada) {
      const ok = await UI.confirm({
        title: `¿Generar el correo de ${q.etiqueta}?`,
        message: `Se generan los dos Excel y las faltas pendientes incluidas quedan reportadas en ${q.etiqueta}, igual que al descargarlos.`,
        confirmText: modo === 'borrador' ? 'Generar borrador' : 'Abrir correo'
      });
      if (!ok) return false;
    }
    const body = { quincenaId: q.id, modo };
    if (excluirFaltas.size) body.excluir = [...excluirFaltas].join(',');
    if (excluirIncidencias.size) body.excluirIncidencias = [...excluirIncidencias].join(',');
    if (correoEditado) Object.assign(body, correoEditado);
    UI.setBusy(boton, true);
    let hecho = false;
    try {
      const res = await fetch('/api/reportes/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) {
        let data = null;
        try { data = await res.json(); } catch { /* sin cuerpo */ }
        const err = new Error((data && (data.error || data.mensaje)) || `Error ${res.status}`);
        err.code = data && data.code;
        throw err;
      }
      if (modo === 'borrador') {
        const cd = res.headers.get('Content-Disposition') || '';
        const m = cd.match(/filename="?([^";]+)"?/i);
        const url = URL.createObjectURL(await res.blob());
        const a = document.createElement('a');
        a.href = url; a.download = m ? decodeURIComponent(m[1]) : `Reportes PREPA ${q.etiqueta}.eml`;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        UI.toast('Se descargó el borrador: ábrelo, revisa y da clic en Enviar en Outlook.', 'success');
      } else {
        const r = await res.json();
        window.location.href = r.mailto;
        await UI.confirm({
          title: 'Adjunta los dos archivos',
          message: 'Se abrió tu programa de correo con los destinatarios, el asunto y el texto. Descarga los dos archivos y adjúntalos antes de enviar.',
          detailHtml: `<div class="stack">${r.archivos.map((f) => `<a class="btn btn-outline" href="${UI.escape(f.url)}" download>${UI.icon('download')}${UI.escape(f.nombre)}</a>`).join('')}</div>`,
          confirmText: 'Listo', cancelText: 'Cerrar'
        });
      }
      hecho = true;
    } catch (err) {
      UI.toast(err.code === 'AVISOS_ROJOS' ? 'Hay avisos que corregir antes de enviar.' : `No se pudo generar el correo: ${err.message}`, 'error');
    } finally {
      UI.setBusy(boton, false);
      await selector.recargar();
      cargar();
    }
    return hecho;
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
      cargarEnvio();
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
    errores[tipo] = null;
    try {
      const nombre = await UI.descargar(`/reportes/${tipo}?${params}`, `${tipo}.xlsx`);
      UI.toast(`Se descargó ${nombre}.`, 'success');
    } catch (err) {
      errores[tipo] = err.message;
      UI.toast('No se pudo generar el archivo: revisa el aviso en la tarjeta.', 'error');
    } finally {
      UI.setBusy(boton, false);
      await selector.recargar();
      cargar();
    }
  }

  /** Contrato de un CRN que no lo tiene (aviso SIN_CONTRATO de Descuentos). */
  async function capturarContratoCrn(falta) {
    const r = await UI.formModal({
      title: `Contrato del CRN ${falta.asignatura.crn || ''}`,
      description: `${falta.docente.nombre} · ${falta.asignatura.materia || ''}. Va en la columna "Contrato" del Excel de Descuentos.`,
      fields: [{ name: 'numContrato', label: 'Número de contrato', required: true, maxlength: 15, inputmode: 'numeric' }],
      values: { numContrato: '' },
      onSubmit: (v) => UI.api(`/asignaturas/${falta.asignatura.id}`, { method: 'PUT', body: { numContrato: v.numContrato.trim() } })
    });
    if (r) UI.toast('Contrato guardado.', 'success');
    return Boolean(r);
  }

  /** Botón "Corregir" de un aviso: abre el formulario que lo resuelve sin salir de Reportes. */
  async function corregir(clave) {
    const [objeto, idTexto, tipo] = clave.split(':');
    const id = Number(idTexto);
    let hecho = false;
    try {
      if (objeto === 'falta') {
        const { falta } = await UI.api(`/faltas/${id}`);
        hecho = tipo === 'SIN_CONTRATO' && falta.asignatura ? await capturarContratoCrn(falta) : await Faltas.editar(falta);
      } else {
        const inc = val.incidencias && val.incidencias.incidencias.find((i) => i.id === id);
        if (inc && inc.origen === 'suplencia' && inc.faltaIds && inc.faltaIds.length) {
          // Varias faltas agrupadas en un solo pago: se corrige la primera y las demás se sincronizan al generar
          const { falta } = await UI.api(`/faltas/${inc.faltaIds[0]}`);
          hecho = await Faltas.asignarSuplente(falta);
        } else {
          const { incidencia } = await UI.api(`/incidencias/${id}`);
          hecho = await Incidencias.nuevo(incidencia);
        }
      }
    } catch (err) { UI.toast(err.message, 'error'); }
    if (hecho) { errores.descuentos = null; errores.incidencias = null; cargar(); }
  }

  async function cerrar(cerrada) {
    const q = selector.quincena();
    if (cerrada && App.configuracion()['correo.enviar_al_cerrar'] === '1') {
      let envios = [];
      try { ({ envios } = await UI.api(`/reportes/envios?quincenaId=${q.id}`)); } catch { /* sin bitácora */ }
      if (!envios.some((x) => x.resultado !== 'error')) {
        const primero = await UI.confirm({
          title: `Aún no se envía ${q.etiqueta} a Nacional`,
          message: '¿Quieres generar el correo con los dos archivos antes de cerrar?',
          confirmText: 'Enviar primero', cancelText: 'Cerrar sin enviar'
        });
        if (primero) {
          const boton = el.querySelector('[data-envio="borrador"]');
          if (!(await enviar(App.configuracion()['correo.modo'] === 'mailto' ? 'mailto' : 'borrador', boton || document.createElement('button')))) return;
        }
      }
    }
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
    correoEditado = null;
    el.innerHTML = `
      <section class="page-header">
        <div><h2>Reportes de Nacional</h2><p class="muted">Los dos Excel de la quincena, con el formato de la plantilla de Nacional.</p></div>
      </section>
      <div class="toolbar"><div id="repSelector"></div></div>
      <div class="grid-2" id="repTarjetas"></div>
      <section class="card reporte-card mt" id="repEnvio"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></section>
      <div class="mt" id="repCierre"></div>
      <section class="card reporte-card mt" id="repInasistencias"></section>`;
    selector = Comun.selectorQuincena(el.querySelector('#repSelector'), {
      onChange: () => { excluirFaltas.clear(); excluirIncidencias.clear(); errores.descuentos = null; errores.incidencias = null; correoEditado = null; cargar(); }
    });
    el.addEventListener('click', (e) => {
      const k = e.target.closest('[data-corregir]');
      if (k) { corregir(k.dataset.corregir); return; }
      const env = e.target.closest('[data-envio]');
      if (env) {
        const accion = env.dataset.envio;
        if (accion === 'editar') editarCorreo();
        else if (accion === 'restaurar') { correoEditado = null; cargarEnvio(); }
        else enviar(accion, env);
        return;
      }
      const r = e.target.closest('[data-revisar]');
      if (r) { abiertos[r.dataset.revisar] = !abiertos[r.dataset.revisar]; pintar(); return; }
      const d = e.target.closest('[data-descargar]');
      if (d) { descargar(d.dataset.descargar, d); return; }
      const c = e.target.closest('[data-cerrar]');
      if (c) cerrar(c.dataset.cerrar === 'true');
    });
    el.addEventListener('change', (e) => {
      const f = e.target.closest('[data-excluir-falta]');
      if (f) { const id = Number(f.dataset.excluirFalta); if (f.checked) excluirFaltas.delete(id); else excluirFaltas.add(id); pintar(); cargarEnvio(); return; }
      const i = e.target.closest('[data-excluir-incidencia]');
      if (i) { const id = Number(i.dataset.excluirIncidencia); if (i.checked) excluirIncidencias.delete(id); else excluirIncidencias.add(id); pintar(); cargarEnvio(); }
    });
    selector.recargar().then(cargar);
    Inasistencias.montar(el.querySelector('#repInasistencias'));
  }

  return { mount };
})();
