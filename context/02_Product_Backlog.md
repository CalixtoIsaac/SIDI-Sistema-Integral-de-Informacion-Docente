# Product Backlog - SIDI
> **Versión 2.4.3 (29/10/2026):** ajustes a los Sprints: consultas del día 13 = las 8 gráficas elegidas (G9 con 2 tipos de falta); el día 2 omite F61/F62; HU-02 ya no marca "Sin tarifa" (4.5 h); el plan dura **3 semanas**; Sprint 3 confirmado. Instrucciones del tablero de GitHub en **`Sprints.md`**.
>
> **Versión 2.4.2 (29/10/2026, tarde):** respuestas del cliente: envío desde **Outlook institucional** (HU-25 solo borrador, 5 → 3 pts), **G9 con 2 tipos de falta**, motivos de baja confirmados, **F61 y F62 en línea** (se omiten). Único pendiente: contratos (RH). Total **134 pts**.
>
> **Versión 2.4.1 (29/10/2026):** HU-24 se simplifica (2 números por semestre del reporte institucional, 5 → 2 pts); gráficas del resumen = las 8 recomendadas. Total 136 pts.
>
> **Versión 2.4 (29/10/2026): retroalimentación de la vista previa (§6).** ✅ El cliente **aprobó el diseño** y todas las vistas. Entran **7 historias nuevas** (HU-21 a HU-27: baja con recontratable, docentes disponibles para suplir, ranking completo, comparativo del campus, **envío por correo**, **resumen ejecutivo**, contratos por CRN) y cambian HU-02, HU-04, HU-10 y HU-16. Se cierran los 2 pendientes (4.5 h = en línea, se ignoran; contratos → reporte de la coordinadora). Se propone un **Sprint 3** de una semana.
>
> **Versión 2.3 (27/10/2026):** **pendientes con el cliente cerrados** (*07 §8*): tarifa $54 final, Detalle con valores (sin vínculo externo), contrato del suplente = cualquiera de los suyos, fila de total siempre, antigüedad desde el primer semestre con clases. Entran dos fuentes nuevas: **Excel de grupos docentes** (HU-02) y **CV en PDF** (HU-20, nueva). La tabla de docentes muestra los **12 campos de consulta** del cliente (*07 §7.2*). Sprints reorganizados.
>
> Versión 2.1 (26/10/2026): pago en 4 meses, jornada = días, OPINA global ponderada. Reestructurado con los archivos del cliente, sin login y con tema personalizable.

## 1. Historias de usuario originales (épicas)
| ID | Historia |
|---|---|
| EP-01 | *Como* coordinadora de docentes *quiero* un sistema de seguimiento de los maestros *para* poder consultar su información de forma más rápida. |
| EP-02 | *Como* coordinadora de docentes *quiero* que el sistema calcule el descuento correspondiente según las inasistencias registradas de cada maestro en un periodo quincenal, considerando el tipo de clase a la que faltaron, *para* automatizar el cálculo del descuento salarial sin realizar operaciones manuales. |
| EP-03 | *Como* coordinadora de docentes *quiero* poder filtrar los maestros que sí están dando clases el semestre actual, así como agregar nuevos maestros y suspender los que no están activos *para* evitar sobrecargas de información al realizar las consultas. |
| EP-04 | *Como* coordinadora *quiero* que el sistema genere gráficas *para* mejorar el análisis de la información. |
| EP-05 | *Como* directiva *quiero* que el sistema ordene los maestros con mejor calificación de OPINA *para* evitar hacer ese cálculo por mi cuenta. |
| EP-06 *(nueva)* | *Como* coordinadora *quiero* que el sistema genere los reportes quincenales de Descuentos e Incidencias en el formato de Nacional *para* dejar de llenarlos a mano. |
| EP-07 *(nueva)* | *Como* usuaria *quiero* elegir el color principal y el modo claro u oscuro *para* que el sistema se vea a mi gusto sin perder formalidad. |

