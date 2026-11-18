const test = require('node:test');
const assert = require('node:assert/strict');
const periodosService = require('../services/periodosService');
const { crearBd } = require('./helpers/bd');

test('periodos: del más reciente al más antiguo con lo que tiene cargado (GET /periodos)', () => {
  const db = crearBd();
  const per = db.prepare('INSERT INTO periodos (clave, etiqueta_opina, fecha_inicio, actual) VALUES (?, ?, ?, ?)');
  const p25 = Number(per.run('AGO-DIC 2025', '2025 Ago - Dic', '2025-08-01', 0).lastInsertRowid);
  per.run('ENE-MAY 2026', '2026 Ene - May', '2026-01-01', 1);
  const docente = Number(db.prepare("INSERT INTO docentes (nomina, nombres, apellido_paterno) VALUES ('L09900001', 'Ana', 'Ruiz')").run().lastInsertRowid);
  const imp = Number(db.prepare("INSERT INTO opina_importaciones (periodo_id, archivo, version_formato, filas) VALUES (?, 'x.xlsx', 'v2', 1)").run(p25).lastInsertRowid);
  db.prepare("INSERT INTO opina_respuestas (importacion_id, periodo_id, docente_id, crn, recomienda) VALUES (?, ?, ?, '16001', 1)").run(imp, p25, docente);

  const lista = periodosService.listar(db);
  assert.deepEqual(lista.map((p) => [p.clave, p.actual, p.tieneOpina, p.tieneGrupos]),
    [['ENE-MAY 2026', true, false, false], ['AGO-DIC 2025', false, true, false]]);
});
