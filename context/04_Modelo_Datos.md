# Modelo de Datos - SIDI
Responsable: Uziel Armando García Duarte · Motor: **SQLite** (`better-sqlite3`, archivo `data/app.db`)

> **Versión 2.4 (29/10/2026): retroalimentación de la vista previa** (*07 §8 #19–#27*). Nuevo en el esquema (migración `002_retro_cliente.sql`): **`opina_campus_semestre`** (% OPP oficial de Preparatoria Veracruz, 2 números por semestre), `tipos_clase.pago_mensual` (calculada), tabla **`docente_bajas`** (motivo, observaciones, recontratable) y `docentes.recontratable`, catálogo `motivo_baja`, **`contratos_importaciones`**, **`envios_correo`**, vista **`v_opina_campus`** y claves de configuración de correo. Los grupos de 4.5 h (en línea) no se importan.
>
> **Versión 2.3 (27/10/2026):** pendientes cerrados (*07 §8*). Nuevas fuentes: **Excel de grupos docentes** (CRN, materia, horario → horas/semana) y **CV en PDF** (CURP, fecha de nacimiento, género, grados). Se agregan los 12 campos de consulta del docente (*07 §7.2*), sesiones por falta, justificación IMSS, quincena de reporte, agrupación de suplencias y contrato del suplente. La hoja Detalle ya **no** usa vínculo externo.
>
> Versión 2.1 (26/10/2026): tarifa $54, pago en 4 meses, jornada = días, OPINA global ponderada.

## 1. Diagrama entidad-relación (resumen)
```
periodos 1──* asignaturas *──1 docentes 1──* titulos_docente
               │    │  └──0..1 tipos_clase       │──* cv_archivos
               │    └──* horarios                ├──* faltas *──0..1 suplencias *──1 incidencias
               │                                 ├──* incidencias *──0..1 quincenas
               └──* opina_respuestas *───────────┘      faltas *──0..1 quincenas (de reporte)
opina_importaciones 1──* opina_respuestas      grupos_importaciones (historial)
docentes 1──* docente_bajas 🆕   asignaturas ←── contratos_importaciones 🆕   quincenas 1──* envios_correo 🆕
departamentos 1──* docentes        catalogos (cc_nomina, motivos, CeCo, textos, nivel, campo)        configuracion (clave/valor)
```

## 2. Decisiones de diseño
- **Nómina canónica** `L` + 8 dígitos (`L03560330`). Al importar se normaliza cualquier forma (`3560330`, `19011`, `L00019011`). Cada formato de salida la escribe como la pide (ver *07 §1*).
- **Fuentes del docente:** Excel de grupos → nómina, nombre, grupos y horarios; CV (PDF) → CURP, fecha de nacimiento, género, títulos, trabajo externo; OPINA → historial de grupos y calificaciones; **captura manual** → contrato por CRN, campo de formación, primer semestre (si no se puede calcular) y correcciones. Lo capturado a mano no se sobrescribe al reimportar sin confirmación.
- **Datos personales mínimos:** del CV **no** se guardan domicilio, teléfono, RFC, estado civil ni correo personal. Solo lo que pide la coordinación (*07 §7.2*). El PDF queda en `data/cv/` (fuera de git).
- **El contrato es por CRN** (Descuentos trae un contrato distinto por cada grupo del mismo docente) → `asignaturas.num_contrato` (captura manual: ningún Excel lo trae). En una **suplencia**, la incidencia usa **cualquiera de los contratos del suplente** (se valida que sea suyo; *07 §8 #15*).
- **Horas/semana se calculan del horario** (`horarios`) y el **idioma se sugiere** (versión en inglés de la materia o modalidad *Bachillerato Intercultural*). **Tipo de clase = horas/semana + idioma** → tarifa por día. Todo editable por CRN.
- **Asignatura = CRN o actividad.** Una actividad (p. ej. *Ruta exploratoria*) no tiene CRN pero sí horas, idioma y contrato, y se puede descontar y cubrir.
- **Falta = 1 registro por CRN, día y sesión** (así lo exige Descuentos). `sesion = 2` solo para el caso especial de un CRN con dos sesiones el mismo día (*07 §8 #14*). El monto se guarda calculado (conserva la tarifa del momento).
- **Quincena de reporte:** una falta o incidencia se asigna a la quincena en la que **se reporta** (no se calcula de la fecha). `quincena_id` NULL = pendiente de reportar.
- **Justificación:** `ninguna` (permiso personal → se descuenta) · `incapacidad_imss` / `cita_imss` (no se descuenta, el suplente sí se paga).
- **Suplencia** liga una falta con el docente que cubrió. Varias suplencias del mismo suplente, titular y CRN en la misma quincena se **agrupan en una sola incidencia** ("del 1 al 4 de septiembre, a pagar 4 días").
- **Nivel de estudios y "¿está estudiando?" se calculan** de `titulos_docente` (grado + estatus); **antigüedad** se calcula del primer semestre con clases (*07 §7.2*).
- **OPINA:** se guardan las respuestas crudas; la calificación se calcula con una vista. Solo grupos **presenciales del campus Veracruz**.
- **Periodos** como los nombra la institución: `AGO-DIC 2024`, `ENE-MAY 2025`, `ENE-MAY 2026`, `AGO-DIC 2026`. `etiqueta_opina` (`2026 Ago - Dic`) es el mismo texto en OPINA y en el Excel de grupos. "Da clases el semestre actual" = tiene asignaturas en el periodo `actual`.
- **Quincenas** numeradas 1–24 por año según la **fecha de pago** (`2026-Q16` = pago 30/08/2026).
- **Sin tabla `usuarios`** (no hay login). Las preferencias del perfil van en `configuracion`.
- 🆕 **Baja con historial:** suspender crea un registro en `docente_bajas` (motivo, observaciones, recontratable, periodo). `docentes.recontratable` guarda el valor de la **última** baja para filtrar rápido (`NULL` = nunca dado de baja). Reactivar no borra el historial.
- 🆕 **Tarifa mensual** = `pago_semestre / 4` como **columna generada** (no se captura; cambia sola si cambia la tarifa).
- 🆕 **Grupos en línea:** los CRN de los grupos **F61 y F62** (configurable en `grupos.omitir_grupos`) **no se importan** (*07 §8 #19, #31*); quedan solo en el historial de la importación.
- 🆕 **Correo:** destinatarios y plantillas en `configuracion`. SIDI **no envía** ni guarda contraseñas: genera el borrador de Outlook (*07 §10*). Cada borrador generado queda en `envios_correo`.
- SQLite: fechas como `TEXT` ISO, booleanos como `INTEGER 0/1`, JSON como `TEXT` (con `json_extract`). `PRAGMA foreign_keys = ON` (ya está en la plantilla).

## 3. Tipos de datos clave
| Dato | Tipo SQLite | Regla |
|---|---|---|
| Nómina | `TEXT` | Único; `^L\d{8}$` |
| CURP | `TEXT` | Único si existe; 18 caracteres formato MX; de ella se derivan fecha de nacimiento y género |
| Género | `TEXT` | `M` (masculino) / `F` (femenino) — de la CURP: `H`→`M`, `M`→`F` |
| CRN | `TEXT` | Único por periodo (NULL en actividades) |
| Contrato | `TEXT` | Solo dígitos, longitud libre (hay de 7 y de 9 dígitos) |
| CeCo / cuenta de cargo | `TEXT` | 10 dígitos |
| Estatus | `INTEGER` | `1` activo (verde) / `0` inactivo (gris) |
| Fechas | `TEXT` | `YYYY-MM-DD` |
| Horas | `TEXT` | `HH:MM` |
| Montos | `REAL` | MXN, 2 decimales |
| % OPINA | calculado | 0–100 |

## 4. DDL (`lib/migraciones/001_inicial.sql`)
```sql
-- ===== Configuración del perfil (sin login) =====
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
-- semillas: tema.modo='automatico', tema.color='#DB2777', perfil.nombre='Coordinación de Docentes',
--           opina.muestra_minima='10', opina.campus='Veracruz', opina.solo_presencial='1',
--           reportes.agrupar_suplencias='1',
--           grupos.omitir_grupos='F61,F62'                  -- 🆕 grupos en línea que no se importan (07 §8 #31)
--           correo.modo='borrador'                          -- 🆕 borrador de Outlook (.eml); sin SMTP (07 §10)
--           correo.para='garcia.sandra@tecmilenio.mx;ruben.salas@tecmilenio.mx;jjbarradas@tecmilenio.mx'
--           correo.cc='', correo.cco=''                     -- listas separadas por ';'
--           correo.asunto='Reportes PREPA Veracruz {quincena} — Descuentos e Incidencias'
--           correo.cuerpo='Buen día, adjunto los reportes de la quincena {quincena} ({periodo}) …'
--           correo.enviar_al_cerrar='0'
--           opina.top_n='10'                                -- 🆕 tamaño por defecto del filtro mejores/peores
-- (se elimina reportes.ruta_descuentos: la hoja Detalle ya no usa vínculo externo)

-- ===== Catálogos =====
CREATE TABLE IF NOT EXISTS departamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_clase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,                    -- 'Clase de 5 hrs en español'
  horas_semana REAL NOT NULL,                     -- 5, 4, 3, 1.5
  idioma TEXT NOT NULL CHECK (idioma IN ('ES','EN')),
  pago_semestre REAL NOT NULL,                    -- 11760.00
  pago_por_dia REAL NOT NULL,                     -- 90.00  (monto a descontar por día de falta en ese CRN)
  pago_mensual REAL GENERATED ALWAYS AS (ROUND(pago_semestre / 4.0, 2)) VIRTUAL,  -- 🆕 2940.00 (semestre en 4 meses)
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (horas_semana, idioma)
);

-- Catálogo genérico para listas del formato de Nacional y del perfil docente
CREATE TABLE IF NOT EXISTS catalogos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('cc_nomina','motivo_incidencia','cuenta_cargo',
                                     'motivo_falta','horas_falta','situacion','estatus_falta','tipo_contrato',
                                     'nivel_estudios','campo_formacion','motivo_baja')),   -- 🆕 motivo_baja
  valor TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,               -- en nivel_estudios define el orden (1 Licenciatura … 4 Doctorado)
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tipo, valor)
);
-- semillas (de Q16–Q20, CV y propuesta del equipo):
--  cc_nomina: 'Sueldo Carga Académica', 'Imp.Clase Artis.Cult.yDep', 'Flex Act. Acad de Apoyo'
--  motivo_incidencia: 'BB_Tutoreo (Preparatoria).', 'B2_Cap.Profr(CADI Asore, Compet.)',
--                     'D1_Activ. Artísticas, Cult Y Dep.', 'LB_Impart CursoTallGral'
--  cuenta_cargo: '5420103000' (académico), '5422101001' (artístico/cultural/deportivo, materias VSPP)
--  motivo_falta: 'Falta por asunto personal', 'Falta injustificadas', 'Suspensión'
--  horas_falta: '8 horas= 1 día completo', '4 horas= 1/2 día'
--  situacion: 'Se hace descuento correspondiente por permiso personal sin justificación.' (ninguna)
--             'No se hace descuento correspondiente por incapacidad del IMSS' (incapacidad_imss)
--             'No se hace descuento correspondiente por cita médica IMSS' (cita_imss)
--  estatus_falta: 'Se descuenta y se toma la falta correspondiente.' (ninguna)
--                 'No se descuenta y no se toma la falta correspondiente.' (incapacidad_imss)
--                 'No se descuenta y no se toma la falta/permiso con goce correspondiente.' (cita_imss)
--  tipo_contrato: 'determinado'
--  nivel_estudios: 'Licenciatura'(1), 'Especialidad'(2), 'Maestría'(3), 'Doctorado'(4)
--  campo_formacion: 'Ingeniería y Tecnología', 'Ciencias Exactas', 'Ciencias Naturales y de la Salud',
--                   'Ciencias Sociales', 'Económico-Administrativas', 'Educación', 'Humanidades',
--                   'Idiomas', 'Artes', 'Deporte'  (propuesta editable)
--  motivo_baja 🆕 (descripcion = recontratable sugerido '1'/'0'):
--                   'Sin disponibilidad de horario' (1), 'Renuncia' (1), 'No cumplió expectativas' (0),
--                   'Problemas de conducta o disciplina' (0), 'Otro' (sin sugerencia)   -- ✅ confirmado, 07 §8 #30

CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,                     -- 'AGO-DIC 2026'
  etiqueta_opina TEXT UNIQUE,                     -- '2026 Ago - Dic' (igual en OPINA y en el Excel de grupos)
  fecha_inicio TEXT,                              -- 2026-08-01 (para calcular antigüedad)
  fecha_fin TEXT,
  actual INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quincenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anio INTEGER NOT NULL,
  numero INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 24),
  fecha_inicio TEXT NOT NULL,                     -- 2026-08-16
  fecha_fin TEXT NOT NULL,                        -- 2026-08-31 (corte: entran faltas pendientes con fecha ≤ fin)
  fecha_pago TEXT NOT NULL,                       -- 2026-08-30 (editable; col. N "A partir de qué periodo")
  cerrada INTEGER NOT NULL DEFAULT 0,             -- 1 = ya se enviaron los reportes (bloquea edición)
  UNIQUE (anio, numero)
);

-- ===== Docentes =====
CREATE TABLE IF NOT EXISTS docentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomina TEXT NOT NULL UNIQUE CHECK (nomina GLOB 'L[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  nombres TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT,
  curp TEXT UNIQUE,                               -- CV o captura
  fecha_nacimiento TEXT,                          -- derivada de la CURP (AAMMDD, posiciones 5–10); editable
  genero TEXT CHECK (genero IN ('M','F')),        -- derivado de la CURP (carácter 11); editable
  nivel_imparte TEXT CHECK (nivel_imparte IN
    ('Bachillerato General','Bachillerato General Bilingüe','Profesional')),  -- antes nivel_educativo; se sugiere de la modalidad de sus grupos
  campo_formacion TEXT,                           -- catálogo campo_formacion (captura)
  primer_periodo_id INTEGER REFERENCES periodos(id), -- primer semestre con clases capturado a mano (si es anterior a los datos)
  primer_semestre_texto TEXT,                     -- 'AGO-DIC 2017' cuando el periodo no existe en la tabla periodos
  trabajo_externo TEXT,                           -- "Área o trabajo independiente a Tecmilenio" (texto libre; se sugiere del CV)
  correo_institucional TEXT,                      -- del CV (opcional)
  tipo_contrato TEXT DEFAULT 'determinado',
  departamento_id INTEGER REFERENCES departamentos(id),
  activo INTEGER NOT NULL DEFAULT 1,
  recontratable INTEGER CHECK (recontratable IN (0,1)),  -- 🆕 de la última baja; NULL = nunca dado de baja
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_grupos','opina','cv','alta_rapida')),
  revisar TEXT,                                   -- motivo de revisión (p. ej. 'Fecha de nacimiento del CV ≠ CURP')
  datos_adicionales TEXT NOT NULL DEFAULT '{}',   -- JSON (columnas desconocidas, idiomas y cursos del CV)
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 🆕 Historial de bajas (suspensiones) con observaciones y si es recontratable
CREATE TABLE IF NOT EXISTS docente_bajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  periodo_id INTEGER REFERENCES periodos(id),     -- semestre en que se dio de baja
  fecha TEXT NOT NULL DEFAULT (date('now','localtime')),
  motivo TEXT NOT NULL,                           -- catálogo motivo_baja
  observaciones TEXT NOT NULL,                    -- por qué se dio de baja (obligatorio, texto libre)
  recontratable INTEGER NOT NULL CHECK (recontratable IN (0,1)),
  fecha_reactivacion TEXT                         -- se llena al reactivar (el registro no se borra)
);

CREATE TABLE IF NOT EXISTS titulos_docente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  grado TEXT NOT NULL,                            -- catálogo nivel_estudios: Licenciatura, Especialidad, Maestría, Doctorado
  nombre_titulo TEXT,                             -- 'Ingeniería Industrial' (el CV casi nunca lo trae → captura)
  institucion TEXT,
  periodo_texto TEXT,                             -- '2017-2021' (como viene en el CV)
  estatus TEXT NOT NULL DEFAULT 'Titulado' CHECK (estatus IN
    ('Titulado','Pasante','Título en trámite','Estudios en curso','Estudios sin concluir')),
  cedula TEXT,
  anio_obtencion INTEGER,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','cv'))
);

CREATE TABLE IF NOT EXISTS cv_archivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  nombre_original TEXT NOT NULL,                  -- 'Cervantes Cervantes  Vanessa.pdf'
  ruta TEXT NOT NULL,                             -- 'data/cv/L03559894.pdf' (fuera de git)
  sha256 TEXT NOT NULL,                           -- evita reimportar el mismo archivo
  paginas INTEGER,
  datos_extraidos TEXT NOT NULL DEFAULT '{}',     -- JSON con lo leído (para auditoría de la importación)
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Un grupo (CRN) o una actividad que imparte un docente en un periodo
CREATE TABLE IF NOT EXISTS asignaturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  crn TEXT,                                       -- '16022'; NULL en actividades
  nombre_actividad TEXT,                          -- 'Ruta exploratoria' (solo actividades)
  clave_materia TEXT,                             -- 'BSMA2003'
  materia TEXT NOT NULL,                          -- 'Math III: regularity and repetition'
  numero_grupo TEXT,                              -- '611', 'F61'
  modalidad TEXT,                                 -- 'Teórica' | 'Bachillerato Intercultural'
  clave_grupo TEXT,                               -- 'Veracruz_BSCN1006_611' (OPINA)
  plan TEXT,                                      -- 'Bachillerato General' | 'Bachillerato General Bilingüe'
  horas_semana REAL,                              -- calculado de horarios; editable
  idioma TEXT CHECK (idioma IN ('ES','EN')),      -- sugerido; editable
  tipo_clase_id INTEGER REFERENCES tipos_clase(id),  -- (horas_semana, idioma); NULL = "Sin tarifa"
  num_contrato TEXT,                              -- contrato de ese CRN (Descuentos col. B) — captura manual
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_grupos','opina')),
  editado_a_mano TEXT NOT NULL DEFAULT '[]',      -- JSON: campos corregidos a mano que una reimportación no debe pisar
  CHECK (crn IS NOT NULL OR nombre_actividad IS NOT NULL),
  UNIQUE (crn, periodo_id)
);

-- Una sesión semanal del grupo (un CRN puede tener dos sesiones el mismo día)
CREATE TABLE IF NOT EXISTS horarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),  -- 1 = lunes
  hora_inicio TEXT NOT NULL,                      -- '11:00'
  hora_fin TEXT NOT NULL,                         -- '12:29' (como viene en el Excel)
  aula TEXT
);

CREATE TABLE IF NOT EXISTS grupos_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  filas INTEGER NOT NULL,
  crn INTEGER NOT NULL,
  docentes INTEGER NOT NULL,
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- 🆕 Cargas del reporte de contratos por CRN (07 §7.3)
CREATE TABLE IF NOT EXISTS contratos_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  filas INTEGER NOT NULL,
  actualizados INTEGER NOT NULL,                  -- contratos nuevos o cambiados
  con_aviso INTEGER NOT NULL DEFAULT 0,
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== Faltas y descuentos (→ DESCUENTO-PREPA Qnn.xlsx) =====
CREATE TABLE IF NOT EXISTS faltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER REFERENCES quincenas(id),   -- quincena en la que se REPORTA; NULL = pendiente
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  asignatura_id INTEGER REFERENCES asignaturas(id),  -- NULL solo en descuento manual sin CRN
  fecha TEXT,                                     -- día de la falta (NULL si es rango manual)
  sesion INTEGER NOT NULL DEFAULT 1 CHECK (sesion IN (1,2)), -- 2 = caso especial: 2ª sesión del mismo CRN ese día
  fecha_texto TEXT,                               -- '03/08/2026 al 16/08/2026' (solo manual)
  dias INTEGER NOT NULL DEFAULT 1 CHECK (dias >= 1), -- col. D "Jornada de trabajo" = número de días
  motivo TEXT NOT NULL,                           -- catálogo motivo_falta
  horas_texto TEXT NOT NULL DEFAULT '8 horas= 1 día completo',
  cuenta_cargo TEXT NOT NULL DEFAULT '5420103000',
  justificacion TEXT NOT NULL DEFAULT 'ninguna' CHECK (justificacion IN ('ninguna','incapacidad_imss','cita_imss')),
  folio_imss TEXT,                                -- 'UW465897'
  modo_calculo TEXT NOT NULL DEFAULT 'tarifa' CHECK (modo_calculo IN ('tarifa','manual')),
  tarifa_aplicada REAL,                           -- copia de tipos_clase.pago_por_dia
  monto_descuento REAL NOT NULL DEFAULT 0,        -- 0 si justificacion ≠ 'ninguna'
  monto_editado INTEGER NOT NULL DEFAULT 0,       -- 1 = la coordinadora cambió el monto de la tabla
  comentario TEXT,                                -- generado: 'CRN 16434 de 3 horas a la semana, a descontar 54.00 = 54.00'
  ticket TEXT,
  situacion TEXT,                                 -- hoja Detalle (según justificacion)
  estatus TEXT,                                   -- hoja Detalle (según justificacion)
  observaciones TEXT,                             -- motivo detallado (viaje, funeral…); va al texto de la suplencia
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (docente_id, asignatura_id, fecha, sesion)
);

-- ===== Pagos adicionales (→ INCIDENCIAS PREPA Qnn.xlsx, hoja Incidencia) =====
CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER REFERENCES quincenas(id),   -- quincena en la que se reporta; NULL = pendiente
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  num_contrato TEXT,                              -- en suplencias: uno de los contratos del suplente; NULL permitido con aviso
  tipo_contrato TEXT NOT NULL DEFAULT 'determinado',
  cc_nomina TEXT NOT NULL,                        -- catálogo cc_nomina
  motivo TEXT NOT NULL,                           -- catálogo motivo_incidencia
  detalle TEXT NOT NULL,                          -- col. G (generado en suplencias)
  ceco TEXT NOT NULL,                             -- col. H (10 caracteres)
  elemento_pep TEXT,                              -- col. I (24 caracteres)
  orden_interna TEXT,                             -- col. J (12 caracteres)
  importe_total REAL NOT NULL CHECK (importe_total >= 0),
  num_periodos INTEGER NOT NULL DEFAULT 1 CHECK (num_periodos >= 1),
  a_partir_de TEXT,                               -- col. N; al reportar = quincenas.fecha_pago
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','suplencia')),
  orden INTEGER NOT NULL DEFAULT 0                -- orden de las filas en el Excel
);

-- Cada suplencia es un día (y sesión) cubierto; varias se agrupan en una misma incidencia
CREATE TABLE IF NOT EXISTS suplencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  falta_id INTEGER NOT NULL UNIQUE REFERENCES faltas(id) ON DELETE CASCADE,
  docente_suplente_id INTEGER NOT NULL REFERENCES docentes(id),
  incidencia_id INTEGER REFERENCES incidencias(id) ON DELETE SET NULL,  -- ya NO es UNIQUE (agrupación)
  monto REAL NOT NULL                             -- = tarifa del CRN (igual al descontado; si la falta es IMSS se paga igual)
);

-- 🆕 Bitácora de envíos de reportes por correo (07 §10)
CREATE TABLE IF NOT EXISTS envios_correo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER NOT NULL REFERENCES quincenas(id),
  reportes TEXT NOT NULL,                         -- 'descuentos,incidencias'
  modo TEXT NOT NULL DEFAULT 'borrador' CHECK (modo IN ('borrador','mailto')),   -- mailto = respaldo sin adjuntos
  para TEXT NOT NULL, cc TEXT, cco TEXT,
  asunto TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('borrador_generado','mailto_abierto','error')),   -- SIDI no envía: Outlook lo hace
  detalle_error TEXT,
  enviado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== OPINA =====
CREATE TABLE IF NOT EXISTS opina_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  version_formato TEXT NOT NULL CHECK (version_formato IN ('v1','v2')),
  filtro_campus TEXT,                             -- 'Veracruz'
  solo_presencial INTEGER NOT NULL DEFAULT 1,
  filas INTEGER NOT NULL,
  filas_descartadas INTEGER NOT NULL DEFAULT 0,
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS opina_respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  importacion_id INTEGER NOT NULL REFERENCES opina_importaciones(id) ON DELETE CASCADE,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  crn TEXT NOT NULL,
  response_id TEXT,                               -- solo v1
  campus_grupo TEXT,
  recomienda INTEGER NOT NULL,                    -- 1 = 'Sí', 0 = 'No'
  por_que_si TEXT,                                -- v1
  por_que_no TEXT,                                -- v1
  items TEXT,                                     -- v2 JSON: {"conocimiento":"Sí","retos":"No estoy seguro",...}
  comentario TEXT
);

-- Calificación por grupo (un docente puede tener varias: distintas materias y grados)
CREATE VIEW IF NOT EXISTS v_opina_crn AS
SELECT periodo_id, docente_id, crn,
       COUNT(*)                                AS respuestas,
       SUM(recomienda)                         AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas
GROUP BY periodo_id, docente_id, crn;

-- Calificación GLOBAL del docente en el periodo: todas sus respuestas juntas
-- (ponderada por alumnos; NO es el promedio de los porcentajes de cada CRN)
CREATE VIEW IF NOT EXISTS v_opina_docente AS
SELECT periodo_id, docente_id,
       COUNT(*)                                AS respuestas,
       SUM(recomienda)                         AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas
GROUP BY periodo_id, docente_id;

-- 🆕 % OPP OFICIAL de Preparatoria Veracruz por semestre (reporte institucional OPINA, 07 §5.4)
-- Se capturan 2 números por semestre; es la fuente de la gráfica G1 y del comparativo del campus.
CREATE TABLE IF NOT EXISTS opina_campus_semestre (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL UNIQUE REFERENCES periodos(id),
  alumnos INTEGER NOT NULL CHECK (alumnos > 0),           -- 'TT Alumnos' de Preparatoria → Veracruz
  positivas INTEGER NOT NULL CHECK (positivas >= 0),      -- 'Opiniones Positivas'
  opp REAL GENERATED ALWAYS AS (ROUND(100.0 * positivas / alumnos, 1)) VIRTUAL,
  region_opp REAL,                                        -- opcional: % OPP de Preparatoria · Centro y Sur
  fuente TEXT,                                            -- 'EM26.xlsx'
  capturado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (positivas <= alumnos)
);
-- semillas: ENE-MAY 2025 (3837, 3387) · AGO-DIC 2025 (3590, 3085) · ENE-MAY 2026 (3804, 3333)

-- Calificación del campus calculada desde OPINA por alumno (referencia interna; puede diferir de la oficial)
-- calificacion_campus: ponderada por alumnos. El promedio simple de maestros y la mediana se calculan
-- en opinaService sobre v_opina_docente (excluyendo muestra insuficiente).
CREATE VIEW IF NOT EXISTS v_opina_campus AS
SELECT periodo_id,
       COUNT(*)                                     AS respuestas,
       SUM(recomienda)                              AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS calificacion_campus,
       COUNT(DISTINCT docente_id)                   AS docentes,
       COUNT(DISTINCT crn)                          AS grupos
FROM opina_respuestas
GROUP BY periodo_id;

-- Perfil académico calculado (campos 8 y 11 de 07 §7.2)
CREATE VIEW IF NOT EXISTS v_docente_estudios AS
SELECT d.id AS docente_id,
       (SELECT t.grado FROM titulos_docente t JOIN catalogos c ON c.tipo='nivel_estudios' AND c.valor=t.grado
         WHERE t.docente_id=d.id AND t.estatus='Titulado' ORDER BY c.orden DESC LIMIT 1)          AS nivel_estudios,
       EXISTS (SELECT 1 FROM titulos_docente t WHERE t.docente_id=d.id AND t.estatus='Estudios en curso') AS estudia_actualmente,
       (SELECT t.grado FROM titulos_docente t WHERE t.docente_id=d.id AND t.estatus='Estudios en curso'
         ORDER BY t.id DESC LIMIT 1)                                                             AS nivel_estudiando
FROM docentes d;

-- Primer semestre con clases (para antigüedad): el menor entre lo capturado, asignaturas y OPINA
CREATE VIEW IF NOT EXISTS v_docente_primer_periodo AS
SELECT d.id AS docente_id,
       MIN(p.fecha_inicio) AS primer_inicio
FROM docentes d
JOIN periodos p ON p.id = d.primer_periodo_id
   OR p.id IN (SELECT periodo_id FROM asignaturas WHERE docente_id = d.id)
   OR p.id IN (SELECT periodo_id FROM opina_respuestas WHERE docente_id = d.id)
GROUP BY d.id;

-- ===== Índices =====
CREATE INDEX IF NOT EXISTS idx_docentes_activo   ON docentes(activo);
CREATE INDEX IF NOT EXISTS idx_docentes_nombre   ON docentes(apellido_paterno, nombres);
CREATE INDEX IF NOT EXISTS idx_docentes_genero   ON docentes(genero);
CREATE INDEX IF NOT EXISTS idx_asig_periodo      ON asignaturas(periodo_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_horarios_asig     ON horarios(asignatura_id, dia_semana);
CREATE INDEX IF NOT EXISTS idx_titulos_docente   ON titulos_docente(docente_id, estatus);
CREATE INDEX IF NOT EXISTS idx_faltas_quincena   ON faltas(quincena_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_faltas_pendientes ON faltas(fecha) WHERE quincena_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_inc_quincena      ON incidencias(quincena_id, orden);
CREATE INDEX IF NOT EXISTS idx_opina_periodo     ON opina_respuestas(periodo_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_bajas_docente     ON docente_bajas(docente_id, fecha);
CREATE INDEX IF NOT EXISTS idx_docentes_recont   ON docentes(recontratable);
CREATE INDEX IF NOT EXISTS idx_envios_quincena   ON envios_correo(quincena_id);
```

## 5. Reglas de negocio
```
nomina_canonica(x)   = 'L' + rellenar_ceros(solo_digitos(x), 8)
nomina_nacional(n)   = entero(n sin 'L')                      -- L00019011 → 19011

quincena(fecha_pago) = (mes − 1) × 2 + (día ≤ 15 ? 1 : 2)     -- numera por FECHA DE PAGO, no por fecha de falta

-- Excel de grupos → asignatura
duracion(sesion)     = redondear_a_0.5h((hora_fin + 1 min) − hora_inicio)   -- '11:00–12:29' = 1.5 h; '16:00–17:35' = 1.5 h
horas_semana         = Σ duracion de sus sesiones (cada día marcado 'SI' es una sesión)
idioma_sugerido      = 'EN' si la materia es versión en inglés (BSMA2003, BSCN2004, BSHU2004, BSCN3002…)
                             o modalidad = 'Bachillerato Intercultural';  si no 'ES'
omitir CRN           = numero_grupo ∈ grupos.omitir_grupos (F61, F62 = en línea, otro sistema) → no se importa   -- 🆕

-- 🆕 Tipo de falta para el resumen ejecutivo (07 §8 #29; solo agrupa, no cambia los textos de Nacional)
tipo_resumen(falta)  = justificacion IN ('incapacidad_imss','cita_imss') → 'Incapacidad médica'
                       en otro caso (asunto personal, falta injustificada / no justificada) → 'Asunto personal'
tipo_clase           = tipos_clase(horas_semana, idioma)  -- sin coincidencia → NULL "Sin tarifa"
tarifa_mensual       = tipos_clase.pago_semestre / 4                                                -- 🆕
plan                 = modalidad 'Bachillerato Intercultural' → 'Bachillerato General Bilingüe'; si no 'Bachillerato General'

-- Falta con modo 'tarifa' (una por CRN, día y sesión)
tarifa_aplicada      = tipos_clase.pago_por_dia  del CRN
monto_descuento      = justificacion = 'ninguna' ? tarifa_aplicada : 0
dias                 = 1                                        -- manual: días del rango (p. ej. 14)
comentario           = 'CRN {crn} de {horas} horas a la semana, a descontar {m} = {m}'
                       -- actividad: '{nombre_actividad} de {horas} horas a la semana, …'
situacion / estatus  = según justificacion (catálogo)

-- Suplencia
suplencias.monto     = tarifa_aplicada (igual a lo descontado; también se paga si la falta es IMSS)
agrupación           = mismo suplente + mismo titular + mismo CRN + mismo mes + misma quincena → 1 incidencia
                       texto de fechas: consecutivos 'del 1 al 4 de septiembre'; sueltos 'del día 24, 25, 27 y 28 de agosto'
incidencia generada  = cc 'Flex Act. Acad de Apoyo', motivo 'B2_Cap.Profr(CADI Asore, Compet.)',
                       periodos 1, importe = Σ montos, detalle 'Sustituyó al docente … a pagar N días. N días* t = total …'
contrato suplente    = uno de asignaturas.num_contrato del suplente (se valida que le pertenezca);
                       por defecto el primero del periodo actual; NULL permitido con aviso si no tiene contratos

-- Quincena de reporte
al generar Qnn       = faltas e incidencias con quincena_id NULL y fecha ≤ quincenas.fecha_fin → se asignan a Qnn
a_partir_de          = quincenas.fecha_pago de Qnn

-- Incidencia
importe_por_periodo  = importe_total / num_periodos            -- en Excel queda como fórmula

-- Detalle (por docente que faltó, en la quincena; se escribe con VALORES)
descontado           = Σ faltas.monto_descuento   (0 si todas fueron IMSS)
pagado_suplentes     = Σ suplencias.monto de esas faltas
diferencia           = descontado − pagado_suplentes   (negativa en faltas IMSS cubiertas)

-- OPINA
calificacion_crn     = 100 × Σ recomienda / respuestas  del CRN
calificacion_global  = 100 × Σ recomienda / Σ respuestas  de todos sus CRN del periodo
                       -- solo grupos presenciales del campus Veracruz; 'muestra insuficiente' si respuestas < muestra_minima

-- 🆕 Baja (suspender)
suspender            = docentes.activo = 0; INSERT docente_bajas(motivo, observaciones, recontratable, periodo actual)
recontratable sug.   = catalogos(motivo_baja).descripcion ('1' sin disponibilidad / '0' expectativas o problemas); editable
docentes.recontratable = recontratable de la última baja
reactivar            = activo = 1; docente_bajas.fecha_reactivacion = hoy (si recontratable = 0 pide confirmación)
avisos               = al importar el Excel de grupos o al elegir suplente, un docente con recontratable = 0 se marca ⚠

-- 🆕 Grupos a suplir y docentes disponibles (al registrar una falta)
grupos_a_suplir      = sesiones (horarios) de las asignaturas elegidas en cada fecha de falta (día de la semana)
disponible(d, sesión)= d.activo = 1  y  d ≠ titular  y  d no tiene falta registrada ese día
                       y NO existe horario de d en el periodo actual con mismo dia_semana
                           y hora_inicio < sesión.fin  y  sesión.inicio < hora_fin            -- sin empalme
orden sugerido       = 1) imparte la misma clave_materia  2) ya da clases ese día (está en el campus)
                       3) menos suplencias en el periodo  4) alfabético
                       (recontratable = 0 → al final con ⚠; inactivos no aparecen)

-- 🆕 OPINA campus por semestre (07 §5.4)
opp_oficial          = opina_campus_semestre.positivas / alumnos × 100          -- G1 y comparativo del campus
calificacion_campus  = v_opina_campus.calificacion_campus                     -- referencia: Σ Sí ÷ Σ respuestas (OPINA por alumno)
promedio_maestros    = AVG(v_opina_docente.porcentaje) con respuestas ≥ muestra_minima
variacion            = valor(periodo) − valor(periodo anterior)   en puntos porcentuales
ranking filtro       = mejores: ORDER BY porcentaje DESC LIMIT n · peores: ORDER BY porcentaje ASC LIMIT n
                       · rango: porcentaje BETWEEN min AND max

-- 🆕 Contratos (07 §7.3)
importar contrato    = asignaturas(periodo, crn).num_contrato = Contrato  (si viene nómina, debe ser la del docente del CRN)

-- Docente (CV y CURP)
fecha_nacimiento     = CURP[5..10] como AAMMDD; siglo = CURP[17] dígito → 19xx, letra → 20xx
genero               = CURP[11]: 'H' → 'M', 'M' → 'F'
edad                 = años completos entre fecha_nacimiento y hoy
fecha del CV ≠ CURP  → docentes.revisar = 'Revisar fecha de nacimiento'
liga CV → docente    = por CURP; si no, por nombre normalizado (sin acentos, minúsculas, palabras ordenadas)

-- Campos calculados de consulta (07 §7.2)
num_grupos           = COUNT(asignaturas del periodo actual)
nivel_estudios       = v_docente_estudios.nivel_estudios      (grado más alto Titulado)
estudia_actualmente  = v_docente_estudios.estudia_actualmente
antiguedad           = hoy − primer_inicio  → 'N años · M semestres'
                       (si primer_semestre_texto está capturado y es anterior, se usa ese)
incompleto           = sin CURP o sin campo_formacion o sin primer semestre calculable o algún CRN sin contrato
```
Una quincena `cerrada` no permite editar sus faltas ni incidencias (evita cambiar algo ya enviado a Nacional); se puede reabrir con confirmación.

## 6. Semillas (`lib/semillas.js`)
- `tipos_clase`: las 8 filas de la tabla de pagos (*07 §6*), con **$54** para 3 h en español (respuesta final).
- `catalogos`: valores listados arriba (incluye `nivel_estudios` y `campo_formacion`).
- `periodos`: AGO-DIC 2024, ENE-MAY 2025, **AGO-DIC 2025** 🆕 (archivo AD25), ENE-MAY 2026, AGO-DIC 2026 (actual), con `fecha_inicio` (1 ago / 1 ene) y `etiqueta_opina`.
- `quincenas`: las 24 del año en curso, con `fecha_pago` = día 15 / último día del mes (editable; Q16 2026 se paga el 30/08).
- `configuracion`: valores por defecto del perfil y de OPINA.

## 7. Pendientes
- ~~Tarifa para grupos de 4.5 h/semana~~ → ✅ se omiten (en línea).
- ~~Fuente del contrato por CRN~~ → ✅ reporte de la coordinadora (`contratos_importaciones`, *07 §7.3*).
- ✅ Catálogo `motivo_baja` confirmado; F62 en línea (se omite).
- ⏳ Reporte de contratos: la coordinadora preguntó a **RH** si existe (*07 §9 #5*).
