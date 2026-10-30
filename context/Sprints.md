# Sprints de SIDI en GitHub (milestones, issues y tablero Kanban)
> **Versión 1.0 (29/10/2026).** Basado en el *Product Backlog v2.4.3* (`02_Product_Backlog.md` §2–§4) y en el flujo Git de `03_Arquitectura_Convenciones.md` §5–§7. Repositorio: `CalixtoIsaac/SIDI-Sistema-Integral-de-Informacion-Docente`. Responsable: **Isaac (Scrum Master)**.

## 1. Qué se va a crear
| Elemento de GitHub | Para qué | Cantidad |
|---|---|---|
| **Milestones** | Un milestone = un Sprint, con fecha de cierre y barra de avance | 3 (Sprint 1, 2 y 3) |
| **Issues** | Una tarjeta por historia (HU) con criterios y tareas del día como *checklist* + 3 tareas de revisión/cierre | 27 HU + 3 = **30** |
| **Labels** | Filtrar por tipo, épica, prioridad y área (BD, Backend, Frontend) | 16 |
| **Project (tablero)** | Kanban con columnas de estado, campos *Puntos*, *Día* y *Fecha*, vistas por sprint y por persona | 1 |
| **Rama `develop`** | Integración diaria (todos los PR van aquí) | 1 |
| **`.github/`** | `CODEOWNERS` (Isaac aprueba todo), plantilla de PR y plantilla de bug | 3 archivos |

> No existe **HU-23**: el "ranking completo" quedó dentro de **HU-16** (backlog v2.4). Por eso los IDs saltan de HU-22 a HU-24.

Archivos de apoyo (ya están en el repositorio):
```
scripts/github/crear-tablero.sh   # crea todo de una vez (opción A)
scripts/github/issues.tsv         # lista de issues: título, labels, milestone, responsables, puntos, día, fecha
scripts/github/issues/*.md        # cuerpo de cada issue (historia, criterios, tareas por integrante)
scripts/github/dot-github/          # se copian a .github/ (el script lo hace solo):
  CODEOWNERS · pull_request_template.md · ISSUE_TEMPLATE/bug.yml
```

## 2. Calendario
15 días hábiles. Se saltan el **2 de noviembre** (Día de Muertos) y el **16 de noviembre** (descanso por la Revolución). Si el arranque cambia, actualiza las fechas en `issues.tsv` (columna `fecha`) y en `crear-tablero.sh` (`SPRINT*_FIN`).

| Sprint | Días | Fechas | Puntos | Cierra con |
|---|---|---|---|---|
| **Sprint 1** — Base, datos de entrada y consulta | D1–D5 | mar 03/11 → lun 09/11 | 70 | Revisión con Saraí (D5) |
| **Sprint 2** — Faltas, reportes de Nacional y analítica | D6–D10 | mar 10/11 → mar 17/11 | 51 | Entrega de reportes de Nacional (D10) |
| **Sprint 3** — Comparativo, correo y resumen ejecutivo | D11–D15 | mié 18/11 → mar 24/11 | 13 | Entrega final (D15) |

## 3. Requisitos (una sola vez)
1. Ser dueño del repositorio (Isaac) y tener a **Uziel, Matías y Sebastián** como colaboradores: *Settings → Collaborators → Add people*. Anota sus usuarios de GitHub.
2. Instalar **Git for Windows** (trae *Git Bash*) y **GitHub CLI**: `winget install GitHub.cli`.
3. En Git Bash:
   ```bash
   gh auth login                 # GitHub.com → HTTPS → navegador
   gh auth refresh -s project    # permiso extra para crear el tablero
   ```
4. **Repositorio privado:** la protección de ramas solo se aplica en repos públicos o con **GitHub Pro**. Pro es gratis con el *GitHub Student Developer Pack* (education.github.com). Si el repo es público no hace falta.

## 4. Opción A — Crear todo con el script (recomendada, ~2 min)
1. Ten en tu copia local la carpeta `scripts/github/` (súbela al repo con un commit para que el equipo la vea).
2. Abre `scripts/github/crear-tablero.sh` y llena la sección **CONFIGURACIÓN**:
   ```bash
   GH_UZIEL="usuario-de-uziel"
   GH_MATIAS="usuario-de-matias"
   GH_SEBASTIAN="usuario-de-sebastian"
   ```
   (Si los dejas vacíos, los issues se crean sin asignar y los asignas después en el tablero.)
