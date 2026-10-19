/**
 * Vista de inicio (pantalla que aparece tras iniciar sesión):
 * saludo, tarjetas de resumen y actividad reciente.
 */
const Inicio = (() => {
  const CARDS = [
    { key: 'total',       label: 'Total de notas', icon: 'notes',    tone: 'tone-primary' },
    { key: 'pendiente',   label: 'Pendientes',     icon: 'clock',    tone: 'tone-warning' },
    { key: 'en_progreso', label: 'En progreso',    icon: 'progress', tone: 'tone-info' },
    { key: 'terminada',   label: 'Terminadas',     icon: 'check',    tone: 'tone-success' }
  ];

  let el = null;

  function greeting() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
  }

  function statCard(card, value) {
    return `
      <div class="card stat">
        <div>
          <p class="stat-label">${UI.escape(card.label)}</p>
          <p class="stat-value">${value === null ? '<span class="skeleton"></span>' : value}</p>
        </div>
        <span class="stat-icon ${card.tone}">${UI.icon(card.icon)}</span>
      </div>`;
  }

  function mount(container) {
    el = container;
    const user = UI.getUser() || {};
    const firstName = String(user.nombre || '').split(' ')[0];

    container.innerHTML = `
      <section class="page-header">
        <div>
          <h2>${greeting()}${firstName ? ', ' + UI.escape(firstName) : ''}</h2>
          <p class="muted">Este es el resumen de tu espacio de trabajo.</p>
        </div>
        <button class="btn btn-primary" type="button" id="inicioNew">${UI.icon('plus')}Nueva nota</button>
      </section>

      <div class="stats" id="inicioStats">${CARDS.map((c) => statCard(c, null)).join('')}</div>

      <section class="card">
        <div class="card-header">
          <h3>Actividad reciente</h3>
          <a class="btn btn-ghost btn-sm" href="#notas">Ver todas</a>
        </div>
        <div id="inicioRecent">
          <div class="recent-skeleton"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
        </div>
      </section>`;

    container.querySelector('#inicioNew').addEventListener('click', async () => {
      if (await Notas.openForm()) load();
    });

    load();
  }

  async function load() {
    const stats = el.querySelector('#inicioStats');
    const recent = el.querySelector('#inicioRecent');
    try {
      const { notas, resumen } = await Notas.fetchAll();
      stats.innerHTML = CARDS.map((c) => statCard(c, resumen[c.key] ?? 0)).join('');

      recent.innerHTML = notas.length
        ? `<ul class="recent-list">${notas.slice(0, 5).map((n) => `
            <li class="recent-item">
              <span class="recent-title">${UI.escape(n.titulo)}</span>
              ${Notas.badge(n.estado)}
              <span class="recent-date">${UI.escape(UI.formatDate(n.actualizado_en))}</span>
            </li>`).join('')}</ul>`
        : `<div class="empty-state">
             <span class="empty-icon">${UI.icon('inbox')}</span>
             <h3>Todavía no hay actividad</h3>
             <p class="muted">Cuando crees o edites notas, aparecerán aquí.</p>
           </div>`;
    } catch (err) {
      stats.innerHTML = CARDS.map((c) => statCard(c, '—')).join('');
      recent.innerHTML = `<div class="empty-state"><p class="muted">${UI.escape(err.message)}</p></div>`;
    }
  }

  return { mount };
})();
