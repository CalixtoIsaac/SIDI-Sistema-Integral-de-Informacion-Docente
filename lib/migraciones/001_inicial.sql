-- =====================================================================
-- 001_inicial.sql · SIDI · Esquema completo (Uziel, BD)
-- Las semillas (datos iniciales) están en lib/semillas.js.
-- =====================================================================

-- ===== Configuración =====
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- ===== Catálogos =====
CREATE TABLE IF NOT EXISTS departamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

-- Tarifas por horas e idioma
CREATE TABLE IF NOT EXISTS tipos_clase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  horas_semana REAL NOT NULL,
  idioma TEXT NOT NULL CHECK (idioma IN ('ES','EN')),
  pago_semestre REAL NOT NULL,
  pago_por_dia REAL NOT NULL,                     -- descuento por día de falta
  pago_mensual REAL GENERATED ALWAYS AS (ROUND(pago_semestre / 4.0, 2)) VIRTUAL,  -- calculada
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (horas_semana, idioma)
);

-- Listas editables (formato de Nacional y perfil docente)
CREATE TABLE IF NOT EXISTS catalogos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('cc_nomina','motivo_incidencia','cuenta_cargo',
                                     'motivo_falta','horas_falta','situacion','estatus_falta','tipo_contrato',
                                     'nivel_estudios','campo_formacion','motivo_baja')),
  valor TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tipo, valor)
);

CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,
  etiqueta_opina TEXT UNIQUE,
  fecha_inicio TEXT,
  fecha_fin TEXT,
  actual INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quincenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anio INTEGER NOT NULL,
  numero INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 24),
  fecha_inicio TEXT NOT NULL,
  fecha_fin TEXT NOT NULL,
  fecha_pago TEXT NOT NULL,
  cerrada INTEGER NOT NULL DEFAULT 0,             -- 1 = reportes enviados (bloquea edición)
  UNIQUE (anio, numero)
);

-- ===== Docentes =====
CREATE TABLE IF NOT EXISTS docentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomina TEXT NOT NULL UNIQUE CHECK (nomina GLOB 'L[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  nombres TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT,
  curp TEXT UNIQUE,
  fecha_nacimiento TEXT,                          -- de la CURP; editable
  genero TEXT CHECK (genero IN ('M','F')),        -- de la CURP; editable
  nivel_imparte TEXT CHECK (nivel_imparte IN
    ('Bachillerato General','Bachillerato General Bilingüe','Profesional')),
  campo_formacion TEXT,
  primer_periodo_id INTEGER REFERENCES periodos(id),
  primer_semestre_texto TEXT,                     -- cuando el periodo no está en la tabla
  trabajo_externo TEXT,
  correo_institucional TEXT,
  tipo_contrato TEXT DEFAULT 'determinado',
  departamento_id INTEGER REFERENCES departamentos(id),
  activo INTEGER NOT NULL DEFAULT 1,
  recontratable INTEGER CHECK (recontratable IN (0,1)),  -- de la última baja; NULL = sin bajas
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_grupos','opina','cv','alta_rapida')),
  revisar TEXT,                                   -- motivo de revisión
  datos_adicionales TEXT NOT NULL DEFAULT '{}',   -- JSON
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- Historial de bajas
CREATE TABLE IF NOT EXISTS docente_bajas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  periodo_id INTEGER REFERENCES periodos(id),
  fecha TEXT NOT NULL DEFAULT (date('now','localtime')),
  motivo TEXT NOT NULL,
  observaciones TEXT NOT NULL,
  recontratable INTEGER NOT NULL CHECK (recontratable IN (0,1)),
  fecha_reactivacion TEXT
);

CREATE TABLE IF NOT EXISTS titulos_docente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  grado TEXT NOT NULL,
  nombre_titulo TEXT,
  institucion TEXT,
  periodo_texto TEXT,
  estatus TEXT NOT NULL DEFAULT 'Titulado' CHECK (estatus IN
    ('Titulado','Pasante','Título en trámite','Estudios en curso','Estudios sin concluir')),
  cedula TEXT,
  anio_obtencion INTEGER,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','cv'))
);

