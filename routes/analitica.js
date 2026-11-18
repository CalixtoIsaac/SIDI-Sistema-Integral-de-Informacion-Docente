/**
 * Panel con gráficas (HU-15; 06 §Analítica). Solo lectura.
 *
 *  GET /api/analitica/kpis?periodoId=&quincenaId=   → docentes, quincena (faltas, descontado, pagado), semestre y OPINA
 *  GET /api/analitica/opina?periodoId=              → % por maestro (barras), promedio de maestros y del campus
 *  GET /api/analitica/distribucion-nivel?periodoId= → docentes por nivel que imparten (General / Bilingüe)
 *  GET /api/analitica/perfil-docentes?activo=       → género, nivel de estudios, campo de formación y antigüedad
 *  GET /api/analitica/faltas-por-motivo?periodoId=  → por motivo y por tipo (Asunto personal / Incapacidad médica)
 *  GET /api/analitica/cumpleanos-mes?mes=           → cumpleaños de docentes activos del mes
 */
const express = require('express');
const db = require('../lib/db');
const analitica = require('../services/analiticaService');
const { manejarErrores } = require('../lib/errores');

const router = express.Router();

router.get('/kpis', (req, res) => res.json(analitica.kpis(db, req.query)));
router.get('/opina', (req, res) => res.json(analitica.opina(db, req.query)));
router.get('/distribucion-nivel', (req, res) => res.json(analitica.distribucionNivel(db, req.query)));
router.get('/perfil-docentes', (req, res) => res.json(analitica.perfilDocentes(db, req.query)));
router.get('/faltas-por-motivo', (req, res) => res.json(analitica.faltasPorMotivo(db, req.query)));
router.get('/cumpleanos-mes', (req, res) => res.json(analitica.cumpleanosMes(db, req.query)));

router.use(manejarErrores);

module.exports = router;
