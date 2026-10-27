# Product Backlog - SIDI
> **Versión 2.1 (26/10/2026):** aplicadas las respuestas del cliente (tarifa $54, pago en 4 meses, jornada = días, se conserva el vínculo externo de Detalle, OPINA global ponderada, Excel de maestros = nómina/nombre/edad/CURP). Pendientes vigentes en *07 §9*.

> Reestructurado con los archivos del cliente (pagos, OPINA, Descuentos, Incidencias), sin login y con tema personalizable.

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
| HU-00 | — | 1 | Como equipo, queremos adaptar la plantilla, para empezar sin login y con la base de SIDI. | Sin login/JWT/`usuarios`/Notas; abre directo al panel; esquema y semillas (tarifas, catálogos) cargados; servidor en `127.0.0.1` | 3 | U, M | D1 |
| HU-01 | EP-01 | 1 | Como coordinadora, quiero capturar un docente con un formulario, para registrar toda su información. | Valida nómina única (acepta `3560330` o `L03560330`) y CURP; guarda títulos, nivel, contrato, asignaturas (CRN con horas/semana e idioma); la ficha permite editar todo después (es la vía principal para los datos que no vienen en Excel) | 5 | U, M, S | D2 |
| HU-02 | EP-01 | 1 | Como coordinadora, quiero subir el Excel de maestros y ver cuántos y quiénes se agregarán, para confirmar. | Lee nómina, nombre, edad y CURP; fecha de nacimiento derivada de la CURP (avisa si no cuadra con la edad); actualiza a los que ya existían por nómina; vista con cantidad y nombres; nada se guarda sin confirmar; avisa duplicados/errores. ⏳ Falta el archivo real para fijar nombres de columnas | 5 | M, U, S | D5 |
| HU-03 | EP-01 | 1 | Como coordinadora, quiero una tabla con nombre, CURP, fecha de nacimiento, cumpleaños, nivel, títulos, OPINA e inasistencias, para consultar todo en un lugar. | Columnas completas; OPINA del semestre actual; faltas totales | 5 | S, M | D3 |
| HU-04 | EP-01 | 2 | Como coordinadora, quiero un resumen al pasar el mouse y los datos extendidos al hacer clic, para no cambiar de pantalla. | Hover: nómina, contrato(s), CRN. Clic: ficha con pestañas debajo de la tabla | 5 | S | D3 |
| HU-05 | EP-03 | 1 | Como coordinadora, quiero ver un punto verde/gris y suspender docentes inactivos, para saber quién está activo. | Verde = activo, gris = inactivo; suspender con confirmación | 3 | S, M | D3 |
| HU-06 | EP-03 | 1 | Como coordinadora, quiero filtrar a quienes dan clases este semestre y ordenar por alfabeto, edad o títulos, para no saturarme. | Filtros combinables; < 500 ms | 5 | M, S | D4 |
| HU-07 | EP-01 | 1 | Como coordinadora, quiero buscar por nombre, CURP, nómina o CRN, para encontrar rápido a un maestro. | Resultados mientras escribe; la nómina funciona con o sin `L0` | 3 | M, S | D4 |
| HU-08 | EP-05 | 1 | Como coordinadora, quiero subir el archivo OPINA del semestre, para tener las calificaciones sin capturarlas. | Acepta `.xlsx`/`.xlsb`; detecta versión 2024 o 2026 y periodo; vista previa; filtro campus Veracruz; crea docentes provisionales si no existen; reimportar reemplaza el periodo | 8 | M, U | D2 |
| HU-09 | EP-02 | 1 | Como coordinadora, quiero registrar una falta indicando el día y los CRN a los que faltó, para que el descuento se calcule solo. | Una fila por CRN y día; monto = pago por día del tipo de clase; motivo, horas, CeCo, ticket; muestra el descuento antes de guardar; opción de **descuento manual** (rango de fechas + monto) | 8 | M, U, S | D6 |
| HU-10 | EP-06 | 1 | Como coordinadora, quiero indicar qué docente cubrió cada falta, para que su pago se genere solo. | Crea la incidencia del suplente con el monto descontado y el texto "Sustituyó al docente…"; editar/borrar la falta actualiza la suplencia | 5 | M, S | D6 |
| HU-11 | EP-06 | 1 | Como coordinadora, quiero capturar los pagos adicionales de la quincena (tutoreo, PAD, coach, talleres), para incluirlos en Incidencias. | Catálogos de cc-nómina, motivo y CeCo; importe total, periodos y fecha de inicio; importe por periodo calculado; copiar pagos de la quincena anterior | 5 | M, S | D7 |
| HU-12 | EP-06 | 1 | Como coordinadora, quiero descargar el Excel de Descuentos de una quincena, para enviarlo a Nacional sin reformatear. | `DESCUENTO-PREPA Qnn.xlsx` con columnas A–L y formato idénticos a la plantilla; abre sin errores | 5 | M, U | D7 |
| HU-13 | EP-06 | 1 | Como coordinadora, quiero descargar el Excel de Incidencias con su hoja Detalle, para enviarlo a Nacional sin reformatear. | Hoja *Incidencia* con `Tabla17` redimensionada y fórmula de importe por periodo; hoja *Detalle* con descontado, pagado a suplentes, diferencia y total; columna C con **vínculo externo** `[1]Descuentos!$K$n` a las filas reales del Descuentos de la quincena, ruta del vínculo actualizada y caché llena; **prueba Q16 aprobada** | 8 | M, U, S | D8 |
| HU-14 | EP-02 | 2 | Como coordinadora, quiero un apartado de inasistencias por semestre, para saber cuántas faltas hubo, cuántos profesores faltaron y por qué. | Tres indicadores + desglose por motivo | 3 | M, S | D8 |
| HU-15 | EP-04 | 2 | Como coordinadora, quiero que la primera vista sea un panel con gráficas, para analizar la información. | KPIs + gráfica OPINA por maestro, faltas, docentes activos, descuento y suplencias de la quincena, cumpleaños | 8 | S, M | D9 |
| HU-16 | EP-05 | 2 | Como directiva, quiero ver a los maestros ordenados por mejor OPINA, para no calcularlo yo. | Ranking descendente por periodo con la **calificación global** (Σ Sí ÷ Σ respuestas de todos sus grupos); desglose por CRN; núm. de respuestas; "muestra insuficiente" (< 10) fuera del ranking; comparativo entre periodos | 3 | U, M, S | D9 |
| HU-17 | EP-07 | 1 | Como usuaria, quiero elegir el color principal y el modo claro u oscuro en mi perfil, para personalizar el sistema. | Rosa por defecto; 6 colores sugeridos + selector libre con validación de contraste; claro/oscuro/automático; se aplica al instante y se conserva al reiniciar | 5 | S | D4 |
| HU-18 | EP-02 | 2 | Como coordinadora, quiero editar las tarifas por tipo de clase y los catálogos, para actualizarlos sin programador. | Edita pago semestral y por día; las faltas ya registradas conservan su monto | 3 | U, S | D5 |
| HU-19 | EP-01 | 3 | Como coordinadora, quiero consultar asignaturas, departamento y horarios del docente, para conocer su carga. | Pestaña en ficha extendida con CRN, materia, tipo de clase, contrato y horarios | 3 | U, S | D9 |

