/**
 * App de escritorio de SIDI (Electron).
 *
 * Arranca el mismo servidor Express de server.js dentro de la app, en 127.0.0.1 y en
 * un puerto libre, y lo muestra en una ventana propia. Así la coordinadora solo abre
 * "SIDI" desde el menú Inicio: no necesita Node, ni consola, ni el navegador.
 *
 * Los datos (app.db y los CV en PDF) se guardan en %APPDATA%\SIDI\data, fuera de la
 * carpeta del programa, para que sobrevivan a reinstalaciones y actualizaciones.
 */
const path = require('path');
const { app, BrowserWindow, Menu, shell, dialog } = require('electron');

// Una sola instancia: si ya está abierta, se enfoca la ventana existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  let ventana = null;
  let servidor = null;

  app.on('second-instance', () => {
    if (!ventana) return;
    if (ventana.isMinimized()) ventana.restore();
    ventana.focus();
  });

  /** Arranca Express y resuelve con la URL local. */
  function iniciarServidor() {
    process.env.SIDI_DATA_DIR = process.env.SIDI_DATA_DIR || path.join(app.getPath('userData'), 'data');
    process.env.HOST = '127.0.0.1';
    process.env.PORT = '0'; // puerto libre: no choca con otro programa en el 3000
    process.env.NODE_ENV = process.env.NODE_ENV || 'production';

    const modulo = require('../server');
    servidor = modulo;
    return new Promise((resolve, reject) => {
      const listo = () => resolve(`http://127.0.0.1:${modulo.server.address().port}/`);
      if (modulo.server.listening) listo();
      else {
        modulo.server.once('listening', listo);
        modulo.server.once('error', reject);
      }
    });
  }

  function esLocal(url, base) {
    try {
      return new URL(url).origin === new URL(base).origin;
    } catch {
      return false;
    }
  }

  function crearVentana(url) {
    ventana = new BrowserWindow({
      width: 1366,
      height: 860,
      minWidth: 1024,
      minHeight: 640,
      title: 'SIDI · Sistema Integral de Información Docente',
      icon: path.join(__dirname, '..', 'build', 'icon.png'),
      backgroundColor: '#ffffff',
      show: false,
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
      },
    });

    // Enlaces: los de SIDI (p. ej. "Ver CV") se abren en otra ventana de la app;
    // los externos y mailto: con el programa predeterminado de Windows.
    ventana.webContents.setWindowOpenHandler(({ url: destino }) => {
      if (esLocal(destino, url)) {
        return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, icon: path.join(__dirname, '..', 'build', 'icon.png') } };
      }
      shell.openExternal(destino);
      return { action: 'deny' };
    });
    ventana.webContents.on('will-navigate', (evento, destino) => {
      if (!esLocal(destino, url)) {
        evento.preventDefault();
        shell.openExternal(destino);
      }
    });

    ventana.once('ready-to-show', () => ventana.show());
    ventana.on('closed', () => { ventana = null; });
    ventana.loadURL(url);
  }

  // Menú mínimo (Alt lo muestra): recargar, zoom y pantalla completa.
  function menu() {
    return Menu.buildFromTemplate([
      {
        label: 'SIDI',
        submenu: [
          { label: 'Abrir carpeta de datos', click: () => shell.openPath(process.env.SIDI_DATA_DIR) },
          { type: 'separator' },
          { role: 'quit', label: 'Salir' },
        ],
      },
      {
        label: 'Ver',
        submenu: [
          { role: 'reload', label: 'Recargar' },
          { role: 'toggleDevTools', label: 'Herramientas de desarrollo' },
          { type: 'separator' },
          { role: 'resetZoom', label: 'Tamaño normal' },
          { role: 'zoomIn', label: 'Acercar' },
          { role: 'zoomOut', label: 'Alejar' },
          { type: 'separator' },
          { role: 'togglefullscreen', label: 'Pantalla completa' },
        ],
      },
    ]);
  }

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(menu());
    try {
      const url = await iniciarServidor();
      crearVentana(url);
    } catch (err) {
      dialog.showErrorBox('SIDI no pudo iniciar', `${err.message}\n\nCarpeta de datos: ${process.env.SIDI_DATA_DIR}`);
      app.quit();
    }
  });

  app.on('window-all-closed', () => app.quit());

  // Cierre ordenado: se cierra el servidor y se libera el archivo de la base de datos.
  app.on('will-quit', () => {
    if (!servidor) return;
    try {
      servidor.server.close();
      servidor.db.close();
    } catch {
      /* ya estaba cerrado */
    }
  });
}