## 2. Historias derivadas (priorizadas)
Pts = puntos de historia. **M** Matías (Back) · **U** Uziel (BD/estructura) · **S** Sebastián (Front, apoyo Back).

| ID | Épica | Prio | Historia | Criterios de aceptación | Pts | Resp. | Día |
|---|---|---|---|---|---|---|---|
| HU-00 | — | 1 | Como equipo, queremos adaptar la plantilla, para empezar sin login y con la base de SIDI. | Sin login/JWT/`usuarios`/Notas; abre directo al panel; esquema v2.3 y semillas (tarifas con $54, catálogos incluidos nivel de estudios y campo de formación, periodos con fecha de inicio, quincenas) cargados; `data/` y `data/cv/` en `.gitignore`; servidor en `127.0.0.1` | 3 | U, M | D1 |
| HU-02 | EP-01 | 1 | Como coordinadora, quiero subir el **Excel de grupos docentes** del semestre y ver qué docentes y grupos se agregarán, para no capturar la carga a mano. | Lee `GRUPOS_DOCENTES_<PERIODO>.xlsx` (hoja `Salida`, 17 columnas, *07 §7*); crea/actualiza docentes por nómina y sus CRN con materia, grupo, modalidad y **horario**; calcula **horas/semana** (fin + 1 min, redondeo a 0.5 h), sugiere **idioma** y **tipo de clase**; marca "Sin contrato"; soporta 2 sesiones el mismo día; vista previa con cantidades y nombres; nada se guarda sin confirmar; reimportar no pisa lo editado a mano. 🆕 **omite los grupos F61 y F62 (en línea)**. **Prueba:** el archivo AGO-DIC 2026 da 147 CRN → se omiten los de F61 (22023, 22024) y F62 → el resto se importa con sus docentes | 8 | M, U, S | D2 |
| HU-08 | EP-05 | 1 | Como coordinadora, quiero subir el archivo OPINA del semestre, para tener las calificaciones sin capturarlas. | Acepta `.xlsx`/`.xlsb`; detecta versión 2024 o 2026 y periodo; vista previa; filtro **presencial + campus Veracruz** (muestra filas descartadas); crea docentes provisionales si no existen; reimportar reemplaza el periodo | 8 | M, U | D2 |
| HU-20 *(nueva)* | EP-01 | 1 | Como coordinadora, quiero subir los **CV en PDF** de los docentes (varios a la vez), para llenar CURP, edad, género y formación sin capturarlos. | Lee el formato "A1 CURRICULUM VITAE DOCENTES" (*07 §7.1*); liga cada CV por CURP o nombre normalizado (si no, pide elegir docente/nómina u omitir); de la CURP saca fecha de nacimiento, edad y **género**; lee grados con estatus (→ nivel de estudios y "está estudiando") y lugar laboral (→ trabajo externo); vista previa editable con conflictos; **no guarda** domicilio, teléfono, RFC ni estado civil; guarda el PDF en `data/cv/` y se abre desde la ficha. **Prueba:** de los 37 CV de muestra, ≥ 35 con CURP y grados leídos | 8 | M, U, S | D3 |
| HU-01 | EP-01 | 1 | Como coordinadora, quiero capturar o completar un docente con un formulario, para registrar lo que no viene en los archivos. | Valida nómina única (acepta `3560330` o `L03560330`) y CURP (llena fecha y género); títulos con estatus, campo de formación, trabajo externo, primer semestre; asignaturas o **actividades** (Ruta exploratoria) con horario, idioma, **contrato por CRN**; "alta rápida" con nómina y nombre | 5 | U, M, S | D3 |
| HU-03 | EP-01 | 1 | Como coordinadora, quiero una tabla con los **12 campos** que necesito (nombre, nómina, edad, género, CURP, número de grupos, grupos asignados, nivel de estudios, campo de formación, antigüedad, si está estudiando y qué nivel, trabajo independiente a Tecmilenio), más OPINA e inasistencias, para encontrar rápido a cualquier profesor. | Columnas por defecto = los 12 campos (*07 §7.2*) + OPINA y faltas; selector de columnas que se recuerda; edad, número de grupos, nivel de estudios, estudiando y **antigüedad (desde el primer semestre con clases)** calculados; etiqueta "Datos incompletos" | 8 | S, M | D4 |
| HU-04 | EP-01 | 2 | Como coordinadora, quiero un resumen al pasar el mouse y los datos extendidos al hacer clic, para no cambiar de pantalla. | Hover: nómina, contrato(s), CRN. Clic: ficha con pestañas debajo de la tabla (personales, formación y trayectoria + Ver CV, asignaturas y horarios, faltas, OPINA). 🆕 En asignaturas: **Tarifa (mensual)** = semestre ÷ 4 **justo a la derecha de Tarifa (diaria)** y total mensual del docente | 5 | S | D4 |
| HU-05 | EP-03 | 1 | Como coordinadora, quiero ver un punto verde/gris y suspender docentes inactivos, para saber quién está activo. | Verde = activo, gris = inactivo; suspender con confirmación; al importar grupos se sugieren los ausentes como inactivos | 3 | S, M | D4 |
| HU-21 🆕 | EP-03 | 1 | Como coordinadora, quiero escribir **por qué** doy de baja a un maestro y marcar si es **recontratable**, para saber si puedo volver a contratarlo. | Formulario al suspender: motivo (catálogo), **observaciones** obligatorias, **recontratable Sí/No** sugerido por el motivo (*sin disponibilidad* → Sí; *no cumplió expectativas / problemas* → No); historial de bajas en la ficha; insignia y filtro "Recontratable" en la tabla; aviso ⚠ si un no recontratable viene en el Excel de grupos o se elige como suplente; reactivar no recontratable pide confirmación; las observaciones no salen en panel ni resumen | 3 | U, M, S | D4 |
| HU-06 | EP-03 | 1 | Como coordinadora, quiero filtrar a quienes dan clases este semestre y por género, nivel de estudios, campo, antigüedad, si estudian y número de grupos, y ordenar por alfabeto, edad, antigüedad o grupos, para no saturarme. | Filtros combinables con chips; < 500 ms | 5 | M, S | D5 |
| HU-07 | EP-01 | 1 | Como coordinadora, quiero buscar por nombre, CURP, nómina o CRN, para encontrar rápido a un maestro. | Resultados mientras escribe; la nómina funciona con o sin `L0` | 3 | M, S | D5 |
| HU-17 | EP-07 | 1 | Como usuaria, quiero elegir el color principal y el modo claro u oscuro en mi perfil, para personalizar el sistema. | Rosa por defecto; 6 colores sugeridos + selector libre con validación de contraste; claro/oscuro/automático; se aplica al instante y se conserva al reiniciar | 5 | S | D5 |
| HU-27 🆕 | EP-02 | 1 | Como coordinadora, quiero **subir el reporte de contratos** de cada CRN (de RH o con la plantilla de SIDI), para no capturar ~145 contratos a mano. | Descarga de **plantilla prellenada** (CRN, materia, grupo, nómina, docente, Contrato vacío); acepta también un archivo propio con columnas CRN y Contrato; vista previa con nuevos/cambian/sin contrato y avisos (CRN inexistente, nómina que no corresponde); no pisa sin confirmar lo capturado a mano (*07 §7.3*) | 3 | M, U, S | D5 |
| HU-18 | EP-02 | 2 | Como coordinadora, quiero editar las tarifas por tipo de clase y los catálogos, para actualizarlos sin programador. | Edita pago semestral y por día; las faltas ya registradas conservan su monto; catálogos de Nacional, nivel de estudios y campo de formación | 3 | U, S | D5 |
| HU-09 | EP-02 | 1 | Como coordinadora, quiero registrar una falta indicando el día y los CRN a los que faltó, para que el descuento se calcule solo. | Propone los CRN que el docente tiene **ese día** según su horario; una fila por CRN y día; monto = pago por día del tipo de clase (editable, queda marcado); **justificación** IMSS (incapacidad/cita + folio) → descuento 0; pide el contrato del CRN si falta; **2ª sesión** del mismo CRN y día como caso especial con confirmación; la falta queda **pendiente de reportar** hasta generar la quincena; opción de **descuento manual** | 8 | M, U, S | D6 |
| HU-10 | EP-06 | 1 | Como coordinadora, quiero indicar qué docente cubrió cada falta, para que su pago se genere solo. | Crea la incidencia del suplente con el mismo monto (también en faltas IMSS) y el texto "Sustituyó al docente…"; **agrupa** días del mismo suplente, titular y CRN ("del 1 al 4 de septiembre, a pagar 4 días"); **contrato = uno de los contratos del suplente** (se propone el primero, se valida que sea suyo; vacío con aviso si no tiene); editar/borrar la falta actualiza la suplencia | 5 | M, S | D6 |
| HU-22 🆕 | EP-02 | 1 | Como coordinadora, quiero que al registrar una falta el sistema me muestre **los grupos que hay que suplir** y **los maestros disponibles**, para encontrar suplente rápido. | Por cada CRN, día y sesión: horario y lista de docentes **activos, sin clase que se empalme** y sin falta ese día; orden: misma materia ★ → da clases ese día → menos suplencias; no recontratables al final con ⚠; "Ver todos" con confirmación si hay empalme; se elige el suplente desde la lista. **Prueba:** con el horario AGO-DIC 2026 ningún propuesto tiene empalme (*04 §5*) | 5 | M, S | D6 |
| HU-11 | EP-06 | 1 | Como coordinadora, quiero capturar los pagos adicionales de la quincena (tutoreo, PAD, coach, talleres), para incluirlos en Incidencias. | Catálogos de cc-nómina, motivo y CeCo; importe total, periodos y fecha de inicio; importe por periodo calculado; copiar pagos de la quincena anterior | 5 | M, S | D7 |
| HU-12 | EP-06 | 1 | Como coordinadora, quiero descargar el Excel de Descuentos de una quincena, para enviarlo a Nacional sin reformatear. | `DESCUENTO-PREPA Qnn.xlsx` con columnas A–L y formato idénticos a la plantilla; incluye los **pendientes con fecha ≤ corte** (se pueden quitar); **fila de total siempre**; abre sin errores | 5 | M, U | D7 |
| HU-13 | EP-06 | 1 | Como coordinadora, quiero descargar el Excel de Incidencias con su hoja Detalle, para enviarlo a Nacional sin reformatear. | Hoja *Incidencia* con `Tabla17` redimensionada y fórmula de importe por periodo; hoja *detalle* **con valores** (como Q17–Q19): descontado (0 en IMSS), pagado a suplentes, diferencia y total; sin avisos de vínculos; **pruebas Q16–Q20 aprobadas** | 5 | M, U, S | D8 |
| HU-14 | EP-02 | 2 | Como coordinadora, quiero un apartado de inasistencias por semestre, para saber cuántas faltas hubo, cuántos profesores faltaron y por qué. | Tres indicadores + desglose por motivo y por justificación | 3 | M, S | D8 |
| HU-15 | EP-04 | 2 | Como coordinadora, quiero que la primera vista sea un panel con gráficas, para analizar la información. | KPIs + gráfica OPINA por maestro, faltas, docentes activos, descuento y suplencias de la quincena, cumpleaños, docentes por género y por nivel de estudios | 8 | S, M | D9 |
| HU-16 | EP-05 | 2 | Como directiva, quiero ver el **ranking completo** de maestros por OPINA, filtrar a los **mejores y peores** y ver el **promedio de todos los maestros por semestre**, para no calcularlo yo. | Ranking completo por periodo con la **calificación global** (Σ Sí ÷ Σ respuestas de todos sus grupos); 🆕 filtro Todos / Mejores N / Peores N / rango de %; 🆕 cuadro con **promedio de maestros** y calificación del campus del periodo; variación vs. otro periodo; desglose por CRN; núm. de respuestas; "muestra insuficiente" (< 10) fuera del ranking; exportar a Excel | 5 | U, M, S | D9 |
| HU-24 🆕 | EP-05 | 2 | Como coordinadora, quiero ver **cómo cambia por semestre el % de opinión positiva (OPP) de Preparatoria Veracruz**, para mostrar la tendencia del campus. | Captura por semestre de **alumnos y opiniones positivas** (fila *Preparatoria → Veracruz* del reporte institucional; los archivos no se importan); % calculado; semillas ENE-MAY 25 88.3 %, AGO-DIC 25 85.9 %, ENE-MAY 26 87.6 %; gráfica de línea con cambio ▲/▼ (= G1 del resumen); editable (*07 §5.4*) | 2 | U, S | D11 |
| HU-25 🆕 | EP-06 | 2 | Como coordinadora, quiero **enviar los reportes de Nacional por correo** a destinatarios fijos, para no adjuntarlos a mano. | Destinatarios configurables (inicial: los 3 correos de Nacional), asunto y cuerpo con variables; **borrador de Outlook** (`.eml` con los 2 Excel adjuntos que Outlook institucional abre listo para *Enviar*); respaldo *mailto* + descarga de archivos si su Outlook no abre el `.eml`; no se genera con avisos rojos; bitácora; opción al cerrar la quincena. **Prueba:** en la computadora de la coordinadora (*07 §10*) | 3 | M, S | D12 |
| HU-26 🆕 | EP-04 | 2 | Como directiva, quiero un **resumen ejecutivo** tipo presentación formal con gráficas del rendimiento, para presentar resultados sin armar diapositivas. | Se abre desde el **Panel administrativo** (botón *Resumen ejecutivo*) y usa **solo los datos registrados en SIDI** (*05 §1.1*); secciones sin datos muestran "Sin datos registrados"; Diapositivas 16:9 con portada, KPIs, **las 8 gráficas elegidas por el cliente: G1, G2, G3, G4, G9, G10, G15, G16** (*05 §1.1*; prototipo ya validado visualmente); G9 con **2 tipos de falta**: Asunto personal e Incapacidad médica con titular-conclusión, y hallazgos; selector de semestre y "comparar con"; **exportar PDF** (una diapositiva por página); legible en claro/oscuro; sin datos sensibles | 8 | S, M | D13–D14 |
| HU-19 | EP-01 | 3 | Como coordinadora, quiero consultar asignaturas, departamento y horarios del docente, para conocer su carga. | Pestaña en ficha extendida con CRN, materia, grupo, modalidad, horario (del Excel de grupos), tipo de clase y contrato; vista semanal | 2 | U, S | D9 |

