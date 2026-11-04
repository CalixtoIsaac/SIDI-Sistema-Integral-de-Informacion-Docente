# Tareas de Uziel — Base de datos y estructura

> Generado a partir de `context/02_Product_Backlog.md` v2.4.3 (§2 y §3) y `scripts/github/issues.tsv`. Si cambia el backlog, se actualiza primero el backlog y después este archivo.

**Rol:** Base de datos y estructura · **Label en GitHub:** `area:bd` · **Historias en las que participa:** 14 · **Puntos involucrados:** 68

## 1. Historias asignadas

"Líder" = primer responsable de la historia en el backlog (coordina y abre el PR que la cierra con `Closes #N`).

| HU | Historia | Sprint | Día | Pts | Papel | Comparte con | Rama sugerida |
|---|---|---|---|---|---|---|---|
| HU-00 | Adaptar la plantilla (sin login, esquema v2.3 y semillas) | 1 | D1 | 3 | Líder | Matías | `feature/hu-00-adaptar-la-plantilla` |
| HU-02 | Importar el Excel de grupos docentes | 1 | D2 | 8 | Apoyo | Matías, Sebastián | `feature/hu-02-importar-el-excel-de-grupos` |
| HU-08 | Importar el archivo OPINA | 1 | D2 | 8 | Apoyo | Matías | `feature/hu-08-importar-el-archivo-opina` |
| HU-01 | Alta y edición de docentes con formulario | 1 | D3 | 5 | Líder | Matías, Sebastián | `feature/hu-01-alta-y-edicion-de-docentes` |
| HU-20 | Importar CV en PDF | 1 | D3 | 8 | Apoyo | Matías, Sebastián | `feature/hu-20-importar-cv-en-pdf` |
| HU-21 | Baja con motivo, observaciones y recontratable | 1 | D4 | 3 | Líder | Matías, Sebastián | `feature/hu-21-baja-con-motivo-observaciones-y` |
| HU-18 | Editar tarifas y catálogos | 1 | D5 | 3 | Líder | Sebastián | `feature/hu-18-editar-tarifas-y-catalogos` |
| HU-27 | Importar el reporte de contratos por CRN | 1 | D5 | 3 | Apoyo | Matías, Sebastián | `feature/hu-27-importar-el-reporte-de-contratos` |
| HU-09 | Registrar faltas por día y CRN | 2 | D6 | 8 | Apoyo | Matías, Sebastián | `feature/hu-09-registrar-faltas-por-dia-y` |
| HU-12 | Excel de Descuentos de la quincena | 2 | D7 | 5 | Apoyo | Matías | `feature/hu-12-excel-de-descuentos-de-la` |
| HU-13 | Excel de Incidencias con hoja Detalle | 2 | D8 | 5 | Apoyo | Matías, Sebastián | `feature/hu-13-excel-de-incidencias-con-hoja` |
| HU-16 | Ranking completo OPINA con filtros y promedios | 2 | D9 | 5 | Líder | Matías, Sebastián | `feature/hu-16-ranking-completo-opina-con-filtros` |
| HU-19 | Asignaturas y horarios del docente | 2 | D9 | 2 | Líder | Sebastián | `feature/hu-19-asignaturas-y-horarios-del-docente` |
| HU-24 | Comparativo del % OPP del campus | 3 | D11 | 2 | Líder | Sebastián | `feature/hu-24-comparativo-del-opp-del-campus` |

> ⚠ En HU-19 apareces como responsable, pero el backlog §3 no te asigna una tarea concreta ese día. Acuérdala con Isaac en la Daily y agrégala a la tabla de abajo.

## 2. Tareas por día

**Estado:** ⬜ Pendiente · 🔨 En progreso · 👀 En revisión (PR abierto) · ✅ Hecho (PR fusionado por Isaac)


### Sprint 1 — Base, datos de entrada y consulta (D1–D5 · 03/11 → 09/11)

