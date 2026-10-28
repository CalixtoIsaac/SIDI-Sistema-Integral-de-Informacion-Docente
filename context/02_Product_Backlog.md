# Product Backlog - SIDI
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
| HU-02 | EP-01 | 1 | Como coordinadora, quiero subir el **Excel de grupos docentes** del semestre y ver qué docentes y grupos se agregarán, para no capturar la carga a mano. | Lee `GRUPOS_DOCENTES_<PERIODO>.xlsx` (hoja `Salida`, 17 columnas, *07 §7*); crea/actualiza docentes por nómina y sus CRN con materia, grupo, modalidad y **horario**; calcula **horas/semana** (fin + 1 min, redondeo a 0.5 h), sugiere **idioma** y **tipo de clase**; marca "Sin tarifa" (4.5 h) y "Sin contrato"; soporta 2 sesiones el mismo día; vista previa con cantidades y nombres; nada se guarda sin confirmar; reimportar no pisa lo editado a mano. **Prueba:** el archivo AGO-DIC 2026 da 147 CRN y 47 docentes | 8 | M, U, S | D2 |
| HU-08 | EP-05 | 1 | Como coordinadora, quiero subir el archivo OPINA del semestre, para tener las calificaciones sin capturarlas. | Acepta `.xlsx`/`.xlsb`; detecta versión 2024 o 2026 y periodo; vista previa; filtro **presencial + campus Veracruz** (muestra filas descartadas); crea docentes provisionales si no existen; reimportar reemplaza el periodo | 8 | M, U | D2 |
| HU-20 *(nueva)* | EP-01 | 1 | Como coordinadora, quiero subir los **CV en PDF** de los docentes (varios a la vez), para llenar CURP, edad, género y formación sin capturarlos. | Lee el formato "A1 CURRICULUM VITAE DOCENTES" (*07 §7.1*); liga cada CV por CURP o nombre normalizado (si no, pide elegir docente/nómina u omitir); de la CURP saca fecha de nacimiento, edad y **género**; lee grados con estatus (→ nivel de estudios y "está estudiando") y lugar laboral (→ trabajo externo); vista previa editable con conflictos; **no guarda** domicilio, teléfono, RFC ni estado civil; guarda el PDF en `data/cv/` y se abre desde la ficha. **Prueba:** de los 37 CV de muestra, ≥ 35 con CURP y grados leídos | 8 | M, U, S | D3 |
| HU-01 | EP-01 | 1 | Como coordinadora, quiero capturar o completar un docente con un formulario, para registrar lo que no viene en los archivos. | Valida nómina única (acepta `3560330` o `L03560330`) y CURP (llena fecha y género); títulos con estatus, campo de formación, trabajo externo, primer semestre; asignaturas o **actividades** (Ruta exploratoria) con horario, idioma, **contrato por CRN**; "alta rápida" con nómina y nombre | 5 | U, M, S | D3 |
| HU-03 | EP-01 | 1 | Como coordinadora, quiero una tabla con los **12 campos** que necesito (nombre, nómina, edad, género, CURP, número de grupos, grupos asignados, nivel de estudios, campo de formación, antigüedad, si está estudiando y qué nivel, trabajo independiente a Tecmilenio), más OPINA e inasistencias, para encontrar rápido a cualquier profesor. | Columnas por defecto = los 12 campos (*07 §7.2*) + OPINA y faltas; selector de columnas que se recuerda; edad, número de grupos, nivel de estudios, estudiando y **antigüedad (desde el primer semestre con clases)** calculados; etiqueta "Datos incompletos" | 8 | S, M | D4 |
| HU-04 | EP-01 | 2 | Como coordinadora, quiero un resumen al pasar el mouse y los datos extendidos al hacer clic, para no cambiar de pantalla. | Hover: nómina, contrato(s), CRN. Clic: ficha con pestañas debajo de la tabla (personales, formación y trayectoria + Ver CV, asignaturas y horarios, faltas, OPINA) | 5 | S | D4 |
| HU-05 | EP-03 | 1 | Como coordinadora, quiero ver un punto verde/gris y suspender docentes inactivos, para saber quién está activo. | Verde = activo, gris = inactivo; suspender con confirmación; al importar grupos se sugieren los ausentes como inactivos | 3 | S, M | D4 |
| HU-06 | EP-03 | 1 | Como coordinadora, quiero filtrar a quienes dan clases este semestre y por género, nivel de estudios, campo, antigüedad, si estudian y número de grupos, y ordenar por alfabeto, edad, antigüedad o grupos, para no saturarme. | Filtros combinables con chips; < 500 ms | 5 | M, S | D5 |
| HU-07 | EP-01 | 1 | Como coordinadora, quiero buscar por nombre, CURP, nómina o CRN, para encontrar rápido a un maestro. | Resultados mientras escribe; la nómina funciona con o sin `L0` | 3 | M, S | D5 |
| HU-17 | EP-07 | 1 | Como usuaria, quiero elegir el color principal y el modo claro u oscuro en mi perfil, para personalizar el sistema. | Rosa por defecto; 6 colores sugeridos + selector libre con validación de contraste; claro/oscuro/automático; se aplica al instante y se conserva al reiniciar | 5 | S | D5 |
| HU-18 | EP-02 | 2 | Como coordinadora, quiero editar las tarifas por tipo de clase y los catálogos, para actualizarlos sin programador. | Edita pago semestral y por día; las faltas ya registradas conservan su monto; catálogos de Nacional, nivel de estudios y campo de formación | 3 | U, S | D5 |
| HU-09 | EP-02 | 1 | Como coordinadora, quiero registrar una falta indicando el día y los CRN a los que faltó, para que el descuento se calcule solo. | Propone los CRN que el docente tiene **ese día** según su horario; una fila por CRN y día; monto = pago por día del tipo de clase (editable, queda marcado); **justificación** IMSS (incapacidad/cita + folio) → descuento 0; pide el contrato del CRN si falta; **2ª sesión** del mismo CRN y día como caso especial con confirmación; la falta queda **pendiente de reportar** hasta generar la quincena; opción de **descuento manual** | 8 | M, U, S | D6 |
| HU-10 | EP-06 | 1 | Como coordinadora, quiero indicar qué docente cubrió cada falta, para que su pago se genere solo. | Crea la incidencia del suplente con el mismo monto (también en faltas IMSS) y el texto "Sustituyó al docente…"; **agrupa** días del mismo suplente, titular y CRN ("del 1 al 4 de septiembre, a pagar 4 días"); **contrato = uno de los contratos del suplente** (se propone el primero, se valida que sea suyo; vacío con aviso si no tiene); editar/borrar la falta actualiza la suplencia | 5 | M, S | D6 |
| HU-11 | EP-06 | 1 | Como coordinadora, quiero capturar los pagos adicionales de la quincena (tutoreo, PAD, coach, talleres), para incluirlos en Incidencias. | Catálogos de cc-nómina, motivo y CeCo; importe total, periodos y fecha de inicio; importe por periodo calculado; copiar pagos de la quincena anterior | 5 | M, S | D7 |
| HU-12 | EP-06 | 1 | Como coordinadora, quiero descargar el Excel de Descuentos de una quincena, para enviarlo a Nacional sin reformatear. | `DESCUENTO-PREPA Qnn.xlsx` con columnas A–L y formato idénticos a la plantilla; incluye los **pendientes con fecha ≤ corte** (se pueden quitar); **fila de total siempre**; abre sin errores | 5 | M, U | D7 |
| HU-13 | EP-06 | 1 | Como coordinadora, quiero descargar el Excel de Incidencias con su hoja Detalle, para enviarlo a Nacional sin reformatear. | Hoja *Incidencia* con `Tabla17` redimensionada y fórmula de importe por periodo; hoja *detalle* **con valores** (como Q17–Q19): descontado (0 en IMSS), pagado a suplentes, diferencia y total; sin avisos de vínculos; **pruebas Q16–Q20 aprobadas** | 5 | M, U, S | D8 |
| HU-14 | EP-02 | 2 | Como coordinadora, quiero un apartado de inasistencias por semestre, para saber cuántas faltas hubo, cuántos profesores faltaron y por qué. | Tres indicadores + desglose por motivo y por justificación | 3 | M, S | D8 |
| HU-15 | EP-04 | 2 | Como coordinadora, quiero que la primera vista sea un panel con gráficas, para analizar la información. | KPIs + gráfica OPINA por maestro, faltas, docentes activos, descuento y suplencias de la quincena, cumpleaños, docentes por género y por nivel de estudios | 8 | S, M | D9 |
| HU-16 | EP-05 | 2 | Como directiva, quiero ver a los maestros ordenados por mejor OPINA, para no calcularlo yo. | Ranking descendente por periodo con la **calificación global** (Σ Sí ÷ Σ respuestas de todos sus grupos); desglose por CRN; núm. de respuestas; "muestra insuficiente" (< 10) fuera del ranking; comparativo entre periodos | 3 | U, M, S | D9 |
| HU-19 | EP-01 | 3 | Como coordinadora, quiero consultar asignaturas, departamento y horarios del docente, para conocer su carga. | Pestaña en ficha extendida con CRN, materia, grupo, modalidad, horario (del Excel de grupos), tipo de clase y contrato; vista semanal | 2 | U, S | D9 |

