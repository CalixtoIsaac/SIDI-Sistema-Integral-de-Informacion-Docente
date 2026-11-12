/**
 * UI kit: utilidades compartidas por todas las pantallas de SIDI.
 *
 *  Seguridad     UI.escape(texto)
 *  API           UI.api('/ruta', { method, body })   → JSON o FormData; lanza Error con .status, .code, .details
 *                UI.descargar('/ruta')              → baja el archivo con el nombre que manda el servidor
 *  Componentes   UI.toast() · UI.confirm() · UI.formModal() · UI.openDialog() · UI.setBusy() · UI.zonaArchivos()
 *  Errores       UI.mensajeCampo(detalle) · UI.listaErrores(err)
 *  Iconos        UI.icon('nombre') · UI.hydrateIcons(raiz)
 *  Formato       UI.formatDate() · UI.fecha() · UI.dinero() · UI.porcentaje() · UI.initials() · UI.guion()
 *  Almacenamiento UI.store.get/set (localStorage que no falla si está bloqueado)
 *
 * Sin login (03 §1): ninguna llamada lleva Authorization.
 */
const UI = (() => {
  let uid = 0;

  // ---------- Seguridad ----------
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escapa un valor antes de insertarlo en HTML. Úsalo SIEMPRE con datos del usuario. */
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  // ---------- Almacenamiento seguro (no falla si está bloqueado) ----------
  const store = {
    get(key, fallback = null) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* sin persistencia */ } }
  };

  // ---------- API ----------
  function errorDe(res, data) {
    const err = new Error((data && data.error) || `Error ${res.status}`);
    err.status = res.status;
    err.code = data && data.code;
    err.details = (data && data.details) || [];
    err.data = data;
    return err;
  }

  /**
   * Llama a la API del servidor.
   *   await UI.api('/docentes')                                     → GET
   *   await UI.api('/docentes', { method: 'POST', body: {...} })     → POST con JSON
   *   await UI.api('/opina/preview', { method: 'POST', body: formData }) → multipart (subida de archivos)
   */
  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    const esForm = typeof FormData !== 'undefined' && body instanceof FormData;
    if (body !== undefined && !esForm) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers,
        body: body === undefined ? undefined : (esForm ? body : JSON.stringify(body))
      });
    } catch {
      throw new Error('No se pudo contactar al servidor. Revisa que esté en ejecución.');
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { error: text }; }
    }
    if (!res.ok) throw errorDe(res, data);
    return data;
  }

  /** Descarga un archivo de la API (Excel, PDF) respetando el nombre de Content-Disposition. */
  async function descargar(path, nombrePorDefecto = 'archivo') {
    let res;
    try { res = await fetch('/api' + path); } catch {
      throw new Error('No se pudo contactar al servidor. Revisa que esté en ejecución.');
    }
    if (!res.ok) {
      let data = null;
      try { data = await res.json(); } catch { /* sin cuerpo */ }
      throw errorDe(res, data);
    }
    const cd = res.headers.get('Content-Disposition') || '';
    const m = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i);
    const nombre = m ? decodeURIComponent(m[1]) : nombrePorDefecto;
    const url = URL.createObjectURL(await res.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return nombre;
  }

  // ---------- Mensajes de validación (details de la API) ----------
  const PROBLEMAS = {
    OBLIGATORIO: 'Es obligatorio.',
    FORMATO: 'El formato no es válido.',
    MUY_LARGO: 'Es demasiado largo.',
    VALOR_INVALIDO: 'El valor no es válido.',
    FECHA_INVALIDA: 'La fecha no es válida.',
    SOLO_DIGITOS: 'Solo se aceptan números.',
    NO_ESTA_EN_CATALOGO: 'No está en el catálogo (agrégalo en Configuración).',
    NO_EXISTE: 'No existe.',
    DIGITO_VERIFICADOR: 'El último dígito de la CURP no coincide. Revísala o marca "Aceptar la CURP como está".',
    CRN_O_ACTIVIDAD: 'Escribe el CRN o el nombre de la actividad.',
    HORAS_INVALIDAS: 'Revisa las horas (inicio antes que fin, formato HH:MM).',
    DEBE_SER_LISTA: 'Debe ser una lista.',
    NOMBRE_Y_APELLIDO: 'Escribe al menos un nombre y un apellido.',
    LONGITUD: 'La CURP debe tener 18 caracteres.'
  };
  const CAMPOS = {
    nomina: 'Nómina', nombres: 'Nombre(s)', apellidoPaterno: 'Apellido paterno', apellidoMaterno: 'Apellido materno',
    curp: 'CURP', fechaNacimiento: 'Fecha de nacimiento', genero: 'Género', nivelImparte: 'Nivel que imparte',
    campoFormacion: 'Campo de formación', trabajoExterno: 'Trabajo externo', correoInstitucional: 'Correo institucional',
    tipoContrato: 'Tipo de contrato', primerSemestre: 'Primer semestre', grado: 'Grado', estatus: 'Estatus',
    nombreTitulo: 'Título', institucion: 'Institución', crn: 'CRN', materia: 'Materia', numContrato: 'Contrato',
    horarios: 'Horario', idioma: 'Idioma', motivo: 'Motivo', observaciones: 'Observaciones', recontratable: 'Recontratable',
    valor: 'Valor', pagoSemestre: 'Pago al semestre', pagoPorDia: 'Pago por día', nombre: 'Nombre'
  };
  /** { campo: 'titulos[0].grado', problema } → "Grado: Es obligatorio." */
  function mensajeCampo(d) {
    if (!d) return '';
    const campo = String(d.campo || '').split('.').pop().replace(/\[\d+\]$/, '');
    const etiqueta = CAMPOS[campo] || campo;
    const texto = PROBLEMAS[d.problema] || d.problema || '';
    return etiqueta ? `${etiqueta}: ${texto}` : texto;
  }
  /** Mensaje del error + lista de details legibles (para mostrar en un formulario). */
  function listaErrores(err) {
    const lineas = (err.details || []).filter((d) => d && d.campo && d.problema).map(mensajeCampo);
    return { mensaje: err.message, lineas };
  }

  // ---------- Iconos (trazos de 24×24) ----------
  const ICONS = {
    logo: '<path d="M22 10 12 5 2 10l10 5 10-5z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    cash: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 10v4M18 10v4"/>',
    star: '<path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
    notes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
    userX: '<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="m17 8 5 5M22 8l-5 5"/>',
    userCheck: '<circle cx="9" cy="8" r="4"/><path d="M1 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/><path d="m16 11 2 2 4-4"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/><path d="M12 15V3"/>',
    columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/>',
    filter: '<path d="M22 3H2l8 9.5V19l4 2v-8.5z"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    chevronDown: '<path d="m6 9 6 6 6-6"/>',
    chevronLeft: '<path d="m15 18-6-6 6-6"/>',
    chevronRight: '<path d="m9 18 6-6-6-6"/>',
    arrowUp: '<path d="M12 19V5M5 12l7-7 7 7"/>',
    arrowDown: '<path d="M12 5v14M19 12l-7 7-7-7"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    external: '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><path d="M15 3h6v6M10 14 21 3"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
    palette: '<circle cx="13.5" cy="6.5" r="1"/><circle cx="17.5" cy="10.5" r="1"/><circle cx="8.5" cy="7.5" r="1"/><circle cx="6.5" cy="12.5" r="1"/><path d="M12 2a10 10 0 0 0 0 20c.9 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.4-.7-.4-1.1 0-.9.8-1.7 1.7-1.7h2A5.6 5.6 0 0 0 22 11c0-5-4.5-9-10-9z"/>'
  };

  function icon(name, extraClass = '') {
    return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }
  /** Reemplaza cada <span data-icon="nombre"> por su SVG. */
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  }

  // ---------- Formato ----------
  /** Convierte "2026-10-19 09:30:00" (formato de SQLite) en una fecha y hora legible. */
  function formatDate(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  }
  /** '1995-02-08' → '08/02/1995' (sin pasar por Date para no moverse de día por la zona horaria). */
  function fecha(iso) {
    const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '');
  }
  const MONEDA = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
  function dinero(n) { return n === null || n === undefined || n === '' ? '—' : MONEDA.format(Number(n)); }
  function porcentaje(n, decimales = 1) {
    return n === null || n === undefined ? '—' : `${Number(n).toFixed(decimales)} %`;
  }
  function guion(v) { return v === null || v === undefined || v === '' ? '—' : escape(v); }
  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  }

  // ---------- Botón ocupado ----------
  function setBusy(button, busy) {
    if (!button) return;
    if (busy) {
      if (button.dataset.busy) return;
      button.dataset.busy = '1';
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      button.innerHTML = `<span class="spinner" aria-hidden="true"></span>${button.dataset.label}`;
    } else if (button.dataset.busy) {
      button.innerHTML = button.dataset.label;
      button.disabled = false;
      button.removeAttribute('aria-busy');
      delete button.dataset.busy;
      delete button.dataset.label;
    }
  }

  // ---------- Notificaciones ----------
  function toast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      stack.setAttribute('role', 'status');
      stack.setAttribute('aria-live', 'polite');
      document.body.appendChild(stack);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = icon({ success: 'check', error: 'alert', warning: 'warning' }[type] || 'info') + `<span>${escape(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    }, type === 'error' ? 6000 : 3500);
  }

  // ---------- Modal base ----------
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  /**
   * Abre un diálogo. size: 'md' (480px) | 'lg' (760px) | 'xl' (1040px).
   * Devuelve { el, close }. El HTML de title/description se escapa; bodyHtml/footerHtml no.
   */
  function openDialog({ title, description = '', bodyHtml = '', footerHtml = '', as = 'div', size = 'md', onClose }) {
    const previousFocus = document.activeElement;
    const titleId = `dialog-title-${++uid}`;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <${as} class="modal modal-${size}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header">
          <h2 id="${titleId}">${escape(title)}</h2>
          ${description ? `<p>${escape(description)}</p>` : ''}
          <button type="button" class="btn btn-ghost btn-icon btn-sm modal-close" data-action="close" aria-label="Cerrar">${icon('x')}</button>
        </div>
        ${bodyHtml ? `<div class="modal-body">${bodyHtml}</div>` : ''}
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </${as}>`;
    const modal = overlay.firstElementChild;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (!document.querySelector('.modal-overlay')) document.body.classList.remove('modal-open');
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (onClose) onClose();
    }
    function onKey(e) {
      if (overlay !== [...document.querySelectorAll('.modal-overlay')].pop()) return; // solo el diálogo de arriba
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    modal.querySelector('[data-action="close"]').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    document.body.classList.add('modal-open');
    return { el: modal, close };
  }

  /**
   * Diálogo de confirmación.
   *   if (await UI.confirm({ title: '¿Eliminar?', message: '...', confirmText: 'Eliminar', danger: true })) { ... }
   * detailHtml (opcional, ya escapado) se muestra debajo del mensaje.
   */
  function confirm({ title = '¿Estás seguro?', message = '', detailHtml = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
      const dialog = openDialog({
        title,
        description: message,
        bodyHtml: detailHtml,
        footerHtml: `
          <button type="button" class="btn btn-outline" data-action="cancel">${escape(cancelText)}</button>
          <button type="button" class="btn ${danger ? 'btn-destructive' : 'btn-primary'}" data-action="ok">${escape(confirmText)}</button>`,
        onClose: () => resolve(false)
      });
      dialog.el.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);
      const ok = dialog.el.querySelector('[data-action="ok"]');
      ok.addEventListener('click', () => { resolve(true); dialog.close(); });
      ok.focus();
    });
  }

  function fieldHtml(field, value) {
    const id = `field-${field.name}-${++uid}`;
    const attrs = [
      `id="${id}"`,
      `name="${escape(field.name)}"`,
      field.required ? 'required' : '',
      field.maxlength ? `maxlength="${Number(field.maxlength)}"` : '',
      field.placeholder ? `placeholder="${escape(field.placeholder)}"` : '',
      field.inputmode ? `inputmode="${escape(field.inputmode)}"` : '',
      field.step ? `step="${escape(field.step)}"` : '',
      field.min !== undefined ? `min="${escape(field.min)}"` : ''
    ].filter(Boolean).join(' ');

    let control;
    if (field.type === 'textarea') {
      control = `<textarea class="input textarea" ${attrs} rows="${field.rows || 4}">${escape(value)}</textarea>`;
    } else if (field.type === 'select') {
      const options = (field.options || []).map((o) =>
        `<option value="${escape(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${escape(o.label)}</option>`
      ).join('');
      control = `<div class="select-wrap"><select class="input select" ${attrs}>${options}</select></div>`;
    } else {
      control = `<input class="input" type="${escape(field.type || 'text')}" ${attrs} value="${escape(value)}">`;
    }
    return `
      <div class="field">
        <label for="${id}">${escape(field.label)}${field.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>
        ${control}
        ${field.hint ? `<p class="hint">${escape(field.hint)}</p>` : ''}
      </div>`;
  }

  /** Muestra el error de la API (mensaje + details) dentro de una caja .alert. */
  function pintarError(box, err) {
    const { mensaje, lineas } = listaErrores(err);
    box.innerHTML = `${escape(mensaje)}${lineas.length ? `<ul>${lineas.map((l) => `<li>${escape(l)}</li>`).join('')}</ul>` : ''}`;
    box.hidden = false;
  }

  /**
   * Formulario en un modal. Resuelve con lo que devuelva onSubmit (o con los
   * valores si no hay onSubmit), o con null si se cancela.
   * Si onSubmit lanza un error, el mensaje se muestra dentro del modal.
   */
  function formModal({ title, description = '', fields, values = {}, submitText = 'Guardar', onSubmit }) {
    return new Promise((resolve) => {
      const dialog = openDialog({
        title,
        description,
        as: 'form',
        bodyHtml: `
          <div class="form">
            ${fields.map((f) => fieldHtml(f, values[f.name] ?? f.default ?? '')).join('')}
            <div class="alert alert-error" data-form-error role="alert" hidden></div>
          </div>`,
        footerHtml: `
          <button type="button" class="btn btn-outline" data-action="cancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">${escape(submitText)}</button>`,
        onClose: () => resolve(null)
      });

      const form = dialog.el;
      const errorBox = form.querySelector('[data-form-error]');
      const submit = form.querySelector('[type="submit"]');
      form.querySelector('[data-action="cancel"]').addEventListener('click', dialog.close);

      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        errorBox.hidden = true;
        const data = {};
        for (const f of fields) data[f.name] = String(form.elements[f.name].value).trim();

        if (!onSubmit) { resolve(data); dialog.close(); return; }
        setBusy(submit, true);
        try {
          const result = await onSubmit(data);
          resolve(result === undefined ? data : result);
          dialog.close();
        } catch (err) {
          pintarError(errorBox, err);
          setBusy(submit, false);
        }
      });

      const first = form.querySelector('input, textarea, select');
      if (first) first.focus();
    });
  }

  // ---------- Zona para soltar archivos ----------
  /**
   * Convierte `el` en una zona "Arrastra aquí…" con botón para elegir.
   *   UI.zonaArchivos(el, { accept: '.xlsx', multiple: false, texto: 'Arrastra aquí el Excel', onArchivos(files) {} })
   */
  function zonaArchivos(el, { accept = '', multiple = false, texto = 'Arrastra aquí el archivo', ayuda = '', onArchivos }) {
    const inputId = `archivo-${++uid}`;
    el.classList.add('dropzone');
    el.innerHTML = `
      <span class="dropzone-icon">${icon('upload')}</span>
      <p class="dropzone-title">${escape(texto)}</p>
      <p class="muted">o <label for="${inputId}" class="link-like">elige ${multiple ? 'los archivos' : 'el archivo'}</label>${ayuda ? ` · ${escape(ayuda)}` : ''}</p>
      <input id="${inputId}" type="file" class="sr-only" ${accept ? `accept="${escape(accept)}"` : ''} ${multiple ? 'multiple' : ''}>`;
    const input = el.querySelector('input');
    const entregar = (lista) => {
      const files = [...(lista || [])];
      if (files.length) onArchivos(multiple ? files : files.slice(0, 1));
    };
    input.addEventListener('change', () => { entregar(input.files); input.value = ''; });
    ['dragenter', 'dragover'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.add('dragging'); }));
    ['dragleave', 'drop'].forEach((ev) => el.addEventListener(ev, (e) => { e.preventDefault(); el.classList.remove('dragging'); }));
    el.addEventListener('drop', (e) => entregar(e.dataTransfer && e.dataTransfer.files));
    return { abrir: () => input.click() };
  }

  /** Espera `ms` desde la última llamada antes de ejecutar fn (búsqueda mientras se escribe). */
  function debounce(fn, ms = 250) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
  }

  return {
    escape, store,
    api, descargar,
    mensajeCampo, listaErrores, pintarError,
    icon, hydrateIcons,
    formatDate, fecha, dinero, porcentaje, guion, initials,
    setBusy, toast, confirm, formModal, openDialog, fieldHtml, zonaArchivos, debounce
  };
})();
