/**
 * Vista OPINA (05 §7). Sprint 1: carga con vista previa (HU-08) e historial de importaciones.
 * El ranking completo (HU-16) y el comparativo del campus (HU-24) se agregan en los sprints 2 y 3.
 */
const Opina = (() => {
  let el = null;
  const VERSION = { v1: 'Formato 2024–2025', v2: 'Formato 2026' };

  function mount(container) {
    el = container;
    container.innerHTML = `
      <section class="page-header">
        <div><h2>OPINA</h2><p class="muted">Encuesta de opinión de alumnos sobre sus profesores.</p></div>
        <button class="btn btn-primary" type="button" id="opinaSubir">${UI.icon('upload')}Subir archivo OPINA (.xlsx / .xlsb)</button>
      </section>
      <div class="tabs" role="tablist">
        <button type="button" class="tab" role="tab" aria-selected="false" disabled title="Llega en el Sprint 2 (HU-16)">Ranking completo</button>
        <button type="button" class="tab" role="tab" aria-selected="false" disabled title="Llega en el Sprint 3 (HU-24)">Comparativo del campus</button>
        <button type="button" class="tab" role="tab" aria-selected="true">Importaciones</button>
      </div>
      <section class="card">
        <div class="card-header"><div><h3>Importaciones</h3><p class="card-sub">Un archivo por semestre. Volver a subir el mismo semestre lo reemplaza.</p></div></div>
        <div id="opinaLista"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
      </section>
      <p class="muted small mt">El porcentaje de cada docente se ve en la columna OPINA de Docentes y en su ficha (pestaña OPINA).</p>`;
    el.querySelector('#opinaSubir').addEventListener('click', async () => { if (await Importar.opina()) cargar(); });
    el.querySelector('#opinaLista').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-eliminar]');
      if (!b) return;
      const ok = await UI.confirm({
        title: `¿Eliminar el OPINA de ${b.dataset.periodo}?`,
        message: 'Se borran todas sus respuestas. Los docentes y grupos que creó se conservan.',
        confirmText: 'Eliminar',
        danger: true
      });
      if (!ok) return;
      try {
        await UI.api(`/opina/importaciones/${b.dataset.eliminar}`, { method: 'DELETE' });
        UI.toast('Importación eliminada.', 'success');
        cargar();
      } catch (err) { UI.toast(err.message, 'error'); }
    });
    cargar();
  }

  async function cargar() {
    const box = el.querySelector('#opinaLista');
    try {
      const { importaciones } = await UI.api('/opina/importaciones');
      box.innerHTML = importaciones.length
        ? `<div class="table-wrap"><table class="table">
            <thead><tr><th>Semestre</th><th>Archivo</th><th>Formato</th><th>Filtro</th><th class="num">Filas</th><th class="num">Descartadas</th><th class="num">Respuestas</th><th>Importado</th><th></th></tr></thead>
            <tbody>${importaciones.map((i) => `<tr>
              <td><strong>${UI.escape(i.periodo)}</strong></td><td>${UI.escape(i.archivo)}</td><td>${UI.escape(VERSION[i.version] || i.version)}</td>
              <td>${i.soloPresencial ? 'Presencial' : 'Todas las modalidades'} · ${UI.escape(i.filtroCampus || 'todos los campus')}</td>
              <td class="num">${Number(i.filas).toLocaleString('es-MX')}</td><td class="num">${Number(i.filasDescartadas).toLocaleString('es-MX')}</td>
              <td class="num">${Number(i.respuestas).toLocaleString('es-MX')}</td><td class="nowrap">${UI.escape(UI.formatDate(i.importadoEn))}</td>
              <td><button type="button" class="btn btn-ghost btn-sm btn-danger-ghost" data-eliminar="${i.id}" data-periodo="${UI.escape(i.periodo)}">${UI.icon('trash')}Eliminar</button></td>
            </tr>`).join('')}</tbody></table></div>`
        : `<div class="empty-state"><span class="empty-icon">${UI.icon('star')}</span><h3>Aún no hay OPINA cargado</h3>
             <p class="muted">Sube el archivo OPINA por alumno del semestre (.xlsx o .xlsb).</p></div>`;
    } catch (err) {
      box.innerHTML = `<div class="card-body"><div class="alert alert-error">${UI.escape(err.message)}</div></div>`;
    }
  }

  return { mount };
})();