**Total:** 108 puntos (v2.1: 98). Cambios: HU-02 pasa a ser el Excel de grupos (5 → 8), **HU-20 nueva** (CV, 8), HU-03 con los 12 campos (5 → 8), HU-13 baja por quitar el vínculo externo (8 → 5), HU-19 baja porque el horario ya se importa (3 → 2).

## 3. Sprints (2 semanas, avances diarios)
### Sprint 1 — Base, datos de entrada y consulta (64 pts)
| Día | Objetivo | Uziel · BD | Matías · Backend | Sebastián · Frontend |
|---|---|---|---|---|
| 1 | HU-00 | Limpiar plantilla; migración `001_inicial.sql` v2.3; semillas | `lib/nomina.js`, `quincena.js`, `curp.js`, `horario.js` + pruebas | Layout, menú, tema rosa base |
| 2 | HU-02 Excel de grupos · HU-08 OPINA | `asignaturas`, `horarios`, `grupos_importaciones`; upsert sin pisar lo editado | Lectores `grupos.js` y `opina.js` (v1/v2, presencial + Veracruz); `/grupos/excel/*`, `/opina/*` | Pantallas de carga con vista previa (grupos y OPINA) |
| 3 | HU-20 CV · HU-01 alta/edición | `titulos_docente`, `cv_archivos`, vista `v_docente_estudios` | `lib/cv/lector.js` (pdf-parse), liga por CURP/nombre; `/docentes/cv/*`; `POST/PUT /docentes`, títulos, alta rápida | Carga de CV con tabla de revisión editable; formulario en pasos |
| 4 | HU-03, HU-04, HU-05 | Vista `v_docente_primer_periodo`; consultas de antigüedad y número de grupos | `GET /docentes` con los 12 campos; `/:id`, `/:id/resumen`, `/:id/cv`; `PATCH estatus` | Tabla con selector de columnas, hover, ficha con pestañas, Ver CV, punto verde/gris |
| 5 | HU-06, HU-07, HU-17, HU-18 · **Revisión de Sprint 1 con Saraí** | Índices de filtros; catálogos editables | Búsqueda multicampo y filtros nuevos; `/tipos-clase`, `/catalogos` | Filtros y chips, Perfil (color y modo), Configuración |

