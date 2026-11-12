/**
 * Panel (primera vista al abrir). Versión del Sprint 1: indicadores que ya se pueden
 * calcular con lo cargado (docentes, grupos, contratos y OPINA) y las últimas cargas.
 * Las gráficas con Chart.js y el resumen ejecutivo llegan con HU-15 (Sprint 2) y HU-26 (Sprint 3).
 */
const Panel = (() => {
  let el = null;

  function tarjeta(etiqueta, valor, icono, tono, nota = '') {
    return `
      <div class="card stat">
        <div>
          <p class="stat-label">${UI.escape(etiqueta)}</p>
          <p class="stat-value">${valor === null ? '<span class="skeleton"></span>' : valor}</p>
          ${nota ? `<small>${nota}</small>` : ''}
        </div>
        <span class="stat-icon ${tono}">${UI.icon(icono)}</span>
      </div>`;
  }

  function mount(container) {
    el = container;
    container.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Panel administrativo</h2>
          <p class="muted" id="panelPeriodo">Resumen de la plantilla docente.</p>
        </div>
        <button class="btn btn-outline" type="button" disabled title="Llega en el Sprint 3 (HU-26)">${UI.icon('chart')}Resumen ejecutivo</button>
      </section>
      <div class="stats stats-5" id="panelStats">
        ${tarjeta('Docentes activos', null, 'users', 'tone-success')}
        ${tarjeta('Datos incompletos', null, 'warning', 'tone-warning')}
        ${tarjeta('Docentes con grupos sin contrato', null, 'file', 'tone-warning')}
        ${tarjeta('OPINA promedio', null, 'star', 'tone-primary')}
      </div>
      <div class="grid-2">
        <section class="card">
          <div class="card-header"><h3>Atajos</h3></div>
          <div class="card-body stack">
            <a class="btn btn-outline" href="#docentes">${UI.icon('users')}Consultar docentes</a>
            <button class="btn btn-outline" type="button" data-cargar="grupos">${UI.icon('upload')}Subir Excel de grupos</button>
            <button class="btn btn-outline" type="button" data-cargar="cv">${UI.icon('upload')}Subir CV (PDF)</button>
            <a class="btn btn-outline" href="#opina">${UI.icon('star')}Subir OPINA</a>
          </div>
        </section>
        <section class="card">
          <div class="card-header"><h3>Últimas cargas</h3></div>
          <div id="panelCargas"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
        </section>
      </div>
      <p class="muted small mt">Las gráficas del panel (OPINA por maestro, nivel, género, faltas y cumpleaños) llegan en el Sprint 2.</p>`;

    container.querySelectorAll('[data-cargar]').forEach((b) => b.addEventListener('click', async () => {
      const ok = b.dataset.cargar === 'grupos' ? await Importar.grupos() : await Importar.cv();
      if (ok) cargar();
    }));
    cargar();
  }

  async function cargar() {
    const stats = el.querySelector('#panelStats');
    try {
      const [{ docentes, periodo, periodoOpina }, grupos, opina, contratos] = await Promise.all([
        UI.api('/docentes'),
        UI.api('/grupos/importaciones').catch(() => ({ importaciones: [] })),
        UI.api('/opina/importaciones').catch(() => ({ importaciones: [] })),
        UI.api('/contratos/importaciones').catch(() => ({ importaciones: [] }))
      ]);
      const activos = docentes.filter((d) => d.activo).length;
      const incompletos = docentes.filter((d) => d.activo && d.incompleto.length).length;
      const sinContrato = docentes.reduce((n, d) => n + (d.incompleto.includes('contrato') ? 1 : 0), 0);
      const conOpina = docentes.filter((d) => d.opina && !d.opina.muestraInsuficiente);
      const promedio = conOpina.length ? conOpina.reduce((s, d) => s + d.opina.porcentaje, 0) / conOpina.length : null;
      el.querySelector('#panelPeriodo').textContent = periodo ? `Semestre ${periodo}` : 'Aún no hay grupos cargados.';
      stats.innerHTML = [
        tarjeta('Docentes activos', `${activos} / ${docentes.length}`, 'users', 'tone-success'),
        tarjeta('Datos incompletos', incompletos, 'warning', 'tone-warning', 'Docentes activos con algún dato pendiente'),
        tarjeta('Docentes con grupos sin contrato', sinContrato, 'file', 'tone-warning', '<a href="#configuracion">Subir contratos</a>'),
        tarjeta('OPINA promedio', promedio === null ? '—' : UI.porcentaje(promedio), 'star', 'tone-primary',
          periodoOpina ? `Promedio de maestros · ${UI.escape(periodoOpina)}` : 'Sin OPINA cargado')
      ].join('');
      pintarCargas([
        ...grupos.importaciones.map((i) => ({ ...i, tipo: 'Excel de grupos' })),
        ...opina.importaciones.map((i) => ({ ...i, tipo: 'OPINA' })),
        ...contratos.importaciones.map((i) => ({ ...i, tipo: 'Contratos' }))
      ].sort((a, b) => String(b.importadoEn).localeCompare(String(a.importadoEn))).slice(0, 6));
    } catch (err) {
      stats.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`;
    }
  }

  function pintarCargas(lista) {
    const box = el.querySelector('#panelCargas');
    box.innerHTML = lista.length
      ? `<ul class="recent-list">${lista.map((i) => `
          <li class="recent-item">
            <span class="badge badge-primary badge-plain">${UI.escape(i.tipo)}</span>
            <span class="recent-title" title="${UI.escape(i.archivo)}">${UI.escape(i.archivo)} · ${UI.escape(i.periodo)}</span>
            <span class="recent-date">${UI.escape(UI.formatDate(i.importadoEn))}</span>
          </li>`).join('')}</ul>`
      : `<div class="empty-state"><span class="empty-icon">${UI.icon('inbox')}</span>
           <h3>Todavía no hay cargas</h3><p class="muted">Empieza por el Excel de grupos del semestre.</p></div>`;
  }

  return { mount };
})();