**Total:** 🆕 **134 puntos** (v2.3: 108): +3 HU-21, +3 HU-27, +5 HU-22, +2 HU-16, +2 HU-24 (solo 2 números por semestre), +3 HU-25 (solo borrador de Outlook), +8 HU-26. HU-04 absorbe la tarifa mensual sin cambiar sus puntos.

Total v2.3: 108 puntos (v2.1: 98). Cambios: HU-02 pasa a ser el Excel de grupos (5 → 8), **HU-20 nueva** (CV, 8), HU-03 con los 12 campos (5 → 8), HU-13 baja por quitar el vínculo externo (8 → 5), HU-19 baja porque el horario ya se importa (3 → 2).

## 3. Sprints (3 semanas, 15 días hábiles, avances diarios)
> Cómo crear los milestones, issues y el tablero Kanban en GitHub: ver **`Sprints.md`**.

> **Decisión del Scrum Master (v2.4.3):** lo que **reduce riesgo** o cabe en vistas ya aprobadas entra a los Sprints 1 y 2 (HU-21, HU-27, HU-22, HU-16 ampliada). Las respuestas del cliente ya llegaron (gráficas, correos, Outlook), pero HU-24, HU-25 y HU-26 (13 pts) **no caben** en los 10 días sin arriesgar los reportes de Nacional, así que van a un **Sprint 3 de una semana**. Así los Sprints 1 y 2 entregan primero lo que la coordinadora usa cada quincena.

