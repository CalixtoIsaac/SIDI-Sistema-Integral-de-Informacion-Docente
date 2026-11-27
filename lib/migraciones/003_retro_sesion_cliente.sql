-- =====================================================================
-- 003_retro_sesion_cliente.sql · SIDI · retroalimentación de la sesión con la cliente (26/11/2026)
-- 1) Nueva justificación 'viaje_escolar' (falta Justificada sin folio IMSS, no se descuenta).
--    SQLite no puede cambiar un CHECK: se reconstruye la tabla faltas conservando ids y datos.
--    Con las llaves foráneas activas, borrar faltas borra en cascada sus suplencias: se respaldan
--    antes en una tabla temporal y se regresan al final (mismos ids).
-- 2) Las horas de la falta siempre son 8 horas = 1 día completo: se desactiva el medio día.
-- =====================================================================

CREATE TEMP TABLE suplencias_respaldo AS SELECT * FROM suplencias;

CREATE TABLE faltas_nueva (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER REFERENCES quincenas(id),   -- NULL = pendiente de reportar
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  asignatura_id INTEGER REFERENCES asignaturas(id),
  fecha TEXT,
  sesion INTEGER NOT NULL DEFAULT 1 CHECK (sesion IN (1,2)),
  fecha_texto TEXT,                               -- rango en descuentos manuales
  dias INTEGER NOT NULL DEFAULT 1 CHECK (dias >= 1),
  motivo TEXT NOT NULL,                           -- 'Falta por asunto personal' (no justificada) / 'Falta justificada'
  horas_texto TEXT NOT NULL DEFAULT '8 horas= 1 día completo',
  cuenta_cargo TEXT NOT NULL DEFAULT '5420103000',
  justificacion TEXT NOT NULL DEFAULT 'ninguna' CHECK (justificacion IN ('ninguna','incapacidad_imss','cita_imss','viaje_escolar')),
  folio_imss TEXT,                                -- solo incapacidad / cita IMSS
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

INSERT INTO faltas_nueva (id, quincena_id, docente_id, asignatura_id, fecha, sesion, fecha_texto, dias, motivo, horas_texto,
                    cuenta_cargo, justificacion, folio_imss, modo_calculo, tarifa_aplicada, monto_descuento, monto_editado,
                    comentario, ticket, situacion, estatus, observaciones, creado_en)
SELECT id, quincena_id, docente_id, asignatura_id, fecha, sesion, fecha_texto, dias, motivo, horas_texto,
       cuenta_cargo, justificacion, folio_imss, modo_calculo, tarifa_aplicada, monto_descuento, monto_editado,
       comentario, ticket, situacion, estatus, observaciones, creado_en
FROM faltas;

-- Conserva el contador de ids (no se reutilizan ids de faltas borradas)
DELETE FROM sqlite_sequence WHERE name = 'faltas_nueva';
INSERT INTO sqlite_sequence (name, seq) SELECT 'faltas_nueva', seq FROM sqlite_sequence WHERE name = 'faltas';

DROP TABLE faltas;
ALTER TABLE faltas_nueva RENAME TO faltas;

INSERT INTO suplencias (id, falta_id, docente_suplente_id, incidencia_id, monto)
SELECT id, falta_id, docente_suplente_id, incidencia_id, monto FROM suplencias_respaldo;
DROP TABLE suplencias_respaldo;

CREATE INDEX IF NOT EXISTS idx_faltas_quincena   ON faltas(quincena_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_faltas_pendientes ON faltas(fecha) WHERE quincena_id IS NULL;

-- Ya no hay medio día (4 horas): toda falta es de 8 horas = 1 día completo
UPDATE catalogos SET activo = 0 WHERE tipo = 'horas_falta' AND valor = '4 horas= 1/2 día';
