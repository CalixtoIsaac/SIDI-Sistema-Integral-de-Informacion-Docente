#!/usr/bin/env node
/**
 * Genera el instalador de Windows: dist/SIDI-Setup-<versión>.exe
 *
 *   npm run dist
 *
 * Pasos:
 *  1. Descarga Electron (win32-x64) en la versión de ELECTRON_VERSION.
 *  2. Arma build/win-unpacked: Electron renombrado a SIDI.exe (con icono y datos de
 *     versión) + resources/app con el código de SIDI y sus dependencias de producción.
 *  3. Cambia el binario de better-sqlite3 por el compilado para Electron (no para Node).
 *  4. Llama a makensis con installer/sidi.nsi.
 *
 * Requisitos (una vez): `npm install` y NSIS (`winget install NSIS.NSIS`).
 * La versión sale de package.json: súbela antes de generar una versión nueva.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ELECTRON_VERSION = '42.11.18'; // misma que el instalador 1.0.0
const RAIZ = path.join(__dirname, '..');
const SALIDA = path.join(RAIZ, 'build', 'win-unpacked');
const APP = path.join(SALIDA, 'resources', 'app');
const DIST = path.join(RAIZ, 'dist');

// Lo que se copia a resources/app (ni tests, ni data, ni documentación).
const CONTENIDO_APP = ['electron', 'lib', 'routes', 'services', 'public', 'templates', 'server.js', 'build/icon.png', 'build/icon.ico'];

const pkg = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
const VERSION = pkg.version;

function paso(texto) {
  console.log(`\n▸ ${texto}`);
}

function copiar(origen, destino) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.cpSync(origen, destino, { recursive: true, dereference: true });
}

async function descargarElectron() {
  paso(`Electron ${ELECTRON_VERSION} (win32-x64)`);
  const { downloadArtifact } = await import('@electron/get');
  const extract = require('extract-zip');
  const zip = await downloadArtifact({ version: ELECTRON_VERSION, platform: 'win32', arch: 'x64', artifactName: 'electron' });
  await extract(zip, { dir: SALIDA });
  fs.renameSync(path.join(SALIDA, 'electron.exe'), path.join(SALIDA, 'SIDI.exe'));
  fs.rmSync(path.join(SALIDA, 'resources', 'default_app.asar'), { force: true });
}

/** Icono y datos de versión de SIDI.exe (en lugar de los de Electron). */
async function personalizarExe() {
  paso('Icono y versión de SIDI.exe');
  const ResEdit = await import('resedit');
  const PE = await import('pe-library');
  const ruta = path.join(SALIDA, 'SIDI.exe');
  const exe = PE.NtExecutable.from(fs.readFileSync(ruta));
  const res = PE.NtExecutableResource.from(exe);

  const ico = ResEdit.Data.IconFile.from(fs.readFileSync(path.join(RAIZ, 'build', 'icon.ico')));
  const grupo = ResEdit.Resource.IconGroupEntry.fromEntries(res.entries)[0];
  ResEdit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, grupo.id, grupo.lang, ico.icons.map((i) => i.data));

  const [vi] = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
  const [maj, min, pat] = VERSION.split('.').map(Number);
  vi.setFileVersion(maj, min, pat, 0, 1033);
  vi.setProductVersion(maj, min, pat, 0, 1033);
  vi.setStringValues({ lang: 1033, codepage: 1200 }, {
    CompanyName: 'Calixto Isaac Galeana',
    FileDescription: 'SIDI',
    FileVersion: VERSION,
    InternalName: 'SIDI',
    LegalCopyright: 'Coordinación de Docentes · Preparatoria Veracruz',
    OriginalFilename: 'SIDI.exe',
    ProductName: 'SIDI',
    ProductVersion: VERSION
  });
  vi.outputToResourceEntries(res.entries);
  res.outputResource(exe);
  fs.writeFileSync(ruta, Buffer.from(exe.generate()));
}

function copiarApp() {
  paso('Código de SIDI → resources/app');
  for (const rel of CONTENIDO_APP) copiar(path.join(RAIZ, rel), path.join(APP, rel));
  const appPkg = {
    name: 'sidi',
    productName: 'SIDI',
    version: VERSION,
    description: 'SIDI · Sistema Integral de Información Docente (Coordinación de Docentes, Preparatoria Veracruz).',
    author: 'Calixto Isaac Galeana',
    main: 'electron/main.js',
    private: true,
    dependencies: pkg.dependencies
  };
  fs.writeFileSync(path.join(APP, 'package.json'), JSON.stringify(appPkg, null, 2));
}

