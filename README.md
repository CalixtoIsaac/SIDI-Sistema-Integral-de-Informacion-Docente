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

## 3. Qué hay hasta el Sprint 1

| Vista | Historias |
|---|---|
| **Panel** | Indicadores de la plantilla y últimas cargas (las gráficas llegan con HU-15). |
| **Docentes** | Tabla con los 12 campos + OPINA y faltas, selector de columnas, resumen al pasar el mouse, ficha con pestañas (tarifa diaria y mensual, Ver CV), punto verde/gris, baja con motivo y recontratable, filtros con chips y búsqueda por nombre, CURP, nómina o CRN (HU-03, 04, 05, 06, 07, 21). Formulario en pasos y alta rápida (HU-01). Cargas del Excel de grupos y de CV en PDF con vista previa (HU-02, HU-20). |
| **OPINA** | Carga del archivo por alumno con vista previa y filas descartadas; historial (HU-08). |
| **Configuración** | Tarifas, catálogos, motivos de baja, contratos por CRN (plantilla y carga), grupos que se omiten y parámetros de OPINA (HU-18, HU-27). |
| **Perfil** | Nombre, color principal con validación de contraste y modo claro/oscuro/automático (HU-17). |

Faltas, Incidencias y Reportes muestran un aviso hasta el Sprint 2.

## 4. Estructura

```
server.js                 # Express: cabeceras, rutas /api y la página
lib/                      # db.js (esquema + semillas), semillas.js, color.js, nómina, CURP, horario, lectores de Excel y CV…
services/                 # lógica de negocio (docentes, bajas, catálogos, contratos, CV, grupos, OPINA, configuración)
routes/                   # /api/docentes, /grupos, /opina, /contratos, /catalogos, /tipos-clase, /configuracion…
public/
  app.html                # menú lateral + contenedor de vistas
  css/                    # theme.css (tokens) · base.css · app.css · sidi.css (componentes de SIDI)
  js/                     # theme.js (en <head>) · ui-kit.js · app.js · panel · docentes · docente-form · importar · opina · catalogos · perfil
tests/                    # *.test.js con fixtures anonimizados
data/                     # app.db y cv/*.pdf (no se suben a git)
context/                  # documentación del proyecto
```

## 5. Reglas del equipo

- Flujo Git, commits y PR: `context/03_Arquitectura_Convenciones.md` §5–§7 (PR diario a `develop`, solo Isaac aprueba).
- **Nunca** subir archivos reales del cliente (Excel, CV) ni `data/`.
- Todo dato del usuario que se pinta en HTML pasa por `UI.escape`; todo SQL va con parámetros.
