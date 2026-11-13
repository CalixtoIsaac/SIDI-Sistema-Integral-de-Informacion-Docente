/**
 * Estructura de SIDI: menú lateral, búsqueda global, navegación entre vistas y
 * sincronización del perfil (nombre, modo y color) con /api/configuracion.
 *
 * Cada vista es un módulo IIFE con mount(contenedor, parametros).
 * Para agregar una pantalla nueva:
 *   1. Crea public/js/mi-vista.js con mount().
 *   2. Cárgalo en app.html antes de app.js.
 *   3. Regístrala en VIEWS y agrega su enlace en el menú de app.html.
 *
 * Rutas: #docentes, #docentes?search=texto, #opina, …
 */
const App = (() => {
  /** Vista provisional para lo que llega en sprints posteriores. */
  function proximamente(titulo, sprint, historias, texto) {
    return {
      mount(el) {
        el.innerHTML = `
          <section class="page-header"><div><h2>${UI.escape(titulo)}</h2>
            <p class="muted">${UI.escape(texto)}</p></div></section>
          <div class="card"><div class="empty-state">
            <span class="empty-icon">${UI.icon('clock')}</span>
            <h3>Disponible en el ${UI.escape(sprint)}</h3>
            <p class="muted">Historias: ${UI.escape(historias)}. Mientras tanto puedes capturar docentes, grupos, contratos y OPINA.</p>
            <a class="btn btn-outline" href="#docentes">${UI.icon('users')}Ir a Docentes</a>
          </div></div>`;
      }
    };
  }

  const VIEWS = {
    panel: { title: 'Panel', module: () => Panel },
    docentes: { title: 'Docentes', module: () => Docentes },
    faltas: { title: 'Faltas', module: () => proximamente('Faltas y descuentos', 'Sprint 2', 'HU-09, HU-10, HU-22', 'Registro de faltas por día y CRN, suplencias y docentes disponibles.') },
    incidencias: { title: 'Incidencias', module: () => proximamente('Incidencias', 'Sprint 2', 'HU-11', 'Pagos adicionales de la quincena.') },
    opina: { title: 'OPINA', module: () => Opina },
    reportes: { title: 'Reportes', module: () => proximamente('Reportes de Nacional', 'Sprint 2', 'HU-12, HU-13, HU-14', 'Excel de Descuentos e Incidencias de la quincena e inasistencias por semestre.') },
    configuracion: { title: 'Configuración', module: () => Catalogos },
    perfil: { title: 'Perfil', module: () => Perfil }
  };
  const DEFAULT_VIEW = 'panel';
  const $ = (id) => document.getElementById(id);

  UI.hydrateIcons(document);

  // ---------- Menú lateral (móvil) ----------
  const sidebar = $('sidebar');
  const backdrop = $('sidebarBackdrop');
  const menuBtn = $('menuBtn');
  function setSidebar(open) {
    sidebar.classList.toggle('open', open);
    backdrop.hidden = !open;
    menuBtn.setAttribute('aria-expanded', String(open));
  }
  menuBtn.addEventListener('click', () => setSidebar(!sidebar.classList.contains('open')));
  backdrop.addEventListener('click', () => setSidebar(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && sidebar.classList.contains('open')) setSidebar(false);
  });

  // ---------- Perfil: nombre, modo y color (la BD es la fuente de verdad) ----------
  let configuracion = {};
  function pintarPerfil() {
    const nombre = configuracion['perfil.nombre'] || 'Coordinación de Docentes';
    $('perfilNombre').textContent = nombre;
    $('perfilAvatar').textContent = UI.initials(nombre);
  }
  async function cargarConfiguracion() {
    try {
      ({ configuracion } = await UI.api('/configuracion'));
      pintarPerfil();
      const t = SidiTema.obtener();
      if (configuracion['tema.modo'] !== t.modo || String(configuracion['tema.color']).toUpperCase() !== t.color) {
        SidiTema.aplicar({ modo: configuracion['tema.modo'], color: configuracion['tema.color'] });
      }
    } catch (err) {
      UI.toast(`No se pudo leer el perfil: ${err.message}`, 'error');
    }
  }
  /** Guarda claves de configuración y avisa a las vistas abiertas. */
  async function guardarConfiguracion(cambios) {
    const r = await UI.api('/configuracion', { method: 'PUT', body: cambios });
    configuracion = r.configuracion;
    pintarPerfil();
    return configuracion;
  }
  // El botón ☀/🌙 cambia el modo al instante (theme.js) y aquí se persiste.
  window.addEventListener('sidi:tema-guardar', (e) => {
    guardarConfiguracion(e.detail).catch((err) => UI.toast(`No se guardó el modo: ${err.message}`, 'error'));
  });

  // ---------- Búsqueda global (barra superior) ----------
  const busqueda = $('busquedaGlobal');
  const irABuscar = UI.debounce(() => {
    const q = busqueda.value.trim();
    if (vistaActual === 'docentes' && Docentes.buscar) Docentes.buscar(q);
    else if (q) location.hash = `docentes?search=${encodeURIComponent(q)}`;
  }, 300);
  busqueda.addEventListener('input', irABuscar);
  busqueda.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); irABuscar(); } });

  // ---------- Navegación ----------
  let vistaActual = null;
  function leerRuta() {
    const [clave, query = ''] = location.hash.slice(1).split('?');
    return { clave: VIEWS[clave] ? clave : DEFAULT_VIEW, parametros: Object.fromEntries(new URLSearchParams(query)) };
  }

  function navigate() {
    const { clave, parametros } = leerRuta();
    const view = VIEWS[clave];

    document.querySelectorAll('[data-view]').forEach((link) => {
      const active = link.dataset.view === clave;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    $('pageTitle').textContent = view.title;
    document.title = `${view.title} · SIDI`;
    if (clave !== 'docentes' && document.activeElement !== busqueda) busqueda.value = '';
    else if (parametros.search !== undefined) busqueda.value = parametros.search;

    const container = $('view');
    container.innerHTML = '';
    vistaActual = clave;
    view.module().mount(container, parametros);
    setSidebar(false);
    window.scrollTo(0, 0);
  }

  /** Arranca después de definir App, para que las vistas puedan usarlo desde mount(). */
  function iniciar() {
    window.addEventListener('hashchange', navigate);
    pintarPerfil();
    navigate();
    cargarConfiguracion();
  }

  return {
    iniciar,
    guardarConfiguracion,
    configuracion: () => ({ ...configuracion }),
    /** Docentes avisa aquí su búsqueda para que la barra superior muestre lo mismo. */
    sincronizarBusqueda(q) { if (document.activeElement !== busqueda) busqueda.value = q; }
  };
})();

App.iniciar();
