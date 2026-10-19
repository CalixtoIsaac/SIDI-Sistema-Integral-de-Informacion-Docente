# Requerimientos Técnicos - SIDI
**Sistema Integral de Información Docente**

> **Documento guía (versión preliminar).** Se enriquecerá cuando se reciban los 3 formatos de Excel institucionales que definirán la información completa de los docentes.

## 1. Propósito
Sistema de información docente diseñado para centralizar y administrar los datos personales, académicos y laborales de los maestros, facilitando la consulta de perfiles, asignaturas, departamentos, horarios y trayectoria profesional desde una plataforma organizada. Usuarios: coordinadora de docentes y directiva, **sin conocimientos técnicos**.

## 2. Equipo
| Rol | Nombre | Responsabilidad |
|---|---|---|
| Product Owner | Saraí Cecilio Rascón | Comunicación con el cliente, mostrar prototipos de vistas para validación constante, entrega del producto final |
| Scrum Master | Calixto Isaac Galeana Medrano | Elegir tecnologías, generar Sprints, dar seguimiento y supervisar que los cambios se alineen al producto; **único que acepta cambios en GitHub** |
| Backend | Matías Hernández Garrido | API, lógica de descuentos, procesamiento de Excel |
| Base de datos y estructura | Uziel Armando García Duarte | Modelo de datos, estructura del programa |
| Frontend (apoyo en Back) | Sebastián Huesca Ramírez | Interfaz, gráficas; apoyo a Matías en backend |

> Las tareas pueden reacomodarse; esta es la especialización de cada integrante.

## 3. Stack tecnológico (elegido por el Scrum Master)
| Capa | Tecnología | Justificación |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind CSS + Lucide Icons + Recharts | Interfaz simple y gráficas |
| Backend | Node.js + Express + TypeScript | Mismo lenguaje en front y back; buenas librerías de Excel |
| Base de datos | PostgreSQL 16 (JSONB para columnas dinámicas) | Relacional + flexible mientras no se conozcan los 3 Excel |
| ORM / migraciones | Prisma | Cambios de esquema versionados |
| Excel | SheetJS (lectura) / ExcelJS (exportación sobre plantilla) | Respeta formatos no modificables |
| Control de versiones | Git + GitHub | Toda modificación pasa por rama + PR aprobado por Isaac |

## 4. Requerimientos funcionales
| ID | Requerimiento | Origen |
|---|---|---|
| RF-01 | Sistema de seguimiento para consultar rápido la información de cada maestro | HU-01 |
| RF-02 | **Captura manual**: formulario con toda la información solicitada del docente | Captura (1) |
| RF-03 | **Captura por Excel**: identifica la información de varios docentes y los agrega simultáneamente; antes muestra una vista con **cantidad y nombres** para confirmar | Captura (2) |
| RF-04 | Tabla organizada con: nombre, CURP, fecha de nacimiento, fecha de cumpleaños, nivel (Bachillerato General / Bilingüe / Profesional), títulos, calificación OPINA semestral y número de inasistencias | Tabla |
| RF-05 | Hover sobre el nombre → resumen pequeño (Núm. de nómina, Contrato, CRN); clic → datos extendidos debajo de la tabla | Tabla |
| RF-06 | Indicador activo/inactivo sencillo (punto verde = activo, gris = inactivo) | Estatus |
| RF-07 | Agregar maestros nuevos y **suspender** a los inactivos; filtrar a los que **sí dan clases el semestre actual** | HU-03 |
| RF-08 | Filtros: orden alfabético, por edad, por títulos, etc. | Filtros |
| RF-09 | Búsqueda por Nombre, CURP, número de nómina o CRN | Búsqueda |
| RF-10 | Mostrar faltas totales por docente | Faltas |
| RF-11 | Cálculo automático del descuento salarial por inasistencias en periodo **quincenal**, según el **tipo de clase** a la que faltó | HU-02 |
| RF-12 | Apartado de inasistencias por semestre: número de inasistencias, cuántos profesores faltaron y razón (algunas, como viajes, se justifican) | Inasistencias |
| RF-13 | **Primera vista = panel administrativo** con gráficas (calificaciones OPINA por maestro, inasistencias totales, docentes activos y métricas propuestas) | HU-04 |
| RF-14 | Ordenar a los maestros por mejor calificación OPINA | HU-05 |
| RF-15 | Generar reportes en los **3 formatos Excel**, respetando exactamente el formato (no modificable) | Notas |
| RF-16 | Consulta de asignaturas, departamentos, horarios y trayectoria profesional | Descripción |

### Métricas propuestas para el panel (RF-13)
Docentes activos/inactivos, inasistencias totales del semestre, profesores con faltas, descuento total de la quincena, promedio OPINA, ranking OPINA, distribución por nivel, faltas por motivo, próximos cumpleaños del mes.

## 5. Requerimientos no funcionales
- **RNF-01 Usabilidad:** pensado para un usuario sin conocimientos técnicos; en español, con confirmaciones claras.
- **RNF-02 Rendimiento:** búsquedas y filtros < 500 ms.
- **RNF-03 Extensibilidad:** absorber las columnas de los 3 Excel sin rehacer la base de datos (JSONB).
- **RNF-04 Responsivo:** escritorio y tableta.
- **RNF-05 Plazo:** desarrollado y probado en máximo **2 semanas**, con avances diarios.

## 6. Integración con los 3 formatos Excel
- Plantillas originales en `backend/templates/`; el sistema solo rellena celdas, **nunca altera el formato**.
- Un archivo de mapeo por formato (`formato-N.map.json`: columna Excel ↔ campo).
- Columnas no reconocidas al importar → `datos_adicionales` y aviso en la vista previa.
- ⚠️ **Pendiente (Saraí con el cliente):** los 3 Excel reales y la tabla de costo por tipo de clase.

## 7. Calidad y seguridad
- Validación en front y back (CURP, nómina única, archivo `.xlsx`).
- Variables sensibles en `.env`.
- Pruebas unitarias del cálculo de descuentos y del lector de Excel; validación de vistas por la PO.
- *Propuesta (no solicitada en el original, a confirmar con el cliente):* inicio de sesión con usuario y contraseña.

## 8. Control de cambios
- Todo el código pasa primero por una rama en GitHub y llega por Pull Request.
- **Solo Isaac acepta los cambios** (`main` y `develop` protegidas). Detalle en *Arquitectura y Convenciones - SIDI*.