3. Desde la raíz del repositorio, en Git Bash:
   ```bash
   bash scripts/github/crear-tablero.sh
   ```
   El script hace, en orden: **copia `dot-github/` a `.github/` → labels → milestones → rama `develop` (y la deja como rama por defecto) → Project con campos Puntos/Día/Fecha → 30 issues** (cada uno con su milestone, labels y responsables) y los mete al tablero con sus valores.
   Es **idempotente**: si lo vuelves a correr, omite lo que ya existe.
4. Sigue con **§6** (columnas, vistas y automatizaciones), que GitHub no permite configurar desde la terminal.

> Si Git Bash marca `$'\r': command not found`, el archivo se guardó con saltos de línea de Windows: en VS Code, abajo a la derecha cambia **CRLF → LF** y guarda.

## 5. Opción B — Crear todo a mano desde la web
Úsala si no quieres instalar `gh`. Todo el contenido sale de `scripts/github/issues.tsv` e `issues/*.md`.

### 5.1 Labels
*Issues → Labels → New label*. Crea:
| Label | Color | Descripción |
|---|---|---|
| `tipo:historia` | `#DB2777` | Historia de usuario del backlog |
| `tipo:tarea` | `#6B7280` | Integración, revisión o cierre |
| `tipo:bug` | `#DC2626` | Error encontrado en pruebas |
| `prioridad:1` / `prioridad:2` / `prioridad:3` | `#B91C1C` / `#D97706` / `#65A30D` | Alta / media / baja |
| `area:bd` / `area:backend` / `area:frontend` | `#1D4ED8` / `#0F766E` / `#9333EA` | Uziel / Matías / Sebastián |
| `EP-01` … `EP-07` | `#FBCFE8` | Épicas del backlog §1 |

### 5.2 Milestones
*Issues → Milestones → New milestone*. Uno por sprint, con la fecha de la tabla del §2 como *Due date* y la descripción "nombre · puntos · días".

### 5.3 Rama `develop`
1. En la página del repo: selector de ramas → escribe `develop` → *Create branch: develop from main*.
2. *Settings → General → Default branch* → cambia a **`develop`**.
   **Por qué:** GitHub solo cierra el issue con `Closes #N` cuando el PR se fusiona a la **rama por defecto**. Como los PR diarios van a `develop`, esta debe ser la rama por defecto.

### 5.4 Issues
Por cada fila de `issues.tsv` (o del catálogo del §10): *Issues → New issue*.
- **Título:** columna `titulo` (ej. `HU-08 · Importar el archivo OPINA`).
- **Descripción:** pega el contenido de `issues/HU-08.md`.
- **Labels, Milestone y Assignees** (barra derecha): columnas `etiquetas`, `milestone` y `responsables` (U = Uziel, M = Matías, S = Sebastián).

### 5.5 Project (tablero)
1. En tu perfil: *Projects → New project → Board*. Nombre: **SIDI · Tablero Scrum**.
2. *⋯ → Settings → Custom fields*: crea **Puntos** (Number), **Día** (Number) y **Fecha** (Date).
3. En el repo: *Projects → Link a project* → elige el tablero.
4. Agrega los issues: en el tablero, `+ Add item` → `#` → elige el repo → selecciona todos. Llena *Puntos*, *Día* y *Fecha* de cada tarjeta (vista de tabla, se edita como hoja de cálculo).

## 6. Configurar el tablero (manual en ambas opciones)
### 6.1 Columnas (campo *Status*)
*⋯ → Settings → Status*. Renombra y agrega opciones hasta tener, en este orden:
| Columna | Significado | Quién la mueve |
|---|---|---|
| 📋 **Backlog** | Historias de sprints futuros | Automático al crear |
| 🎯 **Por hacer** | Historias del sprint actual sin empezar | Isaac en la *Sprint Planning* |
| 🔨 **En progreso** | Alguien ya abrió rama y trabaja en ella | El integrante al empezar |
| 👀 **En revisión** | Tiene PR abierto esperando a Isaac | El integrante al abrir el PR |
| ✅ **Hecho** | Cumple la Definición de Terminado (backlog §4) | Automático al fusionar el PR |

Opcional: en *Settings*, pon un límite de **WIP = 3** a *En progreso* (uno por integrante).

