# Requerimientos Técnicos - SIDI
**Sistema Integral de Información Docente**

> **Versión 2 (26/10/2026).** Incorpora los archivos del cliente: tabla de pagos por tipo de clase, OPINA (3 periodos), Descuentos e Incidencias (Q16). **Solo falta el Excel de información de maestros.** El detalle de cada archivo está en *07 - Formatos Excel*.

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
| Lectura de Excel | SheetJS (`xlsx`) | Lee `.xlsx` y `.xlsb` (OPINA viene en ambos) |
| Generación de Excel | ExcelJS sobre plantillas | Rellena celdas conservando formato, tablas y fórmulas |
| Subida de archivos | `multer` (en memoria, límite 15 MB) | |
| Pruebas | `node:test` | Sin dependencias extra |
| Control de versiones | Git + GitHub | Todo cambio por rama + PR aprobado por Isaac |

**Se elimina de la plantilla:** `lib/auth.js`, `routes/auth.js`, `login.html`, `login.js`, `login.css`, tabla `usuarios`, dependencias `bcryptjs` y `jsonwebtoken`, y el módulo de ejemplo *Notas* (se usa como modelo y luego se borra).

## 4. Requerimientos funcionales
| ID | Requerimiento | Origen |
|---|---|---|
| RF-01 | Sistema de seguimiento para consultar rápido la información de cada maestro | EP-01 |
| RF-02 | **Captura manual**: formulario con toda la información del docente | Captura (1) |
| RF-03 | **Captura por Excel** (archivo de información de maestros ⏳): agrega varios docentes a la vez; antes muestra **cantidad y nombres** para confirmar | Captura (2) |
| RF-04 | Tabla con: nombre, CURP, fecha de nacimiento, cumpleaños, nivel (Bachillerato General / Bilingüe / Profesional), títulos, calificación OPINA del semestre y número de inasistencias | Tabla |
| RF-05 | Hover sobre el nombre → resumen (Núm. de nómina, Contrato(s), CRN); clic → datos extendidos debajo de la tabla | Tabla |
| RF-06 | Indicador activo/inactivo (punto verde = activo, gris = inactivo) | Estatus |
| RF-07 | Agregar maestros y **suspender** inactivos; filtrar a los que **dan clases el semestre actual** | EP-03 |
| RF-08 | Filtros: orden alfabético, edad, títulos, nivel, estatus | Filtros |
| RF-09 | Búsqueda por nombre, CURP, número de nómina (con o sin `L0`) o CRN | Búsqueda |
| RF-10 | Mostrar faltas totales por docente | Faltas |
| RF-11 | Registrar faltas **por CRN y por día**; el descuento se calcula solo con la tarifa por día del tipo de clase (horas/semana + idioma). Permite descuento **manual** para casos especiales | EP-02 |
| RF-12 | Registrar quién **cubrió** cada falta (suplencia); genera automáticamente el pago al suplente en Incidencias | Excel Incidencias |
| RF-13 | Registrar **pagos adicionales** por quincena (tutoreo, PAD, coach, talleres, etc.) con importe total y número de periodos | Excel Incidencias |
| RF-14 | Generar `DESCUENTO-PREPA Qnn.xlsx` **idéntico** al formato de Nacional | Excel Descuentos |
| RF-15 | Generar `INCIDENCIAS PREPA Qnn.xlsx` (hojas *Incidencia* y *Detalle* con la conciliación descontado vs. pagado a suplentes) idéntico al formato de Nacional | Excel Incidencias |
| RF-16 | Importar OPINA (`.xlsx`/`.xlsb`, versiones 2024–2026) y calcular la calificación por docente y periodo | OPINA |
| RF-17 | Ranking de maestros por mejor calificación OPINA | EP-05 |
| RF-18 | Apartado de inasistencias por semestre: número de faltas, cuántos profesores faltaron y motivo | Inasistencias |
| RF-19 | **Primera vista = panel administrativo** con gráficas (OPINA por maestro, inasistencias, docentes activos y métricas propuestas) | EP-04 |
| RF-20 | Catálogo editable de tarifas por tipo de clase y de los catálogos de Incidencias (cc-nómina, motivos, CeCo) | Tabla de pagos |
| RF-21 | **Perfil**: elegir el **color principal** (rosa por defecto) y el **modo claro u oscuro**; se guarda y se aplica a todo el sistema | Cliente |
| RF-22 | Consulta de asignaturas, departamentos, horarios y trayectoria profesional | Descripción |

