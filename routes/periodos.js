/**
 * Periodos (semestres) (06 §Catálogos). Los crean los importadores; aquí se marca el actual.
 *
 *  GET /api/periodos → { periodos: [{ id, clave, etiquetaOpina, fechaInicio, fechaFin, actual, tieneOpina, tieneGrupos }] }
 *                      del más reciente al más antiguo (selectores de OPINA, Panel e inasistencias)
 *  PUT /api/periodos/:id → { periodo }  { actual: true } marca el semestre actual · { fechaInicio, fechaFin } (ISO)
 */
const express = require('express');
const db = require('../lib/db');
const periodosService = require('../services/periodosService');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.get('/', (req, res) => res.json({ periodos: periodosService.listar(db) }));
router.put('/:id', (req, res) => res.json({ periodo: periodosService.actualizar(db, req.params.id, req.body ?? {}) }));

router.use(manejarErrores);

module.exports = router;
