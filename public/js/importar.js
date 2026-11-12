/**
 * Cargas con vista previa (05 §3 y §7). Paso 1: archivo · Paso 2: revisar · Paso 3: confirmar.
 * Nada se guarda hasta confirmar (las vistas previas viven 30 min en el servidor).
 *
 *   Importar.grupos()     HU-02  Excel de grupos docentes   POST /grupos/excel/preview → /confirm
 *   Importar.opina()      HU-08  OPINA (.xlsx/.xlsb)        POST /opina/preview → /confirm
 *   Importar.cv()         HU-20  CV en PDF (varios)         POST /docentes/cv/preview → /confirm (tabla editable)
 *   Importar.contratos()  HU-27  Reporte de contratos       GET /contratos/plantilla · POST /contratos/preview → /confirm
 * Cada una resuelve true si se importó algo.
 */
const Importar = (() => {
  const e = (v) => UI.escape(v);
  const n = (v) => Number(v || 0).toLocaleString('es-MX');
  /** 1 → "1 docente nuevo", 3 → "3 docentes nuevos" */
  const pl = (k, uno, varios) => `${n(k)} ${k === 1 ? uno : varios}`;

  const AVISOS = {
    CRN_INVALIDO: (a) => `Fila ${a.fila}: el CRN no es válido ("${a.detalle}"); se omite.`,
    NOMINA_INVALIDA: (a) => `Fila ${a.fila}: nómina no válida en el CRN ${a.crn} ("${a.detalle}"); se omite.`,
    CRN_VARIOS_DOCENTES: (a) => `CRN ${a.crn} viene con dos docentes (${a.detalle}).`,
    SIN_HORARIO: (a) => `CRN ${a.crn} no trae días ni horas: quedará sin horario.`,
    HORARIO_INVALIDO: (a) => `CRN ${a.crn}: no se pudieron calcular las horas por semana.`,
    NOMBRE_SIN_SEPARADOR: (a) => `Fila ${a.fila}: no se distingue nombre y apellidos en "${a.detalle}"; revisa el nombre después.`,
    VARIOS_PERIODOS: (a) => `El archivo trae varios periodos (${a.detalle}).`,
    CRN_NO_EXISTE: (a) => `Fila ${a.fila}: el CRN ${a.crn} no existe en el periodo; se omite.`,
    NOMINA_NO_CORRESPONDE: (a) => `Fila ${a.fila}: la nómina ${a.archivo} no corresponde al CRN ${a.crn} (es de ${a.docente}).`,
    CONTRATO_INVALIDO: (a) => `Fila ${a.fila}: el contrato del CRN ${a.crn} no es válido ("${a.valor}"); se omite.`
  };
  const textoAviso = (a) => (AVISOS[a.tipo] ? AVISOS[a.tipo](a) : (a.detalle || a.tipo));

  function aviso(tipo, html) {
    const icono = { warn: 'warning', info: 'info', ok: 'check', err: 'alert' }[tipo];
    return `<li class="${tipo}">${UI.icon(icono)}<span>${html}</span></li>`;
  }
  function detalles(titulo, items) {
    if (!items.length) return '';
    return `<details class="mas"><summary>${e(titulo)}</summary><ol>${items.map((x) => `<li>${x}</li>`).join('')}</ol></details>`;
  }
  function cifras(lista) {
    return `<div class="resumen-carga">${lista.map(([v, t]) => `<div><strong>${v}</strong><span>${e(t)}</span></div>`).join('')}</div>`;
  }

  /**
   * Asistente genérico en un modal.
   *  - subir(files) → Promise<preview>
   *  - revisar(preview, cuerpoEl, api) → pinta el paso 2 (api.setConfirmar(texto, habilitado))
   *  - confirmar(preview, cuerpoEl) → Promise<mensaje de éxito>
   */
  function asistente({ titulo, descripcion, accept, multiple = false, textoZona, ayuda, extraPaso1 = '', subir, revisar, confirmar, size = 'lg' }) {
    return new Promise((resolve) => {
      let preview = null;
      let importado = false;
      const dlg = UI.openDialog({
        title: titulo,
        description: descripcion,
        size,
        bodyHtml: `
          <div class="wizard-steps" aria-hidden="true"><span data-w="1">1. Archivo</span><span data-w="2">2. Revisa</span><span data-w="3">3. Confirma</span></div>
          <div data-paso="1">${extraPaso1}<div data-zona></div></div>
          <div data-paso="2" hidden></div>
          <div class="alert alert-error mt" data-error role="alert" hidden></div>`,
        footerHtml: `
          <button type="button" class="btn btn-ghost" data-otro hidden>${UI.icon('chevronLeft')}Elegir otro archivo</button>
          <span class="grow"></span>
          <button type="button" class="btn btn-outline" data-cancelar>Cancelar</button>
          <button type="button" class="btn btn-primary" data-confirmar hidden>${UI.icon('check')}Confirmar e importar</button>`,
        onClose: () => resolve(importado)
      });
      const f = dlg.el;
      const err = f.querySelector('[data-error]');
      const paso1 = f.querySelector('[data-paso="1"]');
      const paso2 = f.querySelector('[data-paso="2"]');
      const btnConfirmar = f.querySelector('[data-confirmar]');
      const btnOtro = f.querySelector('[data-otro]');

      function marcar(paso) {
        f.querySelectorAll('[data-w]').forEach((s) => (Number(s.dataset.w) === paso ? s.setAttribute('aria-current', 'step') : s.removeAttribute('aria-current')));
        paso1.hidden = paso !== 1;
        paso2.hidden = paso === 1;
        btnConfirmar.hidden = paso === 1;
        btnOtro.hidden = paso === 1;
      }
      const api = {
        setConfirmar(texto, habilitado = true) {
          btnConfirmar.innerHTML = `${UI.icon('check')}${e(texto)}`;
          btnConfirmar.disabled = !habilitado;
        },
        error(ex) { if (ex) UI.pintarError(err, ex); else err.hidden = true; }
      };

      const zona = UI.zonaArchivos(f.querySelector('[data-zona]'), {
        accept, multiple, texto: textoZona, ayuda,
        async onArchivos(files) {
          err.hidden = true;
          const caja = f.querySelector('[data-zona]');
          caja.classList.add('dragging');
          caja.querySelector('.dropzone-title').textContent = files.length > 1 ? `Leyendo ${files.length} archivos…` : `Leyendo ${files[0].name}…`;
          try {
            preview = await subir(files);
            paso2.innerHTML = '';
            api.setConfirmar('Confirmar e importar');
            revisar(preview, paso2, api);
            marcar(2);
            btnConfirmar.focus();
          } catch (ex) {
            UI.pintarError(err, ex);
          } finally {
            caja.classList.remove('dragging');
            caja.querySelector('.dropzone-title').textContent = textoZona;
          }
        }
      });
      f.querySelector('[data-cancelar]').addEventListener('click', dlg.close);
      btnOtro.addEventListener('click', () => { err.hidden = true; marcar(1); zona.abrir(); });
      btnConfirmar.addEventListener('click', async () => {
        err.hidden = true;
        UI.setBusy(btnConfirmar, true);
        try {
          const mensaje = await confirmar(preview, paso2);
          if (mensaje === null) { UI.setBusy(btnConfirmar, false); return; } // validación local
          marcar(3);
          importado = true;
          UI.toast(mensaje, 'success');
          dlg.close();
        } catch (ex) {
          UI.pintarError(err, ex);
          UI.setBusy(btnConfirmar, false);
        }
      });
      paso1.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-descargar]');
        if (b) UI.descargar(b.dataset.descargar).catch((ex) => UI.pintarError(err, ex));
      });
      marcar(1);
    });
  }

  function formUnArchivo(campo, file) {
    const fd = new FormData();
    fd.append(campo, file, file.name);
    return fd;
  }

  // ================================================================== HU-02 Excel de grupos
  async function grupos() {
    let motivos = [];
    return asistente({
      titulo: 'Subir Excel de grupos',
      descripcion: 'Archivo GRUPOS_DOCENTES_<PERIODO>.xlsx (hoja "Salida"). Se agregan docentes nuevos y se actualizan sus grupos.',
      accept: '.xlsx,.xlsm,.xls',
      textoZona: 'Arrastra aquí el Excel de grupos',
      ayuda: 'hasta 15 MB',
      subir: (files) => UI.api('/grupos/excel/preview', { method: 'POST', body: formUnArchivo('archivo', files[0]) }),
      revisar(p, el, api) {
        const totalDocentes = p.docentes.nuevos.length + p.docentes.existentes;
        const lista = [];
        if (!p.periodoExiste) lista.push(aviso('info', `El periodo <strong>${e(p.periodo)}</strong> todavía no existe en SIDI; se creará.`));
        if (p.sinTarifa.length) lista.push(aviso('warn', `${p.sinTarifa.length} ${p.sinTarifa.length === 1 ? 'grupo' : 'grupos'} sin tarifa (${p.sinTarifa.map((s) => `${e(s.crn)}: ${s.horasSemana ?? '?'} h/semana`).join(', ')}) → asígnalos después.`));
        if (p.idiomaSugeridoEN) lista.push(aviso('info', `${p.idiomaSugeridoEN} ${p.idiomaSugeridoEN === 1 ? 'grupo' : 'grupos'} con idioma sugerido "Inglés" (versión en inglés o Bachillerato Intercultural). Puedes cambiarlo en la ficha del docente.`));
        if (p.sinContrato) lista.push(aviso('info', `Los contratos no vienen en este archivo: ${p.sinContrato} ${p.sinContrato === 1 ? 'grupo quedará' : 'grupos quedarán'} "Sin contrato". Súbelos en Configuración → Contratos.`));
        if (p.omitidos.length) lista.push(aviso('info', `Grupos ${[...new Set(p.omitidos.map((o) => o.grupo))].map(e).join(' y ')} (en línea) se omiten — se pagan en otro sistema: ${p.omitidos.map((o) => e(o.crn)).join(', ')}.`));
        if (p.noRecontratables.length) lista.push(aviso('warn', `⚠ Vienen ${p.noRecontratables.length} docente(s) marcados como <strong>No recontratable</strong>: ${p.noRecontratables.map((d) => `${e(d.nombre)} (${e(d.nomina)})`).join(', ')}.`));
        if (p.reaparecenInactivos.length) lista.push(aviso('warn', `${p.reaparecenInactivos.length} docente(s) dados de baja vuelven a aparecer (no se reactivan solos; hazlo desde su ficha): ${p.reaparecenInactivos.map((d) => e(d.nombre)).join(', ')}.`));
        p.avisos.forEach((a) => lista.push(aviso('warn', e(textoAviso(a)))));

        el.innerHTML = `
          <p style="margin-bottom:12px"><strong>Periodo detectado: ${e(p.periodo)}</strong> · ${n(p.crn)} grupos · ${n(totalDocentes)} docentes <span class="muted small">(${e(p.archivo)}, ${n(p.filas)} filas)</span></p>
          ${cifras([[p.docentes.nuevos.length, 'docentes nuevos'], [p.docentes.existentes, 'ya existían (se actualizan sus grupos)'],
            [p.grupos.nuevos, 'grupos nuevos'], [p.grupos.cambianDocente.length, 'cambian de docente'], [p.grupos.yaNoVienen.length, 'ya no vienen']])}
          ${detalles(`Ver los ${p.docentes.nuevos.length} docentes nuevos`, p.docentes.nuevos.map((d) => `${e(d.nombre)} (${e(d.nomina)}) · ${d.grupos} ${d.grupos === 1 ? 'grupo' : 'grupos'}`))}
          ${detalles('Ver grupos que cambian de docente', p.grupos.cambianDocente.map((g) => `CRN ${e(g.crn)} · ${e(g.materia)}: ${e(g.antes)} → ${e(g.despues)}`))}
          ${detalles('Ver grupos que ya no vienen', p.grupos.yaNoVienen.map((g) => `CRN ${e(g.crn)} (${e(g.nomina)})`))}
          ${lista.length ? `<ul class="aviso-lista mt">${lista.join('')}</ul>` : ''}
          ${p.sugeridosInactivo.length ? `
            <div class="repeat-item mt">
              <label class="check"><input type="checkbox" data-inactivar>Dar de baja a los ${p.sugeridosInactivo.length} docentes activos que ya no vienen en este semestre</label>
              ${detalles('¿Quiénes?', p.sugeridosInactivo.map((d) => `${e(d.nombre)} (${e(d.nomina)})`))}
              <div class="form-grid mt" data-baja hidden>
                <div class="field"><label for="gBajaMotivo">Motivo <span class="req">*</span></label>
                  <div class="select-wrap"><select class="input select" id="gBajaMotivo"><option value="">— Elige —</option></select></div></div>
                <fieldset class="field" style="border:0;padding:0;margin:0"><legend style="font-size:13px;font-weight:500;margin-bottom:6px">¿Recontratables? <span class="req">*</span></legend>
                  <div class="radio-list"><label><input type="radio" name="gRecont" value="true">Sí</label><label><input type="radio" name="gRecont" value="false">No</label></div></fieldset>
                <div class="field full"><label for="gBajaObs">Observaciones</label>
                  <input class="input" id="gBajaObs" maxlength="1000" placeholder="Si lo dejas vacío: No aparece en el Excel de grupos de ${e(p.periodo)}."></div>
              </div>
            </div>` : ''}`;
        api.setConfirmar('Confirmar e importar');
        const chk = el.querySelector('[data-inactivar]');
        if (chk) {
          chk.addEventListener('change', async () => {
            el.querySelector('[data-baja]').hidden = !chk.checked;
            if (chk.checked && !motivos.length) {
              try { ({ motivos } = await UI.api('/docentes/motivos-baja')); } catch { motivos = []; }
              el.querySelector('#gBajaMotivo').innerHTML = '<option value="">— Elige —</option>' + motivos.map((m) => `<option>${e(m.motivo)}</option>`).join('');
            }
          });
          el.addEventListener('change', (ev) => {
            if (ev.target.id !== 'gBajaMotivo') return;
            const m = motivos.find((x) => x.motivo === ev.target.value);
            if (m && m.recontratableSugerido !== null) el.querySelector(`input[name="gRecont"][value="${m.recontratableSugerido}"]`).checked = true;
          });
        }
      },
      async confirmar(p, el) {
        const chk = el.querySelector('[data-inactivar]');
        const cuerpo = { previewId: p.previewId, inactivarAusentes: Boolean(chk && chk.checked) };
        if (cuerpo.inactivarAusentes) {
          const r = el.querySelector('input[name="gRecont"]:checked');
          cuerpo.baja = { motivo: el.querySelector('#gBajaMotivo').value, recontratable: r ? r.value === 'true' : undefined, observaciones: el.querySelector('#gBajaObs').value.trim() || undefined };
        }
        const r = await UI.api('/grupos/excel/confirm', { method: 'POST', body: cuerpo });
        return `Excel importado: ${pl(r.docentesNuevos, 'docente nuevo', 'docentes nuevos')}, ${pl(r.gruposNuevos, 'grupo nuevo', 'grupos nuevos')} y ${pl(r.gruposActualizados, 'actualizado', 'actualizados')}${r.inactivados ? `; ${pl(r.inactivados, 'dado de baja', 'dados de baja')}` : ''}.`;
      }
    });
  }

  // ================================================================== HU-08 OPINA
  const VERSION = { v1: 'Formato 2024–2025', v2: 'Formato 2026' };
  async function opina() {
    return asistente({
      titulo: 'Subir archivo OPINA',
      descripcion: 'OPINA por alumno (.xlsx o .xlsb). Se cuentan solo los grupos presenciales del campus configurado.',
      accept: '.xlsx,.xlsb,.xls',
      textoZona: 'Arrastra aquí el archivo OPINA',
      ayuda: 'hasta 30 MB',
      subir: (files) => UI.api('/opina/preview', { method: 'POST', body: formUnArchivo('archivo', files[0]) }),
      revisar(p, el, api) {
        const d = p.descartadas || {};
        const totalDesc = p.filas - p.filasFiltradas;
        const lista = [];
        lista.push(aviso('info', `Solo grupos presenciales del campus configurado: se excluyen <strong>${n(totalDesc)}</strong> ${totalDesc === 1 ? 'respuesta' : 'respuestas'} (otro campus: ${n(d.campus)} · en línea u otra modalidad: ${n(d.modalidad)} · sin datos: ${n(d.sinDatos)} · sin respuesta: ${n(d.sinRespuesta)}).`));
        if (p.profesoresNuevos.length) lista.push(aviso('warn', `${p.profesoresNuevos.length} ${p.profesoresNuevos.length === 1 ? 'profesor no está registrado' : 'profesores no están registrados'} → se crearán como "Datos incompletos". ${detalles('¿Quiénes?', p.profesoresNuevos.map((x) => `${e(x.nombre)} (${e(x.nomina)})`))}`));
        if (!p.periodoExiste) lista.push(aviso('info', `El periodo ${e(p.periodo)} se creará.`));
        p.avisos.forEach((a) => lista.push(aviso('warn', e(textoAviso(a)))));
        el.innerHTML = `
          <p style="margin-bottom:12px"><strong>Periodo detectado: ${e(p.periodo)}</strong> · ${e(VERSION[p.version] || p.version)} <span class="muted small">(${e(p.archivo)})</span></p>
          ${cifras([[n(p.filasFiltradas), 'respuestas que cuentan'], [n(totalDesc), 'filas descartadas'], [n(p.profesores), 'profesores'], [n(p.grupos), 'grupos']])}
          ${Object.keys(p.formatos || {}).length ? `<p class="small muted" style="margin-bottom:10px">Modalidades en el archivo: ${Object.entries(p.formatos).map(([k, v]) => `${e(k)} (${n(v)})`).join(' · ')}</p>` : ''}
          <ul class="aviso-lista">${lista.join('')}</ul>
          ${p.yaImportado ? `<div class="repeat-item mt"><p class="alert alert-warning" style="margin-bottom:10px">${UI.icon('warning')}Ya existe OPINA de ${e(p.periodo)} → se reemplazará.</p>
            <label class="check"><input type="checkbox" data-reemplazar>Sí, reemplazar el OPINA de ${e(p.periodo)}</label></div>` : ''}`;
        if (p.yaImportado) {
          api.setConfirmar('Reemplazar e importar', false);
          el.querySelector('[data-reemplazar]').addEventListener('change', (ev) => api.setConfirmar('Reemplazar e importar', ev.target.checked));
        } else api.setConfirmar('Importar');
      },
      async confirmar(p, el) {
        const chk = el.querySelector('[data-reemplazar]');
        const r = await UI.api('/opina/confirm', { method: 'POST', body: { previewId: p.previewId, reemplazar: Boolean(chk && chk.checked) } });
        return `OPINA ${r.periodo} importado: ${pl(r.respuestas, 'respuesta', 'respuestas')}${r.docentesNuevos ? `, ${pl(r.docentesNuevos, 'docente nuevo', 'docentes nuevos')}` : ''}${r.reemplazadas ? ` (se reemplazó la carga anterior: ${pl(r.reemplazadas, 'respuesta', 'respuestas')})` : ''}.`;
      }
    });
  }

  // ================================================================== HU-20 CV en PDF
  const GRADOS = ['Licenciatura', 'Especialidad', 'Maestría', 'Doctorado'];
  function nivelDe(titulos) {
    const tit = (titulos || []).filter((t) => t.estatus === 'Titulado').map((t) => GRADOS.indexOf(t.grado)).filter((i) => i >= 0);
    return tit.length ? GRADOS[Math.max(...tit)] : '—';
  }
  function estudiandoDe(titulos) {
    const t = (titulos || []).find((x) => x.estatus === 'Estudios en curso');
    return t ? `Sí · ${t.grado}` : 'No';
  }

  /** Detalle editable de lo leído de un CV (✏). Modifica item.datos. */
  function editarCv(item) {
    const p = item.propuesta;
    const d = { curp: p.curp || '', fechaNacimiento: p.fechaNacimiento || '', genero: p.genero || '', trabajoExterno: p.trabajoExterno || '',
      primerSemestre: p.primerSemestre || '', titulos: (p.titulos || []).map((t) => ({ ...t })), ...JSON.parse(JSON.stringify(item.datos || {})) };
    return new Promise((resolve) => {
      const filaT = (t, i) => `<tr data-t="${i}">
        <td><div class="select-wrap"><select class="input select" data-tc="grado">${GRADOS.map((g) => `<option ${g === t.grado ? 'selected' : ''}>${g}</option>`).join('')}</select></div></td>
        <td><div class="select-wrap"><select class="input select" data-tc="estatus">${['Titulado', 'Pasante', 'Título en trámite', 'Estudios en curso', 'Estudios sin concluir'].map((s) => `<option ${s === t.estatus ? 'selected' : ''}>${s}</option>`).join('')}</select></div></td>
        <td><input class="input" data-tc="institucion" value="${e(t.institucion || '')}"></td>
        <td><input class="input" data-tc="periodoTexto" value="${e(t.periodoTexto || '')}" style="width:120px"></td>
        <td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-quitar-t="${i}" aria-label="Quitar título">${UI.icon('trash')}</button></td></tr>`;
      const conf = p.confianza || {};
      const marca = (k) => (conf[k] === 'baja' ? ' <span class="badge badge-warning badge-plain">revisar</span>' : '');
      const dlg = UI.openDialog({
        title: `Revisar: ${item.archivo}`,
        description: 'Corrige lo que se leyó del CV antes de confirmar.',
        size: 'lg',
        bodyHtml: `<div class="form-grid">
            <div class="field"><label>CURP${marca('curp')}</label><input class="input" data-c="curp" maxlength="18" value="${e(d.curp)}" style="text-transform:uppercase"></div>
            <div class="field"><label>Fecha de nacimiento${marca('fechaNacimiento')}</label><input class="input" type="date" data-c="fechaNacimiento" value="${e(d.fechaNacimiento)}"></div>
            <div class="field"><label>Género</label><div class="select-wrap"><select class="input select" data-c="genero"><option value="">—</option><option value="F" ${d.genero === 'F' ? 'selected' : ''}>Femenino</option><option value="M" ${d.genero === 'M' ? 'selected' : ''}>Masculino</option></select></div></div>
            <div class="field"><label>Primer semestre${marca('primerSemestre')}</label><input class="input" data-c="primerSemestre" value="${e(d.primerSemestre)}" placeholder="AGO-DIC 2022"></div>
            <div class="field full"><label>Trabajo externo (lugar laboral)${marca('trabajoExterno')}</label><input class="input" data-c="trabajoExterno" value="${e(d.trabajoExterno)}"></div>
          </div>
          <p class="section-title mt">Títulos</p>
          <div class="table-wrap"><table class="table table-compact"><thead><tr><th>Grado</th><th>Estatus</th><th>Institución</th><th>Periodo</th><th></th></tr></thead><tbody data-titulos>${d.titulos.map(filaT).join('')}</tbody></table></div>
          <button type="button" class="btn btn-ghost btn-sm" data-agregar-t>${UI.icon('plus')}Agregar título</button>
          ${p.cursos && p.cursos.length ? `<p class="small muted mt"><strong>Cursos:</strong> ${p.cursos.map(e).join(' · ')}</p>` : ''}
          ${p.idiomas && p.idiomas.length ? `<p class="small muted"><strong>Idiomas:</strong> ${p.idiomas.map(e).join(' · ')}</p>` : ''}`,
        footerHtml: '<button type="button" class="btn btn-outline" data-cancelar>Cancelar</button><button type="button" class="btn btn-primary" data-ok>Usar estos datos</button>',
        onClose: () => resolve(false)
      });
      const f = dlg.el;
      const leerT = () => [...f.querySelectorAll('[data-t]')].map((tr) => Object.fromEntries([...tr.querySelectorAll('[data-tc]')].map((x) => [x.dataset.tc, x.value.trim() || null])));
      f.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-agregar-t]')) { d.titulos = leerT(); d.titulos.push({ grado: 'Licenciatura', estatus: 'Titulado' }); f.querySelector('[data-titulos]').innerHTML = d.titulos.map(filaT).join(''); }
        const q = ev.target.closest('[data-quitar-t]');
        if (q) { d.titulos = leerT(); d.titulos.splice(Number(q.dataset.quitarT), 1); f.querySelector('[data-titulos]').innerHTML = d.titulos.map(filaT).join(''); }
      });
      f.querySelector('[data-cancelar]').addEventListener('click', dlg.close);
      f.querySelector('[data-ok]').addEventListener('click', () => {
        const datos = {};
        f.querySelectorAll('[data-c]').forEach((x) => {
          const v = x.value.trim();
          const original = x.dataset.c === 'curp' ? (p.curp || '') : (p[x.dataset.c] || '');
          if (v !== original) datos[x.dataset.c] = x.dataset.c === 'curp' ? (v.toUpperCase() || null) : (v || null);
        });
        const titulos = leerT();
        if (JSON.stringify(titulos.map((t) => [t.grado, t.estatus, t.institucion, t.periodoTexto])) !== JSON.stringify((p.titulos || []).map((t) => [t.grado, t.estatus, t.institucion || null, t.periodoTexto || null]))) datos.titulos = titulos;
        item.datos = { ...(item.datos || {}), ...datos };
        resolve(true);
        dlg.close();
      });
    });
  }

  async function cv() {
    let docentes = [];
    try { ({ docentes } = await UI.api('/docentes')); } catch { docentes = []; }
    const opcionesDocente = docentes.map((d) => `<option value="${d.id}">${e(d.nombre)} (${e(d.nomina)})</option>`).join('');
    return asistente({
      titulo: 'Subir CV (PDF)',
      descripcion: 'Formato "A1 CURRICULUM VITAE DOCENTES". Puedes subir varios a la vez (hasta 60, 10 MB cada uno).',
      accept: '.pdf',
      multiple: true,
      size: 'xl',
      textoZona: 'Arrastra aquí los CV en PDF',
      subir(files) {
        const fd = new FormData();
        files.forEach((file) => fd.append('archivos', file, file.name));
        return UI.api('/docentes/cv/preview', { method: 'POST', body: fd });
      },
      revisar(p, el, api) {
        p.items.forEach((it) => {
          it.eleccion = it.coincidencia ? { docenteId: it.coincidencia.docenteId } : {};
          it.datos = {};
        });
        function contar() {
          const listos = p.items.filter((it) => !it.eleccion.omitir && (it.eleccion.docenteId || it.eleccion.nomina)).length;
          api.setConfirmar(`Confirmar ${listos} CV`, listos > 0);
        }
        function celdaDocente(it, i) {
          if (it.eleccion.omitir) return `<span class="badge badge-plain">Se omitirá</span> <button type="button" class="link-btn small" data-deshacer="${i}">Deshacer</button>`;
          if (it.coincidencia && it.eleccion.docenteId === it.coincidencia.docenteId) {
            return `<span class="nowrap">✅ ${e(it.coincidencia.nombre)} <span class="muted small">(${it.coincidencia.por === 'curp' ? 'CURP' : 'nombre'})</span></span>
              <button type="button" class="link-btn small" data-cambiar="${i}">Cambiar</button>`;
          }
          return `<div class="stack" style="gap:6px;min-width:260px">
              <span class="small" style="color:var(--warning-text)">⚠️ ${it.coincidencia ? 'Elige el docente' : 'Sin coincidencia'}</span>
              <div class="select-wrap"><select class="input select" data-elegir="${i}" aria-label="Elegir docente para ${e(it.archivo)}"><option value="">Elegir docente ▾</option>${opcionesDocente}</select></div>
              <div class="row"><input class="input" style="height:32px;width:150px" data-nomina="${i}" placeholder="o capturar nómina" value="${e(it.eleccion.nomina || '')}" aria-label="Nómina para ${e(it.archivo)}">
              <button type="button" class="btn btn-ghost btn-sm" data-omitir="${i}">Omitir</button></div></div>`;
        }
        function pintar() {
          const conflictosFecha = p.items.filter((it) => it.conflictos.some((c) => c.campo === 'fechaNacimiento' && c.curp)).length;
          el.innerHTML = `
            ${cifras([[p.total, 'archivos'], [p.leidos, 'leídos'], [p.items.filter((it) => it.coincidencia).length, 'con docente encontrado'], [p.noLeidos.length, 'no se pudieron leer']])}
            ${p.noLeidos.length ? `<ul class="aviso-lista" style="margin-bottom:12px">${p.noLeidos.map((x) => aviso('err', `${e(x.archivo)}: ${e(x.motivo)}`)).join('')}</ul>` : ''}
            <div class="table-wrap"><table class="table table-compact">
              <thead><tr><th>Archivo</th><th>Docente encontrado</th><th>CURP</th><th>Nac.</th><th>Gén</th><th>Nivel de estudios</th><th>Estudiando</th><th>Trabajo externo</th><th><span class="sr-only">Editar</span></th></tr></thead>
              <tbody>${p.items.map((it, i) => {
                const pr = { ...it.propuesta, ...it.datos };
                const conflictoBd = it.conflictos.filter((c) => c.actual !== undefined);
                return `<tr>
                  <td style="max-width:220px;white-space:normal">${e(it.archivo)}${it.yaImportado ? ' <span class="badge badge-plain">Ya se había cargado</span>' : ''}</td>
                  <td>${celdaDocente(it, i)}</td>
                  <td class="nowrap">${pr.curp ? `${e(pr.curp.slice(0, 10))}…` : '<span style="color:var(--warning-text)">⚠️ no se encontró</span>'}</td>
                  <td class="nowrap">${pr.fechaNacimiento ? e(UI.fecha(pr.fechaNacimiento)) : '—'}</td>
                  <td>${UI.guion(pr.genero)}</td>
                  <td>${e(nivelDe(pr.titulos))}</td>
                  <td>${e(estudiandoDe(pr.titulos))}</td>
                  <td style="white-space:normal">${UI.guion(pr.trabajoExterno)}${conflictoBd.length ? `<div class="small" style="color:var(--warning-text)">Ya tenía: ${conflictoBd.map((c) => `${e(c.campo)} = ${e(c.actual)}`).join(', ')} (se conserva lo capturado)</div>` : ''}</td>
                  <td><button type="button" class="btn btn-ghost btn-icon btn-sm" data-editar="${i}" aria-label="Editar lo leído de ${e(it.archivo)}" title="Editar lo leído">${UI.icon('pencil')}</button>
                    ${Object.keys(it.datos).length ? '<span class="badge badge-info badge-plain">editado</span>' : ''}</td></tr>`;
              }).join('')}</tbody></table></div>
            <ul class="aviso-lista mt">
              ${conflictosFecha ? aviso('warn', `${conflictosFecha} fecha(s) de nacimiento del CV no coinciden con la CURP → se marcarán "Revisar".`) : ''}
              ${aviso('info', 'Domicilio, teléfono, RFC y estado civil no se guardan.')}
            </ul>`;
          contar();
        }
        el.addEventListener('click', async (ev) => {
          const t = ev.target;
          const i = (k) => Number(t.closest(`[${k}]`).getAttribute(k));
          if (t.closest('[data-omitir]')) { p.items[i('data-omitir')].eleccion = { omitir: true }; pintar(); }
          else if (t.closest('[data-deshacer]')) { const it = p.items[i('data-deshacer')]; it.eleccion = it.coincidencia ? { docenteId: it.coincidencia.docenteId } : {}; pintar(); }
          else if (t.closest('[data-cambiar]')) { p.items[i('data-cambiar')].eleccion = {}; pintar(); }
          else if (t.closest('[data-editar]')) { if (await editarCv(p.items[i('data-editar')])) pintar(); }
        });
        el.addEventListener('change', (ev) => {
          if (ev.target.dataset.elegir !== undefined) {
            const it = p.items[Number(ev.target.dataset.elegir)];
            it.eleccion = ev.target.value ? { docenteId: Number(ev.target.value) } : {};
            if (it.eleccion.docenteId && it.coincidencia && it.coincidencia.docenteId === it.eleccion.docenteId) pintar(); else contar();
          }
        });
        el.addEventListener('input', (ev) => {
          if (ev.target.dataset.nomina !== undefined) {
            const it = p.items[Number(ev.target.dataset.nomina)];
            const v = ev.target.value.trim();
            it.eleccion = v ? { nomina: v } : {};
            const sel = el.querySelector(`[data-elegir="${ev.target.dataset.nomina}"]`);
            if (sel) sel.value = '';
            contar();
          }
        });
        pintar();
      },
      async confirmar(p) {
        const pendientes = p.items.filter((it) => !it.eleccion.omitir && !it.eleccion.docenteId && !it.eleccion.nomina);
        if (pendientes.length) {
          const seguir = await UI.confirm({
            title: 'Hay CV sin docente',
            message: `${pendientes.length} CV no tienen docente elegido ni nómina. ¿Omitirlos y continuar?`,
            confirmText: 'Omitirlos y continuar'
          });
          if (!seguir) return null;
          pendientes.forEach((it) => { it.eleccion = { omitir: true }; });
        }
        const items = p.items.map((it) => ({ archivo: it.archivo, ...it.eleccion, datos: it.datos }));
        const r = await UI.api('/docentes/cv/confirm', { method: 'POST', body: { previewId: p.previewId, items } });
        return `${r.guardados === 1 ? 'Se guardó 1 CV' : `Se guardaron ${r.guardados} CV`}${r.omitidos ? ` (${pl(r.omitidos, 'omitido', 'omitidos')})` : ''}.`;
      }
    });
  }

  // ================================================================== HU-27 Contratos por CRN
  async function contratos() {
    return asistente({
      titulo: 'Subir reporte de contratos',
      descripcion: 'Descarga la plantilla con los CRN del periodo, escribe el contrato de cada uno y súbela. También puedes subir el reporte de RH (columnas CRN y Contrato).',
      accept: '.xlsx,.xls,.csv',
      textoZona: 'Arrastra aquí el reporte de contratos',
      ayuda: '.xlsx, .xls o .csv',
      extraPaso1: `<p style="margin-bottom:12px"><button type="button" class="btn btn-outline btn-sm" data-descargar="/contratos/plantilla">${UI.icon('download')}Descargar plantilla de contratos</button></p>`,
      subir: (files) => UI.api('/contratos/preview', { method: 'POST', body: formUnArchivo('archivo', files[0]) }),
      revisar(p, el, api) {
        const lista = [];
        if (!p.validaNomina) lista.push(aviso('info', 'El archivo no trae columna de nómina: no se pudo validar que cada CRN sea del docente correcto.'));
        if (p.sinContrato.length) lista.push(aviso('warn', `${p.sinContrato.length} CRN seguirán sin contrato: ${p.sinContrato.slice(0, 15).map(e).join(', ')}${p.sinContrato.length > 15 ? '…' : ''}`));
        p.avisos.forEach((a) => lista.push(aviso('warn', `⚠ ${e(textoAviso(a))}`)));
        el.innerHTML = `
          <p style="margin-bottom:12px"><strong>${e(p.periodo)}</strong> · ${n(p.crn)} CRN en el periodo <span class="muted small">(${e(p.archivo)}, ${n(p.filas)} filas)</span></p>
          ${cifras([[p.nuevos.length, 'contratos nuevos'], [p.cambian.length, 'cambian'], [p.iguales, 'sin cambio'], [p.sinContrato.length, 'sin contrato'], [p.avisos.length, 'avisos']])}
          ${detalles(`Ver los ${p.nuevos.length} contratos nuevos`, p.nuevos.map((x) => `CRN ${e(x.crn)} · ${e(x.materia || '')} → ${e(x.contrato)}`))}
          ${p.cambian.length ? `<p class="section-title mt">Contratos que cambian <span class="hint">(marca los que quieres conservar como están)</span></p>
            <table class="table table-compact"><thead><tr><th>CRN</th><th>Actual</th><th>En el archivo</th><th>Conservar el actual</th></tr></thead>
            <tbody>${p.cambian.map((c) => `<tr><td>${e(c.crn)}</td><td>${e(c.antes)}</td><td>${e(c.despues)}</td>
              <td><input type="checkbox" data-conservar="${e(c.crn)}" aria-label="Conservar el contrato actual del CRN ${e(c.crn)}"></td></tr>`).join('')}</tbody></table>` : ''}
          ${lista.length ? `<ul class="aviso-lista mt">${lista.join('')}</ul>` : ''}`;
        const total = p.nuevos.length + p.cambian.length;
        api.setConfirmar(total ? `Confirmar ${total} contratos` : 'No hay contratos que actualizar', total > 0);
      },
      async confirmar(p, el) {
        const conservarManual = [...el.querySelectorAll('[data-conservar]:checked')].map((x) => x.dataset.conservar);
        const r = await UI.api('/contratos/confirm', { method: 'POST', body: { previewId: p.previewId, conservarManual } });
        return `Contratos actualizados: ${r.actualizados}${r.conservados ? ` (se conservaron ${r.conservados})` : ''}.`;
      }
    });
  }

  return { grupos, opina, cv, contratos };
})();
