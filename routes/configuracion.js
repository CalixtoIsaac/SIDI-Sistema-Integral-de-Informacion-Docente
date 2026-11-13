/**
 * Configuración del perfil (HU-17; 06 §Sistema).
 *
 *  GET /api/configuracion  → { configuracion: { 'tema.modo', 'tema.color', 'perfil.nombre', 'opina.*', … } }
 *  PUT /api/configuracion  → { configuracion }  actualiza una o varias claves
 *                            (tema.color en #RRGGBB con contraste ≥ 4.5:1; tema.modo ∈ claro|oscuro|automatico)
 */
const express = require('express');
const db = require('../lib/db');
const configuracionService = require('../services/configuracionService');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.get('/', (req, res) => res.json({ configuracion: configuracionService.listar(db) }));
router.put('/', (req, res) => res.json({ configuracion: configuracionService.actualizar(db, req.body ?? {}) }));

router.use(manejarErrores);

module.exports = router;