### Sprint 1 — Base, datos de entrada y consulta (64 → 🆕 70 pts)
| Día | Objetivo | Uziel · BD | Matías · Backend | Sebastián · Frontend |
|---|---|---|---|---|
| 1 | HU-00 | Limpiar plantilla; migración `001_inicial.sql` v2.3; semillas | `lib/nomina.js`, `quincena.js`, `curp.js`, `horario.js` + pruebas | Layout, menú, tema rosa base |
| 2 | HU-02 Excel de grupos · HU-08 OPINA | `asignaturas`, `horarios`, `grupos_importaciones`; upsert sin pisar lo editado | Lectores `grupos.js` (**omite F61 y F62**, en línea) y `opina.js` (v1/v2, presencial + Veracruz); `/grupos/excel/*`, `/opina/*` | Pantallas de carga con vista previa (grupos y OPINA) |
| 3 | HU-20 CV · HU-01 alta/edición | `titulos_docente`, `cv_archivos`, vista `v_docente_estudios` | `lib/cv/lector.js` (pdf-parse), liga por CURP/nombre; `/docentes/cv/*`; `POST/PUT /docentes`, títulos, alta rápida | Carga de CV con tabla de revisión editable; formulario en pasos |
| 4 | HU-03, HU-04, HU-05, 🆕 HU-21 | Vista `v_docente_primer_periodo`; consultas de antigüedad y número de grupos; 🆕 `docente_bajas`, `motivo_baja`, `tipos_clase.pago_mensual` | `GET /docentes` con los 12 campos; `/:id`, `/:id/resumen`, `/:id/cv`; `PATCH estatus` 🆕 con motivo/observaciones/recontratable, `/:id/bajas` | Tabla con selector de columnas, hover, ficha con pestañas (🆕 tarifa mensual), Ver CV, punto verde/gris, 🆕 modal de baja e insignia recontratable |
| 5 | HU-06, HU-07, HU-17, HU-18, 🆕 HU-27 · **Revisión de Sprint 1 con Saraí** | Índices de filtros; catálogos editables; 🆕 `contratos_importaciones` | Búsqueda multicampo y filtros nuevos; `/tipos-clase`, `/catalogos`; 🆕 `/contratos/plantilla`, `/contratos/preview`, `/contratos/confirm` | Filtros y chips (🆕 Recontratable), Perfil (color y modo), Configuración (🆕 contratos, motivos de baja) |