| Día | Fecha | HU | Tarea | Estado |
|---|---|---|---|---|
| D1 | mar 03/11 | HU-00 | Limpiar la plantilla: quitar login, JWT, tabla `usuarios` y Notas | ⬜ |
| D1 | mar 03/11 | HU-00 | Migración `001_inicial.sql` con el esquema v2.3 | ⬜ |
| D1 | mar 03/11 | HU-00 | Semillas: tarifas ($54), catálogos (nivel de estudios, campo de formación), periodos con fecha de inicio y quincenas | ⬜ |
| D2 | mié 04/11 | HU-02 | Tablas `asignaturas`, `horarios` y `grupos_importaciones` | ⬜ |
| D2 | mié 04/11 | HU-02 · HU-08 | Upsert de docentes y CRN sin pisar lo editado a mano | ⬜ |
| D3 | jue 05/11 | HU-20 | Tablas `titulos_docente` y `cv_archivos` | ⬜ |
| D3 | jue 05/11 | HU-20 · HU-01 | Vista `v_docente_estudios` | ⬜ |
| D4 | vie 06/11 | HU-03 | Vista `v_docente_primer_periodo`; consultas de antigüedad y número de grupos | ⬜ |
| D4 | vie 06/11 | HU-21 | Tablas `docente_bajas` y `motivo_baja` | ⬜ |
| D4 | vie 06/11 | HU-04 | Columna `tipos_clase.pago_mensual` (tarifa mensual) | ⬜ |
| D5 | lun 09/11 | HU-06 | Índices para los filtros | ⬜ |
| D5 | lun 09/11 | HU-18 | Catálogos editables | ⬜ |
| D5 | lun 09/11 | HU-27 | Tabla `contratos_importaciones` | ⬜ |
| D5 | lun 09/11 | D5 | Revisión del Sprint 1 con Saraí: demostrar lo terminado | ⬜ |

### Sprint 2 — Faltas, reportes de Nacional y analítica (D6–D10 · 10/11 → 17/11)

| Día | Fecha | HU | Tarea | Estado |
|---|---|---|---|---|
| D6 | mar 10/11 | HU-09 | Tabla `faltas` (sesión, justificación, quincena de reporte) | ⬜ |
| D6 | mar 10/11 | HU-10 | Tabla `suplencias` | ⬜ |
| D6 | mar 10/11 | HU-22 | Índice de horarios por día | ⬜ |
| D7 | mié 11/11 | HU-11 | Tabla `incidencias` | ⬜ |
| D7 | mié 11/11 | HU-12 | Plantilla vacía de Descuentos | ⬜ |
| D8 | jue 12/11 | HU-13 | Plantilla de Incidencias **sin vínculos externos** | ⬜ |
| D9 | vie 13/11 | HU-15 | Consultas agregadas (docentes por género y por nivel de estudios) | ⬜ |
| D9 | vie 13/11 | HU-16 | Vista `v_opina_campus` | ⬜ |
| D10 | mar 17/11 | D10 | Cierre Sprint 2: datos de demo anonimizados y apoyo en pruebas Q16–Q20 | ⬜ |

### Sprint 3 — Comparativo, correo y resumen ejecutivo (D11–D15 · 18/11 → 24/11)

| Día | Fecha | HU | Tarea | Estado |
|---|---|---|---|---|
| D11 | mié 18/11 | HU-24 | Periodo AGO-DIC 2025; tabla `opina_campus_semestre` con semillas (88.3 %, 85.9 %, 87.6 %) | ⬜ |
| D12 | jue 19/11 | HU-25 | Tabla `envios_correo`; claves de configuración `correo.*` | ⬜ |
| D13 | vie 20/11 | HU-26 | Consultas de las 8 gráficas: G1–G4, G9 (*Asunto personal* e *Incapacidad médica*), G10, G15 y G16 | ⬜ |
| D14 | lun 23/11 | HU-26 | Sin tarea propia en el backlog: apoyo con las consultas de las gráficas si hace falta | ⬜ |
| D15 | mar 24/11 | D15 | Cierre Sprint 3: datos de demo y pruebas integrales | ⬜ |

## 3. Recordatorios del flujo diario

1. Daily de 5 min: qué hice, qué haré hoy, qué me bloquea.
2. Asignarte la tarjeta en el tablero y moverla a 🔨 *En progreso*.
3. Crear la rama desde `develop`: `gh issue develop <N> --base develop --name <rama sugerida> --checkout`.
4. Commits con Conventional Commits, p. ej. `feat(opina): importar formato 2026`.
5. PR a `develop` al final del día: `Refs #N` si la historia sigue, `Closes #N` en el último PR. Solo **Isaac** aprueba.
6. Nunca subir datos reales del cliente (`data/`, `data/cv/`, Excel y PDF originales).
7. Cambia el estado de esta tabla al mover la tarjeta, para que coincida con el tablero.
