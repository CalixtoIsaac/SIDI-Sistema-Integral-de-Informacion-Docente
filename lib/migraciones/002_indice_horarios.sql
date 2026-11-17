-- =====================================================================
-- 002_indice_horarios.sql · SIDI · HU-22 (Uziel, BD)
-- Índice para buscar docentes disponibles por día y hora (grupos a suplir).
-- El de 001 (asignatura_id, dia_semana) sirve para el horario de UN grupo;
-- este sirve para "¿quién da clase el martes a las 11:00?".
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_horarios_dia_hora ON horarios(dia_semana, hora_inicio);
