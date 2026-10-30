# Arquitectura y Convenciones - SIDI
> **Versión 2.4 (29/10/2026).** Retroalimentación del cliente: lector del **reporte de contratos**, **envío de reportes por correo** (borrador `.eml` para Outlook institucional), **resumen ejecutivo** (visor de diapositivas e impresión a PDF), cálculo de **docentes disponibles** y comparativo OPINA del campus. Límite de OPINA a 30 MB.
>
> **Versión 2.3 (27/10/2026). Basada en la plantilla **Express + SQLite + JS sin frameworks** del repositorio, sin login. Agrega los lectores del **Excel de grupos** y de **CV en PDF**; el generador de Incidencias ya no maneja vínculos externos.

## 1. Arquitectura general
Una sola aplicación Node que sirve la API y las páginas:

```
Navegador (public/: HTML + CSS + JS, módulos IIFE)
      │  fetch JSON  (UI.api)
      ▼
Express (server.js) ── routes/ ── services/ ── lib/db.js ── SQLite (data/app.db)
                                      │
                                      ├── lib/excel/lectores/   (SheetJS: OPINA, grupos docentes)
                                      ├── lib/cv/               (pdf-parse: CV "A1 CURRICULUM VITAE DOCENTES")
                                      ├── lib/excel/generadores/ (templates/: Descuentos con ExcelJS,
                                      │                           Incidencias con JSZip sobre el XML; plantilla de contratos)
                                      └── lib/correo/            (🆕 generador .eml borrador de Outlook)
```

Capas del backend:
- **routes/**: reciben la petición, validan entrada y responden. Sin SQL.
- **services/**: lógica de negocio (descuentos, suplencias y su agrupación, quincenas de reporte, cálculo OPINA, perfil del docente, métricas).
- **lib/db.js**: conexión única `better-sqlite3`, esquema y migraciones.
- **lib/excel/**: lectores y generadores, uno por archivo.
  - `descuentos.js`: carga la plantilla con ExcelJS y escribe las filas.
  - `incidencias.js`: abre la plantilla con **JSZip** y edita el XML directamente (conserva `Tabla17`, sus fórmulas `Tabla17[[#This Row],…]` y el estilo). Pasos: escribir filas en `sheet1.xml` (hoja *Incidencia*) y ajustar el `ref` de `table1.xml`; escribir *detalle* en `sheet2.xml` **con valores** en C (y fórmulas internas `=Incidencia!K{n}` en D, `=C−D` en E, `SUM` en el total); usar cadenas en línea (`inlineStr`) o agregarlas a `sharedStrings.xml`; borrar `calcChain.xml` (y su entrada en `[Content_Types].xml` y `workbook.xml.rels`) y poner `fullCalcOnLoad="1"`. La plantilla se guarda **sin** `externalLinks/` (se quitaron los residuos del original) para que Excel no pida "actualizar vínculos".
- **lib/excel/lectores/grupos.js**: lee `GRUPOS_DOCENTES_<PERIODO>.xlsx` (hoja `Salida`), agrupa filas por CRN, arma sesiones (día + horas), calcula horas/semana e idioma sugerido y devuelve una vista previa (docentes y CRN nuevos/cambiados).
- **lib/cv/lector.js**: extrae el texto de las primeras 3 páginas con `pdf-parse`, ubica las secciones por su número (`1.1`, `1.2.n`, `1.3.n`, `1.4`, `2.`…) y lee los campos `Etiqueta: valor`. Devuelve una **propuesta** (CURP, fecha, grados con estatus, lugar laboral, cursos, idiomas) con el nivel de confianza de cada dato. Nunca escribe en la BD por sí mismo.
  - Ambos generadores reciben los mismos datos de la quincena para que las filas de Descuentos y las referencias de Detalle coincidan.

- 🆕 **lib/excel/lectores/contratos.js**: lee el reporte de contratos (plantilla de SIDI o archivo propio con columnas CRN/Contrato por alias) y devuelve una vista previa (*07 §7.3*).
- 🆕 **lib/correo/eml.js**: arma un MIME `multipart/mixed` con los 2 Excel en base64, destinatarios, asunto y cuerpo, y `X-Unsent: 1` para que Outlook institucional lo abra como borrador (*07 §10*). Sin dependencias (no se usa Nodemailer ni SMTP). `reporteService.enviar()` genera los archivos y registra en `envios_correo`.
- 🆕 **services/disponibilidadService.js**: dado un CRN, fecha y sesión, busca docentes activos sin empalme de horario (`inicio < fin' AND inicio' < fin` el mismo día de la semana) y los ordena (*04 §5*).
- 🆕 **Resumen ejecutivo** (`public/js/resumen.js`): visor de diapositivas 16:9 con Chart.js; exporta con `window.print()` y CSS `@page { size: 13.333in 7.5in }`, una diapositiva por página; las gráficas se redibujan en modo claro antes de imprimir.

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
│   ├── curp.js                # validar CURP, fecha de nacimiento, género
│   ├── horario.js             # duración de sesión, horas/semana, idioma sugerido
│   ├── cv/lector.js           # lector de CV en PDF (pdf-parse)
│   ├── correo/                # 🆕 eml.js (borrador de Outlook con adjuntos)
│   └── excel/
│       ├── lectores/          # opina.js (v1/v2), grupos.js (Excel de grupos docentes), 🆕 contratos.js
│       └── generadores/       # descuentos.js, incidencias.js
├── services/                  # descuentoService.js, suplenciaService.js, opinaService.js, metricasService.js,
│                              # gruposService.js, cvService.js, perfilDocenteService.js,
│                              # 🆕 bajaService.js, disponibilidadService.js, contratosService.js, reporteService.js (envío)
├── routes/                    # docentes.js, faltas.js, incidencias.js, opina.js, reportes.js,
│                              # catalogos.js, configuracion.js, analitica.js
├── templates/                 # PLANTILLAS VACÍAS: DESCUENTO-PREPA.xlsx, INCIDENCIAS-PREPA.xlsx (sin vínculos externos)
├── data/                      # app.db y cv/*.pdf (NO se suben a git: .gitignore)
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
│       ├── opina.js · reportes.js · catalogos.js · perfil.js · 🆕 resumen.js
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
- **Nunca** se suben a git archivos reales del cliente (Excel, **CV**), ni `data/*.db`, ni `data/cv/`. Los *fixtures* de prueba se anonimizan (para CV: un PDF de ejemplo con datos ficticios en el mismo formato).

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