**Total:** 98 puntos (antes 71; HU-02 bajó de 8 a 5 porque el Excel de maestros solo trae 4 datos). El aumento viene de EP-06 (reportes de Nacional), la importación de OPINA y el perfil.

## 3. Sprints (2 semanas, avances diarios)
### Sprint 1 — Base, datos de entrada y consulta
| Día | Objetivo |
|---|---|
| 1 | HU-00: limpiar la plantilla, ramas `main`/`develop` protegidas, esquema SQLite, semillas (tarifas, catálogos, quincenas), tema rosa base |
| 2 | HU-08 importar OPINA (crea docentes provisionales) · HU-01 alta manual |
| 3 | HU-03, HU-04, HU-05: tabla, hover, ficha, estatus |
| 4 | HU-06, HU-07 filtros y búsqueda · HU-17 perfil (color y modo) |
| 5 | HU-18 catálogos · HU-02 si ya llegó el Excel de maestros · **Revisión de Sprint 1 con Saraí** |

### Sprint 2 — Faltas, reportes de Nacional y analítica
| Día | Objetivo |
|---|---|
| 6 | HU-09 faltas y descuento · HU-10 suplencias |
| 7 | HU-11 pagos adicionales · HU-12 Excel de Descuentos |
| 8 | HU-13 Excel de Incidencias + **prueba Q16** · HU-14 inasistencias semestrales |
| 9 | HU-15 panel · HU-16 ranking OPINA · HU-19 asignaturas/horarios |
| 10 | Pruebas integrales, bugs, revisión final de PRs por Isaac, merge a `main`, entrega a Saraí |

Cada día, cada integrante sube su avance en una rama y abre un PR que **solo Isaac** aprueba.

**Riesgo principal:** horas/semana e idioma de cada CRN no vienen en ningún Excel; si la coordinadora no ha capturado los grupos del semestre antes del día 6, los descuentos se prueban con los grupos de Q16 capturados por el equipo.

**Riesgo técnico:** conservar el vínculo externo de Detalle (HU-13) obliga a editar el XML de la plantilla; se hace una prueba de concepto el día 7 antes de construir el generador completo.

## 4. Definición de Terminado
- PR aprobado por Isaac.
- Criterios de aceptación verificados con evidencia.
- Vista validada por Saraí cuando aplica.
- Para HU-12/HU-13: archivo generado abierto en Excel y comparado con el original.

## 5. Pendientes con el cliente
| Pendiente | Estado |
|---|---|
| Formatos Excel de Descuentos e Incidencias | ✅ Recibidos (Q16) — no modificables |
| Costo por hora de cada tipo de clase | ✅ Recibido — 3 h español = **$54**; semestre = 4 meses |
| Fuente de las calificaciones OPINA | ✅ Recibida (AGO-DIC 24, ENE-MAY 25, ENE-MAY 26) — fórmula confirmada (% recomendación, global ponderada) |
| Hoja Detalle con valores en vez de vínculo | ✅ **No**: se conserva el vínculo hasta que Nacional autorice |
| Columna "Jornada de trabajo" | ✅ Número de días |
| ¿Se requiere inicio de sesión? | ✅ **No** |
| Color del sistema | ✅ Rosa, personalizable en el perfil + modo claro/oscuro |
| **Excel de información de maestros** | ✅ Contenido confirmado (nómina, nombre, edad, CURP) · ⏳ falta recibir el archivo |
| Faltas justificadas, monto de suplencias, fecha "a partir de" de suplencias, campus en OPINA | ⏳ Ver *07 - Formatos Excel §9* |
