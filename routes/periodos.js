/**
 * Periodos (semestres) (06 §Catálogos). Solo lectura por ahora: los crean los importadores.
 *
 *  GET /api/periodos → { periodos: [{ id, clave, etiquetaOpina, fechaInicio, fechaFin, actual, tieneOpina, tieneGrupos }] }
 *                      del más reciente al más antiguo (selectores de OPINA, Panel e inasistencias)
 */
const express = require('express');
const db = require('../lib/db');
const periodosService = require('../services/periodosService');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.get('/', (req, res) => res.json({ periodos: periodosService.listar(db) }));

router.use(manejarErrores);

module.exports = router;