### 6.2 Vistas (pestañas del tablero)
| Vista | Tipo | Configuración |
|---|---|---|
| **Sprint actual** | Board | Filtro `milestone:"Sprint 1"` (cámbialo al iniciar cada sprint) · *Group by*: Assignees (carriles por persona) · *Field sum*: Puntos |
| **Backlog completo** | Table | *Group by*: Milestone · *Sort*: Día ↑ · columnas: Título, Status, Assignees, Labels, Puntos, Día, Fecha · *Field sum*: Puntos |
| **Calendario** | Roadmap | *Start date* y *Target date* = Fecha · zoom: semana |
| **Por persona** | Table | *Group by*: Assignees · filtro `-status:Hecho` |

### 6.3 Automatizaciones
*⋯ → Workflows* y activa:
| Workflow | Acción |
|---|---|
| *Item added to project* | Status = **Backlog** |
| *Auto-add to project* | Filtro `is:issue,pr is:open` del repo SIDI (los bugs y PR nuevos entran solos) |
| *Pull request merged* | Status = **Hecho** |
| *Item closed* | Status = **Hecho** |
| *Item reopened* | Status = **En progreso** |
| *Code changes requested* | Status = **En progreso** |

### 6.4 Sprint Planning del Sprint 1
En la vista *Backlog completo*, selecciona todas las tarjetas de **Sprint 1** → *Status* = **Por hacer**. Lo mismo al iniciar el Sprint 2 (D6) y el 3 (D11).

## 7. Proteger las ramas (solo Isaac aprueba)
1. Sube con un commit la carpeta `.github/` (el script la crea desde `scripts/github/dot-github/`; en la opción B cópiala a mano). Su `CODEOWNERS` contiene `* @CalixtoIsaac`. Debe quedar en `develop` y en `main`.
2. *Settings → Branches → Add branch ruleset* (o *Add classic branch protection rule*), uno para `main` y otro para `develop`:
   - ✅ *Require a pull request before merging* → *Required approvals*: **1**
   - ✅ *Require review from Code Owners*
   - ✅ *Dismiss stale pull request approvals when new commits are pushed*
   - ✅ *Block force pushes* · ✅ *Restrict deletions*
   - En `main`, además: solo se fusiona desde `develop` al cerrar cada sprint (regla del equipo, `03` §6).

## 8. Flujo diario (cada integrante)
1. **Daily (5 min):** cada quien dice qué hizo, qué hará hoy y si algo lo bloquea. Isaac revisa la vista *Sprint actual*.
2. **Tomar la tarjeta:** asignarse, moverla a 🔨 *En progreso*.
3. **Crear la rama ligada al issue** (queda vinculada en la tarjeta):
   ```bash
   gh issue develop 8 --base develop --name feature/hu-08-importar-opina --checkout
   ```
   (Desde la web: en el issue, *Development → Create a branch*, origen `develop`.)
4. **Commits** con Conventional Commits: `feat(opina): importar formato 2026`.
5. **Marcar avances** en el *checklist* del issue (tareas del día y criterios).
6. **PR a `develop` al final del día** con la plantilla:
   - PR parcial (la historia sigue): `Refs #8`.
   - Último PR de la historia: `Closes #8` → al fusionarlo, la tarjeta pasa sola a ✅ *Hecho*.
   - Mover la tarjeta a 👀 *En revisión* mientras Isaac revisa.
7. **Isaac** revisa, pide cambios o aprueba y fusiona.
8. **Bugs:** *New issue → Bug*, ligado a la HU; entra solo al tablero.

## 9. Cierre de cada sprint
1. **Sprint Review** con Saraí (D5, D10, D15): demostrar lo que está en ✅ *Hecho*; los comentarios van al backlog §6.
2. **Retrospectiva** (15 min): qué funcionó, qué no, una mejora para el siguiente sprint.
3. Isaac abre el PR **`develop` → `main`**, lo fusiona y crea un *release* (`v0.1` Sprint 1, `v0.2` Sprint 2, `v1.0` Sprint 3).
4. Lo que no se terminó: cambiar su milestone al siguiente sprint (y anotarlo en el backlog).
5. *Issues → Milestones → Close* el milestone del sprint.
6. **Gráfica de avance:** en el tablero, *Insights → New chart* → tipo *Historical*, eje Y = **Sum of Puntos**, agrupado por **Status**, filtro por milestone (burn-up del sprint).

