/**
 * Tarifas y catálogos (HU-18).
 *
 *  GET  /api/tipos-clase        → { tiposClase }  (pagoMensual calculado, solo lectura)
 *  PUT  /api/tipos-clase/:id    → { tipoClase }   { pagoSemestre, pagoPorDia, nombre, activo }
 *  GET  /api/catalogos?tipo=    → { catalogos }   (incluirInactivos=true para ver los dados de baja)
 *  POST /api/catalogos          → 201 { catalogo } { tipo, valor, descripcion, orden }
 *  PUT  /api/catalogos/:id      → { catalogo }
 *  DELETE /api/catalogos/:id    → 204 (baja lógica)
 */
const express = require('express');
const db = require('../lib/db');
const catalogosService = require('../services/catalogosService');
const { HttpError, manejarErrores } = require('../lib/errores');

function idValido(req, res, next, valor) {
  const id = Number(valor);
  if (!Number.isInteger(id) || id <= 0) return next(new HttpError(400, 'Id inválido.', 'ID_INVALIDO'));
  req.idRecurso = id;
  return next();
}

const tiposClase = express.Router();
tiposClase.param('id', idValido);
tiposClase.get('/', (req, res) => res.json({ tiposClase: catalogosService.tiposClase(db) }));
tiposClase.put('/:id', (req, res) => res.json({ tipoClase: catalogosService.actualizarTipoClase(db, req.idRecurso, req.body ?? {}) }));
tiposClase.use(manejarErrores);

const catalogos = express.Router();
catalogos.param('id', idValido);
catalogos.get('/', (req, res) => res.json({ catalogos: catalogosService.listar(db, req.query) }));
catalogos.post('/', (req, res) => res.status(201).json({ catalogo: catalogosService.crear(db, req.body ?? {}) }));
catalogos.put('/:id', (req, res) => res.json({ catalogo: catalogosService.actualizar(db, req.idRecurso, req.body ?? {}) }));
catalogos.delete('/:id', (req, res) => {
  catalogosService.desactivar(db, req.idRecurso);
  res.status(204).end();
});
catalogos.use(manejarErrores);

module.exports = { tiposClase, catalogos };
