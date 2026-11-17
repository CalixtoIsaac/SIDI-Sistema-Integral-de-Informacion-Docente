/**
 * Quincenas (06 §Catálogos).
 *
 *  GET   /api/quincenas?anio=2026  → { quincenas } con faltas, descontado, incidencias y estado
 *  GET   /api/quincenas/actual     → { quincena } la de hoy
 *  GET   /api/quincenas/:id        → { quincena }
 *  PATCH /api/quincenas/:id        → { fechaPago } | { cerrada: true|false }
 */
const express = require('express');
const db = require('../lib/db');
const quincenasService = require('../services/quincenasService');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.get('/', (req, res) => res.json({ quincenas: quincenasService.listar(db, req.query) }));
router.get('/actual', (req, res) => res.json({ quincena: quincenasService.actual(db) }));
router.get('/:id', (req, res) => res.json({ quincena: quincenasService.obtener(db, req.params.id) }));
router.patch('/:id', (req, res) => res.json({ quincena: quincenasService.actualizar(db, req.params.id, req.body ?? {}) }));

router.use(manejarErrores);

module.exports = router;
