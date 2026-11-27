# SIDI · Sistema Integral de Información Docente

Aplicación web local para la Coordinación de Docentes de Preparatoria Veracruz: centraliza los datos personales, académicos y laborales de los maestros (Excel de grupos, CV en PDF, contratos por CRN y OPINA) y prepara los reportes quincenales de Nacional.

- **Backend:** Node.js + Express y SQLite (`better-sqlite3`). Sin login: se abre directo en el Panel (03 §1).
- **Frontend:** HTML, CSS y JavaScript **sin frameworks** (módulos IIFE, sin compilación). Color principal (rosa por defecto) y modo claro/oscuro/automático elegibles en **Perfil**.
- Documentación del proyecto en [`context/`](context/) (requerimientos, backlog, arquitectura, modelo de datos, UI/UX, API y formatos de Excel).

## 1. Requisitos

- **Node.js 20 o superior** (recomendado 22 LTS) y npm. SQLite viene dentro de `better-sqlite3`.

> En Windows, `better-sqlite3` descarga un binario ya compilado. Si `npm install` falla al compilarlo, usa una versión LTS de Node.

## 2. Instalación y arranque

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
npm run dev                 # se reinicia solo al guardar cambios del servidor
```

Abre **http://localhost:3000**. La primera vez se crea `data/app.db` con el esquema v2.3 y las semillas (tarifas, catálogos, motivos de baja, periodos y configuración del perfil).

| Script | Para qué |
|---|---|
| `npm run dev` | Desarrollo: reinicia el servidor al guardar (`node --watch`). |
| `npm start` | Ejecución normal. |
| `npm test` | Pruebas de servicios y lectores (`node:test`, datos ficticios). |

Los cambios en `public/` no requieren reiniciar: basta con recargar el navegador.

## 3. Qué hay hasta el Sprint 2

| Vista | Historias |
|---|---|
| **Panel** | Docentes activos, faltas, descontado y pagado a suplentes de la quincena, OPINA promedio; gráficas de calificación OPINA por maestro (con periodo), docentes por nivel que imparten, nivel de estudios, género, faltas por motivo y cumpleaños del mes; avisos, atajos y últimas cargas (HU-15). Gráficas en HTML/CSS (`graficas.js`), sin internet y con el color del tema. |
| **Docentes** | Tabla con los 12 campos + OPINA y faltas, selector de columnas, resumen al pasar el mouse, ficha con pestañas (tarifa diaria y mensual, Ver CV, vista semanal de horarios — HU-19), punto verde/gris, baja con motivo y recontratable, filtros con chips y búsqueda por nombre, CURP, nómina o CRN (HU-03, 04, 05, 06, 07, 21). Formulario en pasos y alta rápida (HU-01). Cargas del Excel de grupos y de CV en PDF con vista previa (HU-02, HU-20). |
| **Faltas** | Pendientes de reportar y reportadas por quincena, con descontado, pagado a suplentes y diferencia. Modal **Registrar falta**: CRN del día según el horario, varios días, monto editable, justificación IMSS, 2ª sesión, contrato del CRN y descuento manual (HU-09); grupos a suplir y docentes disponibles sin empalme (HU-22); suplente con alta rápida y su contrato, asignable después desde la lista (HU-10). |
| **Incidencias** | Pagos adicionales por quincena (tutoreo, PAD, coach…), importe por periodo, contadores de PEP/orden interna, reordenar como saldrá en el Excel y copiar los de la quincena anterior; las suplencias se ven con 🔗 a Faltas (HU-11). |
| **Reportes** | Selector de quincena, lo que se incluirá con opción de quitar pendientes, avisos antes de descargar, descarga de `DESCUENTO-PREPA Qnn.xlsx` e `INCIDENCIAS PREPA Qnn.xlsx`, cerrar/reabrir quincena (HU-12, HU-13). Debajo, **inasistencias por semestre**: número de faltas, profesores que faltaron, descontado, justificadas IMSS y faltas por motivo (HU-14). |
| **OPINA** | **Ranking completo** (pestaña por defecto): periodo, todos / mejores N / peores N / rango de %, incluir muestra insuficiente, comparar con otro semestre (▲/▼), cuadro de promedios (maestros y campus), exportar a Excel y clic → ficha en la pestaña OPINA (HU-16). Carga del archivo por alumno con vista previa y filas descartadas; historial (HU-08). |
| **Configuración** | Tarifas, catálogos, motivos de baja, contratos por CRN (plantilla y carga), grupos que se omiten y parámetros de OPINA (HU-18, HU-27). |
| **Perfil** | Nombre, color principal con validación de contraste y modo claro/oscuro/automático (HU-17). |


## 4. Instalador de Windows (app de escritorio)

La coordinadora usa SIDI como programa de Windows (Electron): `electron/main.js` arranca el mismo `server.js` en `127.0.0.1` y lo muestra en su propia ventana. Sus datos (`app.db` y los CV) se guardan en `%APPDATA%\SIDI\data`, así que **instalar una versión nueva no borra nada**.

**Requisitos (una vez):** `npm install` y NSIS (`winget install NSIS.NSIS`).

**Para sacar una versión nueva:**

1. Sube `version` en `package.json` (p. ej. `1.0.1` → `1.0.2`).
2. `npm run dist` → genera `dist/SIDI-Setup-<versión>.exe` (tarda unos minutos la primera vez porque descarga Electron).
3. Publica el instalador como *Release* de GitHub (no como commit: pesa ~120 MB):
   ```bash
   gh release create v1.0.2 dist/SIDI-Setup-1.0.2.exe --target main --title "SIDI 1.0.2" --notes "Qué cambió"
   ```
4. En la computadora de la coordinadora se ejecuta el instalador nuevo encima del anterior (cierra SIDI si está abierto).

| Archivo | Para qué |
|---|---|
| `electron/main.js` | Ventana de la app, puerto libre, carpeta de datos y menú (Alt). |
| `lib/rutas.js` | Carpeta de datos: `data/` en desarrollo, `%APPDATA%\SIDI\data` en la app instalada. |
| `scripts/empaquetar.js` | Arma `build/win-unpacked` (Electron 42 + código + dependencias) y llama a NSIS. |
| `installer/sidi.nsi` | Instalador en español, por usuario, en `%LOCALAPPDATA%\Programs\SIDI`. |
| `build/icon.png`, `build/icon.ico` | Icono de la ventana, de `SIDI.exe` y del instalador. |

## 5. Estructura

```
server.js                 # Express: cabeceras, rutas /api y la página
lib/                      # db.js (esquema + semillas), semillas.js, color.js, nómina, CURP, horario, lectores de Excel y CV…
services/                 # lógica de negocio (docentes, bajas, catálogos, contratos, CV, grupos, OPINA, configuración)
routes/                   # /api/docentes, /grupos, /opina, /contratos, /catalogos, /tipos-clase, /configuracion…
public/
  app.html                # menú lateral + contenedor de vistas
  css/                    # theme.css (tokens) · base.css · app.css · sidi.css (componentes de SIDI)
  js/                     # theme.js (en <head>) · ui-kit.js · sidi-comun.js · app.js · graficas · panel · docentes · docente-form · importar · opina · faltas · incidencias · inasistencias · reportes · catalogos · perfil
tests/                    # *.test.js con fixtures anonimizados
data/                     # app.db y cv/*.pdf (no se suben a git)
context/                  # documentación del proyecto
```

## 6. Reglas del equipo

- Flujo Git, commits y PR: `context/03_Arquitectura_Convenciones.md` §5–§7 (PR diario a `develop`, solo Isaac aprueba).
- **Nunca** subir archivos reales del cliente (Excel, CV) ni `data/`.
- Todo dato del usuario que se pinta en HTML pasa por `UI.escape`; todo SQL va con parámetros.
