/**
 * UI kit: utilidades compartidas por todas las pantallas.
 *
 *  Seguridad     UI.escape(texto)
 *  Sesión        UI.getToken() · UI.getUser() · UI.setSession() · UI.setUser() · UI.clearSession()
 *  API           UI.api('/ruta', { method, body })  → agrega el token y lanza Error si falla
 *  Componentes   UI.toast() · UI.confirm() · UI.formModal() · UI.setBusy()
 *  Iconos        UI.icon('nombre') · UI.hydrateIcons(raiz)
 *  Formato       UI.formatDate() · UI.initials()
 */
const UI = (() => {
  const TOKEN_KEY = 'app.token';
  const USER_KEY = 'app.user';
  const MESSAGE_KEY = 'app.authMessage';
  let uid = 0;

  // ---------- Seguridad ----------
  const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  /** Escapa un valor antes de insertarlo en HTML. Úsalo SIEMPRE con datos del usuario. */
  function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
  }

  // ---------- Almacenamiento seguro (no falla si está bloqueado) ----------
  const store = {
    get(area, key) { try { return window[area].getItem(key); } catch { return null; } },
    set(area, key, value) { try { window[area].setItem(key, value); } catch { /* sin persistencia */ } },
    remove(area, key) { try { window[area].removeItem(key); } catch { /* nada */ } }
  };

  // ---------- Sesión ----------
  function getToken() { return store.get('localStorage', TOKEN_KEY); }
  function getUser() {
    try { return JSON.parse(store.get('localStorage', USER_KEY)) || null; } catch { return null; }
  }
  function setUser(user) { store.set('localStorage', USER_KEY, JSON.stringify(user)); }
  function setSession(token, user) {
    store.set('localStorage', TOKEN_KEY, token);
    setUser(user);
  }
  /** Cierra la sesión. El mensaje opcional se muestra en la pantalla de login. */
  function clearSession(message) {
    store.remove('localStorage', TOKEN_KEY);
    store.remove('localStorage', USER_KEY);
    if (message) store.set('sessionStorage', MESSAGE_KEY, message);
  }
  function takeAuthMessage() {
    const msg = store.get('sessionStorage', MESSAGE_KEY);
    store.remove('sessionStorage', MESSAGE_KEY);
    return msg;
  }

  // ---------- API ----------
  /**
   * Llama a la API del servidor.
   *   await UI.api('/notas')                                  → GET
   *   await UI.api('/notas', { method: 'POST', body: {...} })  → POST con JSON
   * Si el servidor responde con error, lanza un Error con su mensaje.
   * Si la sesión ya no es válida, vuelve al login.
   */
  async function api(path, { method = 'GET', body } = {}) {
    const headers = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let res;
    try {
      res = await fetch('/api' + path, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw new Error('No se pudo contactar al servidor. Revisa que esté en ejecución.');
    }

    const text = await res.text();
    let data = null;
    if (text) {
      try { data = JSON.parse(text); } catch { data = { error: text }; }
    }

    if (res.status === 401 && data && data.code === 'AUTH_REQUIRED') {
      clearSession(data.error);
      location.replace('/');
    }
    if (!res.ok) {
      const err = new Error((data && data.error) || `Error ${res.status}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }

  // ---------- Iconos (trazos de 24×24) ----------
  const ICONS = {
    logo: '<path d="M12 3 3 8l9 5 9-5z"/><path d="m3 13 9 5 9-5"/>',
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M9.5 21v-6h5v6"/>',
    notes: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="m16 17 5-5-5-5"/><path d="M21 12H9"/>',
    pencil: '<path d="M17 3a2.8 2.8 0 0 1 4 4L7.5 20.5 2 22l1.5-5.5z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    eyeOff: '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a17.6 17.6 0 0 1-3.2 4.2M6.6 6.6C3.9 8.4 2 12 2 12s3.5 7 10 7a10 10 0 0 0 5.4-1.6"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    progress: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 8v4l2.5 2.5"/>',
    inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
    alert: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'
  };

  function icon(name, extraClass = '') {
    return `<svg class="icon ${extraClass}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
  }
  /** Reemplaza cada <span data-icon="nombre"> por su SVG. */
  function hydrateIcons(root = document) {
    root.querySelectorAll('[data-icon]').forEach((el) => { el.outerHTML = icon(el.dataset.icon); });
  }

  // ---------- Formato ----------
  /** Convierte "2026-10-19 09:30:00" (formato de SQLite) en una fecha legible. */
  function formatDate(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' });
  }
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
    el.innerHTML = icon({ success: 'check', error: 'alert' }[type] || 'info') + `<span>${escape(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    }, type === 'error' ? 5000 : 3200);
  }

  // ---------- Modal base ----------
  const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  function openDialog({ title, description = '', bodyHtml = '', footerHtml = '', as = 'div', onClose }) {
    const previousFocus = document.activeElement;
    const titleId = `dialog-title-${++uid}`;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <${as} class="modal" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
        <div class="modal-header">
          <h2 id="${titleId}">${escape(title)}</h2>
          ${description ? `<p>${escape(description)}</p>` : ''}
        </div>
        ${bodyHtml ? `<div class="modal-body">${bodyHtml}</div>` : ''}
        <div class="modal-footer">${footerHtml}</div>
      </${as}>`;
    const modal = overlay.firstElementChild;
    let closed = false;

    function close() {
      if (closed) return;
      closed = true;
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      if (previousFocus && previousFocus.focus) previousFocus.focus();
      if (onClose) onClose();
    }
    function onKey(e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      const items = [...modal.querySelectorAll(FOCUSABLE)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    return { el: modal, close };
  }

  /**
   * Diálogo de confirmación.
   *   if (await UI.confirm({ title: '¿Eliminar?', message: '...', confirmText: 'Eliminar', danger: true })) { ... }
   */
  function confirm({ title = '¿Estás seguro?', message = '', confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false } = {}) {
    return new Promise((resolve) => {
      const dialog = openDialog({
        title,
        description: message,
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
      field.placeholder ? `placeholder="${escape(field.placeholder)}"` : ''
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
        <label for="${id}">${escape(field.label)}</label>
        ${control}
        ${field.hint ? `<p class="hint">${escape(field.hint)}</p>` : ''}
      </div>`;
  }

  /**
   * Formulario en un modal. Resuelve con lo que devuelva onSubmit (o con los
   * valores si no hay onSubmit), o con null si se cancela.
   * Si onSubmit lanza un error, el mensaje se muestra dentro del modal.
   *
   *   const guardado = await UI.formModal({
   *     title: 'Nuevo cliente',
   *     fields: [{ name: 'nombre', label: 'Nombre', required: true }],
   *     onSubmit: (values) => UI.api('/clientes', { method: 'POST', body: values })
   *   });
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
          errorBox.textContent = err.message;
          errorBox.hidden = false;
          setBusy(submit, false);
        }
      });

      const first = form.querySelector('input, textarea, select');
      if (first) first.focus();
    });
  }

  return {
    escape,
    getToken, getUser, setUser, setSession, clearSession, takeAuthMessage,
    api,
    icon, hydrateIcons,
    formatDate, initials,
    setBusy, toast, confirm, formModal
  };
})();
