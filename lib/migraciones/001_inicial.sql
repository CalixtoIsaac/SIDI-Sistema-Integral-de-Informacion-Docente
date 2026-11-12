-- =====================================================================
-- 001_inicial.sql · SIDI · Esquema base del Sprint 1 (Uziel, BD)
-- Catálogos, periodos, quincenas, docentes y su perfil, materias,
-- asignaturas y horarios.
--
-- Cambios por 3FN:
--   · docentes sin fecha_nacimiento ni genero → salen de la CURP (v_docente_curp)
--   · materias: tabla nueva; asignaturas guarda materia_id
--   · asignaturas sin tipo_clase_id (v_asignatura_tarifa, en 002) ni clave_grupo
--   · editado_a_mano (JSON) → tabla asignatura_campos_editados
-- =====================================================================
 
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
 
CREATE TABLE IF NOT EXISTS departamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);
 
CREATE TABLE IF NOT EXISTS tipos_clase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  horas_semana REAL NOT NULL,
  idioma TEXT NOT NULL CHECK (idioma IN ('ES','EN')),
  pago_semestre REAL NOT NULL,
  pago_por_dia REAL NOT NULL,
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (horas_semana, idioma)
);
 
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
  cerrada INTEGER NOT NULL DEFAULT 0,
  UNIQUE (anio, numero)
);
 
-- 3FN: sin fecha_nacimiento, genero ni recontratable
CREATE TABLE IF NOT EXISTS docentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomina TEXT NOT NULL UNIQUE CHECK (nomina GLOB 'L[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  nombres TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT,
  curp TEXT UNIQUE,
  nivel_imparte TEXT CHECK (nivel_imparte IN
    ('Bachillerato General','Bachillerato General Bilingüe','Profesional')),
  campo_formacion TEXT,
  primer_periodo_id INTEGER REFERENCES periodos(id),
  primer_semestre_texto TEXT,
  trabajo_externo TEXT,
  correo_institucional TEXT,
  tipo_contrato TEXT DEFAULT 'determinado',
  departamento_id INTEGER REFERENCES departamentos(id),
  activo INTEGER NOT NULL DEFAULT 1,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_grupos','opina','cv','alta_rapida')),
  revisar TEXT,
  datos_adicionales TEXT NOT NULL DEFAULT '{}',
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
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
  ruta TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  paginas INTEGER,
  datos_extraidos TEXT NOT NULL DEFAULT '{}',
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
 
-- 3FN: la clave de la materia determina su nombre
CREATE TABLE IF NOT EXISTS materias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT UNIQUE,
  nombre TEXT NOT NULL
);
 
-- 3FN: materia_id en lugar de clave_materia/materia; sin tipo_clase_id, clave_grupo ni editado_a_mano
CREATE TABLE IF NOT EXISTS asignaturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  crn TEXT,
  nombre_actividad TEXT,
  materia_id INTEGER REFERENCES materias(id),
  numero_grupo TEXT,
  modalidad TEXT,
  plan TEXT,
  horas_semana REAL,
  idioma TEXT CHECK (idioma IN ('ES','EN')),
  num_contrato TEXT,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_grupos','opina')),
  CHECK (crn IS NOT NULL OR nombre_actividad IS NOT NULL),
  CHECK (crn IS NULL OR materia_id IS NOT NULL),
  UNIQUE (crn, periodo_id)
);
 
-- 1FN: una fila por campo editado a mano (antes JSON editado_a_mano)
CREATE TABLE IF NOT EXISTS asignatura_campos_editados (
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  campo TEXT NOT NULL,
  PRIMARY KEY (asignatura_id, campo)
);
 
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
 
-- Nivel de estudios más alto titulado y si estudia actualmente
CREATE VIEW IF NOT EXISTS v_docente_estudios AS
SELECT d.id AS docente_id,
       (SELECT t.grado FROM titulos_docente t JOIN catalogos c ON c.tipo='nivel_estudios' AND c.valor=t.grado
         WHERE t.docente_id=d.id AND t.estatus='Titulado' ORDER BY c.orden DESC LIMIT 1)          AS nivel_estudios,
       EXISTS (SELECT 1 FROM titulos_docente t WHERE t.docente_id=d.id AND t.estatus='Estudios en curso') AS estudia_actualmente,
       (SELECT t.grado FROM titulos_docente t WHERE t.docente_id=d.id AND t.estatus='Estudios en curso'
         ORDER BY t.id DESC LIMIT 1)                                                             AS nivel_estudiando
FROM docentes d;
 
-- 3FN: fecha de nacimiento, edad y género calculados de la CURP
CREATE VIEW IF NOT EXISTS v_docente_curp AS
SELECT c.docente_id,
       c.curp,
       c.fecha_nacimiento,
       CASE WHEN c.fecha_nacimiento IS NOT NULL THEN
         (CAST(strftime('%Y', 'now', 'localtime') AS INTEGER) - CAST(strftime('%Y', c.fecha_nacimiento) AS INTEGER))
         - (strftime('%m-%d', 'now', 'localtime') < strftime('%m-%d', c.fecha_nacimiento))
       END AS edad,
       c.genero
FROM (
  SELECT id AS docente_id,
         curp,
         CASE WHEN LENGTH(curp) = 18
               AND substr(curp,5,6) NOT GLOB '*[^0-9]*'
               AND date((CASE WHEN substr(curp,17,1) GLOB '[0-9]' THEN '19' ELSE '20' END)
                        || substr(curp,5,2) || '-' || substr(curp,7,2) || '-' || substr(curp,9,2))
                   = (CASE WHEN substr(curp,17,1) GLOB '[0-9]' THEN '19' ELSE '20' END)
                        || substr(curp,5,2) || '-' || substr(curp,7,2) || '-' || substr(curp,9,2)
              THEN (CASE WHEN substr(curp,17,1) GLOB '[0-9]' THEN '19' ELSE '20' END)
                        || substr(curp,5,2) || '-' || substr(curp,7,2) || '-' || substr(curp,9,2)
         END AS fecha_nacimiento,
         CASE WHEN LENGTH(curp) = 18 THEN
           CASE substr(curp,11,1) WHEN 'H' THEN 'M' WHEN 'M' THEN 'F' END
         END AS genero
  FROM docentes
) c;
 
CREATE INDEX IF NOT EXISTS idx_docentes_activo   ON docentes(activo);
CREATE INDEX IF NOT EXISTS idx_docentes_nombre   ON docentes(apellido_paterno, nombres);
CREATE INDEX IF NOT EXISTS idx_docentes_campo    ON docentes(campo_formacion);
CREATE INDEX IF NOT EXISTS idx_asig_periodo      ON asignaturas(periodo_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_asig_materia      ON asignaturas(materia_id);
CREATE INDEX IF NOT EXISTS idx_horarios_asig     ON horarios(asignatura_id, dia_semana);
CREATE INDEX IF NOT EXISTS idx_titulos_docente   ON titulos_docente(docente_id, estatus);