## 10. Catálogo de issues
| Sprint | Día | Fecha | Issue | Resp. | Pts |
|---|---|---|---|---|---|
| 1 | D1 | mar 03/11 | HU-00 · Adaptar la plantilla (sin login, esquema v2.3 y semillas) | U, M | 3 |
| 1 | D2 | mié 04/11 | HU-02 · Importar el Excel de grupos docentes | M, U, S | 8 |
| 1 | D2 | mié 04/11 | HU-08 · Importar el archivo OPINA | M, U | 8 |
| 1 | D3 | jue 05/11 | HU-01 · Alta y edición de docentes con formulario | U, M, S | 5 |
| 1 | D3 | jue 05/11 | HU-20 · Importar CV en PDF | M, U, S | 8 |
| 1 | D4 | vie 06/11 | HU-03 · Tabla de docentes con los 12 campos | S, M | 8 |
| 1 | D4 | vie 06/11 | HU-04 · Resumen al pasar el mouse y ficha extendida (tarifa mensual) | S | 5 |
| 1 | D4 | vie 06/11 | HU-05 · Punto verde/gris y suspender docentes | S, M | 3 |
| 1 | D4 | vie 06/11 | HU-21 · Baja con motivo, observaciones y recontratable | U, M, S | 3 |
| 1 | D5 | lun 09/11 | D5 · Revisión del Sprint 1 con Saraí | U, M, S | — |
| 1 | D5 | lun 09/11 | HU-06 · Filtros y orden de docentes | M, S | 5 |
| 1 | D5 | lun 09/11 | HU-07 · Búsqueda por nombre, CURP, nómina o CRN | M, S | 3 |
| 1 | D5 | lun 09/11 | HU-17 · Color principal y modo claro/oscuro | S | 5 |
| 1 | D5 | lun 09/11 | HU-18 · Editar tarifas y catálogos | U, S | 3 |
| 1 | D5 | lun 09/11 | HU-27 · Importar el reporte de contratos por CRN | M, U, S | 3 |
| 2 | D6 | mar 10/11 | HU-09 · Registrar faltas por día y CRN | M, U, S | 8 |
| 2 | D6 | mar 10/11 | HU-10 · Suplencias y pago del suplente | M, S | 5 |
| 2 | D6 | mar 10/11 | HU-22 · Grupos a suplir y docentes disponibles | M, S | 5 |
| 2 | D7 | mié 11/11 | HU-11 · Pagos adicionales de la quincena | M, S | 5 |
| 2 | D7 | mié 11/11 | HU-12 · Excel de Descuentos de la quincena | M, U | 5 |
| 2 | D8 | jue 12/11 | HU-13 · Excel de Incidencias con hoja Detalle | M, U, S | 5 |
| 2 | D8 | jue 12/11 | HU-14 · Inasistencias por semestre | M, S | 3 |
| 2 | D9 | vie 13/11 | HU-15 · Panel con gráficas | S, M | 8 |
| 2 | D9 | vie 13/11 | HU-16 · Ranking completo OPINA con filtros y promedios | U, M, S | 5 |
| 2 | D9 | vie 13/11 | HU-19 · Asignaturas y horarios del docente | U, S | 2 |
| 2 | D10 | mar 17/11 | D10 · Cierre del Sprint 2: pruebas Q16–Q20 y entrega de reportes de Nacional | U, M, S | — |
| 3 | D11 | mié 18/11 | HU-24 · Comparativo del % OPP del campus | U, S | 2 |
| 3 | D12 | jue 19/11 | HU-25 · Borrador de Outlook con los reportes de Nacional | M, S | 3 |
| 3 | D13 | vie 20/11 | HU-26 · Resumen ejecutivo en diapositivas | S, M | 8 |
| 3 | D15 | mar 24/11 | D15 · Cierre del Sprint 3: pruebas integrales y entrega final | U, M, S | — |
**Totales:** Sprint 1 = 70 pts · Sprint 2 = 51 pts · Sprint 3 = 13 pts · **134 pts** (igual que el backlog). HU-26 abarca D13–D14, y su issue trae las tareas de los dos días.

## 11. Si cambia el backlog
- **Historia nueva o cambio de alcance:** primero se actualiza `02_Product_Backlog.md` (lo decide Isaac) y luego el issue en GitHub, a mano (el script no reescribe issues que ya existen).
- **Cambio de día o de sprint:** cambia el *Milestone* y los campos *Día*/*Fecha* de la tarjeta, y la fila del sprint en el backlog §3.
- Para un proyecto nuevo desde cero, edita `issues.tsv` e `issues/*.md` y vuelve a correr el script.