/** Copia solo las dependencias de producción ya instaladas en node_modules. */
function copiarDependencias() {
  paso('Dependencias de producción');
  let salida;
  try {
    salida = execFileSync('npm', ['ls', '--omit=dev', '--all', '--parseable'], {
      cwd: RAIZ, encoding: 'utf8', shell: process.platform === 'win32', maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore']
    });
  } catch (err) {
    // npm ls sale con error ante avisos menores (p. ej. xlsx instalado desde URL); la lista sigue sirviendo.
    if (!err.stdout) throw err;
    salida = err.stdout;
  }
  const carpetas = salida.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && path.resolve(l) !== path.resolve(RAIZ));
  for (const carpeta of carpetas) {
    const rel = path.relative(RAIZ, carpeta);
    if (!rel.startsWith('node_modules')) continue;
    copiar(carpeta, path.join(APP, rel));
  }
  // pdf-parse usa @napi-rs/canvas, que necesita su binario de Windows.
  const canvasWin = path.join(RAIZ, 'node_modules', '@napi-rs', 'canvas-win32-x64-msvc');
  if (!fs.existsSync(canvasWin)) {
    throw new Error('Falta node_modules/@napi-rs/canvas-win32-x64-msvc. Ejecuta: npm install --os=win32 --cpu=x64');
  }
  copiar(canvasWin, path.join(APP, 'node_modules', '@napi-rs', 'canvas-win32-x64-msvc'));
  console.log(`  ${carpetas.length} paquetes`);
}

/** better-sqlite3 es nativo: se baja el binario ya compilado para Electron win32-x64. */
function sqliteParaElectron() {
  paso('better-sqlite3 para Electron');
  const dir = path.join(APP, 'node_modules', 'better-sqlite3');
  fs.rmSync(path.join(dir, 'build'), { recursive: true, force: true });
  const prebuild = require.resolve('prebuild-install/bin.js', { paths: [RAIZ] });
  execFileSync(process.execPath, [prebuild, '--runtime', 'electron', '--target', ELECTRON_VERSION, '--platform', 'win32', '--arch', 'x64', '--verbose'], {
    cwd: dir, stdio: 'inherit'
  });
  const binario = path.join(dir, 'build', 'Release', 'better_sqlite3.node');
  if (!fs.existsSync(binario)) throw new Error('No se descargó better_sqlite3.node para Electron.');
}

function buscarMakensis() {
  const candidatos = process.platform === 'win32'
    ? [process.env.MAKENSIS, 'C:\\Program Files (x86)\\NSIS\\makensis.exe', 'C:\\Program Files\\NSIS\\makensis.exe', 'makensis']
    : [process.env.MAKENSIS, 'makensis'];
  for (const c of candidatos.filter(Boolean)) {
    try {
      execFileSync(c, ['-VERSION'], { stdio: 'ignore' });
      return c;
    } catch { /* siguiente */ }
  }
  throw new Error('No se encontró makensis. Instala NSIS: winget install NSIS.NSIS');
}

function instalador() {
  paso('Instalador (NSIS)');
  fs.mkdirSync(DIST, { recursive: true });
  const salida = path.join(DIST, `SIDI-Setup-${VERSION}.exe`);
  execFileSync(buscarMakensis(), [
    '-V2', `-DVERSION=${VERSION}`, `-DSRC=${SALIDA}`, `-DOUTFILE=${salida}`,
    path.join(RAIZ, 'installer', 'sidi.nsi')
  ], { stdio: 'inherit' });
  const mb = (fs.statSync(salida).size / 1024 / 1024).toFixed(1);
  console.log(`\n✔ ${path.relative(RAIZ, salida)} (${mb} MB)`);
}

(async () => {
  console.log(`SIDI ${VERSION} · instalador de Windows`);
  fs.rmSync(SALIDA, { recursive: true, force: true });
  fs.mkdirSync(SALIDA, { recursive: true });
  await descargarElectron();
  await personalizarExe();
  copiarApp();
  copiarDependencias();
  sqliteParaElectron();
  instalador();
})().catch((err) => {
  console.error(`\n✖ ${err.message}`);
  process.exit(1);
});