CREATE TABLE IF NOT EXISTS cv_archivos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  nombre_original TEXT NOT NULL,
  ruta TEXT NOT NULL,                             -- data/cv/ (fuera de git)
  sha256 TEXT NOT NULL,                           -- evita reimportar el mismo PDF
  paginas INTEGER,
  datos_extraidos TEXT NOT NULL DEFAULT '{}',     -- JSON de auditoría
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== Grupos y horarios =====
-- Un CRN o una actividad de un docente en un periodo
CREATE TABLE IF NOT EXISTS asignaturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  crn TEXT,                                       -- NULL en actividades
  nombre_actividad TEXT,
  clave_materia TEXT,
  materia TEXT NOT NULL,
  numero_grupo TEXT,
  modalidad TEXT,
  clave_grupo TEXT,                               -- para ligar con OPINA
  plan TEXT,
  horas_semana REAL,                              -- de horarios; editable
  idioma TEXT CHECK (idioma IN ('ES','EN')),
  tipo_clase_id INTEGER REFERENCES tipos_clase(id),  -- NULL = sin tarifa
  num_contrato TEXT,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_grupos','opina')),
  editado_a_mano TEXT NOT NULL DEFAULT '[]',      -- JSON: campos que una reimportación no pisa
  CHECK (crn IS NOT NULL OR nombre_actividad IS NOT NULL),
  UNIQUE (crn, periodo_id)
);

-- Sesiones semanales (puede haber dos el mismo día)
CREATE TABLE IF NOT EXISTS horarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio TEXT NOT NULL,
  hora_fin TEXT NOT NULL,
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

-- Cargas del reporte de contratos
CREATE TABLE IF NOT EXISTS contratos_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  filas INTEGER NOT NULL,
  actualizados INTEGER NOT NULL,
  con_aviso INTEGER NOT NULL DEFAULT 0,
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== Faltas y descuentos =====
CREATE TABLE IF NOT EXISTS faltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER REFERENCES quincenas(id),   -- NULL = pendiente de reportar
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  asignatura_id INTEGER REFERENCES asignaturas(id),
  fecha TEXT,
  sesion INTEGER NOT NULL DEFAULT 1 CHECK (sesion IN (1,2)),
  fecha_texto TEXT,                               -- rango en descuentos manuales
  dias INTEGER NOT NULL DEFAULT 1 CHECK (dias >= 1),
  motivo TEXT NOT NULL,
  horas_texto TEXT NOT NULL DEFAULT '8 horas= 1 día completo',
  cuenta_cargo TEXT NOT NULL DEFAULT '5420103000',
  justificacion TEXT NOT NULL DEFAULT 'ninguna' CHECK (justificacion IN ('ninguna','incapacidad_imss','cita_imss')),
  folio_imss TEXT,
  modo_calculo TEXT NOT NULL DEFAULT 'tarifa' CHECK (modo_calculo IN ('tarifa','manual')),
  tarifa_aplicada REAL,                           -- copia de la tarifa del momento
  monto_descuento REAL NOT NULL DEFAULT 0,
  monto_editado INTEGER NOT NULL DEFAULT 0,
  comentario TEXT,
  ticket TEXT,
  situacion TEXT,
  estatus TEXT,
  observaciones TEXT,
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (docente_id, asignatura_id, fecha, sesion)
);

-- ===== Pagos adicionales =====
CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER REFERENCES quincenas(id),   -- NULL = pendiente de reportar
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  num_contrato TEXT,
  tipo_contrato TEXT NOT NULL DEFAULT 'determinado',
  cc_nomina TEXT NOT NULL,
  motivo TEXT NOT NULL,
  detalle TEXT NOT NULL,
  ceco TEXT NOT NULL,
  elemento_pep TEXT,
  orden_interna TEXT,
  importe_total REAL NOT NULL CHECK (importe_total >= 0),
  num_periodos INTEGER NOT NULL DEFAULT 1 CHECK (num_periodos >= 1),
  a_partir_de TEXT,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','suplencia')),
  orden INTEGER NOT NULL DEFAULT 0
);

