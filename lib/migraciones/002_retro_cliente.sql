-- =====================================================================
-- 002_retro_cliente.sql · SIDI · Retroalimentación del cliente (Uziel, BD)
-- Tarifa mensual, historial de bajas, contratos, y las consultas de
-- primer periodo, número de grupos y antigüedad.
--
-- Cambios por 3FN:
--   · recontratable ya no es columna de docentes → v_docente_recontratable
--   · la tarifa de cada asignatura sale de (horas, idioma) → v_asignatura_tarifa
-- =====================================================================
 
-- Columna calculada (no se guarda): semestre / 4
ALTER TABLE tipos_clase
  ADD COLUMN pago_mensual REAL GENERATED ALWAYS AS (ROUND(pago_semestre / 4.0, 2)) VIRTUAL;
 
-- 3FN: tarifa = tipo de clase con las mismas horas e idioma (sin coincidencia = "Sin tarifa")
CREATE VIEW IF NOT EXISTS v_asignatura_tarifa AS
SELECT a.id AS asignatura_id,
       t.id AS tipo_clase_id,
       t.nombre AS tipo_clase,
       t.pago_semestre,
       t.pago_mensual,
       t.pago_por_dia
FROM asignaturas a
LEFT JOIN tipos_clase t ON t.horas_semana = a.horas_semana AND t.idioma = a.idioma AND t.activo = 1;
 
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
 
CREATE TABLE IF NOT EXISTS contratos_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  filas INTEGER NOT NULL,
  actualizados INTEGER NOT NULL,
  con_aviso INTEGER NOT NULL DEFAULT 0,
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
 
-- 3FN: recontratable = valor de la última baja (sin bajas = no aparece)
CREATE VIEW IF NOT EXISTS v_docente_recontratable AS
SELECT b.docente_id, b.recontratable
FROM docente_bajas b
WHERE b.id = (SELECT b2.id FROM docente_bajas b2
              WHERE b2.docente_id = b.docente_id
              ORDER BY b2.fecha DESC, b2.id DESC LIMIT 1);
 
-- Primer semestre con clases (003 la amplía con OPINA)
CREATE VIEW IF NOT EXISTS v_docente_primer_periodo AS
SELECT d.id AS docente_id,
       MIN(p.fecha_inicio) AS primer_inicio
FROM docentes d
JOIN periodos p ON p.id = d.primer_periodo_id
   OR p.id IN (SELECT periodo_id FROM asignaturas WHERE docente_id = d.id)
GROUP BY d.id;
 
-- Número de grupos (CRN + actividades) del periodo actual
CREATE VIEW IF NOT EXISTS v_docente_grupos AS
SELECT d.id AS docente_id,
       COUNT(a.id) AS num_grupos
FROM docentes d
LEFT JOIN periodos p ON p.actual = 1
LEFT JOIN asignaturas a ON a.docente_id = d.id AND a.periodo_id = p.id
GROUP BY d.id;
 
-- Antigüedad en años y semestres desde el primer semestre con clases
CREATE VIEW IF NOT EXISTS v_docente_antiguedad AS
SELECT x.docente_id,
       x.primer_inicio,
       (CAST(strftime('%Y', 'now', 'localtime') AS INTEGER) - CAST(strftime('%Y', x.primer_inicio) AS INTEGER))
         - (strftime('%m-%d', 'now', 'localtime') < strftime('%m-%d', x.primer_inicio))           AS anios,
       (CAST(strftime('%Y', 'now', 'localtime') AS INTEGER) * 2
          + (CAST(strftime('%m', 'now', 'localtime') AS INTEGER) >= 8))
       - (CAST(strftime('%Y', x.primer_inicio) AS INTEGER) * 2
          + (CAST(strftime('%m', x.primer_inicio) AS INTEGER) >= 8)) + 1                          AS semestres
FROM (
  SELECT d.id AS docente_id,
         CASE WHEN pp.primer_inicio IS NOT NULL AND t.fecha IS NOT NULL THEN MIN(pp.primer_inicio, t.fecha)
              ELSE COALESCE(pp.primer_inicio, t.fecha) END AS primer_inicio
  FROM docentes d
  LEFT JOIN v_docente_primer_periodo pp ON pp.docente_id = d.id
  LEFT JOIN (
    SELECT id,
           CASE upper(substr(trim(primer_semestre_texto), 1, 3))
             WHEN 'ENE' THEN substr(trim(primer_semestre_texto), -4) || '-01-01'
             WHEN 'AGO' THEN substr(trim(primer_semestre_texto), -4) || '-08-01'
           END AS fecha
    FROM docentes
  ) t ON t.id = d.id
) x;
 
CREATE INDEX IF NOT EXISTS idx_bajas_docente   ON docente_bajas(docente_id, fecha);