/**
 * Estructura de la aplicación: sesión, menú lateral y navegación entre vistas.
 *
 * Cada vista es un módulo con un método mount(contenedor).
 * Para agregar una pantalla nueva:
 *   1. Crea public/js/mi-modulo.js (copia notas.js como modelo).
 *   2. Cárgalo en app.html antes de app.js.
 *   3. Regístralo en VIEWS y agrega su enlace en el menú de app.html.
 */
(() => {
  const VIEWS = {
    inicio: { title: 'Inicio', module: () => Inicio },
    notas:  { title: 'Notas',  module: () => Notas }
  };
  const DEFAULT_VIEW = 'inicio';

  const $ = (id) => document.getElementById(id);

  if (!UI.getToken()) {
    location.replace('/');
    return;
  }

  UI.hydrateIcons(document);

  // ---------- Usuario ----------
  function renderUser(user) {
    if (!user) return;
    $('userName').textContent = user.nombre;
    $('userHandle').textContent = '@' + user.usuario;
    $('userAvatar').textContent = UI.initials(user.nombre);
  }

  async function refreshUser() {
    try {
      const { user } = await UI.api('/auth/me');
      UI.setUser(user);
      renderUser(user);
    } catch (err) {
      if (err.status !== 401) UI.toast(err.message, 'error');
    }
  }

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

  // ---------- Cerrar sesión ----------
  $('logoutBtn').addEventListener('click', async () => {
    const ok = await UI.confirm({
      title: '¿Cerrar sesión?',
      message: 'Tendrás que volver a escribir tu contraseña para entrar.',
      confirmText: 'Cerrar sesión'
    });
    if (!ok) return;
    UI.clearSession();
    location.replace('/');
  });

  // ---------- Navegación ----------
  function navigate() {
    const requested = location.hash.slice(1);
    const key = VIEWS[requested] ? requested : DEFAULT_VIEW;
    const view = VIEWS[key];

    document.querySelectorAll('[data-view]').forEach((link) => {
      const active = link.dataset.view === key;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });

    $('pageTitle').textContent = view.title;
    document.title = `${view.title} · Mi Proyecto`;

    const container = $('view');
    container.innerHTML = '';
    view.module().mount(container);
    setSidebar(false);
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', navigate);

  renderUser(UI.getUser());
  navigate();
  refreshUser();
})();
