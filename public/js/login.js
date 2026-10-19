/**
 * Pantalla de inicio de sesión.
 * Si todavía no existe ninguna cuenta, muestra el formulario "Crea tu cuenta".
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const alertBox = $('authAlert');

  // Si ya hay sesión, directo a la aplicación (app.js la valida con el servidor).
  if (UI.getToken()) {
    location.replace('/app');
    return;
  }

  UI.hydrateIcons(document);

  function showAlert(message, type = 'error') {
    alertBox.textContent = message;
    alertBox.className = `alert alert-${type}`;
    alertBox.hidden = false;
  }
  function hideAlert() { alertBox.hidden = true; }

  const pendingMessage = UI.takeAuthMessage();
  if (pendingMessage) showAlert(pendingMessage, 'info');

  // Botones para mostrar / ocultar la contraseña
  document.querySelectorAll('[data-toggle-password]').forEach((btn) => {
    const input = $(btn.dataset.togglePassword);
    const update = () => {
      const visible = input.type === 'text';
      btn.innerHTML = UI.icon(visible ? 'eyeOff' : 'eye');
      btn.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    };
    btn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
      update();
      input.focus();
    });
    update();
  });

  function setMode(mode) {
    const setup = mode === 'setup';
    $('authLoading').hidden = true;
    $('loginForm').hidden = setup;
    $('setupForm').hidden = !setup;
    $('authTitle').textContent = setup ? 'Crea tu cuenta' : 'Inicia sesión';
    $('authSubtitle').textContent = setup
      ? 'Es la primera vez que se abre la aplicación. Crea la cuenta con la que vas a entrar.'
      : 'Escribe tus datos para entrar a tu espacio de trabajo.';
    (setup ? $('setupName') : $('loginUser')).focus();
  }

  async function submit(form, path, body) {
    hideAlert();
    const button = form.querySelector('[type="submit"]');
    UI.setBusy(button, true);
    try {
      const { token, user } = await UI.api(path, { method: 'POST', body });
      UI.setSession(token, user);
      location.replace('/app');
    } catch (err) {
      UI.setBusy(button, false);
      showAlert(err.message);
      if (err.status === 409) setMode('login'); // la cuenta ya existía
    }
  }

  $('loginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    submit(e.currentTarget, '/auth/login', {
      usuario: data.get('usuario'),
      password: data.get('password')
    });
  });

  $('setupForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const data = new FormData(e.currentTarget);
    if (data.get('password') !== data.get('confirm')) {
      showAlert('Las contraseñas no coinciden.');
      $('setupConfirm').focus();
      return;
    }
    submit(e.currentTarget, '/auth/setup', {
      nombre: data.get('nombre'),
      usuario: data.get('usuario'),
      password: data.get('password')
    });
  });

  UI.api('/auth/status')
    .then(({ hasUser }) => setMode(hasUser ? 'login' : 'setup'))
    .catch((err) => {
      $('authLoading').hidden = true;
      showAlert(err.message);
    });
})();
