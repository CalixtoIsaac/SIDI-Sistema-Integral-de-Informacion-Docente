/**
 * Inasistencias por semestre (HU-14; 05 §8 "Además"). Se muestra debajo de los reportes de Nacional.
 *
 *   Inasistencias.montar(contenedor)
 *
 * Semestre elegible · número de faltas y días faltados · profesores que faltaron · descontado · pagado a
 * suplentes · faltas por motivo y por tipo (gráficas) y tabla de profesores (clic → ficha, pestaña Faltas).
 * API: GET /api/periodos · GET /api/faltas/resumen-semestral?periodoId=  (services/inasistenciasService.js:
 * una falta = un CRN, un día y una sesión, como en el Excel de Descuentos).
 */
const Inasistencias = (() => {
  let box = null;
  let periodos = [];
  let periodoId = '';
  let peticion = 0;

  async function montar(contenedor) {
    box = contenedor;
    box.innerHTML = `
      <div class="card-header card-header-row">
        <div><h3>${UI.icon('calendar')}Inasistencias por semestre</h3><p class="card-sub">Todas las faltas registradas del semestre, reportadas o pendientes.</p></div>
        <span class="select-wrap"><select class="input select" data-ina-periodo aria-label="Semestre" disabled><option>—</option></select></span>
      </div>
      <div class="card-body" data-ina-cuerpo><span class="skeleton" style="height:120px"></span></div>`;
    try { ({ periodos } = await UI.api('/periodos')); } catch (err) { periodos = []; }
    if (!box.isConnected) return;
    const sel = box.querySelector('[data-ina-periodo]');
    const lista = periodos.filter((p) => p.tieneGrupos || p.actual);
    const elegible = lista.length ? lista : periodos;
    if (!elegible.length) {
      box.querySelector('[data-ina-cuerpo]').innerHTML = '<p class="muted small grafica-vacia">Aún no hay semestres cargados.</p>';
      return;
    }
    periodoId = String((elegible.find((p) => p.actual) || elegible[0]).id);
    sel.innerHTML = elegible.map((p) => `<option value="${p.id}" ${String(p.id) === periodoId ? 'selected' : ''}>${UI.escape(p.clave)}</option>`).join('');
    sel.disabled = elegible.length < 2;
    sel.addEventListener('change', () => { periodoId = sel.value; cargar(); });
    box.querySelector('[data-ina-cuerpo]').addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-docente]');
      if (b) location.hash = `docentes?search=${encodeURIComponent(b.dataset.nomina)}&ficha=${b.dataset.docente}&pestana=faltas`;
    });
    cargar();
  }

  async function cargar() {
    const n = ++peticion;
    const cuerpo = box.querySelector('[data-ina-cuerpo]');
    cuerpo.style.opacity = '.55';
    try {
      const r = await UI.api(`/faltas/resumen-semestral?periodoId=${periodoId}`);
      if (n !== peticion || !box.isConnected) return;
      cuerpo.innerHTML = pintar(r);
    } catch (err) {
      if (n === peticion) cuerpo.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`;
    } finally {
      if (n === peticion) cuerpo.style.opacity = '';
    }
  }

  function pintar(r) {
    const i = r.indicadores;
    if (!i.faltas) {
      return `<div class="empty-state small-empty"><span class="empty-icon">${UI.icon('check')}</span>
        <h3>Sin faltas en este semestre</h3><p class="muted">Las faltas se registran en <a href="#faltas">Faltas</a>.</p></div>`;
    }
    const sinDescuento = r.porTipo.filter((t) => t.tipo !== 'Asunto personal' && t.faltas);
    return `
      <div class="stats stats-5">
        ${Comun.stat('Número de faltas', String(i.faltas), { icono: 'calendar', tono: 'tone-warning', sub: `${i.diasFaltados} día(s) faltados` })}
        ${Comun.stat('Profesores que faltaron', String(i.profesores), { icono: 'users', tono: 'tone-primary' })}
        ${Comun.stat('Descontado', UI.escape(UI.dinero(i.montoDescontado)), { icono: 'cash', tono: 'tone-warning', sub: sinDescuento.length ? `${sinDescuento.map((t) => `${t.faltas} por ${t.tipo.toLowerCase()}`).join(' · ')} (sin descuento)` : '' })}
        ${Comun.stat('Pagado a suplentes', UI.escape(UI.dinero(i.pagadoSuplentes)), { icono: 'cash', tono: 'tone-primary', sub: `${i.cubiertas} falta(s) cubiertas` })}
      </div>
      <div class="inasistencias-grid mt">
        <div>
          <p class="section-title">Faltas por motivo</p>
          ${Graficas.barras(r.porMotivo.map((m) => ({ etiqueta: m.motivo, valor: m.faltas, nota: `${m.profesores} prof.` })), { etiquetaAncho: '160px' })}
          <p class="section-title mt">Por tipo</p>
          ${Graficas.barras(r.porTipo.map((t) => ({ etiqueta: t.tipo, valor: t.faltas, nota: `${t.profesores} prof.`, tono: t.tipo === 'Asunto personal' ? 'primario' : 'neutro' })), { etiquetaAncho: '160px' })}
        </div>
        <div>
          <p class="section-title">Profesores que faltaron</p>
          <div class="table-wrap revisar-lista"><table class="table table-compact ranking-tabla">
            <thead><tr><th scope="col">Docente</th><th scope="col" class="num">Faltas</th><th scope="col" class="num">Días</th><th scope="col" class="num">Descontado</th><th scope="col">Motivos</th></tr></thead>
            <tbody>${r.porDocente.map((d) => `<tr>
              <td><button type="button" class="nombre-btn" data-docente="${d.docenteId}" data-nomina="${UI.escape(d.nomina)}" title="Ver sus faltas">${UI.escape(d.nombre)}</button></td>
              <td class="num"><strong>${d.faltas}</strong></td><td class="num">${d.diasFaltados}</td>
              <td class="num">${UI.dinero(d.montoDescontado)}</td><td class="small">${UI.escape(d.motivos.join(' · '))}</td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>
      </div>`;
  }

  return { montar };
})();
