# Arquitectura y Convenciones - SIDI
> **Versión 2 (26/10/2026).** Basada en la plantilla **Express + SQLite + JS sin frameworks** del repositorio, sin login.

## 1. Arquitectura general
Una sola aplicación Node que sirve la API y las páginas:

```
Navegador (public/: HTML + CSS + JS, módulos IIFE)
      │  fetch JSON  (UI.api)
      ▼
Express (server.js) ── routes/ ── services/ ── lib/db.js ── SQLite (data/app.db)
                                      │
                                      ├── lib/excel/lectores/   (SheetJS: OPINA, maestros)
                                      └── lib/excel/generadores/ (templates/: Descuentos con ExcelJS,
                                                                  Incidencias con JSZip sobre el XML)
```

Capas del backend:
- **routes/**: reciben la petición, validan entrada y responden. Sin SQL.
- **services/**: lógica de negocio (descuentos, suplencias, quincenas, cálculo OPINA, métricas).
- **lib/db.js**: conexión única `better-sqlite3`, esquema y migraciones.
- **lib/excel/**: lectores y generadores, uno por archivo.
  - `descuentos.js`: carga la plantilla con ExcelJS y escribe las filas.
  - `incidencias.js`: abre la plantilla con **JSZip** y edita el XML directamente, porque ExcelJS pierde los vínculos externos. Pasos: escribir filas en `sheet1.xml` (hoja *Incidencia*) y ajustar el `ref` de `table1.xml` (`Tabla17`); escribir *Detalle* en `sheet2.xml` con fórmulas `[1]Descuentos!$K$n`; actualizar el destino del vínculo en `externalLinks/_rels/externalLink1.xml.rels` y la caché de valores en `externalLink1.xml`; usar cadenas en línea (`inlineStr`) o agregarlas a `sharedStrings.xml`; borrar `calcChain.xml` (y su entrada en `[Content_Types].xml` y `workbook.xml.rels`) y poner `fullCalcOnLoad="1"`.
  - Ambos generadores reciben los mismos datos de la quincena para que las filas de Descuentos y las referencias de Detalle coincidan.

Sin sesiones: no hay `requireAuth`. El servidor escucha en `HOST` (por defecto `127.0.0.1`).

## 2. Estructura de carpetas
```
SIDI/
├── server.js                  # Express: cabeceras, rutas /api y páginas
├── lib/
│   ├── db.js                  # Conexión, PRAGMAs, esquema, semillas
│   ├── migraciones/           # 001_inicial.sql, 002_....sql (se aplican en orden)
│   ├── semillas.js            # tipos_clase, catálogos, quincenas del año
│   ├── nomina.js              # normalizar / formatear nómina
│   ├── quincena.js            # número de quincena, rango y fecha de pago
│   └── excel/
│       ├── lectores/          # opina.js (v1/v2), maestros.js (nómina, nombre, edad, CURP)
│       └── generadores/       # descuentos.js, incidencias.js
├── services/                  # descuentoService.js, suplenciaService.js, opinaService.js, metricasService.js
├── routes/                    # docentes.js, faltas.js, incidencias.js, opina.js, reportes.js,
│                              # catalogos.js, configuracion.js, analitica.js
├── templates/                 # PLANTILLAS VACÍAS: DESCUENTO-PREPA.xlsx, INCIDENCIAS-PREPA.xlsx
├── data/                      # app.db (no se sube a git)
├── tests/                     # *.test.js con node:test + fixtures anonimizados
├── public/
│   ├── app.html               # menú lateral + contenedor de vistas (página de inicio)
│   ├── vendor/chart.umd.min.js
│   ├── css/  theme.css · base.css · app.css
│   └── js/
│       ├── theme.js           # aplica modo y color ANTES de pintar (en <head>)
│       ├── ui-kit.js          # UI.escape, UI.api, UI.toast, UI.confirm, UI.formModal…
│       ├── app.js             # navegación entre vistas (VIEWS)
│       ├── panel.js · docentes.js · faltas.js · incidencias.js
│       ├── opina.js · reportes.js · catalogos.js · perfil.js
└── context/                   # estos documentos .md
```
Se eliminan: `lib/auth.js`, `routes/auth.js`, `routes/notas.js`, `public/login.html`, `public/js/login.js`, `public/js/notas.js`, `public/css/login.css`.

## 3. Tema y color principal (Perfil)
- `theme.css` define todos los colores como variables. El color principal se expresa con **una sola variable base** `--primary` y las derivadas (`--primary-hover`, `--primary-soft`, `--primary-text`, `--ring`, `--focus-ring`, `--primary-foreground`) se calculan en `theme.js` a partir del hex elegido.
- `theme.js` (cargado en `<head>`) lee `sidi.tema` de `localStorage` y aplica `data-theme` y las variables **antes** de pintar, para evitar destellos. Luego `perfil.js` sincroniza con `/api/configuracion` (la BD es la fuente de verdad; `localStorage` es solo caché).
- `--primary-foreground` se elige automáticamente (blanco u oscuro) para cumplir contraste ≥ 4.5:1; si el color elegido no lo logra en ningún caso, se rechaza con un aviso.
- Modo: `claro`, `oscuro` o `automático` (sigue al sistema operativo).
- **Formalidad:** el color solo se aplica a acentos. Se quita el `--brand-gradient` violeta de la plantilla y los "glows" se derivan del color elegido con opacidad baja. Colores de estado fijos: verde (activo), gris (inactivo), rojo (falta/alerta), ámbar (pendiente).
- Paleta sugerida: Rosa `#DB2777` (por defecto), Frambuesa `#BE185D`, Ciruela `#9333EA`, Azul marino `#1D4ED8`, Verde azulado `#0F766E`, Grafito `#475569`.

## 4. Convenciones de código
| Elemento | Convención | Ejemplo |
|---|---|---|
| Variables y funciones | camelCase | `calcularDescuento()` |
| Módulos de vista (IIFE) | PascalCase, un archivo por vista | `public/js/faltas.js` → `Faltas` |
| Archivos de servicio | camelCase + sufijo | `descuentoService.js` |
| Tablas y columnas BD | snake_case, tablas en plural | `faltas.monto_descuento` |
| Constantes | MAYÚSCULAS | `MUESTRA_MINIMA_OPINA` |
| Endpoints | kebab-case, sustantivos en plural | `/api/faltas`, `/api/reportes/descuentos` |
| Fechas en BD | `TEXT` ISO `YYYY-MM-DD` | `2026-08-17` |
| Dinero | `REAL` redondeado a 2 decimales en el servicio | `54.00` |

- Dominio en español (docente, falta, suplencia); términos técnicos en inglés aceptados.
- CommonJS (`require`), sin TypeScript ni compilación.
- Todo dato del usuario que se pinta en HTML pasa por `UI.escape`.
- SQL siempre con parámetros (`db.prepare(...).run(...)`); varias escrituras relacionadas van en `db.transaction()`.
- Funciones de más de ~40 líneas se dividen. Prettier recomendado.
- **Nunca** se suben a git archivos reales del cliente ni `data/*.db`. Los *fixtures* de prueba se anonimizan.

## 5. Commits (Conventional Commits)
```
<tipo>(<alcance>): <descripción en presente>
```
Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Ejemplos: `feat(opina): importar formato 2026`, `fix(descuentos): una fila por CRN y día`, `chore(plantilla): quitar login`.

## 6. Flujo de trabajo Git
```
main      ←── (fin de sprint, solo Isaac) ── develop ←── PRs diarios ── feature/* , fix/*
```
1. **`main`**: protegida; código estable/entregable. Solo **Calixto Isaac Galeana** fusiona.
2. **`develop`**: integración diaria; protegida; requiere PR aprobado por Isaac.
3. **Ramas de trabajo:** `feature/hu-08-importar-opina`, `fix/nomina-ceros` (desde `develop`).
4. **Un PR por día por integrante** como mínimo, con resumen, HU relacionada, evidencia y tareas del día.
5. GitHub: *Branch protection* en `main` y `develop`, "Require pull request review", Isaac como único *CODEOWNER* con permiso de merge.
6. Prohibido `push --force` a `main`/`develop`.

## 7. Plantilla de Pull Request
```markdown
## Resumen
## Historia de usuario
HU-XX
## Cambios
- 
## Evidencia
(capturas / resultado de pruebas / Excel generado comparado con el original)
## Checklist
- [ ] Cumple criterios de aceptación
- [ ] Sin errores en consola
- [ ] Probado con datos de ejemplo (sin datos reales en el commit)
- [ ] Documentación de context/ actualizada
```

## 8. Variables de entorno (`.env`)
```
PORT=3000
HOST=127.0.0.1          # 0.0.0.0 solo si se decide abrir a la red local
NODE_ENV=development
# DB_PATH=./data/app.db
```
Se eliminan `JWT_SECRET` y todo lo relacionado con sesiones.
