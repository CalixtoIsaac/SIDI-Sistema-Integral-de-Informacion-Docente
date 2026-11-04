# Tareas de Matías — Backend

> Generado a partir de `context/02_Product_Backlog.md` v2.4.3 (§2 y §3) y `scripts/github/issues.tsv`. Si cambia el backlog, se actualiza primero el backlog y después este archivo.

**Rol:** Backend · **Label en GitHub:** `area:backend` · **Historias en las que participa:** 22 · **Puntos involucrados:** 117

## 1. Historias asignadas

"Líder" = primer responsable de la historia en el backlog (coordina y abre el PR que la cierra con `Closes #N`).

| HU | Historia | Sprint | Día | Pts | Papel | Comparte con | Rama sugerida |
|---|---|---|---|---|---|---|---|
| HU-00 | Adaptar la plantilla (sin login, esquema v2.3 y semillas) | 1 | D1 | 3 | Apoyo | Uziel | `feature/hu-00-adaptar-la-plantilla` |
| HU-02 | Importar el Excel de grupos docentes | 1 | D2 | 8 | Líder | Uziel, Sebastián | `feature/hu-02-importar-el-excel-de-grupos` |
| HU-08 | Importar el archivo OPINA | 1 | D2 | 8 | Líder | Uziel | `feature/hu-08-importar-el-archivo-opina` |
| HU-01 | Alta y edición de docentes con formulario | 1 | D3 | 5 | Apoyo | Uziel, Sebastián | `feature/hu-01-alta-y-edicion-de-docentes` |
| HU-20 | Importar CV en PDF | 1 | D3 | 8 | Líder | Uziel, Sebastián | `feature/hu-20-importar-cv-en-pdf` |
| HU-03 | Tabla de docentes con los 12 campos | 1 | D4 | 8 | Apoyo | Sebastián | `feature/hu-03-tabla-de-docentes-con-los` |
| HU-05 | Punto verde/gris y suspender docentes | 1 | D4 | 3 | Apoyo | Sebastián | `feature/hu-05-punto-verde-gris-y-suspender` |
| HU-21 | Baja con motivo, observaciones y recontratable | 1 | D4 | 3 | Apoyo | Uziel, Sebastián | `feature/hu-21-baja-con-motivo-observaciones-y` |
| HU-06 | Filtros y orden de docentes | 1 | D5 | 5 | Líder | Sebastián | `feature/hu-06-filtros-y-orden-de-docentes` |
| HU-07 | Búsqueda por nombre, CURP, nómina o CRN | 1 | D5 | 3 | Líder | Sebastián | `feature/hu-07-busqueda-por-nombre-curp-nomina` |
| HU-27 | Importar el reporte de contratos por CRN | 1 | D5 | 3 | Líder | Uziel, Sebastián | `feature/hu-27-importar-el-reporte-de-contratos` |
| HU-09 | Registrar faltas por día y CRN | 2 | D6 | 8 | Líder | Uziel, Sebastián | `feature/hu-09-registrar-faltas-por-dia-y` |
| HU-10 | Suplencias y pago del suplente | 2 | D6 | 5 | Líder | Sebastián | `feature/hu-10-suplencias-y-pago-del-suplente` |
| HU-22 | Grupos a suplir y docentes disponibles | 2 | D6 | 5 | Líder | Sebastián | `feature/hu-22-grupos-a-suplir-y-docentes` |
| HU-11 | Pagos adicionales de la quincena | 2 | D7 | 5 | Líder | Sebastián | `feature/hu-11-pagos-adicionales-de-la-quincena` |
| HU-12 | Excel de Descuentos de la quincena | 2 | D7 | 5 | Líder | Uziel | `feature/hu-12-excel-de-descuentos-de-la` |
| HU-13 | Excel de Incidencias con hoja Detalle | 2 | D8 | 5 | Líder | Uziel, Sebastián | `feature/hu-13-excel-de-incidencias-con-hoja` |
| HU-14 | Inasistencias por semestre | 2 | D8 | 3 | Líder | Sebastián | `feature/hu-14-inasistencias-por-semestre` |
| HU-15 | Panel con gráficas | 2 | D9 | 8 | Apoyo | Sebastián | `feature/hu-15-panel-con-graficas` |
| HU-16 | Ranking completo OPINA con filtros y promedios | 2 | D9 | 5 | Apoyo | Uziel, Sebastián | `feature/hu-16-ranking-completo-opina-con-filtros` |
| HU-25 | Borrador de Outlook con los reportes de Nacional | 3 | D12 | 3 | Líder | Sebastián | `feature/hu-25-borrador-de-outlook-con-los` |
| HU-26 | Resumen ejecutivo en diapositivas | 3 | D13–D14 | 8 | Apoyo | Sebastián | `feature/hu-26-resumen-ejecutivo-en-diapositivas` |

> ⚠ En HU-11, HU-14 apareces como responsable, pero el backlog §3 no te asigna una tarea concreta ese día. Acuérdala con Isaac en la Daily y agrégala a la tabla de abajo.

## 2. Tareas por día

**Estado:** ⬜ Pendiente · 🔨 En progreso · 👀 En revisión (PR abierto) · ✅ Hecho (PR fusionado por Isaac)


