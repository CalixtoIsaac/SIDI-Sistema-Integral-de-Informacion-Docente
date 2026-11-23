/**
 * Panel administrativo (05 §1), primera vista al abrir. HU-15.
 *
 *  Indicadores: docentes activos · faltas de la quincena · descontado · pagado a suplentes · OPINA promedio.
 *  Gráficas:    calificación OPINA por maestro (con selector de periodo) · docentes por nivel que imparten ·
 *               por nivel de estudios · por género · por antigüedad · faltas por motivo del semestre · 🎂 cumpleaños del mes.
 *  Además:      atajos, avisos de datos incompletos y últimas cargas.
 *
 * Datos: GET /api/analitica/* (kpis, opina, distribucion-nivel, perfil-docentes, faltas-por-motivo,
 * cumpleanos-mes) + /periodos para el selector y /docentes para los avisos. Las gráficas son HTML/CSS
 * (graficas.js) y usan el color principal, así que siguen al tema sin redibujar.
 * El botón "Resumen ejecutivo" abre las diapositivas de HU-26 (public/js/resumen.js, ruta #resumen).
 */
const Panel = (() => {
  let el = null;
  let periodos = [];
  let periodoOpinaId = '';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

  const stat = (etiqueta, valor, icono, tono, sub = '') => Comun.stat(etiqueta, valor === null ? '<span class="skeleton"></span>' : valor, { icono, tono, sub });

  function mount(container) {
    el = container;
    container.innerHTML = `
      <section class="page-header">
        <div>
          <h2>Panel administrativo</h2>
          <p class="muted" id="panelPeriodo">Resumen de la plantilla docente.</p>
        </div>
        <a class="btn btn-outline" href="#resumen">${UI.icon('chart')}Resumen ejecutivo</a>
      </section>
      <div class="stats stats-5" id="panelStats">
        ${stat('Docentes activos', null, 'users', 'tone-success')}
        ${stat('Faltas de la quincena', null, 'calendar', 'tone-warning')}
        ${stat('Descontado en la quincena', null, 'cash', 'tone-warning')}
        ${stat('Pagado a suplentes', null, 'cash', 'tone-primary')}
        ${stat('OPINA promedio', null, 'star', 'tone-primary')}
      </div>

      <div class="panel-graficas">
        <section class="card panel-ancha">
          <div class="card-header card-header-row">
            <div><h3>Calificación OPINA por maestro</h3><p class="card-sub" id="gOpinaSub">% de alumnos que lo recomiendan</p></div>
            <span class="select-wrap"><select class="input select" id="gOpinaPeriodo" aria-label="Periodo de OPINA" disabled><option>—</option></select></span>
          </div>
          <div class="card-body" id="gOpina"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>Docentes por nivel que imparten</h3><p class="card-sub">Activos con grupos en el semestre (General / Bilingüe)</p></div></div>
          <div class="card-body" id="gNivelImparte"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>Por nivel de estudios</h3><p class="card-sub">Grado más alto titulado · activos</p></div></div>
          <div class="card-body" id="gEstudios"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>Por género</h3><p class="card-sub">Docentes activos</p></div></div>
          <div class="card-body" id="gGenero"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>Por antigüedad</h3><p class="card-sub">Desde el primer semestre que dio clases · activos</p></div></div>
          <div class="card-body" id="gAntiguedad"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>Faltas por motivo</h3><p class="card-sub" id="gFaltasSub">Semestre actual</p></div></div>
          <div class="card-body" id="gFaltas"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><div><h3>🎂 Cumpleaños de ${MESES[new Date().getMonth()]}</h3><p class="card-sub">Docentes activos</p></div></div>
          <div class="card-body" id="gCumples"><span class="skeleton" style="height:140px"></span></div>
        </section>
        <section class="card">
          <div class="card-header"><h3>Atajos</h3></div>
          <div class="card-body stack">
            <div id="panelAvisos"></div>
            <a class="btn btn-outline" href="#docentes">${UI.icon('users')}Consultar docentes</a>
            <a class="btn btn-outline" href="#faltas">${UI.icon('calendar')}Registrar falta</a>
            <button class="btn btn-outline" type="button" data-cargar="grupos">${UI.icon('upload')}Subir Excel de grupos</button>
            <button class="btn btn-outline" type="button" data-cargar="cv">${UI.icon('upload')}Subir CV (PDF)</button>
            <a class="btn btn-outline" href="#opina?tab=importaciones">${UI.icon('star')}Subir OPINA</a>
          </div>
        </section>
        <section class="card">
          <div class="card-header"><h3>Últimas cargas</h3></div>
          <div id="panelCargas"><div class="card-body"><span class="skeleton" style="height:18px"></span></div></div>
        </section>
      </div>`;

    container.querySelectorAll('[data-cargar]').forEach((b) => b.addEventListener('click', async () => {
      const ok = b.dataset.cargar === 'grupos' ? await Importar.grupos() : await Importar.cv();
      if (ok) cargar();
    }));
    container.querySelector('#gOpinaPeriodo').addEventListener('change', (ev) => {
      periodoOpinaId = ev.target.value;
      cargarOpina();
    });
    cargar();
  }

  const vivo = () => el && el.isConnected;
  const error = (box, err) => { if (box) box.innerHTML = `<div class="alert alert-error">${UI.escape(err.message)}</div>`; };
  const fichaHref = (id, nombre, pestana) => `#docentes?search=${encodeURIComponent(nombre)}&ficha=${id}${pestana ? `&pestana=${pestana}` : ''}`;

  /** Todo sale de /api/analitica/* (services/analiticaService.js). /docentes solo para los avisos. */
  async function cargar() {
    try { ({ periodos } = await UI.api('/periodos')); } catch { periodos = []; }
    if (!vivo()) return;
    pintarSelectorOpina();
    cargarKpis();
    cargarOpina();
    cargarNivelImparte();
    cargarPerfil();
    cargarFaltasMotivo();
    cargarCumples();
    cargarAvisos();
    cargarUltimas();
  }

  function reemplazarStat(i, html) {
    const box = el.querySelector('#panelStats');
    const viejo = box?.children[i];
    if (!viejo) return;
    const t = document.createElement('div');
    t.innerHTML = html.trim();
    viejo.replaceWith(t.firstElementChild);
  }

  // ------------------------------------------------------------------ indicadores (GET /analitica/kpis)
  async function cargarKpis() {
    try {
      const k = await UI.api('/analitica/kpis');
      if (!vivo()) return;
      const partes = [];
      if (k.periodo) partes.push(`Semestre ${k.periodo.clave}`);
      if (k.quincena) partes.push(`Quincena Q${k.quincena.numero} · pago ${UI.fecha(k.quincena.fechaPago)}${k.quincena.cerrada ? ' · cerrada' : ''}`);
      el.querySelector('#panelPeriodo').textContent = partes.length ? partes.join(' · ') : 'Aún no hay grupos cargados.';

      const d = k.docentes;
      reemplazarStat(0, stat('Docentes activos', `${d.activos} / ${d.total}`, 'users', 'tone-success',
        `${d.conClaseEnSemestre} con clases en el semestre${d.inactivos ? ` · ${d.inactivos} inactivos` : ''}`));
      if (k.quincena) {
        const q = k.quincena;
        reemplazarStat(1, stat('Faltas de la quincena', String(q.faltas), 'calendar', 'tone-warning',
          `<a href="#faltas">Q${q.numero}</a>${k.faltasSemestre ? ` · ${k.faltasSemestre.faltas} en el semestre` : ''}`));
        reemplazarStat(2, stat('Descontado en la quincena', UI.escape(UI.dinero(q.descontado)), 'cash', 'tone-warning',
          `Diferencia vs. suplentes: ${UI.escape(UI.dinero(q.descontado - q.pagadoSuplentes))}`));
        reemplazarStat(3, stat('Pagado a suplentes', UI.escape(UI.dinero(q.pagadoSuplentes)), 'cash', 'tone-primary',
          k.faltasSemestre ? `${UI.escape(UI.dinero(k.faltasSemestre.pagadoSuplentes))} en el semestre` : ''));
      } else {
        reemplazarStat(1, stat('Faltas de la quincena', '—', 'calendar', 'tone-warning', 'Sin quincena para hoy'));
        reemplazarStat(2, stat('Descontado en la quincena', '—', 'cash', 'tone-warning'));
        reemplazarStat(3, stat('Pagado a suplentes', '—', 'cash', 'tone-primary'));
      }
      reemplazarStat(4, k.opina
        ? stat('OPINA promedio', UI.escape(UI.porcentaje(k.opina.promedioMaestros)), 'star', 'tone-primary',
          `Promedio de ${k.opina.docentes} maestros · ${UI.escape(k.opina.periodo.clave)}`)
        : stat('OPINA promedio', '—', 'star', 'tone-primary', 'Sin OPINA cargado'));
    } catch (err) {
      reemplazarStat(0, stat('Docentes activos', '—', 'users', 'tone-success', UI.escape(err.message)));
    }
  }

  // ------------------------------------------------------------------ OPINA por maestro (GET /analitica/opina)
  function pintarSelectorOpina() {
    const sel = el.querySelector('#gOpinaPeriodo');
    const conOpina = periodos.filter((p) => p.tieneOpina);
    if (!conOpina.some((p) => String(p.id) === String(periodoOpinaId))) periodoOpinaId = conOpina[0] ? String(conOpina[0].id) : '';
    sel.innerHTML = conOpina.length
      ? conOpina.map((p) => `<option value="${p.id}" ${String(p.id) === periodoOpinaId ? 'selected' : ''}>${UI.escape(p.clave)}</option>`).join('')
      : '<option>Sin OPINA</option>';
    sel.disabled = conOpina.length < 2;
  }

  async function cargarOpina() {
    const box = el.querySelector('#gOpina');
    try {
      const r = await UI.api(`/analitica/opina${periodoOpinaId ? `?periodoId=${periodoOpinaId}` : ''}`);
      if (!vivo()) return;
      if (!r.periodo) {
        box.innerHTML = `<div class="empty-state small-empty"><span class="empty-icon">${UI.icon('star')}</span>
          <h3>Aún no hay OPINA cargado</h3><p class="muted"><a href="#opina?tab=importaciones">Sube el archivo OPINA</a> para ver la calificación de cada maestro.</p></div>`;
        return;
      }
      el.querySelector('#gOpinaSub').textContent = `% de alumnos que lo recomiendan · promedio ${UI.porcentaje(r.promedioMaestros)} · campus ${UI.porcentaje(r.calificacionCampus)}`;
      box.innerHTML = Graficas.barras(r.docentes.map((i) => ({
        etiqueta: i.nombre,
        valor: i.porcentaje,
        nota: i.muestraSuficiente ? `${i.respuestas} resp.` : `${i.respuestas} resp. · muestra insuficiente`,
        tono: i.muestraSuficiente ? 'primario' : 'neutro',
        href: fichaHref(i.docenteId, i.nombre, 'opina')
      })), { formato: (v) => UI.porcentaje(v), max: 100, etiquetaAncho: '220px', alto: 440, vacio: 'Sin respuestas en ese periodo.' })
        + Graficas.leyenda([{ etiqueta: 'Calificación global del maestro', tono: 'primario' }, { etiqueta: `Menos de ${r.muestraMinima} respuestas`, tono: 'neutro' }])
        + '<p class="small mt-xs"><a href="#opina">Ver ranking completo con filtros →</a></p>';
    } catch (err) { error(box, err); }
  }

  // ------------------------------------------------------------------ nivel que imparten (GET /analitica/distribucion-nivel)
  async function cargarNivelImparte() {
    const box = el.querySelector('#gNivelImparte');
    try {
      const r = await UI.api('/analitica/distribucion-nivel');
      if (!vivo()) return;
      const corto = { 'Bachillerato General': 'General', 'Bachillerato General Bilingüe': 'Bilingüe' };
      box.innerHTML = Graficas.columnas(r.niveles.map((n) => ({ etiqueta: corto[n.nivel] || n.nivel, valor: n.docentes })),
        { vacio: 'Sin grupos con plan en el semestre.' })
        + (r.totalDocentes ? `<p class="small muted mt-xs">${r.totalDocentes} docentes con grupos${r.ambos ? ` · ${r.ambos} dan en ambos` : ''}</p>` : '');
    } catch (err) { error(box, err); }
  }

  // ------------------------------------------------------------------ perfil (GET /analitica/perfil-docentes)
  async function cargarPerfil() {
    try {
      const r = await UI.api('/analitica/perfil-docentes');
      if (!vivo()) return;
      const total = r.total || 1;
      const nombreGenero = { F: 'Mujeres', M: 'Hombres', ninguno: 'Sin dato' };
      el.querySelector('#gGenero').innerHTML = Graficas.columnas(
        r.genero.map((g) => ({ etiqueta: nombreGenero[g.genero] || g.genero, valor: g.docentes, tono: g.genero === 'ninguno' ? 'neutro' : 'primario' })),
        { formato: (v) => `${v} · ${Math.round((v / total) * 100)} %`, vacio: 'Sin docentes activos.' });
      el.querySelector('#gEstudios').innerHTML = Graficas.barras(
        r.nivelEstudios.map((n) => ({ etiqueta: n.nivelEstudios === 'ninguno' ? 'Sin dato' : n.nivelEstudios, valor: n.docentes, tono: n.nivelEstudios === 'ninguno' ? 'neutro' : 'primario' })),
        { etiquetaAncho: '120px', vacio: 'Sin docentes activos.' });
      el.querySelector('#gAntiguedad').innerHTML = Graficas.barras(
        r.antiguedad.map((a) => ({ etiqueta: a.rango === 'ninguno' ? 'Sin dato' : a.rango, valor: a.docentes, tono: a.rango === 'ninguno' ? 'neutro' : 'primario' })),
        { etiquetaAncho: '120px', vacio: 'Sin docentes activos.' });
    } catch (err) {
      ['#gGenero', '#gEstudios', '#gAntiguedad'].forEach((s) => error(el.querySelector(s), err));
    }
  }

  // ------------------------------------------------------------------ faltas por motivo (GET /analitica/faltas-por-motivo)
  async function cargarFaltasMotivo() {
    const box = el.querySelector('#gFaltas');
    try {
      const r = await UI.api('/analitica/faltas-por-motivo');
      if (!vivo()) return;
      el.querySelector('#gFaltasSub').textContent = `${r.periodo.clave} · número de faltas registradas`;
      const tipos = r.porTipo.filter((t) => t.faltas).map((t) => `${t.faltas} ${t.tipo.toLowerCase()}`).join(' · ');
      box.innerHTML = Graficas.barras(r.porMotivo.map((m) => ({ etiqueta: m.motivo, valor: m.faltas, nota: `${m.profesores} prof.` })),
        { etiquetaAncho: '160px', vacio: 'Sin faltas registradas en el semestre.' })
        + (r.total ? `<p class="small muted mt-xs">${r.total} falta(s)${tipos ? ` · ${UI.escape(tipos)}` : ''} · <a href="#reportes">Inasistencias por semestre →</a></p>` : '');
    } catch (err) {
      box.innerHTML = `<p class="muted small grafica-vacia">${UI.escape(err.message)}</p>`;
    }
  }

  // ------------------------------------------------------------------ cumpleaños (GET /analitica/cumpleanos-mes)
  async function cargarCumples() {
    const box = el.querySelector('#gCumples');
    try {
      const { docentes } = await UI.api('/analitica/cumpleanos-mes');
      if (!vivo()) return;
      const mes = MESES[new Date().getMonth()];
      box.innerHTML = docentes.length
        ? `<ul class="cumple-lista">${docentes.map((d) => `<li class="${d.esHoy ? 'hoy' : ''}"><span class="cumple-dia" aria-hidden="true">${d.dia}</span>
            <span class="grow"><a href="${fichaHref(d.docenteId, d.nombre)}">${UI.escape(d.nombre)}</a><br>
            <small class="muted">${d.yaPaso ? 'Cumplió' : 'Cumple'} ${d.cumple} años</small></span>
            ${d.esHoy ? '<span class="badge badge-primary">¡Hoy!</span>' : `<span class="muted small">${d.dia} de ${mes}</span>`}</li>`).join('')}</ul>`
        : '<p class="muted small grafica-vacia">Nadie cumple años este mes (o falta su fecha de nacimiento).</p>';
    } catch (err) { error(box, err); }
  }

  // ------------------------------------------------------------------ avisos (GET /docentes)
  async function cargarAvisos() {
    const box = el.querySelector('#panelAvisos');
    try {
      const { docentes } = await UI.api('/docentes?activo=true');
      if (!vivo()) return;
      const activos = docentes.filter((d) => d.activo);
      const incompletos = activos.filter((d) => d.incompleto.length).length;
      const sinContrato = activos.filter((d) => d.incompleto.includes('contrato')).length;
      box.innerHTML = (incompletos || sinContrato)
        ? `<ul class="aviso-lista panel-avisos">
            ${incompletos ? `<li class="alert alert-warning small">${UI.icon('warning')}${incompletos} docente(s) activos con datos incompletos. <a href="#docentes">Revisar</a></li>` : ''}
            ${sinContrato ? `<li class="alert alert-warning small">${UI.icon('file')}${sinContrato} con grupos sin contrato. <a href="#configuracion">Subir contratos</a></li>` : ''}
          </ul>`
        : `<p class="alert alert-success small">${UI.icon('check')}Los docentes activos tienen sus datos completos.</p>`;
    } catch (err) { error(box, err); }
  }

  // ------------------------------------------------------------------ últimas cargas
  async function cargarUltimas() {
    const [grupos, opina, contratos] = await Promise.all([
      UI.api('/grupos/importaciones').catch(() => ({ importaciones: [] })),
      UI.api('/opina/importaciones').catch(() => ({ importaciones: [] })),
      UI.api('/contratos/importaciones').catch(() => ({ importaciones: [] }))
    ]);
    if (!vivo()) return;
    const lista = [
      ...grupos.importaciones.map((i) => ({ ...i, tipo: 'Excel de grupos' })),
      ...opina.importaciones.map((i) => ({ ...i, tipo: 'OPINA' })),
      ...contratos.importaciones.map((i) => ({ ...i, tipo: 'Contratos' }))
    ].sort((a, b) => String(b.importadoEn).localeCompare(String(a.importadoEn))).slice(0, 6);
    el.querySelector('#panelCargas').innerHTML = lista.length
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