**Al cerrar el Sprint 1 la coordinadora puede:** importar el Excel de grupos de AGO-DIC 2026, los CV y los OPINA, consultar a los 47 docentes con sus 12 campos, dar de baja con observaciones y 🆕 **descargar la plantilla de contratos y subirla llena** (los contratos son necesarios para el Sprint 2).

### Sprint 2 — Faltas, reportes de Nacional y analítica (44 → 🆕 51 pts)
| Día | Objetivo | Uziel · BD | Matías · Backend | Sebastián · Frontend |
|---|---|---|---|---|
| 6 | HU-09 faltas · HU-10 suplencias · 🆕 HU-22 disponibles | `faltas` (sesión, justificación, quincena de reporte), `suplencias`; 🆕 índice de horarios por día | `descuentoService`, `suplenciaService` (agrupación, contrato del suplente); 🆕 `POST /faltas/disponibles` (empalmes) | Modal "Registrar falta" con CRN del día, IMSS, 2ª sesión, 🆕 **grupos a suplir y disponibles**, suplente y contrato |
| 7 | HU-11 pagos · HU-12 Excel de Descuentos | `incidencias`; plantilla vacía de Descuentos | `generadores/descuentos.js` (fila de total); `/reportes/descuentos*` | Vista Incidencias; pantalla Reportes (pendientes a incluir) |
| 8 | HU-13 Excel de Incidencias + **pruebas Q16–Q20** · HU-14 | Plantilla de Incidencias **sin vínculos externos** | `generadores/incidencias.js` (JSZip, Detalle con valores); comparación contra originales | Inasistencias semestrales |
| 9 | HU-15 panel · HU-16 ranking 🆕 completo · HU-19 horarios | Consultas agregadas (género, nivel de estudios); 🆕 `v_opina_campus` | `/analitica/*`, `/opina/ranking` 🆕 con filtros y promedios, `/opina/ranking/excel` | Panel con gráficas, ranking 🆕 con filtros mejores/peores y cuadro de promedios, vista semanal de horarios |
| 10 | Pruebas integrales (Q16–Q20), bugs, revisión de PRs por Isaac, merge a `main`, **entrega de reportes de Nacional** a Saraí | Datos de demo anonimizados | Corrección de bugs | Pulido de UI |