### Sprint 1 — Base, datos de entrada y consulta (D1–D5 · 03/11 → 09/11)

| Día | Fecha | HU | Tarea | Estado |
|---|---|---|---|---|
| D1 | mar 03/11 | HU-00 | `lib/nomina.js`, `lib/quincena.js`, `lib/curp.js` y `lib/horario.js` con sus pruebas | ⬜ |
| D2 | mié 04/11 | HU-02 | Lector `grupos.js` (**omite F61 y F62**, en línea); rutas `/grupos/excel/*` | ⬜ |
| D2 | mié 04/11 | HU-08 | Lector `opina.js` (v1/v2, filtro presencial + Veracruz); rutas `/opina/*` | ⬜ |
| D3 | jue 05/11 | HU-20 | `lib/cv/lector.js` (pdf-parse), liga por CURP/nombre; rutas `/docentes/cv/*` | ⬜ |
| D3 | jue 05/11 | HU-01 | `POST /docentes`, `PUT /docentes/:id`, títulos y alta rápida | ⬜ |
| D4 | vie 06/11 | HU-03 | `GET /docentes` con los 12 campos; `GET /docentes/:id` | ⬜ |
| D4 | vie 06/11 | HU-04 | `GET /docentes/:id/resumen` y `GET /docentes/:id/cv` | ⬜ |
| D4 | vie 06/11 | HU-05 · HU-21 | `PATCH /docentes/:id/estatus` con motivo, observaciones y recontratable; `GET /docentes/:id/bajas` | ⬜ |
| D5 | lun 09/11 | HU-06 · HU-07 | Búsqueda multicampo (nómina con o sin `L0`) y filtros nuevos | ⬜ |
| D5 | lun 09/11 | HU-18 | Rutas `/tipos-clase` y `/catalogos` | ⬜ |
| D5 | lun 09/11 | HU-27 | `/contratos/plantilla`, `/contratos/preview` y `/contratos/confirm` | ⬜ |
| D5 | lun 09/11 | D5 | Revisión del Sprint 1 con Saraí: demostrar lo terminado | ⬜ |

### Sprint 2 — Faltas, reportes de Nacional y analítica (D6–D10 · 10/11 → 17/11)

| Día | Fecha | HU | Tarea | Estado |
|---|---|---|---|---|
| D6 | mar 10/11 | HU-09 | `descuentoService` | ⬜ |
| D6 | mar 10/11 | HU-10 | `suplenciaService` (agrupación de días, contrato del suplente) | ⬜ |
| D6 | mar 10/11 | HU-22 | `POST /faltas/disponibles` (detección de empalmes) | ⬜ |
| D7 | mié 11/11 | HU-12 | `generadores/descuentos.js` (fila de total siempre); rutas `/reportes/descuentos*` | ⬜ |
| D8 | jue 12/11 | HU-13 | `generadores/incidencias.js` (JSZip, hoja Detalle con valores) | ⬜ |
| D8 | jue 12/11 | HU-13 | Comparar los archivos generados contra los originales **Q16–Q20** | ⬜ |
| D9 | vie 13/11 | HU-15 | Rutas `/analitica/*` | ⬜ |
| D9 | vie 13/11 | HU-16 | `/opina/ranking` con filtros y promedios; `/opina/ranking/excel` | ⬜ |
| D10 | mar 17/11 | D10 | Cierre Sprint 2: pruebas Q16–Q20 y corrección de bugs | ⬜ |

### Sprint 3 — Comparativo, correo y resumen ejecutivo (D11–D15 · 18/11 → 24/11)

| Día | Fecha | HU | Tarea | Estado |
|---|---|---|---|---|
| D11 | mié 18/11 | HU-24 | `GET/PUT /opina/campus` | ⬜ |
| D11 | mié 18/11 | HU-25 | Arranque de `lib/correo/eml.js` | ⬜ |
| D12 | jue 19/11 | HU-25 | Generador `.eml` (`X-Unsent`) + respaldo `mailto`; rutas `/reportes/enviar` y `/reportes/envios` | ⬜ |
| D12 | jue 19/11 | HU-25 | Probar el borrador en el Outlook de la coordinadora | ⬜ |
| D13 | vie 20/11 | HU-26 | `/analitica/resumen-ejecutivo` (conclusiones generadas) | ⬜ |
| D14 | lun 23/11 | HU-26 | Datos de cada una de las 8 gráficas | ⬜ |
| D15 | mar 24/11 | D15 | Cierre Sprint 3: pruebas integrales y corrección de bugs | ⬜ |

## 3. Recordatorios del flujo diario

1. Daily de 5 min: qué hice, qué haré hoy, qué me bloquea.
2. Asignarte la tarjeta en el tablero y moverla a 🔨 *En progreso*.
3. Crear la rama desde `develop`: `gh issue develop <N> --base develop --name <rama sugerida> --checkout`.
4. Commits con Conventional Commits, p. ej. `feat(opina): importar formato 2026`.
5. PR a `develop` al final del día: `Refs #N` si la historia sigue, `Closes #N` en el último PR. Solo **Isaac** aprueba.
6. Nunca subir datos reales del cliente (`data/`, `data/cv/`, Excel y PDF originales).
7. Cambia el estado de esta tabla al mover la tarjeta, para que coincida con el tablero.
