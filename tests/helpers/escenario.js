/**
 * Escenario ficticio para probar la consulta de docentes:
 * Excel de grupos AGO-DIC 2026 (periodo actual) + OPINA ENE-MAY 2026 + datos capturados.
 */
const { crearBd } = require('./bd');
const { libro, excelGrupos, ENC_OPINA_V2, filaOpinaV2 } = require('./excel');
const gruposService = require('../../services/gruposService');
const opinaService = require('../../services/opinaService');

function idDe(db, nomina) {
  return db.prepare('SELECT id FROM docentes WHERE nomina = ?').get(nomina).id;
}

function crearEscenario() {
  const db = crearBd();
  gruposService.confirm(db, { previewId: gruposService.preview(db, { buffer: excelGrupos(), nombre: 'g.xlsx' }).previewId });
  db.prepare("UPDATE periodos SET actual = 1 WHERE clave = 'AGO-DIC 2026'").run();

  // OPINA del semestre anterior: María 11/12 (91.7 %), Guillermo 2/3 (muestra insuficiente)
  const filas = [
    ...Array.from({ length: 11 }, () => filaOpinaV2({})),
    filaOpinaV2({ rec: 'No' }),
    filaOpinaV2({ nomina: 'L03500002', profesor: 'Sosa Von Putlitz  Guillermo', crn: '15001' }),
    filaOpinaV2({ nomina: 'L03500002', profesor: 'Sosa Von Putlitz  Guillermo', crn: '15001' }),
    filaOpinaV2({ nomina: 'L03500002', profesor: 'Sosa Von Putlitz  Guillermo', crn: '15001', rec: 'No' }),
  ];
  opinaService.confirm(db, { previewId: opinaService.preview(db, { buffer: libro({ H: [ENC_OPINA_V2, ...filas] }), nombre: 'o.xlsx' }).previewId });

  const maria = idDe(db, 'L03500001');
  db.prepare(`UPDATE docentes SET curp = 'LORM950208MVZPZR00', fecha_nacimiento = '1995-02-08', genero = 'F',
              campo_formacion = 'Ingeniería y Tecnología', trabajo_externo = 'Despacho contable',
              primer_semestre_texto = 'AGO-DIC 2022', datos_adicionales = '{"idiomas":["Inglés C1"]}' WHERE id = ?`).run(maria);
  db.prepare("UPDATE asignaturas SET num_contrato = '5500001' WHERE docente_id = ?").run(maria);
  const t = db.prepare('INSERT INTO titulos_docente (docente_id, grado, institucion, estatus) VALUES (?, ?, ?, ?)');
  t.run(maria, 'Licenciatura', 'Universidad Ficticia', 'Titulado');
  t.run(maria, 'Maestría', 'Universidad Ficticia', 'Estudios en curso');
  return { db, ids: { maria, guillermo: idDe(db, 'L03500002'), ana: idDe(db, 'L03500003') } };
}

module.exports = { crearEscenario, idDe };