### 🆕 Sprint 3 (1 semana) — Comparativo, correo y resumen ejecutivo (13 pts)
| Día | Objetivo | Uziel · BD | Matías · Backend | Sebastián · Frontend |
|---|---|---|---|---|
| 11 | HU-24 % OPP del campus · inicio de HU-25 | Periodo AGO-DIC 2025; `opina_campus_semestre` con semillas | `/opina/campus` (GET/PUT); arranque de `lib/correo/eml.js` | Pestaña "Comparativo del campus" (tabla editable + línea) |
| 12 | HU-25 envío por correo | `envios_correo`; claves `correo.*` | Generador `.eml` (`X-Unsent`) + respaldo `mailto`; `/reportes/enviar`, `/reportes/envios`; prueba con el Outlook de la coordinadora | Botón "Enviar a Nacional", configuración de correo, historial |
| 13 | HU-26 resumen ejecutivo (estructura) | Consultas de las 8 gráficas: G1–G4, G9 (faltas por tipo: *Asunto personal* e *Incapacidad médica*), G10, G15 y G16 | `/analitica/resumen-ejecutivo` (conclusiones generadas) | Visor de diapositivas 16:9, portada, KPIs, exportar PDF |
| 14 | HU-26 gráficas elegidas por el cliente | — | Datos de cada gráfica | Gráficas y hallazgos; revisión con Saraí |
| 15 | Pruebas integrales, revisión final de PRs por Isaac, merge a `main`, entrega final | Datos de demo | Corrección de bugs | Pulido de UI |

