/**
 * Formulario de docente en pasos y alta rápida (HU-01; 05 §3 Opción 1).
 *
 *   DocenteForm.nuevo()                  → POST /docentes (con títulos y asignaturas)
 *   DocenteForm.editar(id, { paso })     → PUT /docentes/:id + altas/cambios/bajas de títulos y asignaturas
 *   DocenteForm.altaRapida()             → POST /docentes/alta-rapida { nomina, nombre } (suplentes)
 * Todas resuelven true si se guardó algo (para recargar la tabla) o false si se canceló.
 *
 * Pasos: Datos personales (CURP → fecha de nacimiento y género) → Formación (títulos con estatus,
 * campo, trabajo externo, primer semestre) → Laborales → Asignaturas (CRN o actividad, horario, contrato).
 */
const DocenteForm = (() => {
  const PASOS = [
    ['personales', 'Datos personales'], ['formacion', 'Formación'], ['laborales', 'Laborales'], ['asignaturas', 'Asignaturas']
  ];
  const ESTATUS = ['Titulado', 'Pasante', 'Título en trámite', 'Estudios en curso', 'Estudios sin concluir'];
  const NIVELES_IMPARTE = ['Bachillerato General', 'Bachillerato General Bilingüe', 'Profesional'];
  const DIAS = [[1, 'Lunes'], [2, 'Martes'], [3, 'Miércoles'], [4, 'Jueves'], [5, 'Viernes'], [6, 'Sábado']];
  const CAMPOS_PASO = {
    personales: ['nomina', 'nombres', 'apellidoPaterno', 'apellidoMaterno', 'curp', 'fechaNacimiento', 'genero', 'correoInstitucional', 'nivelImparte'],
    formacion: ['campoFormacion', 'trabajoExterno', 'primerSemestre', 'titulos'],
    laborales: ['tipoContrato', 'departamentoId'],
    asignaturas: ['asignaturas', 'crn', 'materia', 'horarios', 'numContrato', 'idioma', 'nombreActividad', 'periodoId']
  };

  let catalogos = null;
  const e = (v) => UI.escape(v);

  // ------------------------------------------------------------------ utilidades
  /** '3560330' | 'l03560330' → 'L03560330' (misma regla que lib/nomina.js); null si no parece nómina. */
  function normalizarNomina(valor) {
    const t = String(valor || '').trim().toUpperCase().replace(/\s/g, '');
    const m = t.match(/^L?0*(\d{1,8})$/);
    return m ? `L${m[1].padStart(8, '0')}` : null;
  }

  /** Fecha (YYYY-MM-DD) y género que codifica una CURP; null si no se puede leer. */
  function datosCurp(curp) {
    const c = String(curp || '').trim().toUpperCase();
    const m = c.match(/^[A-Z]{4}(\d{2})(\d{2})(\d{2})([HM])[A-Z]{5}([0-9A-Z])\d$/);
    if (!m) return null;
    const siglo = /\d/.test(m[5]) ? 1900 : 2000;
    const anio = siglo + Number(m[1]);
    const fecha = `${anio}-${m[2]}-${m[3]}`;
    if (Number.isNaN(new Date(`${fecha}T00:00:00`).getTime())) return null;
    return { fecha, genero: m[4] === 'H' ? 'M' : 'F' };
  }

  async function cargarCatalogos() {
    if (catalogos) return catalogos;
    const tipos = ['nivel_estudios', 'campo_formacion', 'tipo_contrato'];
    const res = await Promise.all(tipos.map((t) => UI.api(`/catalogos?tipo=${t}`).then((r) => r.catalogos.map((c) => c.valor)).catch(() => [])));
    catalogos = { grados: res[0], campos: res[1], contratos: res[2].length ? res[2] : ['determinado'] };
    return catalogos;
  }

  function vacio() {
    return {
      nomina: '', nombres: '', apellidoPaterno: '', apellidoMaterno: '', curp: '', fechaNacimiento: '', genero: '',
      correoInstitucional: '', nivelImparte: '', campoFormacion: '', trabajoExterno: '', primerSemestre: '',
      tipoContrato: 'determinado', aceptarCurpConAviso: false, titulos: [], asignaturas: []
    };
  }

  function desdeDetalle(d) {
    return {
      nomina: d.nomina, nombres: d.nombres || '', apellidoPaterno: d.apellidoPaterno || '', apellidoMaterno: d.apellidoMaterno || '',
      curp: d.curp || '', fechaNacimiento: d.fechaNacimiento || '', genero: d.genero || '', correoInstitucional: d.correoInstitucional || '',
      nivelImparte: d.nivelImparte || '', campoFormacion: d.campoFormacion || '', trabajoExterno: d.trabajoExterno || '',
      primerSemestre: d.primerSemestreTexto || '', tipoContrato: d.tipoContrato || 'determinado', aceptarCurpConAviso: false,
      titulos: d.titulos.map((t) => ({ id: t.id, grado: t.grado, nombreTitulo: t.nombreTitulo || '', institucion: t.institucion || '',
        periodoTexto: t.periodoTexto || '', estatus: t.estatus, cedula: t.cedula || '' })),
      asignaturas: d.asignaturas.map((a) => ({ id: a.id, tipo: a.crn ? 'crn' : 'actividad', crn: a.crn || '', nombreActividad: a.nombreActividad || '',
        materia: a.materia || '', numeroGrupo: a.numeroGrupo || '', modalidad: a.modalidad || '', idioma: a.idioma || '',
        numContrato: a.numContrato || '', horarios: (a.horarios || []).map((h) => ({ ...h })) }))
    };
  }

  // ------------------------------------------------------------------ plantillas
  function campo(nombre, etiqueta, control, { full = false, hint = '', req = false } = {}) {
    return `<div class="field ${full ? 'full' : ''}" data-field="${nombre}">
      <label for="df-${nombre}">${e(etiqueta)}${req ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
      ${control}
      <p class="hint" data-hint="${nombre}">${e(hint)}</p>
      <p class="field-error" data-error="${nombre}" hidden></p></div>`;
  }
  const input = (n, v, attrs = '') => `<input class="input" id="df-${n}" data-campo="${n}" value="${e(v)}" ${attrs}>`;
  function select(n, v, opciones, vacioTexto = '— Sin dato —') {
    return `<div class="select-wrap"><select class="input select" id="df-${n}" data-campo="${n}">
      <option value="">${e(vacioTexto)}</option>
      ${opciones.map((o) => { const [val, txt] = Array.isArray(o) ? o : [o, o]; return `<option value="${e(val)}" ${String(val) === String(v) ? 'selected' : ''}>${e(txt)}</option>`; }).join('')}
    </select></div>`;
  }

  function pasoPersonales(m) {
    const n = normalizarNomina(m.nomina);
    return `<div class="form-grid">
      ${campo('nomina', 'Nómina', input('nomina', m.nomina, 'required autocomplete="off" placeholder="3560330 o L03560330"'), { req: true, hint: n ? `Se guardará como ${n}` : 'Acepta 3560330 o L03560330.' })}
      ${campo('correoInstitucional', 'Correo institucional', input('correoInstitucional', m.correoInstitucional, 'type="email" autocomplete="off"'))}
      ${campo('nombres', 'Nombre(s)', input('nombres', m.nombres, 'required'), { req: true })}
      ${campo('apellidoPaterno', 'Apellido paterno', input('apellidoPaterno', m.apellidoPaterno, 'required'), { req: true })}
      ${campo('apellidoMaterno', 'Apellido materno', input('apellidoMaterno', m.apellidoMaterno))}
      ${campo('curp', 'CURP', input('curp', m.curp, 'maxlength="18" autocomplete="off" style="text-transform:uppercase"'), { hint: 'Con la CURP se llenan la fecha de nacimiento y el género.' })}
      ${campo('fechaNacimiento', 'Fecha de nacimiento', input('fechaNacimiento', m.fechaNacimiento, 'type="date"'))}
      ${campo('genero', 'Género', select('genero', m.genero, [['F', 'Femenino'], ['M', 'Masculino']]))}
      ${campo('nivelImparte', 'Nivel que imparte', select('nivelImparte', m.nivelImparte, NIVELES_IMPARTE))}
      <label class="check full" data-curp-aviso hidden><input type="checkbox" data-campo="aceptarCurpConAviso" ${m.aceptarCurpConAviso ? 'checked' : ''}>
        Aceptar la CURP como está (el dígito verificador no coincide, pero así viene en el documento)</label>
    </div>`;
  }

  function filaTitulo(t, i) {
    return `<div class="repeat-item" data-lista="titulos" data-i="${i}">
      <div class="repeat-head"><span>Título ${i + 1}${t.id ? '' : ' · nuevo'}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-quitar-fila="titulos" data-i="${i}">${UI.icon('trash')}Quitar</button></div>
      <div class="form-grid">
        <div class="field" data-field="titulos[${i}].grado"><label>Grado <span class="req">*</span></label>
          <div class="select-wrap"><select class="input select" data-campo="grado">
            <option value="">— Elige —</option>${catalogos.grados.map((g) => `<option ${g === t.grado ? 'selected' : ''}>${e(g)}</option>`).join('')}</select></div>
          <p class="field-error" data-error="titulos[${i}].grado" hidden></p></div>
        <div class="field" data-field="titulos[${i}].estatus"><label>Estatus <span class="req">*</span></label>
          <div class="select-wrap"><select class="input select" data-campo="estatus">
            ${ESTATUS.map((s) => `<option ${s === t.estatus ? 'selected' : ''}>${e(s)}</option>`).join('')}</select></div>
          <p class="field-error" data-error="titulos[${i}].estatus" hidden></p></div>
        <div class="field"><label>Nombre del título</label><input class="input" data-campo="nombreTitulo" value="${e(t.nombreTitulo)}" placeholder="Ingeniería Industrial"></div>
        <div class="field"><label>Institución</label><input class="input" data-campo="institucion" value="${e(t.institucion)}"></div>
        <div class="field"><label>Periodo</label><input class="input" data-campo="periodoTexto" value="${e(t.periodoTexto)}" placeholder="2013-2017"></div>
        <div class="field"><label>Cédula</label><input class="input" data-campo="cedula" value="${e(t.cedula)}" inputmode="numeric"></div>
      </div></div>`;
  }

  function primerSemestreControl(valor) {
    const m = String(valor || '').match(/^(ENE-MAY|AGO-DIC)\s+(\d{4})$/);
    const sem = m ? m[1] : '';
    const anio = m ? m[2] : '';
    return `<div class="row">
      <div class="select-wrap"><select class="input select" id="df-primerSemestre" data-semestre="sem" aria-label="Semestre">
        <option value="">— Semestre —</option><option ${sem === 'ENE-MAY' ? 'selected' : ''}>ENE-MAY</option><option ${sem === 'AGO-DIC' ? 'selected' : ''}>AGO-DIC</option></select></div>
      <input class="input" style="width:110px" data-semestre="anio" type="number" min="1980" max="2100" placeholder="Año" aria-label="Año" value="${e(anio)}">
    </div>`;
  }

  function pasoFormacion(m) {
    return `<div class="form-grid">
      ${campo('campoFormacion', 'Campo de formación', select('campoFormacion', m.campoFormacion, catalogos.campos))}
      ${campo('primerSemestre', 'Primer semestre que dio clases', primerSemestreControl(m.primerSemestre), { hint: 'Sirve para calcular la antigüedad.' })}
      ${campo('trabajoExterno', 'Trabajo externo / independiente', input('trabajoExterno', m.trabajoExterno, 'placeholder="Ej. Despacho contable"'), { full: true })}
    </div>
    <p class="section-title mt">Títulos</p>
    <p class="hint" style="margin-bottom:8px">El nivel de estudios es el grado más alto "Titulado"; "Estudios en curso" marca que está estudiando.</p>
    <div data-contenedor="titulos">${m.titulos.length ? m.titulos.map(filaTitulo).join('') : '<p class="muted small">Sin títulos.</p>'}</div>
    <button type="button" class="btn btn-outline btn-sm mt" data-agregar="titulos">${UI.icon('plus')}Agregar título</button>`;
  }

  function pasoLaborales(m) {
    return `<div class="form-grid">
      ${campo('tipoContrato', 'Tipo de contrato', select('tipoContrato', m.tipoContrato, catalogos.contratos, '— Elige —'))}
      <div class="field"><label>Departamento</label><p class="hint">Se asignará cuando exista el catálogo de departamentos.</p></div>
    </div>`;
  }

  function filaHorario(h, i, j) {
    return `<div class="horario-row" data-horario="${j}">
      <div class="select-wrap"><select class="input select" data-h="dia" aria-label="Día">${DIAS.map(([v, t]) => `<option value="${v}" ${Number(h.dia) === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>
      <input class="input" type="time" data-h="inicio" value="${e(h.inicio)}" aria-label="Hora de inicio">
      <input class="input" type="time" data-h="fin" value="${e(h.fin)}" aria-label="Hora de fin">
      <button type="button" class="btn btn-ghost btn-icon btn-sm" data-quitar-horario="${j}" data-i="${i}" aria-label="Quitar sesión">${UI.icon('x')}</button>
    </div>`;
  }

  function filaAsignatura(a, i) {
    const existente = Boolean(a.id);
    const esCrn = a.tipo === 'crn';
    return `<div class="repeat-item" data-lista="asignaturas" data-i="${i}">
      <div class="repeat-head"><span>${esCrn ? `Grupo ${a.crn ? `CRN ${e(a.crn)}` : i + 1}` : 'Actividad'}${existente ? '' : ' · nuevo'}</span>
        <button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-quitar-fila="asignaturas" data-i="${i}">${UI.icon('trash')}Quitar</button></div>
      ${existente ? '' : `<div class="seg" style="margin-bottom:10px">
        <label><input type="radio" name="tipo-${i}" data-campo="tipo" value="crn" ${esCrn ? 'checked' : ''}>Grupo con CRN</label>
        <label><input type="radio" name="tipo-${i}" data-campo="tipo" value="actividad" ${esCrn ? '' : 'checked'}>Actividad sin CRN</label></div>`}
      <div class="form-grid">
        ${esCrn
          ? `<div class="field" data-field="asignaturas[${i}].crn"><label>CRN <span class="req">*</span></label>
              <input class="input" data-campo="crn" value="${e(a.crn)}" inputmode="numeric" ${existente ? 'readonly' : ''}>
              <p class="field-error" data-error="asignaturas[${i}].crn" hidden></p></div>`
          : `<div class="field" data-field="asignaturas[${i}].nombreActividad"><label>Actividad <span class="req">*</span></label>
              <input class="input" data-campo="nombreActividad" value="${e(a.nombreActividad)}" placeholder="Tutoreo, coach…">
              <p class="field-error" data-error="asignaturas[${i}].nombreActividad" hidden></p></div>`}
        <div class="field" data-field="asignaturas[${i}].materia"><label>Materia${esCrn ? ' <span class="req">*</span>' : ''}</label>
          <input class="input" data-campo="materia" value="${e(a.materia)}"><p class="field-error" data-error="asignaturas[${i}].materia" hidden></p></div>
        <div class="field"><label>Grupo</label><input class="input" data-campo="numeroGrupo" value="${e(a.numeroGrupo)}" placeholder="611"></div>
        <div class="field"><label>Modalidad</label><input class="input" data-campo="modalidad" value="${e(a.modalidad)}" placeholder="Teórica"></div>
        <div class="field"><label>Idioma</label><div class="select-wrap"><select class="input select" data-campo="idioma">
          <option value="">Sugerido por SIDI</option><option value="ES" ${a.idioma === 'ES' ? 'selected' : ''}>Español</option><option value="EN" ${a.idioma === 'EN' ? 'selected' : ''}>Inglés</option></select></div></div>
        <div class="field" data-field="asignaturas[${i}].numContrato"><label>Contrato</label>
          <input class="input" data-campo="numContrato" value="${e(a.numContrato)}" inputmode="numeric" placeholder="5568351">
          <p class="field-error" data-error="asignaturas[${i}].numContrato" hidden></p></div>
      </div>
      <p class="section-title mt">Horario <span class="hint">(las horas por semana y la tarifa se calculan solas)</span></p>
      <div data-field="asignaturas[${i}].horarios">${a.horarios.map((h, j) => filaHorario(h, i, j)).join('') || '<p class="muted small">Sin sesiones.</p>'}
        <p class="field-error" data-error="asignaturas[${i}].horarios" hidden></p></div>
      <button type="button" class="btn btn-ghost btn-sm" data-agregar-horario="${i}">${UI.icon('plus')}Agregar sesión</button>
    </div>`;
  }

  function pasoAsignaturas(m) {
    return `<p class="hint" style="margin-bottom:10px">Grupos y actividades del semestre actual. Los contratos también se pueden cargar después con el reporte de contratos.</p>
      <div data-contenedor="asignaturas">${m.asignaturas.length ? m.asignaturas.map(filaAsignatura).join('') : '<p class="muted small">Sin grupos ni actividades.</p>'}</div>
      <button type="button" class="btn btn-outline btn-sm mt" data-agregar="asignaturas">${UI.icon('plus')}Agregar grupo o actividad</button>`;
  }

  const RENDER = { personales: pasoPersonales, formacion: pasoFormacion, laborales: pasoLaborales, asignaturas: pasoAsignaturas };

  // ------------------------------------------------------------------ lectura del formulario
  function leer(f, m) {
    // campos de primer nivel (fuera de listas)
    f.querySelectorAll('[data-campo]').forEach((x) => {
      if (x.closest('[data-lista]')) return;
      m[x.dataset.campo] = x.type === 'checkbox' ? x.checked : x.value.trim();
    });
    const sem = f.querySelector('[data-semestre="sem"]');
    const anio = f.querySelector('[data-semestre="anio"]');
    if (sem) m.primerSemestre = sem.value && anio.value ? `${sem.value} ${anio.value}` : '';
    for (const lista of ['titulos', 'asignaturas']) {
      f.querySelectorAll(`[data-lista="${lista}"]`).forEach((item) => {
        const fila = m[lista][Number(item.dataset.i)];
        item.querySelectorAll('[data-campo]').forEach((x) => {
          if (x.type === 'radio') { if (x.checked) fila[x.dataset.campo] = x.value; return; }
          fila[x.dataset.campo] = x.value.trim();
        });
        if (lista === 'asignaturas') {
          fila.horarios = [...item.querySelectorAll('[data-horario]')].map((r) => ({
            dia: Number(r.querySelector('[data-h="dia"]').value), inicio: r.querySelector('[data-h="inicio"]').value, fin: r.querySelector('[data-h="fin"]').value
          }));
        }
      });
    }
    return m;
  }

  // ------------------------------------------------------------------ cuerpos para la API
  const nulo = (v) => (v === '' || v === undefined ? null : v);

  function cuerpoDocente(m) {
    const b = {
      nomina: m.nomina, nombres: m.nombres, apellidoPaterno: m.apellidoPaterno, apellidoMaterno: nulo(m.apellidoMaterno),
      curp: nulo(m.curp.toUpperCase()), fechaNacimiento: nulo(m.fechaNacimiento), genero: nulo(m.genero),
      correoInstitucional: nulo(m.correoInstitucional), nivelImparte: nulo(m.nivelImparte), campoFormacion: nulo(m.campoFormacion),
      trabajoExterno: nulo(m.trabajoExterno), primerSemestre: nulo(m.primerSemestre), tipoContrato: nulo(m.tipoContrato)
    };
    if (m.aceptarCurpConAviso) b.aceptarCurpConAviso = true;
    return b;
  }
  function cuerpoTitulo(t) {
    return { grado: t.grado, estatus: t.estatus, nombreTitulo: nulo(t.nombreTitulo), institucion: nulo(t.institucion), periodoTexto: nulo(t.periodoTexto), cedula: nulo(t.cedula) };
  }
  function cuerpoAsignatura(a, original) {
    const b = { materia: a.materia || (a.tipo === 'actividad' ? a.nombreActividad : ''), numeroGrupo: nulo(a.numeroGrupo), modalidad: nulo(a.modalidad), numContrato: nulo(a.numContrato) };
    if (a.idioma) b.idioma = a.idioma;
    if (!original) {
      if (a.tipo === 'crn') b.crn = a.crn; else b.nombreActividad = a.nombreActividad;
      b.horarios = a.horarios.filter((h) => h.inicio && h.fin);
      return b;
    }
    if (a.tipo === 'actividad') b.nombreActividad = a.nombreActividad;
    const horarios = a.horarios.filter((h) => h.inicio && h.fin);
    if (JSON.stringify(horarios) !== JSON.stringify(original.horarios)) b.horarios = horarios;
    return b;
  }

  /** Cambia el prefijo de los details de una petición individual: grado → titulos[2].grado */
  function conPrefijo(err, prefijo) {
    err.details = (err.details || []).map((d) => (d.campo ? { ...d, campo: `${prefijo}${d.campo}` } : d));
    return err;
  }

  // ------------------------------------------------------------------ diálogo
  function abrirFormulario({ titulo, modelo, docenteId = null, paso = 'personales' }) {
    const original = docenteId ? JSON.parse(JSON.stringify(modelo)) : null;
    const m = modelo;
    let actual = PASOS.some(([k]) => k === paso) ? paso : 'personales';
    let guardoAlgo = false;

    return new Promise((resolve) => {
      const dlg = UI.openDialog({
        title: titulo,
        description: docenteId ? `${m.nombres} ${m.apellidoPaterno} · ${m.nomina}` : 'Los campos con * son obligatorios. Puedes completar el resto después.',
        as: 'form',
        size: 'lg',
        bodyHtml: `
          <nav class="stepper" aria-label="Pasos">${PASOS.map(([k, t]) => `<button type="button" class="step" data-ir="${k}">${t}</button>`).join('')}</nav>
          ${PASOS.map(([k]) => `<section data-paso="${k}" hidden></section>`).join('')}
          <div class="alert alert-error mt" data-error-general role="alert" hidden></div>`,
        footerHtml: `
          <button type="button" class="btn btn-ghost" data-nav="atras">${UI.icon('chevronLeft')}Anterior</button>
          <span class="grow"></span>
          <button type="button" class="btn btn-outline" data-nav="cancelar">Cancelar</button>
          <button type="button" class="btn btn-outline" data-nav="siguiente">Siguiente${UI.icon('chevronRight')}</button>
          <button type="submit" class="btn btn-primary">${UI.icon('check')}Guardar</button>`,
        onClose: () => resolve(guardoAlgo)
      });
      const f = dlg.el;
      f.noValidate = true; // hay campos obligatorios en pasos ocultos: valida validarLocal() y el servidor

      function pintarPaso(k) {
        const s = f.querySelector(`[data-paso="${k}"]`);
        s.innerHTML = RENDER[k](m);
      }
      function mostrar(k) {
        leer(f, m);
        actual = k;
        PASOS.forEach(([p]) => {
          const s = f.querySelector(`[data-paso="${p}"]`);
          if (!s.innerHTML) pintarPaso(p);
          s.hidden = p !== k;
        });
        f.querySelectorAll('[data-ir]').forEach((b) => (b.dataset.ir === k ? b.setAttribute('aria-current', 'step') : b.removeAttribute('aria-current')));
        const i = PASOS.findIndex(([p]) => p === k);
        f.querySelector('[data-nav="atras"]').disabled = i === 0;
        f.querySelector('[data-nav="siguiente"]').hidden = i === PASOS.length - 1;
        const primero = f.querySelector(`[data-paso="${k}"] .field.invalid input, [data-paso="${k}"] input:not([readonly]), [data-paso="${k}"] select`);
        if (primero) primero.focus();
      }
      function repintarLista(lista) {
        leer(f, m);
        pintarPaso(lista === 'titulos' ? 'formacion' : 'asignaturas');
      }

      function limpiarErrores() {
        f.querySelectorAll('.field.invalid').forEach((x) => x.classList.remove('invalid'));
        f.querySelectorAll('[data-error]').forEach((x) => { x.hidden = true; x.textContent = ''; });
        f.querySelectorAll('.step.con-error').forEach((x) => x.classList.remove('con-error'));
        f.querySelector('[data-error-general]').hidden = true;
      }
      function pasoDeCampo(c) {
        const base = String(c).split(/[.[]/)[0];
        return (PASOS.find(([k]) => CAMPOS_PASO[k].includes(base)) || ['personales'])[0];
      }
      function marcarErrores(err) {
        let primerPaso = null;
        const sueltos = [];
        for (const d of err.details || []) {
          if (!d.campo) continue;
          const box = f.querySelector(`[data-field="${CSS.escape(d.campo)}"]`) || f.querySelector(`[data-field="${CSS.escape(String(d.campo).replace(/\[\d+\]$/, ''))}"]`);
          const p = pasoDeCampo(d.campo);
          f.querySelector(`[data-ir="${p}"]`).classList.add('con-error');
          primerPaso = primerPaso || p;
          if (box) {
            box.classList.add('invalid');
            const msg = box.querySelector('[data-error]');
            if (msg) { msg.textContent = UI.mensajeCampo(d).split(': ').slice(1).join(': ') || UI.mensajeCampo(d); msg.hidden = false; }
          } else sueltos.push(UI.mensajeCampo(d));
          if (d.campo === 'curp' && d.problema === 'DIGITO_VERIFICADOR') f.querySelector('[data-curp-aviso]').hidden = false;
        }
        const general = f.querySelector('[data-error-general]');
        general.hidden = false;
        general.innerHTML = `${e(err.message)}${sueltos.length ? `<ul>${sueltos.map((s) => `<li>${e(s)}</li>`).join('')}</ul>` : ''}`;
        if (primerPaso) mostrar(primerPaso);
      }

      // Validación rápida antes de ir al servidor.
      function validarLocal() {
        const det = [];
        if (!m.nomina) det.push({ campo: 'nomina', problema: 'OBLIGATORIO' });
        else if (!normalizarNomina(m.nomina)) det.push({ campo: 'nomina', problema: 'FORMATO' });
        if (!m.nombres) det.push({ campo: 'nombres', problema: 'OBLIGATORIO' });
        if (!m.apellidoPaterno) det.push({ campo: 'apellidoPaterno', problema: 'OBLIGATORIO' });
        if (m.curp && m.curp.length !== 18) det.push({ campo: 'curp', problema: 'LONGITUD' });
        m.titulos.forEach((t, i) => { if (!t.grado) det.push({ campo: `titulos[${i}].grado`, problema: 'OBLIGATORIO' }); });
        m.asignaturas.forEach((a, i) => {
          if (a.tipo === 'crn' && !a.crn) det.push({ campo: `asignaturas[${i}].crn`, problema: 'OBLIGATORIO' });
          if (a.tipo === 'crn' && !a.materia) det.push({ campo: `asignaturas[${i}].materia`, problema: 'OBLIGATORIO' });
          if (a.tipo === 'actividad' && !a.nombreActividad) det.push({ campo: `asignaturas[${i}].nombreActividad`, problema: 'OBLIGATORIO' });
          if (a.horarios.some((h) => !h.inicio || !h.fin || h.inicio >= h.fin)) det.push({ campo: `asignaturas[${i}].horarios`, problema: 'HORAS_INVALIDAS' });
        });
        if (det.length) { marcarErrores(Object.assign(new Error('Revisa los datos marcados.'), { details: det })); return false; }
        return true;
      }

      async function guardarNuevo() {
        const cuerpo = cuerpoDocente(m);
        cuerpo.titulos = m.titulos.map(cuerpoTitulo);
        cuerpo.asignaturas = m.asignaturas.map((a) => cuerpoAsignatura(a, null));
        const { docente } = await UI.api('/docentes', { method: 'POST', body: cuerpo });
        return docente;
      }

      async function guardarEdicion() {
        await UI.api(`/docentes/${docenteId}`, { method: 'PUT', body: cuerpoDocente(m) });
        guardoAlgo = true;
        // Títulos: bajas, cambios y altas
        const idsTit = new Set(m.titulos.filter((t) => t.id).map((t) => t.id));
        for (const t of original.titulos.filter((x) => !idsTit.has(x.id))) {
          await UI.api(`/titulos/${t.id}`, { method: 'DELETE' });
          original.titulos = original.titulos.filter((x) => x.id !== t.id);
        }
        for (const [i, t] of m.titulos.entries()) {
          try {
            if (!t.id) t.id = (await UI.api(`/docentes/${docenteId}/titulos`, { method: 'POST', body: cuerpoTitulo(t) })).titulo.id;
            else if (JSON.stringify(cuerpoTitulo(t)) !== JSON.stringify(cuerpoTitulo(original.titulos.find((x) => x.id === t.id) || {}))) {
              await UI.api(`/titulos/${t.id}`, { method: 'PUT', body: cuerpoTitulo(t) });
            }
          } catch (err) { throw conPrefijo(err, `titulos[${i}].`); }
        }
        // Asignaturas: bajas, cambios y altas
        const idsAsig = new Set(m.asignaturas.filter((a) => a.id).map((a) => a.id));
        for (const a of original.asignaturas.filter((x) => !idsAsig.has(x.id))) {
          await UI.api(`/asignaturas/${a.id}`, { method: 'DELETE' });
          original.asignaturas = original.asignaturas.filter((x) => x.id !== a.id);
        }
        for (const [i, a] of m.asignaturas.entries()) {
          try {
            if (!a.id) {
              const r = await UI.api(`/docentes/${docenteId}/asignaturas`, { method: 'POST', body: cuerpoAsignatura(a, null) });
              a.id = r.asignatura.id;
              original.asignaturas.push(JSON.parse(JSON.stringify(a)));
            } else {
              const orig = original.asignaturas.find((x) => x.id === a.id);
              const cuerpo = cuerpoAsignatura(a, orig);
              const antes = cuerpoAsignatura(orig, orig);
              if (JSON.stringify(cuerpo) !== JSON.stringify(antes)) await UI.api(`/asignaturas/${a.id}`, { method: 'PUT', body: cuerpo });
            }
          } catch (err) { throw conPrefijo(err, `asignaturas[${i}].`); }
        }
      }

      f.addEventListener('click', (ev) => {
        const ir = ev.target.closest('[data-ir]');
        if (ir) { mostrar(ir.dataset.ir); return; }
        const nav = ev.target.closest('[data-nav]');
        if (nav) {
          const i = PASOS.findIndex(([p]) => p === actual);
          if (nav.dataset.nav === 'cancelar') dlg.close();
          else if (nav.dataset.nav === 'atras' && i > 0) mostrar(PASOS[i - 1][0]);
          else if (nav.dataset.nav === 'siguiente' && i < PASOS.length - 1) mostrar(PASOS[i + 1][0]);
          return;
        }
        const agregar = ev.target.closest('[data-agregar]');
        if (agregar) {
          leer(f, m);
          if (agregar.dataset.agregar === 'titulos') m.titulos.push({ grado: '', estatus: 'Titulado', nombreTitulo: '', institucion: '', periodoTexto: '', cedula: '' });
          else m.asignaturas.push({ tipo: 'crn', crn: '', nombreActividad: '', materia: '', numeroGrupo: '', modalidad: '', idioma: '', numContrato: '', horarios: [{ dia: 1, inicio: '', fin: '' }] });
          repintarLista(agregar.dataset.agregar);
          const items = f.querySelectorAll(`[data-lista="${agregar.dataset.agregar}"]`);
          items[items.length - 1]?.querySelector('input:not([readonly]), select')?.focus();
          return;
        }
        const quitar = ev.target.closest('[data-quitar-fila]');
        if (quitar) {
          leer(f, m);
          m[quitar.dataset.quitarFila].splice(Number(quitar.dataset.i), 1);
          repintarLista(quitar.dataset.quitarFila);
          return;
        }
        const agregarH = ev.target.closest('[data-agregar-horario]');
        if (agregarH) {
          leer(f, m);
          const a = m.asignaturas[Number(agregarH.dataset.agregarHorario)];
          const ultimo = a.horarios[a.horarios.length - 1];
          a.horarios.push({ dia: ultimo ? Math.min(6, ultimo.dia + 1) : 1, inicio: ultimo ? ultimo.inicio : '', fin: ultimo ? ultimo.fin : '' });
          repintarLista('asignaturas');
          return;
        }
        const quitarH = ev.target.closest('[data-quitar-horario]');
        if (quitarH) {
          leer(f, m);
          m.asignaturas[Number(quitarH.dataset.i)].horarios.splice(Number(quitarH.dataset.quitarHorario), 1);
          repintarLista('asignaturas');
        }
      });

      f.addEventListener('input', (ev) => {
        const c = ev.target.dataset.campo;
        if (c === 'nomina') {
          const n = normalizarNomina(ev.target.value);
          f.querySelector('[data-hint="nomina"]').textContent = n ? `Se guardará como ${n}` : 'Acepta 3560330 o L03560330.';
        }
        if (c === 'curp') {
          const info = datosCurp(ev.target.value);
          const hint = f.querySelector('[data-hint="curp"]');
          if (info) {
            const fecha = f.querySelector('[data-campo="fechaNacimiento"]');
            const genero = f.querySelector('[data-campo="genero"]');
            if (!fecha.value) fecha.value = info.fecha;
            if (!genero.value) genero.value = info.genero;
            hint.textContent = `De la CURP: ${UI.fecha(info.fecha)} · ${info.genero === 'F' ? 'Femenino' : 'Masculino'}`;
            if (fecha.value !== info.fecha) hint.textContent += ' — ⚠ la fecha capturada no coincide; se marcará "Revisar".';
          } else hint.textContent = 'Con la CURP se llenan la fecha de nacimiento y el género.';
        }
      });
      f.addEventListener('change', (ev) => {
        if (ev.target.dataset.campo === 'tipo') repintarLista('asignaturas');
      });

      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        leer(f, m);
        limpiarErrores();
        if (!validarLocal()) return;
        const boton = f.querySelector('[type="submit"]');
        UI.setBusy(boton, true);
        try {
          if (docenteId) {
            await guardarEdicion();
            UI.toast('Cambios guardados.', 'success');
          } else {
            const d = await guardarNuevo();
            guardoAlgo = true;
            UI.toast(`Se dio de alta a ${d.nombre} (${d.nomina}).`, 'success');
          }
          guardoAlgo = true;
          dlg.close();
        } catch (err) {
          marcarErrores(err);
          UI.setBusy(boton, false);
        }
      });

      mostrar(actual);
    });
  }

  async function nuevo() {
    try { await cargarCatalogos(); } catch (err) { UI.toast(err.message, 'error'); return false; }
    return abrirFormulario({ titulo: 'Nuevo docente', modelo: vacio() });
  }

  async function editar(id, { paso } = {}) {
    let docente;
    try {
      await cargarCatalogos();
      ({ docente } = await UI.api(`/docentes/${id}`));
    } catch (err) { UI.toast(err.message, 'error'); return false; }
    return abrirFormulario({ titulo: 'Editar docente', modelo: desdeDetalle(docente), docenteId: id, paso });
  }

  async function altaRapida(valores = {}) {
    const r = await UI.formModal({
      title: 'Alta rápida',
      description: 'Para suplentes o docentes nuevos: solo nómina y nombre. Completa sus datos después.',
      fields: [
        { name: 'nomina', label: 'Nómina', required: true, placeholder: '3560330 o L03560330', inputmode: 'numeric' },
        { name: 'nombre', label: 'Nombre completo', required: true, placeholder: 'Nombre(s) Apellido paterno Apellido materno', maxlength: 200 }
      ],
      values: valores,
      submitText: 'Dar de alta',
      onSubmit: (v) => UI.api('/docentes/alta-rapida', { method: 'POST', body: v })
    });
    if (!r) return false;
    UI.toast(`Se dio de alta a ${r.docente.nombre} (${r.docente.nomina}).`, 'success');
    return r.docente;
  }

  return { nuevo, editar, altaRapida, normalizarNomina, datosCurp };
})();
