/**
 * Perfil (HU-17; 05 §10): nombre que se muestra, color principal y apariencia.
 * El cambio se ve al instante en toda la app; "Guardar" lo persiste en /api/configuracion.
 * Si se sale sin guardar, se regresa a lo guardado.
 */
const Perfil = (() => {
  let el = null;
  let guardado = null; // { nombre, modo, color } tal como está en la BD
  let borrador = null;

  const MODOS = [
    { valor: 'claro', texto: 'Claro' },
    { valor: 'oscuro', texto: 'Oscuro' },
    { valor: 'automatico', texto: 'Automático (según tu computadora)' }
  ];

  function enPaleta(color) {
    return SidiTema.PALETA.some((p) => p.color.toUpperCase() === String(color).toUpperCase());
  }

  function plantilla() {
    return `
      <section class="page-header">
        <div><h2>Perfil</h2><p class="muted">Cómo se ve SIDI en esta computadora y para quien la use.</p></div>
      </section>
      <form class="card" id="perfilForm" novalidate>
        <div class="card-body stack">
          <div class="field" style="max-width:420px">
            <label for="perfilNombreInput">Nombre que se muestra</label>
            <input class="input" id="perfilNombreInput" maxlength="60" required>
          </div>

          <fieldset class="stack" style="border:0;padding:0;margin:0">
            <legend class="section-title">Color principal</legend>
            <div class="swatches" role="radiogroup">
              ${SidiTema.PALETA.map((p) => `
                <label class="swatch"><input type="radio" name="color" value="${p.color}">
                  <span class="muestra" style="background:${p.color}"></span>${UI.escape(p.nombre)}</label>`).join('')}
              <label class="swatch"><input type="radio" name="color" value="personalizado">
                <span class="muestra" id="muestraPersonal"></span>Personalizado</label>
            </div>
            <div class="color-custom" id="colorPersonal" hidden>
              <input type="color" id="colorPicker" aria-label="Elegir color">
              <input class="input" id="colorHex" maxlength="7" aria-label="Color en hexadecimal (#RRGGBB)" placeholder="#DB2777">
            </div>
            <p class="alert alert-warning" id="colorAviso" role="alert" hidden></p>
          </fieldset>

          <fieldset class="stack" style="border:0;padding:0;margin:0">
            <legend class="section-title">Apariencia</legend>
            <div class="radio-list">
              ${MODOS.map((m) => `<label><input type="radio" name="modo" value="${m.valor}">${UI.escape(m.texto)}</label>`).join('')}
            </div>
          </fieldset>

          <div>
            <p class="section-title">Vista previa</p>
            <div class="preview-box">
              <button type="button" class="btn btn-primary" tabindex="-1">Botón principal</button>
              <a href="#perfil" tabindex="-1" onclick="return false">enlace</a>
              <span class="preview-bars" aria-hidden="true"><span style="height:40%"></span><span style="height:75%"></span><span style="height:100%"></span><span style="height:60%"></span></span>
              <span class="row small"><span class="dot on"></span>Activo</span>
              <span class="row small"><span class="dot"></span>Inactivo</span>
              <span class="badge badge-primary">Elemento activo</span>
            </div>
          </div>
          <div class="alert alert-error" id="perfilError" role="alert" hidden></div>
        </div>
        <div class="modal-footer" style="border-top:1px solid var(--border)">
          <button type="button" class="btn btn-outline" id="perfilReset">${UI.icon('refresh')}Restablecer</button>
          <button type="submit" class="btn btn-primary" id="perfilGuardar">${UI.icon('check')}Guardar</button>
        </div>
      </form>`;
  }

  function pintarFormulario() {
    const f = el.querySelector('#perfilForm');
    f.querySelector('#perfilNombreInput').value = borrador.nombre;
    const personal = borrador.personal || !enPaleta(borrador.color);
    f.querySelectorAll('input[name="color"]').forEach((r) => {
      r.checked = personal ? r.value === 'personalizado' : r.value.toUpperCase() === borrador.color.toUpperCase();
    });
    f.querySelector('#colorPersonal').hidden = !personal;
    f.querySelector('#colorPicker').value = borrador.color.toLowerCase();
    f.querySelector('#colorHex').value = borrador.color;
    f.querySelector('#muestraPersonal').style.background = borrador.color;
    f.querySelectorAll('input[name="modo"]').forEach((r) => { r.checked = r.value === borrador.modo; });
  }

  /** Aplica el borrador a toda la app (sin guardar) y avisa si el color no sirve. */
  function previsualizar() {
    const aviso = el.querySelector('#colorAviso');
    const info = SidiTema.analizar(borrador.color);
    aviso.hidden = info.valido;
    aviso.textContent = info.valido ? '' : `⚠️ ${info.mensaje}`;
    el.querySelector('#perfilGuardar').disabled = !info.valido;
    SidiTema.aplicar({ modo: borrador.modo, color: info.valido ? borrador.color : guardado.color }, { guardar: false });
  }

  function hayCambios() {
    return borrador && guardado && (borrador.nombre !== guardado.nombre || borrador.modo !== guardado.modo
      || borrador.color.toUpperCase() !== guardado.color.toUpperCase());
  }

  function enlazar() {
    const f = el.querySelector('#perfilForm');
    f.querySelector('#perfilNombreInput').addEventListener('input', (e) => { borrador.nombre = e.target.value; });
    f.querySelectorAll('input[name="color"]').forEach((r) => r.addEventListener('change', () => {
      const personal = r.value === 'personalizado';
      borrador.personal = personal;
      if (!personal) borrador.color = r.value;
      pintarFormulario();
      previsualizar();
      if (personal) f.querySelector('#colorHex').focus();
    }));
    f.querySelector('#colorPicker').addEventListener('input', (e) => {
      borrador.color = e.target.value.toUpperCase();
      f.querySelector('#colorHex').value = borrador.color;
      f.querySelector('#muestraPersonal').style.background = borrador.color;
      previsualizar();
    });
    f.querySelector('#colorHex').addEventListener('input', (e) => {
      let v = e.target.value.trim();
      if (v && v[0] !== '#') v = `#${v}`;
      borrador.color = v.toUpperCase();
      if (/^#[0-9A-F]{6}$/.test(borrador.color)) {
        f.querySelector('#colorPicker').value = borrador.color.toLowerCase();
        f.querySelector('#muestraPersonal').style.background = borrador.color;
      }
      previsualizar();
    });
    f.querySelectorAll('input[name="modo"]').forEach((r) => r.addEventListener('change', () => {
      borrador.modo = r.value;
      previsualizar();
    }));
    f.querySelector('#perfilReset').addEventListener('click', () => {
      borrador = { ...borrador, modo: SidiTema.POR_DEFECTO.modo, color: SidiTema.POR_DEFECTO.color, personal: false };
      pintarFormulario();
      previsualizar();
      UI.toast('Se restablecieron el color Rosa y el modo automático. Presiona Guardar para conservarlo.');
    });
    f.addEventListener('submit', guardar);
  }

  async function guardar(e) {
    e.preventDefault();
    const err = el.querySelector('#perfilError');
    err.hidden = true;
    const nombre = borrador.nombre.trim();
    if (!nombre) {
      UI.pintarError(err, new Error('Escribe el nombre que se muestra.'));
      return;
    }
    const boton = el.querySelector('#perfilGuardar');
    UI.setBusy(boton, true);
    try {
      const c = await App.guardarConfiguracion({ 'perfil.nombre': nombre, 'tema.modo': borrador.modo, 'tema.color': borrador.color });
      guardado = { nombre: c['perfil.nombre'], modo: c['tema.modo'], color: c['tema.color'] };
      borrador = { ...guardado, personal: !enPaleta(guardado.color) };
      SidiTema.aplicar(guardado); // ahora sí a la caché local
      UI.toast('Perfil guardado.', 'success');
    } catch (ex) {
      UI.pintarError(err, ex);
    } finally {
      UI.setBusy(boton, false);
    }
  }

  async function mount(container) {
    el = container;
    container.innerHTML = plantilla();
    const t = SidiTema.obtener();
    guardado = { nombre: 'Coordinación de Docentes', modo: t.modo, color: t.color };
    borrador = { ...guardado };
    pintarFormulario();
    enlazar();
    // Al salir sin guardar, se regresa a lo guardado.
    window.addEventListener('hashchange', function salir() {
      window.removeEventListener('hashchange', salir);
      if (hayCambios()) {
        SidiTema.aplicar({ modo: guardado.modo, color: guardado.color });
        UI.toast('No se guardaron los cambios del perfil.', 'warning');
      }
    });
    try {
      const { configuracion } = await UI.api('/configuracion');
      guardado = { nombre: configuracion['perfil.nombre'], modo: configuracion['tema.modo'], color: configuracion['tema.color'] };
      borrador = { ...guardado };
      pintarFormulario();
      previsualizar();
    } catch (ex) {
      UI.pintarError(el.querySelector('#perfilError'), ex);
    }
  }

  return { mount };
})();