### Métricas propuestas para el panel (RF-19)
Docentes activos/inactivos, faltas de la quincena y del semestre, profesores con faltas, **descuento total de la quincena**, **pagado a suplentes en la quincena**, promedio OPINA, ranking OPINA, distribución por nivel, faltas por motivo, próximos cumpleaños del mes.

## 5. Requerimientos no funcionales
- **RNF-01 Usabilidad:** usuaria sin conocimientos técnicos; todo en español, confirmaciones claras, máximo 2 clics para consultas frecuentes.
- **RNF-02 Rendimiento:** búsquedas y filtros < 500 ms; importar un OPINA (~4,000 filas) < 10 s.
- **RNF-03 Fidelidad de formatos:** los Excel generados deben abrirse en Excel sin mensajes de reparación y verse igual que los originales (ver *07 §4.3*).
- **RNF-04 Extensibilidad:** columnas desconocidas del Excel de maestros → `datos_adicionales` (JSON) sin rehacer la BD.
- **RNF-05 Apariencia formal:** el color elegido solo afecta acentos (botones, menú activo, enlaces); fondos neutros; los colores de estado (verde/gris/rojo/ámbar) no cambian. Contraste mínimo WCAG AA (4.5:1).
- **RNF-06 Responsivo:** escritorio y tableta.
- **RNF-07 Plazo:** 2 semanas con avances diarios.

## 6. Acceso y seguridad (sin inicio de sesión)
El cliente confirmó que **no se requiere inicio de sesión**. Al abrir SIDI se entra directo al panel. Para compensar:
- El servidor escucha por defecto **solo en `127.0.0.1`** (variable `HOST`), es decir, solo desde la misma computadora. Abrirlo a la red local es una decisión explícita en `.env`.
- Los archivos reales del cliente (OPINA, Descuentos, Incidencias, base de datos) **nunca se suben a GitHub**: contienen nóminas, nombres y comentarios de alumnos. En `templates/` solo van plantillas **vacías**.
- Se conservan de la plantilla: consultas SQL con parámetros, escape de HTML (`UI.escape`) y cabeceras de seguridad.
- Respaldo: copiar `data/app.db` (botón "Descargar respaldo" en Configuración).

## 7. Integración con Excel
Resumen (detalle completo en *07 - Formatos Excel*):
- **Entrada:** OPINA (semestral) y, cuando llegue, información de maestros.
- **Salida:** Descuentos e Incidencias (quincenales). Los dos son **no modificables** porque así los pide Nacional: SIDI rellena una plantilla vacía y solo escribe valores.
- La nómina se guarda normalizada (`L` + 8 dígitos) y cada formato la escribe como la pide.

## 8. Calidad
- Validación en front y back (CURP, nómina única, archivo `.xlsx`/`.xlsb`, montos ≥ 0).
- Pruebas unitarias: normalización de nómina, número de quincena, cálculo de descuento, lector OPINA v1/v2, generadores de Excel.
- **Prueba de punta a punta con Q16:** capturar las faltas y pagos de los archivos reales de Q16 y comparar los Excel generados contra los originales.
- Validación de vistas por la PO.

## 9. Control de cambios
- Todo el código pasa por una rama en GitHub y llega por Pull Request.
- **Solo Isaac acepta los cambios** (`main` y `develop` protegidas). Detalle en *Arquitectura y Convenciones - SIDI*.

## 10. Pendientes
Ver *07 §8*. El principal: **Excel de información de maestros** (sin él no se conocen horas/semana e idioma por CRN, que determinan la tarifa).
