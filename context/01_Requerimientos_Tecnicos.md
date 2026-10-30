# Requerimientos Técnicos - SIDI
**Sistema Integral de Información Docente**

> **Versión 2.4 (29/10/2026): retroalimentación de la vista previa.** El cliente **aprobó el diseño** y las vistas (Panel, Docentes, Formación, Excel de grupos, Registrar falta, Incidencias, OPINA, Reportes). Nuevos requerimientos RF-24 a RF-29: tarifa mensual, baja con observaciones y recontratable, docentes disponibles para suplir, comparativo OPINA del campus, **envío de reportes por correo** y **resumen ejecutivo**. Los grupos de 4.5 h (en línea) se ignoran y la coordinadora creará el reporte de contratos (*07 §8 #19–#27*).
>
> **Versión 2.3 (27/10/2026):** pendientes con el cliente **cerrados** (*07 §8*). Nuevas entradas: **Excel de grupos docentes** y **CV en PDF**; 12 campos de consulta del docente; la hoja Detalle se genera **con valores** (sin vínculo externo).
>
> Versión 2.1 (26/10/2026): aplicadas las respuestas del cliente (tarifa $54, pago en 4 meses, jornada = días, se conserva el vínculo externo de Detalle, OPINA global ponderada, Excel de maestros = nómina/nombre/edad/CURP). Pendientes vigentes en *07 §9*.

> Incorpora todos los archivos del cliente: tabla de pagos por tipo de clase, OPINA (3 periodos), Descuentos e Incidencias (Q16–Q20), **Excel de grupos docentes (AGO-DIC 2026)** y **37 CV en PDF**. El detalle de cada archivo está en *07 - Formatos Excel*.

## 1. Propósito
Sistema de información docente diseñado para centralizar y administrar los datos personales, académicos y laborales de los maestros, facilitando la consulta de perfiles, asignaturas, departamentos, horarios y trayectoria profesional desde una plataforma organizada.

Además automatiza dos trámites quincenales que hoy se hacen a mano y se envían a Nacional en un formato fijo: el **reporte de descuentos por faltas** y el **reporte de incidencias (pagos adicionales y suplencias)**.

Usuarios: coordinadora de docentes y directiva, **sin conocimientos técnicos**. Contexto: Preparatoria, campus Veracruz (Bachillerato General y Bachillerato General Bilingüe).

## 2. Equipo
| Rol | Nombre | Responsabilidad |
|---|---|---|
| Product Owner | Saraí Cecilio Rascón | Comunicación con el cliente, mostrar prototipos de vistas para validación constante, entrega del producto final |
| Scrum Master | Calixto Isaac Galeana Medrano | Elegir tecnologías, generar Sprints, dar seguimiento y supervisar que los cambios se alineen al producto; **único que acepta cambios en GitHub** |
| Backend | Matías Hernández Garrido | API, lógica de descuentos, lectura y generación de Excel |
| Base de datos y estructura | Uziel Armando García Duarte | Modelo de datos, estructura del programa, mapeos de Excel |
| Frontend (apoyo en Back) | Sebastián Huesca Ramírez | Interfaz, gráficas, tema personalizable; apoyo a Matías en backend |

> Las tareas pueden reacomodarse; esta es la especialización de cada integrante.

## 3. Stack tecnológico (elegido por el Scrum Master)
Se usa la **plantilla Express + SQLite** que ya está en el repositorio (commit del 19/10/2026), **sin el módulo de login**.

| Capa | Tecnología | Justificación |
|---|---|---|
| Servidor | Node.js 20+ (22 LTS) + Express 4 (CommonJS) | Ya está en la plantilla; simple de correr en una PC |
| Base de datos | SQLite con `better-sqlite3` (archivo `data/app.db`) | Un solo usuario, sin instalar servidor de BD; respaldo = copiar un archivo |
| Frontend | HTML + CSS + JavaScript **sin frameworks**; cada vista es un módulo IIFE | Sin paso de compilación; UI kit propio (`ui-kit.js`) |
| Estilos | Variables CSS en `theme.css` (claro/oscuro) | Permite cambiar color principal y modo en tiempo real |
| Gráficas | Chart.js 4 (archivo local en `public/vendor/`) | Funciona sin internet, sin compilación |
| Lectura de Excel | SheetJS (`xlsx`) | Lee `.xlsx` y `.xlsb` (OPINA viene en ambos) y el Excel de grupos |
| Lectura de CV (PDF) | `pdf-parse` (sobre pdf.js, sin binarios externos) | Los CV tienen texto seleccionable; solo se leen las primeras páginas (el formato "A1 CURRICULUM VITAE DOCENTES") |
| Envío de correo 🆕 | Generación de `.eml` (borrador de Outlook con adjuntos), sin dependencias | La cuenta es Outlook institucional; no se guardan contraseñas ni se requiere TI (*07 §10*) |
| Exportar resumen ejecutivo 🆕 | Impresión del navegador a PDF con CSS `@page` (16:9) | Sin dependencias; Chart.js ya está local |
| Generación de Excel | ExcelJS (Descuentos) · JSZip + edición del XML de la plantilla (Incidencias) | Descuentos es un formato simple; Incidencias tiene una tabla de Excel (`Tabla17`) con fórmulas estructuradas que se conservan mejor editando el XML. Ya **no** hay vínculo externo |
| Subida de archivos | `multer` (en memoria; 15 MB por Excel, 30 MB para OPINA, 10 MB por PDF, hasta 60 PDF por carga) | |
| Pruebas | `node:test` | Sin dependencias extra |
| Control de versiones | Git + GitHub | Todo cambio por rama + PR aprobado por Isaac |

**Se elimina de la plantilla:** `lib/auth.js`, `routes/auth.js`, `login.html`, `login.js`, `login.css`, tabla `usuarios`, dependencias `bcryptjs` y `jsonwebtoken`, y el módulo de ejemplo *Notas* (se usa como modelo y luego se borra).

## 4. Requerimientos funcionales
| ID | Requerimiento | Origen |
|---|---|---|
| RF-01 | Sistema de seguimiento para consultar rápido la información de cada maestro | EP-01 |
| RF-02 | **Captura manual**: formulario con toda la información del docente; corrige o completa lo importado. Es la vía para **contrato por CRN**, campo de formación, primer semestre (si es anterior a los datos), actividades sin CRN y departamento | Captura (1) |
| RF-03 | **Captura por Excel de grupos** (`GRUPOS_DOCENTES_<PERIODO>.xlsx`, **mismo formato cada semestre** ✅): agrega o actualiza docentes (nómina, nombre) y sus **grupos del semestre** (CRN, materia, grupo, modalidad, horario); calcula **horas/semana**, sugiere **idioma** y **tipo de clase**; **omite los grupos de 4.5 h (en línea)**. Antes muestra **cantidad y nombres** para confirmar | Captura (2) |
| RF-23 | **Captura por CV (PDF)**: sube varios CV a la vez; extrae CURP (→ fecha de nacimiento, edad y género), grados con su estatus (→ nivel de estudios y si está estudiando) y lugar laboral actual (→ trabajo independiente); vista previa editable, nada se guarda sin confirmar; el PDF se puede abrir desde la ficha | Captura (3) |
| RF-04 | Tabla con los **12 campos de consulta** (*07 §7.2*): nombre, nómina, edad, género, CURP, número de grupos, grupos asignados, nivel de estudios, campo de formación, antigüedad, si está estudiando (y qué nivel), trabajo independiente a Tecmilenio; además cumpleaños, OPINA del semestre y número de inasistencias. Selector de columnas | Tabla · Nota del cliente |
| RF-05 | Hover sobre el nombre → resumen (Núm. de nómina, Contrato(s), CRN); clic → datos extendidos debajo de la tabla | Tabla |
| RF-06 | Indicador activo/inactivo (punto verde = activo, gris = inactivo) | Estatus |
| RF-07 | Agregar maestros y **suspender** inactivos; filtrar a los que **dan clases el semestre actual**. 🆕 Al suspender (dar de baja) se capturan **motivo, observaciones** y si es **recontratable** (*sin disponibilidad* → Recontratable; *no cumplió expectativas o tuvo problemas* → No recontratable); queda un historial de bajas | EP-03 · Retro 29/10 |
| RF-08 | Filtros y orden: alfabético, edad, género, nivel de estudios, campo de formación, antigüedad, está estudiando, número de grupos, nivel que imparte, estatus | Filtros |
| RF-09 | Búsqueda por nombre, CURP, número de nómina (con o sin `L0`) o CRN | Búsqueda |
| RF-10 | Mostrar faltas totales por docente | Faltas |
| RF-11 | Registrar faltas **por CRN y por día**; el descuento se calcula solo con la tarifa por día del tipo de clase (horas/semana + idioma). Faltas con **incapacidad o cita del IMSS** no se descuentan. Permite descuento **manual** y una 2ª sesión del mismo CRN y día (caso especial) | EP-02 |
| RF-12 | Registrar quién **cubrió** cada falta (suplencia); genera automáticamente el pago al suplente en Incidencias, agrupando los días del mismo CRN y usando **uno de los contratos del suplente** | Excel Incidencias |
| RF-13 | Registrar **pagos adicionales** por quincena (tutoreo, PAD, coach, talleres, etc.) con importe total y número de periodos | Excel Incidencias |
| RF-14 | Generar `DESCUENTO-PREPA Qnn.xlsx` **idéntico** al formato de Nacional, con fila de total al final. Incluye todo lo **pendiente de reportar** hasta la fecha de corte | Excel Descuentos |
| RF-15 | Generar `INCIDENCIAS PREPA Qnn.xlsx` (hojas *Incidencia* y *detalle* con la conciliación descontado vs. pagado a suplentes, **con valores**) idéntico al formato de Nacional | Excel Incidencias |
| RF-16 | Importar OPINA (`.xlsx`/`.xlsb`, versiones 2024–2026; **solo grupos presenciales del campus Veracruz**) y calcular el % de recomendación por grupo (CRN) y una **calificación global** por docente y periodo (todas sus respuestas juntas) | OPINA |
| RF-17 | **Ranking completo** de maestros por calificación OPINA, con filtro de **mejores y peores** (Top/Bottom N o rango de %) y el **promedio de todos los maestros por semestre** | EP-05 · Retro 29/10 |
| RF-18 | Apartado de inasistencias por semestre: número de faltas, cuántos profesores faltaron y motivo | Inasistencias |
| RF-19 | **Primera vista = panel administrativo** con gráficas (OPINA por maestro, inasistencias, docentes activos y métricas propuestas) | EP-04 |
| RF-20 | Catálogo editable de tarifas por tipo de clase y de los catálogos de Incidencias (cc-nómina, motivos, CeCo) | Tabla de pagos |
| RF-21 | **Perfil**: elegir el **color principal** (rosa por defecto) y el **modo claro u oscuro**; se guarda y se aplica a todo el sistema | Cliente |
| RF-22 | Consulta de asignaturas, departamentos, horarios (del Excel de grupos) y trayectoria profesional (del CV) | Descripción |
| RF-24 🆕 | En la ficha del docente, **tarifa mensual** (pago al semestre ÷ 4) justo a la derecha de la tarifa diaria de cada CRN | Retro 29/10 |
| RF-25 🆕 | Al registrar una falta, mostrar los **grupos que necesitarán suplirse** y proponer los **docentes disponibles** (activos, sin clase que se empalme con el horario de ese grupo ese día) | Retro 29/10 |
| RF-26 🆕 | **Evolución por semestre del % OPP de Preparatoria Veracruz** (reporte institucional OPINA): captura de alumnos y opiniones positivas por semestre y gráfica de línea con el cambio (*07 §5.4*) | Retro 29/10 |
| RF-27 🆕 | **Enviar los reportes de Nacional por correo** a destinatarios configurables (3 correos de Nacional) desde **Outlook institucional**: SIDI prepara el borrador con los 2 Excel adjuntos y ella presiona *Enviar*; bitácora (*07 §10*) | Retro 29/10 |
| RF-28 🆕 | **Resumen ejecutivo** en el panel: presentación formal (diapositivas 16:9) con KPIs y gráficas de rendimiento por semestre, exportable a PDF; gráficas a elegir por el cliente (*05 §1.1*) | Retro 29/10 |
| RF-29 🆕 | **Importar el reporte de contratos por CRN** (plantilla prellenada que genera SIDI; *07 §7.3*) | Retro 29/10 |

### Métricas propuestas para el panel (RF-19)
Docentes activos/inactivos, faltas de la quincena y del semestre, profesores con faltas, **descuento total de la quincena**, **pagado a suplentes en la quincena**, promedio OPINA, ranking OPINA, distribución por nivel, faltas por motivo, próximos cumpleaños del mes.

## 5. Requerimientos no funcionales
- **RNF-01 Usabilidad:** usuaria sin conocimientos técnicos; todo en español, confirmaciones claras, máximo 2 clics para consultas frecuentes.
- **RNF-02 Rendimiento:** búsquedas y filtros < 500 ms; importar un OPINA (~4,000 filas) < 10 s.
- **RNF-03 Fidelidad de formatos:** los Excel generados deben abrirse en Excel sin mensajes de reparación ni avisos de "actualizar vínculos", y verse igual que los originales (ver *07 §4.3*).
- **RNF-04 Extensibilidad:** columnas desconocidas del Excel de grupos y secciones extra del CV → `datos_adicionales` (JSON) sin rehacer la BD.
- **RNF-08 Importación de CV:** 40 PDF en < 30 s; si un PDF no se puede leer (escaneo, formato distinto) se avisa y se puede capturar a mano.
- **RNF-05 Apariencia formal:** el color elegido solo afecta acentos (botones, menú activo, enlaces); fondos neutros; los colores de estado (verde/gris/rojo/ámbar) no cambian. Contraste mínimo WCAG AA (4.5:1).
- **RNF-06 Responsivo:** escritorio y tableta.
- **RNF-07 Plazo:** 2 semanas con avances diarios.

## 6. Acceso y seguridad (sin inicio de sesión)
El cliente confirmó que **no se requiere inicio de sesión**. Al abrir SIDI se entra directo al panel. Para compensar:
- El servidor escucha por defecto **solo en `127.0.0.1`** (variable `HOST`), es decir, solo desde la misma computadora. Abrirlo a la red local es una decisión explícita en `.env`.
- Los archivos reales del cliente (OPINA, Descuentos, Incidencias, Excel de grupos, **CV**, base de datos) **nunca se suben a GitHub**: contienen nóminas, nombres, CURP, domicilios y comentarios de alumnos. En `templates/` solo van plantillas **vacías**; los PDF viven en `data/cv/` (ignorado por git).
- **Datos personales mínimos:** del CV solo se guardan los campos que pide la coordinación (*07 §7.2*); domicilio, teléfono, RFC, estado civil y correo personal no se almacenan.
- Se conservan de la plantilla: consultas SQL con parámetros, escape de HTML (`UI.escape`) y cabeceras de seguridad.
- Respaldo: copiar `data/app.db` (botón "Descargar respaldo" en Configuración).
- 🆕 **Observaciones de baja** (motivo de suspensión) son información sensible: solo se ven en la ficha del docente, nunca en el panel ni en el resumen ejecutivo (ahí solo conteos).

## 7. Integración con Excel
Resumen (detalle completo en *07 - Formatos Excel*):
- **Entrada:** OPINA (semestral), **Excel de grupos docentes** (inicio de semestre) y **CV en PDF** (altas).
- **Salida:** Descuentos e Incidencias (quincenales). Los dos son **no modificables** porque así los pide Nacional: SIDI rellena una plantilla vacía. La hoja Detalle se escribe con valores (como Q17–Q19).
- La nómina se guarda normalizada (`L` + 8 dígitos) y cada formato la escribe como la pide.

## 8. Calidad
- Validación en front y back (CURP, nómina única, archivo `.xlsx`/`.xlsb`/`.pdf`, montos ≥ 0, contrato del suplente le pertenece).
- Pruebas unitarias: normalización de nómina, número de quincena, horas/semana desde el horario, idioma sugerido, CURP → fecha/género, lector OPINA v1/v2, lector de grupos, lector de CV, agrupación de suplencias, generadores de Excel.
- **Prueba de punta a punta con Q16–Q20:** capturar las faltas y pagos de los archivos reales y comparar los Excel generados contra los originales (corrigiendo antes los errores de captura conocidos).
- Validación de vistas por la PO.

## 9. Control de cambios
- Todo el código pasa por una rama en GitHub y llega por Pull Request.
- **Solo Isaac acepta los cambios** (`main` y `develop` protegidas). Detalle en *Arquitectura y Convenciones - SIDI*.

## 10. Pendientes
🆕 Respuestas del 29/10 (*07 §8 #28–#31*): correos de destino y **Outlook institucional** (borrador de Outlook), **2 tipos de falta** en el resumen ejecutivo, motivos de baja confirmados y **F61/F62 en línea** (se omiten).

**Único pendiente:** el **reporte de contratos por CRN** — la coordinadora preguntó a **RH** si existe (*07 §9 #5*). Si existe, se importa; si no, se usa la plantilla de SIDI; mientras tanto el contrato se captura al registrar la primera falta de cada CRN.