-- Día cubierto por un suplente; varias pueden ir en una misma incidencia
CREATE TABLE IF NOT EXISTS suplencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  falta_id INTEGER NOT NULL UNIQUE REFERENCES faltas(id) ON DELETE CASCADE,
  docente_suplente_id INTEGER NOT NULL REFERENCES docentes(id),
  incidencia_id INTEGER REFERENCES incidencias(id) ON DELETE SET NULL,
  monto REAL NOT NULL
);

-- Bitácora de envíos de reportes por correo
CREATE TABLE IF NOT EXISTS envios_correo (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER NOT NULL REFERENCES quincenas(id),
  reportes TEXT NOT NULL,
  modo TEXT NOT NULL DEFAULT 'borrador' CHECK (modo IN ('borrador','mailto')),
  para TEXT NOT NULL, cc TEXT, cco TEXT,
  asunto TEXT NOT NULL,
  resultado TEXT NOT NULL CHECK (resultado IN ('borrador_generado','mailto_abierto','error')),
  detalle_error TEXT,
  enviado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ===== OPINA =====
CREATE TABLE IF NOT EXISTS opina_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  version_formato TEXT NOT NULL CHECK (version_formato IN ('v1','v2')),
  filtro_campus TEXT,
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
  response_id TEXT,
  campus_grupo TEXT,
  recomienda INTEGER NOT NULL,                    -- 1 = Sí, 0 = No
  por_que_si TEXT,
  por_que_no TEXT,
  items TEXT,                                     -- JSON con los reactivos (v2)
  comentario TEXT
);

-- % de recomendación por grupo
CREATE VIEW IF NOT EXISTS v_opina_crn AS
SELECT periodo_id, docente_id, crn,
       COUNT(*)                                AS respuestas,
       SUM(recomienda)                         AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas
GROUP BY periodo_id, docente_id, crn;

-- % global del docente (ponderado por alumnos)
CREATE VIEW IF NOT EXISTS v_opina_docente AS
SELECT periodo_id, docente_id,
       COUNT(*)                                AS respuestas,
       SUM(recomienda)                         AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas
GROUP BY periodo_id, docente_id;

-- % OPP oficial del campus por semestre (captura manual)
CREATE TABLE IF NOT EXISTS opina_campus_semestre (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL UNIQUE REFERENCES periodos(id),
  alumnos INTEGER NOT NULL CHECK (alumnos > 0),
  positivas INTEGER NOT NULL CHECK (positivas >= 0),
  opp REAL GENERATED ALWAYS AS (ROUND(100.0 * positivas / alumnos, 1)) VIRTUAL,
  region_opp REAL,
  fuente TEXT,
  capturado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  CHECK (positivas <= alumnos)
);

-- Calificación del campus calculada desde OPINA
CREATE VIEW IF NOT EXISTS v_opina_campus AS
SELECT periodo_id,
       COUNT(*)                                     AS respuestas,
       SUM(recomienda)                              AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS calificacion_campus,
       COUNT(DISTINCT docente_id)                   AS docentes,
       COUNT(DISTINCT crn)                          AS grupos
FROM opina_respuestas
GROUP BY periodo_id;

-- ===== Vistas del perfil docente =====
-- Nivel de estudios más alto y si estudia actualmente
CREATE VIEW IF NOT EXISTS v_docente_estudios AS
SELECT d.id AS docente_id,
       (SELECT t.grado FROM titulos_docente t JOIN catalogos c ON c.tipo='nivel_estudios' AND c.valor=t.grado
         WHERE t.docente_id=d.id AND t.estatus='Titulado' ORDER BY c.orden DESC LIMIT 1)          AS nivel_estudios,
       EXISTS (SELECT 1 FROM titulos_docente t WHERE t.docente_id=d.id AND t.estatus='Estudios en curso') AS estudia_actualmente,
       (SELECT t.grado FROM titulos_docente t WHERE t.docente_id=d.id AND t.estatus='Estudios en curso'
         ORDER BY t.id DESC LIMIT 1)                                                             AS nivel_estudiando
FROM docentes d;

-- Primer semestre con clases (para la antigüedad)
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
