-- =====================================================================
-- 003_opina.sql · SIDI · Encuestas OPINA (Uziel, BD)
-- Importaciones, respuestas por alumno y calificación por grupo y docente.
--
-- Cambios por 3FN:
--   · la respuesta guarda solo asignatura_id (periodo, docente y CRN salen de ahí)
--   · items (JSON) → tabla opina_respuesta_items
-- =====================================================================
 
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
 
-- 3FN: sin periodo_id, docente_id ni crn
CREATE TABLE IF NOT EXISTS opina_respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  importacion_id INTEGER NOT NULL REFERENCES opina_importaciones(id) ON DELETE CASCADE,
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  response_id TEXT,
  campus_grupo TEXT,
  recomienda INTEGER NOT NULL CHECK (recomienda IN (0,1)),
  por_que_si TEXT,
  por_que_no TEXT,
  comentario TEXT
);
 
-- 1FN: una fila por reactivo (antes JSON items)
CREATE TABLE IF NOT EXISTS opina_respuesta_items (
  respuesta_id INTEGER NOT NULL REFERENCES opina_respuestas(id) ON DELETE CASCADE,
  reactivo TEXT NOT NULL,
  valor TEXT NOT NULL,
  PRIMARY KEY (respuesta_id, reactivo)
);
 
-- % de recomendación por grupo
CREATE VIEW IF NOT EXISTS v_opina_crn AS
SELECT a.periodo_id, a.docente_id, a.crn,
       COUNT(*)                                AS respuestas,
       SUM(r.recomienda)                       AS positivas,
       ROUND(100.0 * SUM(r.recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas r
JOIN asignaturas a ON a.id = r.asignatura_id
GROUP BY a.periodo_id, a.docente_id, a.crn;
 
-- % global del docente por periodo (ponderado por alumnos)
CREATE VIEW IF NOT EXISTS v_opina_docente AS
SELECT a.periodo_id, a.docente_id,
       COUNT(*)                                AS respuestas,
       SUM(r.recomienda)                       AS positivas,
       ROUND(100.0 * SUM(r.recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas r
JOIN asignaturas a ON a.id = r.asignatura_id
GROUP BY a.periodo_id, a.docente_id;
 
-- Se recrea para incluir también los periodos con respuestas de OPINA
DROP VIEW IF EXISTS v_docente_primer_periodo;
CREATE VIEW v_docente_primer_periodo AS
SELECT d.id AS docente_id,
       MIN(p.fecha_inicio) AS primer_inicio
FROM docentes d
JOIN periodos p ON p.id = d.primer_periodo_id
   OR p.id IN (SELECT periodo_id FROM asignaturas WHERE docente_id = d.id)
   OR p.id IN (SELECT a.periodo_id FROM opina_respuestas r JOIN asignaturas a ON a.id = r.asignatura_id
               WHERE a.docente_id = d.id)
GROUP BY d.id;
 
CREATE INDEX IF NOT EXISTS idx_opina_asignatura ON opina_respuestas(asignatura_id);