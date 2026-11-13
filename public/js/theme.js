/**
 * Tema de SIDI: modo (claro / oscuro / automático) y color principal (03 §3, HU-17).
 * Se carga en el <head> ANTES de las hojas de estilo para evitar destellos.
 *
 * - Lee la caché `sidi.tema` de localStorage ({ modo, color }) y aplica todo antes de pintar.
 *   La fuente de verdad es /api/configuracion: app.js y perfil.js sincronizan después.
 * - Del color elegido se derivan --primary-hover, --primary-soft, --primary-text, --ring,
 *   --focus-ring, --glow-1 y --primary-foreground (blanco u oscuro, contraste ≥ 4.5:1).
 * - Cualquier botón con [data-theme-toggle] alterna claro/oscuro y emite "sidi:tema-guardar".
 * - Emite "themechange" en window cada vez que cambia algo (las gráficas se redibujan con él).
 *
 * API: window.SidiTema = { obtener, aplicar, guardarLocal, analizar, PALETA, MODOS, modoResuelto }
 */
(function () {
  var KEY = 'sidi.tema';
  var POR_DEFECTO = { modo: 'automatico', color: '#DB2777' };
  var MODOS = ['claro', 'oscuro', 'automatico'];
  var PALETA = [
    { nombre: 'Rosa', color: '#DB2777' },
    { nombre: 'Frambuesa', color: '#BE185D' },
    { nombre: 'Ciruela', color: '#9333EA' },
    { nombre: 'Azul marino', color: '#1D4ED8' },
    { nombre: 'Verde azulado', color: '#0F766E' },
    { nombre: 'Grafito', color: '#475569' }
  ];
  // Fondos de referencia de theme.css para medir el contraste del texto en color.
  var FONDO = { light: '#ffffff', dark: '#111114' };
  var TEXTO_OSCURO = '#09090b';
  var CONTRASTE_MIN = 4.5;

  var root = document.documentElement;
  var media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  var actual = leer();

  var SUN = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
  var MOON = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8 8 0 1 1 9.5 4 6.5 6.5 0 0 0 20 14.5z"/></svg>';

  // ---------------------------------------------------------------- color
  function hexValido(hex) { return /^#[0-9a-f]{6}$/i.test(String(hex || '')); }
  function aRgb(hex) {
    var n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function aHex(rgb) {
    return '#' + rgb.map(function (v) {
      var h = Math.round(Math.max(0, Math.min(255, v))).toString(16);
      return h.length === 1 ? '0' + h : h;
    }).join('');
  }
  /** Mezcla a con b: t = 0 → a, t = 1 → b. */
  function mezclar(a, b, t) {
    var x = aRgb(a), y = aRgb(b);
    return aHex([0, 1, 2].map(function (i) { return x[i] + (y[i] - x[i]) * t; }));
  }
  function rgba(hex, alfa) {
    var c = aRgb(hex);
    return 'rgba(' + c[0] + ', ' + c[1] + ', ' + c[2] + ', ' + alfa + ')';
  }
  function luminancia(hex) {
    var c = aRgb(hex).map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contraste(a, b) {
    var la = luminancia(a), lb = luminancia(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /** Acerca `color` a `hacia` en pasos hasta lograr el contraste contra `fondo`. */
  function ajustarTexto(color, hacia, fondo) {
    for (var t = 0; t <= 1.0001; t += 0.05) {
      var c = mezclar(color, hacia, t);
      if (contraste(c, fondo) >= CONTRASTE_MIN) return c;
    }
    return hacia;
  }

  /**
   * Revisa si un color sirve como color principal y calcula sus derivadas.
   * { valido, mensaje, primerPlano, contraste, light: {vars}, dark: {vars} }
   */
  function analizar(hex) {
    if (!hexValido(hex)) return { valido: false, mensaje: 'Escribe el color como #RRGGBB (por ejemplo #DB2777).' };
    var color = hex.toLowerCase();
    var cBlanco = contraste(color, '#ffffff');
    var cOscuro = contraste(color, TEXTO_OSCURO);
    var primerPlano = cBlanco >= CONTRASTE_MIN ? '#ffffff' : (cOscuro >= CONTRASTE_MIN ? TEXTO_OSCURO : null);
    if (!primerPlano) {
      return { valido: false, mensaje: 'Este color no tiene suficiente contraste; elige uno más oscuro.' };
    }
    function derivadas(oscuro) {
      return {
        '--primary': color,
        '--primary-hover': mezclar(color, oscuro ? '#ffffff' : '#000000', 0.12),
        '--primary-foreground': primerPlano,
        '--primary-soft': oscuro ? rgba(color, 0.18) : mezclar(color, '#ffffff', 0.9),
        '--primary-text': oscuro ? ajustarTexto(color, '#ffffff', FONDO.dark) : ajustarTexto(color, '#000000', FONDO.light),
        '--ring': mezclar(color, '#ffffff', oscuro ? 0.35 : 0.3),
        '--focus-ring': '0 0 0 3px ' + rgba(color, oscuro ? 0.4 : 0.35),
        '--glow-1': rgba(color, oscuro ? 0.16 : 0.12)
      };
    }
    return {
      valido: true,
      mensaje: '',
      primerPlano: primerPlano,
      contraste: Math.max(cBlanco, cOscuro),
      light: derivadas(false),
      dark: derivadas(true)
    };
  }

  // ---------------------------------------------------------------- estado
  function leer() {
    try {
      var t = JSON.parse(localStorage.getItem(KEY));
      if (t && MODOS.indexOf(t.modo) >= 0 && hexValido(t.color)) return t;
    } catch (e) { /* caché vacía o bloqueada */ }
    return { modo: POR_DEFECTO.modo, color: POR_DEFECTO.color };
  }
  function guardarLocal(tema) {
    try { localStorage.setItem(KEY, JSON.stringify(tema)); } catch (e) { /* sin persistencia */ }
  }
  function modoResuelto(modo) {
    var m = modo || actual.modo;
    if (m === 'claro') return 'light';
    if (m === 'oscuro') return 'dark';
    return media && media.matches ? 'dark' : 'light';
  }

  function actualizarBotones() {
    var oscuro = root.getAttribute('data-theme') === 'dark';
    var botones = document.querySelectorAll('[data-theme-toggle]');
    for (var i = 0; i < botones.length; i++) {
      var b = botones[i];
      b.innerHTML = oscuro ? SUN : MOON;
      b.setAttribute('aria-pressed', String(oscuro));
      b.setAttribute('aria-label', oscuro ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
      b.title = oscuro ? 'Modo claro' : 'Modo oscuro';
    }
  }

  /**
   * Aplica { modo, color } (sin guardar en la BD). Si el color no tiene contraste,
   * se conserva el anterior. opciones: { animar, guardar (caché local) }.
   */
  function aplicar(tema, opciones) {
    opciones = opciones || {};
    var siguiente = {
      modo: MODOS.indexOf(tema && tema.modo) >= 0 ? tema.modo : actual.modo,
      color: tema && hexValido(tema.color) ? tema.color.toUpperCase() : actual.color
    };
    var info = analizar(siguiente.color);
    if (!info.valido) { siguiente.color = actual.color; info = analizar(actual.color); }
    if (!info.valido) { siguiente.color = POR_DEFECTO.color; info = analizar(POR_DEFECTO.color); }

    if (opciones.animar) {
      root.classList.add('theme-switching');
      setTimeout(function () { root.classList.remove('theme-switching'); }, 260);
    }
    var resuelto = modoResuelto(siguiente.modo);
    root.setAttribute('data-theme', resuelto);
    var vars = info[resuelto];
    for (var k in vars) root.style.setProperty(k, vars[k]);

    actual = siguiente;
    if (opciones.guardar !== false) guardarLocal(actual);
    actualizarBotones();
    window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: resuelto, modo: actual.modo, color: actual.color } }));
    return actual;
  }

  // Aplicación inmediata (antes de pintar la página).
  aplicar(actual, { guardar: false });

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-theme-toggle]');
    if (!btn) return;
    var modo = root.getAttribute('data-theme') === 'dark' ? 'claro' : 'oscuro';
    aplicar({ modo: modo }, { animar: true });
    window.dispatchEvent(new CustomEvent('sidi:tema-guardar', { detail: { 'tema.modo': modo } }));
  });

  document.addEventListener('DOMContentLoaded', actualizarBotones);

  // Otra pestaña cambió el tema.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY) aplicar(leer(), { animar: true, guardar: false });
  });

  // Cambió el tema del sistema y está en automático.
  if (media && media.addEventListener) {
    media.addEventListener('change', function () {
      if (actual.modo === 'automatico') aplicar(actual, { animar: true, guardar: false });
    });
  }

  window.SidiTema = {
    obtener: function () { return { modo: actual.modo, color: actual.color }; },
    aplicar: aplicar,
    guardarLocal: guardarLocal,
    analizar: analizar,
    modoResuelto: modoResuelto,
    PALETA: PALETA,
    MODOS: MODOS,
    POR_DEFECTO: POR_DEFECTO
  };
})();