Cada día, cada integrante sube su avance en una rama y abre un PR que **solo Isaac** aprueba.

**Riesgo principal:** el **contrato por CRN** no viene en ningún archivo. 🆕 Mitigado: la coordinadora **creará el reporte** con la plantilla de SIDI (HU-27, día 5). Si no llega antes del día 6, los descuentos se prueban con los contratos de Q16–Q20 capturados por el equipo.

🆕 **Riesgo de envío por correo:** la cuenta es **Outlook institucional**, donde el envío directo requeriría OAuth y permiso de TI. Por eso SIDI solo **prepara el borrador**; hay que confirmar en la computadora de la coordinadora que su Outlook abre el `.eml` como borrador (si no, respaldo *mailto*).

🆕 ~~Dependencia del cliente para HU-26~~ → ✅ gráficas elegidas (29/10). Existe un **prototipo v1** del resumen (*05 §1.1*) que reduce el trabajo de los días 13–14.

**Riesgo técnico:** lectura de CV en PDF (HU-20). El formato es uniforme y tiene texto, pero las fechas y los nombres de carrera vienen escritos libremente; se mitiga tomando la fecha de la CURP y dejando todo editable en la vista previa. Prueba de concepto con los 37 CV el día 3 por la mañana.

*(El riesgo del vínculo externo de Detalle desaparece: se escriben valores.)*

