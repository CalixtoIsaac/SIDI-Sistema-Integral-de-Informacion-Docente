/**
 * Módulo de ejemplo: Notas (alta, edición, eliminación, búsqueda y filtro).
 * Úsalo como modelo para los módulos de tu proyecto.
 *
 * API pública: Notas.mount(contenedor), Notas.fetchAll(), Notas.openForm(nota?), Notas.badge(estado)
 */
const Notas = (() => {
  const ESTADOS = {
    pendiente:   { label: 'Pendiente',   badge: 'badge-warning' },
    en_progreso: { label: 'En progreso', badge: 'badge-info' },
    terminada:   { label: 'Terminada',   badge: 'badge-success' }
  };

  // Estado privado del módulo
  const state = { notas: [], q: '', estado: '', el: null };

  // ---------- Datos ----------
  function fetchAll() {
    return UI.api('/notas'); // → { notas, resumen }
  }

  function filtered() {
    const q = state.q.toLowerCase();
    return state.notas.filter((n) =>
      (!state.estado || n.estado === state.estado) &&
      (!q || n.titulo.toLowerCase().includes(q) || n.contenido.toLowerCase().includes(q))
    );
  }

  // ---------- Fragmentos de HTML ----------
  function badge(estado) {
    const e = ESTADOS[estado] || { label: estado, badge: '' };
    return `<span class="badge ${e.badge}">${UI.escape(e.label)}</span>`;
  }

  function emptyState({ icon = 'inbox', title, text, action = '' }) {
    return `
      <div class="card empty-state">
        <span class="empty-icon">${UI.icon(icon)}</span>
        <h3>${UI.escape(title)}</h3>
        <p class="muted">${UI.escape(text)}</p>
        ${action}
      </div>`;
  }

  function noteCard(n) {
    const titulo = UI.escape(n.titulo);
    return `
      <article class="card note">
        <div class="note-head">
          <h3 class="note-title">${titulo}</h3>
          ${badge(n.estado)}
        </div>
        ${n.contenido
          ? `<p class="note-body">${UI.escape(n.contenido)}</p>`
          : '<p class="note-body note-empty">Sin contenido</p>'}
        <div class="note-foot">
          <span class="note-date" title="Creada: ${UI.escape(UI.formatDate(n.creado_en))}">
            ${UI.escape(UI.formatDate(n.actualizado_en))}
          </span>
          <div class="note-actions">
            <button class="btn btn-ghost btn-icon btn-sm" type="button" data-action="edit" data-id="${n.id}"
                    aria-label="Editar ${titulo}" title="Editar">${UI.icon('pencil')}</button>
            <button class="btn btn-ghost btn-icon btn-sm btn-danger-ghost" type="button" data-action="delete" data-id="${n.id}"
                    aria-label="Eliminar ${titulo}" title="Eliminar">${UI.icon('trash')}</button>
          </div>
        </div>
      </article>`;
  }

  // ---------- Vista ----------
  function mount(container) {
    // La vista vive en su propio elemento: así los escuchadores se eliminan
    // junto con ella al cambiar de pantalla y no se acumulan.
    const root = document.createElement('div');
    container.appendChild(root);
    state.el = root;
    const opciones = Object.entries(ESTADOS)
      .map(([value, e]) => `<option value="${value}"${state.estado === value ? ' selected' : ''}>${e.label}</option>`)
      .join('');

    root.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Notas</h2>
          <p class="muted">Módulo de ejemplo con alta, edición, eliminación, búsqueda y filtro.</p>
        </div>
      </section>

      <div class="toolbar">
        <label class="search">
          <span class="sr-only">Buscar notas</span>
          ${UI.icon('search')}
          <input class="input" id="notasSearch" type="search" placeholder="Buscar por título o contenido…"
                 value="${UI.escape(state.q)}" autocomplete="off">
        </label>
        <div class="select-wrap">
          <label class="sr-only" for="notasEstado">Filtrar por estado</label>
          <select class="input select" id="notasEstado">
            <option value="">Todos los estados</option>${opciones}
          </select>
        </div>
        <button class="btn btn-primary" type="button" data-action="create">${UI.icon('plus')}Nueva nota</button>
      </div>

      <p class="result-count" id="notasCount" aria-live="polite"></p>
      <div id="notasList"></div>`;

    root.querySelector('#notasSearch').addEventListener('input', (e) => {
      state.q = e.target.value.trim();
      renderList();
    });
    root.querySelector('#notasEstado').addEventListener('change', (e) => {
      state.estado = e.target.value;
      renderList();
    });
    root.addEventListener('click', onAction);

    load();
  }

  async function load() {
    const list = state.el.querySelector('#notasList');
    list.innerHTML = `<div class="notes-grid">${
      '<div class="card note note-skeleton"><span class="skeleton"></span><span class="skeleton"></span></div>'.repeat(3)
    }</div>`;
    try {
      const { notas } = await fetchAll();
      state.notas = notas;
      renderList();
    } catch (err) {
      state.el.querySelector('#notasCount').textContent = '';
      list.innerHTML = emptyState({
        icon: 'alert',
        title: 'No se pudieron cargar las notas',
        text: err.message,
        action: '<button class="btn btn-outline" type="button" data-action="retry">Reintentar</button>'
      });
    }
  }

  function renderList() {
    const list = state.el.querySelector('#notasList');
    const count = state.el.querySelector('#notasCount');
    const items = filtered();
    const total = state.notas.length;

    if (!total) {
      count.textContent = '';
      list.innerHTML = emptyState({
        title: 'Aún no tienes notas',
        text: 'Crea la primera para ver cómo funciona el módulo.',
        action: `<button class="btn btn-primary" type="button" data-action="create">${UI.icon('plus')}Crear nota</button>`
      });
      return;
    }

    count.textContent = items.length === total
      ? `${total} nota${total === 1 ? '' : 's'}`
      : `${items.length} de ${total} notas`;

    list.innerHTML = items.length
      ? `<div class="notes-grid">${items.map(noteCard).join('')}</div>`
      : emptyState({ icon: 'search', title: 'Sin resultados', text: 'Prueba con otra búsqueda o cambia el filtro.' });
  }

  // ---------- Acciones ----------
  function onAction(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const nota = state.notas.find((n) => n.id === Number(btn.dataset.id));

    switch (btn.dataset.action) {
      case 'create': openForm().then((saved) => saved && load()); break;
      case 'edit':   if (nota) openForm(nota).then((saved) => saved && load()); break;
      case 'delete': if (nota) remove(nota); break;
      case 'retry':  load(); break;
    }
  }

  /** Abre el formulario de alta o edición. Resuelve true si se guardó. */
  async function openForm(nota = null) {
    const saved = await UI.formModal({
      title: nota ? 'Editar nota' : 'Nueva nota',
      description: nota ? '' : 'Las notas son el ejemplo de CRUD de la plantilla.',
      submitText: nota ? 'Guardar cambios' : 'Crear nota',
      values: nota || { estado: 'pendiente' },
      fields: [
        { name: 'titulo', label: 'Título', required: true, maxlength: 120, placeholder: 'Ej. Revisar la entrega del proyecto' },
        { name: 'contenido', label: 'Contenido', type: 'textarea', maxlength: 2000, placeholder: 'Detalles (opcional)' },
        {
          name: 'estado', label: 'Estado', type: 'select',
          options: Object.entries(ESTADOS).map(([value, e]) => ({ value, label: e.label }))
        }
      ],
      onSubmit: async (values) => {
        const result = nota
          ? await UI.api(`/notas/${nota.id}`, { method: 'PUT', body: values })
          : await UI.api('/notas', { method: 'POST', body: values });
        return result.nota;
      }
    });
    if (saved) UI.toast(nota ? 'Nota actualizada.' : 'Nota creada.', 'success');
    return Boolean(saved);
  }

  async function remove(nota) {
    const ok = await UI.confirm({
      title: '¿Eliminar esta nota?',
      message: `Se eliminará "${nota.titulo}". Esta acción no se puede deshacer.`,
      confirmText: 'Eliminar',
      danger: true
    });
    if (!ok) return;
    try {
      await UI.api(`/notas/${nota.id}`, { method: 'DELETE' });
      UI.toast('Nota eliminada.', 'success');
      load();
    } catch (err) {
      UI.toast(err.message, 'error');
    }
  }

  return { mount, fetchAll, openForm, badge, ESTADOS };
})();