**Al cerrar el Sprint 1 la coordinadora puede:** importar el Excel de grupos de AGO-DIC 2026, los CV y los 3 OPINA, consultar a los 47 docentes con sus 12 campos y **capturar los contratos de cada CRN** (necesarios para el Sprint 2).

### Sprint 2 — Faltas, reportes de Nacional y analítica (44 pts)
| Día | Objetivo | Uziel · BD | Matías · Backend | Sebastián · Frontend |
|---|---|---|---|---|
| 6 | HU-09 faltas · HU-10 suplencias | `faltas` (sesión, justificación, quincena de reporte), `suplencias` | `descuentoService`, `suplenciaService` (agrupación, contrato del suplente) | Modal "Registrar falta" con CRN del día, IMSS, 2ª sesión, suplente y contrato |
| 7 | HU-11 pagos · HU-12 Excel de Descuentos | `incidencias`; plantilla vacía de Descuentos | `generadores/descuentos.js` (fila de total); `/reportes/descuentos*` | Vista Incidencias; pantalla Reportes (pendientes a incluir) |
| 8 | HU-13 Excel de Incidencias + **pruebas Q16–Q20** · HU-14 | Plantilla de Incidencias **sin vínculos externos** | `generadores/incidencias.js` (JSZip, Detalle con valores); comparación contra originales | Inasistencias semestrales |
| 9 | HU-15 panel · HU-16 ranking · HU-19 horarios | Consultas agregadas (género, nivel de estudios) | `/analitica/*`, `/opina/ranking` | Panel con gráficas, ranking, vista semanal de horarios |
| 10 | Pruebas integrales, bugs, revisión final de PRs por Isaac, merge a `main`, entrega a Saraí | Datos de demo anonimizados | Corrección de bugs | Pulido de UI |

Cada día, cada integrante sube su avance en una rama y abre un PR que **solo Isaac** aprueba.

**Riesgo principal:** el **contrato por CRN** no viene en ningún archivo (*07 §9*). Si la coordinadora no los ha capturado antes del día 6, los descuentos se prueban con los contratos de Q16–Q20 capturados por el equipo.

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
| Tarifa de grupos de 4.5 h/semana (F61) | ⏳ Nuevo (*07 §9*) — no bloquea |
| ¿Existe reporte con el contrato de cada CRN? | ⏳ Nuevo (*07 §9*) — no bloquea; captura manual |