## 4. Definición de Terminado
- PR aprobado por Isaac.
- Criterios de aceptación verificados con evidencia.
- Vista validada por Saraí cuando aplica.
- Para HU-12/HU-13: archivo generado abierto en Excel y comparado con el original.
- Para HU-02/HU-20: importación probada con los archivos reales **en la computadora** (nunca subidos a GitHub).

## 5. Pendientes con el cliente
| Pendiente | Estado |
|---|---|
| Formatos Excel de Descuentos e Incidencias | ✅ Recibidos (Q16–Q20) — no modificables |
| Costo por hora de cada tipo de clase | ✅ 3 h español = **$54** (respuesta final); semestre = 4 meses |
| Fuente de las calificaciones OPINA | ✅ Recibida (3 periodos) — % recomendación, global ponderada, **solo presencial Veracruz** |
| Hoja Detalle con valores en vez de vínculo | ✅ **Sí, con valores** (como Q17–Q19) |
| Columna "Jornada de trabajo" | ✅ Número de días |
| ¿Se requiere inicio de sesión? | ✅ **No** |
| Color del sistema | ✅ Rosa, personalizable en el perfil + modo claro/oscuro |
| Información de maestros | ✅ **Excel de grupos** (AGO-DIC 2026) + **37 CV en PDF** |
| Campos de consulta del docente | ✅ Los 12 campos de *07 §7.2* |
| Faltas justificadas, monto de suplencias, fecha "a partir de", campus OPINA, CRN doble, contrato del suplente, fila de total, antigüedad | ✅ Cerrados (*07 §8*) |
| Tarifa de grupos de 4.5 h/semana (F61) | ✅ **Se ignoran** (en línea, otro sistema) |
| ¿Existe reporte con el contrato de cada CRN? | ⏳ **Único pendiente:** la coordinadora preguntó a **RH** si existe. Si existe se importa; si no, plantilla de SIDI (HU-27) |
| 🆕 Gráficas del resumen ejecutivo | ✅ **Las 8 recomendadas** (G1, G2, G3, G4, G9, G10, G15, G16); no existía un resumen previo |
| 🆕 Correos de destino y cuenta de envío | ✅ 3 correos de Nacional, desde **Outlook institucional** → borrador de Outlook |
| 🆕 Catálogo de motivos de baja | ✅ La lista propuesta, tal cual |
| 🆕 ¿F62 también es en línea? | ✅ Sí → se omite con F61 |
| 🆕 Archivos OPINA AD25, EM25, EM26 | ✅ Son el reporte institucional; solo se usa el % OPP de Preparatoria Veracruz: 88.3 % → 85.9 % → 87.6 % (*07 §5.4*) |

## 6. Retroalimentación de la vista previa (29/10/2026) 🆕
| Vista / tema | Resultado | Acción en el backlog |
|---|---|---|
| Diseño general | ✅ Aprobado, le gustó | — |
| Panel | ✅ | + resumen ejecutivo → **HU-26** |
| Tabla de docentes · ficha | ✅ + tarifa mensual a la derecha de la diaria | **HU-04** |
| Formación | ✅ | — |
| Excel de grupos | ✅ Llega con el **mismo formato cada semestre** | HU-02 sin cambios de formato; omite F61 y F62 |
| Registrar falta | ✅ Le sirve que se propongan **maestros disponibles** y los **grupos a suplir** | **HU-22** |
| Incidencias | ✅ | — |
| OPINA | ✅ Ranking **completo** con filtro mejores/peores y **promedio por semestre**; comparativo del **campus** por semestre | **HU-16**, **HU-24** |
| Reportes | ✅ Cubre lo que necesita en el día a día; quiere **enviarlos por correo** | **HU-25** |
| Suspender | Observaciones + **recontratable** | **HU-21** |
| Contratos por CRN | La coordinadora creará el reporte | **HU-27** |
