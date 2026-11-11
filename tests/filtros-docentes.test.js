const test = require('node:test');
const assert = require('node:assert/strict');
const docentesService = require('../services/docentesService');
const filtros = require('../services/filtrosDocentes');
const { crearEscenario } = require('./helpers/escenario');

function buscar(db, query) {
  return docentesService.listar(db, query, { filtrar: filtros.filtrar, hoy: '2026-11-11' }).docentes.map((d) => d.nomina);
}

test('búsqueda por nombre: sin acentos, parcial y en cualquier orden', () => {
  const { db } = crearEscenario();
  assert.deepEqual(buscar(db, { search: 'maria' }), ['L03500001']);
  assert.deepEqual(buscar(db, { search: 'RUIZ lóp' }), ['L03500001']);
  assert.deepEqual(buscar(db, { search: 'von putlitz' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: 'xyz' }), []);
  assert.equal(buscar(db, { search: '   ' }).length, 4);
});

test('búsqueda por nómina con o sin L0, por CURP y por CRN', () => {
  const { db } = crearEscenario();
  assert.deepEqual(buscar(db, { search: '3500002' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: 'L03500002' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: 'l0350000' }).length, 4); // prefijo: mientras escribe
  assert.deepEqual(buscar(db, { search: 'lorm9502' }), ['L03500001']);
  assert.deepEqual(buscar(db, { search: '16452' }), ['L03500002']);
  assert.deepEqual(buscar(db, { search: '1643' }), ['L03500003']);
});

test('la búsqueda se combina con activo', () => {
  const { db, ids } = crearEscenario();
  db.prepare('UPDATE docentes SET activo = 0 WHERE id = ?').run(ids.maria);
  assert.deepEqual(buscar(db, { search: 'maria', activo: 'true' }), []);
  assert.deepEqual(buscar(db, { search: 'maria', activo: 'false' }), ['L03500001']);
});

// ---------------------------------------------------------------- HU-06
function listar(db, query) {
  return docentesService.listar(db, query, { filtrar: filtros.filtrar, comparar: filtros.comparador(query), hoy: '2026-11-11' })
    .docentes.map((d) => d.nomina);
}

test('filtros: semestre actual, género, nivel de estudios, campo y estudiando (combinables)', () => {
  const { db, ids } = crearEscenario();
  db.prepare("UPDATE docentes SET genero = 'M' WHERE id = ?").run(ids.guillermo);
  // Alguien de OPINA sin grupos este semestre
  db.prepare("INSERT INTO docentes (nomina, nombres, apellido_paterno) VALUES ('L03500077', 'Sin', 'Grupos')").run();
  assert.equal(listar(db, {}).length, 5);
  assert.equal(listar(db, { semestreActual: 'true' }).length, 4);
  assert.deepEqual(listar(db, { genero: 'F' }), ['L03500001']);
  assert.deepEqual(listar(db, { genero: 'M,F' }), ['L03500001', 'L03500002']);
  assert.equal(listar(db, { genero: 'ninguno' }).length, 3);
  assert.deepEqual(listar(db, { nivelEstudios: 'Licenciatura' }), ['L03500001']);
  assert.equal(listar(db, { nivelEstudios: 'ninguno' }).length, 4);
  assert.deepEqual(listar(db, { campo: 'Ingeniería y Tecnología' }), ['L03500001']);
  assert.deepEqual(listar(db, { estudiando: 'true' }), ['L03500001']);
  assert.deepEqual(listar(db, { genero: 'F', estudiando: 'false' }), []);
  assert.deepEqual(listar(db, { nivelImparte: 'Bachillerato General Bilingüe' }), ['L03500003']);
});

test('filtros: rangos de antigüedad (semestres) y número de grupos', () => {
  const { db } = crearEscenario();
  assert.deepEqual(listar(db, { antiguedadMin: '5' }), ['L03500001']); // María: 9 semestres
  assert.deepEqual(listar(db, { gruposMin: '2' }), ['L03500001']);
  assert.equal(listar(db, { gruposMax: '1' }).length, 3);
  assert.deepEqual(listar(db, { antiguedadMax: '1', gruposMin: '1' }).sort(), ['L03500003', 'L03500005']); // Guillermo: 2 (OPINA ENE-MAY 2026)
});

test('orden por edad, antigüedad, grupos, nivel y OPINA; vacíos al final', () => {
  const { db, ids } = crearEscenario();
  db.prepare("UPDATE docentes SET fecha_nacimiento = '1980-01-01' WHERE id = ?").run(ids.ana);
  assert.deepEqual(listar(db, { ordenar: 'edad' }).slice(0, 2), ['L03500001', 'L03500003']);
  assert.deepEqual(listar(db, { ordenar: 'edad', orden: 'desc' }).slice(0, 2), ['L03500003', 'L03500001']);
  assert.equal(listar(db, { ordenar: 'grupos', orden: 'desc' })[0], 'L03500001');
  assert.equal(listar(db, { ordenar: 'antiguedad', orden: 'desc' })[0], 'L03500001');
  assert.deepEqual(listar(db, { ordenar: 'opina', orden: 'desc' }).slice(0, 2), ['L03500001', 'L03500002']);
  assert.equal(listar(db, { ordenar: 'nivelEstudios', orden: 'desc' })[0], 'L03500001');
  assert.deepEqual(listar(db, { ordenar: 'nombre', orden: 'desc' })[0], 'L03500002'); // Sosa
});

test('valores inválidos → 400 FILTRO_INVALIDO', () => {
  const { db } = crearEscenario();
  assert.throws(() => listar(db, { ordenar: 'color' }), { status: 400, code: 'FILTRO_INVALIDO' });
  assert.throws(() => listar(db, { gruposMin: 'muchos' }), { status: 400 });
  assert.throws(() => listar(db, { genero: 'X' }), { status: 400 });
});

test('rendimiento: 300 docentes filtrados y ordenados en menos de 500 ms', () => {
  const { db } = crearEscenario();
  const ins = db.prepare("INSERT INTO docentes (nomina, nombres, apellido_paterno, genero) VALUES (?, 'Docente', ?, 'F')");
  for (let i = 0; i < 300; i++) ins.run(`L0360${String(i).padStart(4, '0')}`, `Prueba${i}`);
  const inicio = process.hrtime.bigint();
  const r = listar(db, { search: 'docente', genero: 'F', ordenar: 'edad' });
  const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
  assert.equal(r.length, 300);
  assert.ok(ms < 500, `tardó ${ms} ms`);
});
