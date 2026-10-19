# Product Backlog - SIDI
> Documento guía; se ajustará al recibir los 3 formatos Excel.

## 1. Historias de usuario originales (épicas)
| ID | Historia |
|---|---|
| EP-01 | *Como* coordinadora de docentes *quiero* un sistema de seguimiento de los maestros *para* poder consultar su información de forma más rápida. |
| EP-02 | *Como* coordinadora de docentes *quiero* que el sistema calcule el descuento correspondiente según las inasistencias registradas de cada maestro en un periodo quincenal, considerando el tipo de clase a la que faltaron, *para* automatizar el cálculo del descuento salarial sin realizar operaciones manuales. |
| EP-03 | *Como* coordinadora de docentes *quiero* poder filtrar los maestros que sí están dando clases el semestre actual, así como agregar nuevos maestros y suspender los que no están activos *para* evitar sobrecargas de información al realizar las consultas. |
| EP-04 | *Como* coordinadora *quiero* que el sistema genere gráficas *para* mejorar el análisis de la información. |
| EP-05 | *Como* directiva *quiero* que el sistema ordene los maestros con mejor calificación de OPINA *para* evitar hacer ese cálculo por mi cuenta. |

## 2. Historias derivadas (priorizadas)
Pts = puntos de historia. **M** Matías (Back) · **U** Uziel (BD/estructura) · **S** Sebastián (Front, apoyo Back).

| ID | Épica | Prio | Historia | Criterios de aceptación | Pts | Resp. | Día |
|---|---|---|---|---|---|---|---|
| HU-01 | EP-01 | 1 | Como coordinadora, quiero capturar un docente con un formulario, para registrar toda su información. | Valida CURP y nómina única; guarda títulos, nivel, contrato, CRN | 5 | U, M, S | D2 |
| HU-02 | EP-01 | 1 | Como coordinadora, quiero subir un Excel con varios maestros y ver cuántos y quiénes se agregarán, para confirmar que los datos son correctos. | Vista con cantidad y nombres; nada se guarda sin confirmar; avisa duplicados/errores | 8 | M, U, S | D3 |
| HU-03 | EP-01 | 1 | Como coordinadora, quiero ver una tabla con nombre, CURP, fecha de nacimiento, cumpleaños, nivel, títulos, OPINA e inasistencias, para consultar todo en un lugar. | Columnas completas; faltas totales visibles | 5 | S, M | D4 |
| HU-04 | EP-01 | 2 | Como coordinadora, quiero ver un resumen al pasar el mouse y los datos extendidos al hacer clic, para no cambiar de pantalla. | Hover: nómina, contrato, CRN. Clic: ficha debajo de la tabla | 5 | S | D4 |
| HU-05 | EP-03 | 1 | Como coordinadora, quiero ver un punto verde/gris y suspender docentes inactivos, para identificar a quién está activo. | Verde = activo, gris = inactivo; suspender con confirmación | 3 | S, M | D4 |
| HU-06 | EP-03 | 1 | Como coordinadora, quiero filtrar a quienes dan clases el semestre actual y ordenar por alfabeto, edad o títulos, para evitar sobrecarga de información. | Filtros combinables; < 500 ms | 5 | M, S | D5 |
| HU-07 | EP-01 | 1 | Como coordinadora, quiero buscar por nombre, CURP, nómina o CRN, para encontrar a un maestro rápido. | Resultados mientras escribe | 3 | M, S | D5 |
| HU-08 | EP-02 | 1 | Como coordinadora, quiero registrar faltas con tipo de clase y motivo, para llevar el control. | Fecha, horas, tipo de clase, justificada sí/no, motivo | 5 | U, S | D6 |
| HU-09 | EP-02 | 1 | Como coordinadora, quiero que el descuento quincenal se calcule automáticamente, para no hacer operaciones manuales. | Usa costo/hora del tipo de clase; justificadas = $0; total por quincena | 5 | M, U | D6 |
| HU-10 | EP-02 | 2 | Como coordinadora, quiero un apartado de inasistencias por semestre, para saber cuántas faltas hubo, cuántos profesores faltaron y por qué. | Tres indicadores + desglose por motivo | 5 | M, S | D6 |
| HU-11 | EP-04 | 2 | Como coordinadora, quiero que la primera vista sea un panel con gráficas, para analizar la información. | Gráfica OPINA por maestro, inasistencias totales, docentes activos y métricas propuestas | 8 | S, M | D7 |
| HU-12 | EP-05 | 2 | Como directiva, quiero ver a los maestros ordenados por mejor OPINA, para no calcularlo yo. | Ranking descendente por semestre | 3 | U, M, S | D8 |
| HU-13 | Notas | 1 | Como coordinadora, quiero generar reportes en los 3 formatos Excel, para entregarlos sin reformatear. | Archivo idéntico a la plantilla institucional | 8 | M, U, S | D8 |
| HU-14 | Desc. | 3 | Como coordinadora, quiero consultar asignaturas, departamento y horarios del docente, para conocer su carga. | Pestaña en ficha extendida | 3 | U, S | D8 |

**Total:** 71 puntos.

## 3. Sprints (2 semanas, avances diarios)
### Sprint 1 — Fundación, carga de datos y estructura base
| Día | Objetivo |
|---|---|
| 1 | Kickoff: repositorio, ramas `main`/`develop` protegidas, stack, estructura de carpetas, modelo de datos inicial |
| 2 | Esquema de BD + alta manual de docentes (HU-01) |
| 3 | Carga masiva Excel con vista de confirmación (HU-02) |
| 4 | Tabla principal, hover, ficha extendida, punto verde/gris, suspender (HU-03, HU-04, HU-05) |
| 5 | Filtros y búsqueda (HU-06, HU-07) · **Revisión de Sprint 1 con Saraí** (validación de vistas con el cliente) |

### Sprint 2 — Descuentos, analítica, reportes y pruebas
| Día | Objetivo |
|---|---|
| 6 | Inasistencias, cálculo de descuentos y apartado semestral (HU-08, HU-09, HU-10) |
| 7 | Panel administrativo con gráficas (HU-11) |
| 8 | Ranking OPINA, reportes en 3 formatos, horarios/asignaturas (HU-12, HU-13, HU-14) |
| 9 | Pruebas integrales, corrección de bugs, pulido de UI, datos de demostración |
| 10 | Cierre: revisión final de PRs por Isaac, merge a `main`, entrega a Saraí para validación con el cliente |

Cada día, cada integrante sube su avance en una rama y abre un PR que **solo Isaac** aprueba.

## 4. Definición de Terminado
- PR aprobado por Isaac.
- Criterios de aceptación verificados con evidencia.
- Vista validada por Saraí cuando aplica.

## 5. Pendientes con el cliente
- Los 3 formatos Excel.
- Costo por hora de cada tipo de clase.
- Fuente de las calificaciones OPINA.
- ¿Se requiere inicio de sesión? (no viene en el original).