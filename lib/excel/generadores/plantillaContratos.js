/**
 * Plantilla prellenada CONTRATOS_<PERIODO>.xlsx (07 §7.3): hoja 'Contratos' con
 * CRN · Materia · Grupo · Nómina · Docente · Contrato. La coordinadora solo llena Contrato.
 */
const XLSX = require('xlsx');

const ENCABEZADOS = ['CRN', 'Materia', 'Grupo', 'Nómina', 'Docente', 'Contrato'];

/** filas = [{ crn, materia, numeroGrupo, nomina, docente, numContrato }] → Buffer .xlsx */
function generar(filas) {
  const datos = [ENCABEZADOS, ...filas.map((f) => [f.crn ?? '', f.materia ?? '', f.numeroGrupo ?? '', f.nomina ?? '', f.docente ?? '', f.numContrato ?? ''])];
  const hoja = XLSX.utils.aoa_to_sheet(datos);
  // CRN, Nómina y Contrato como TEXTO para que Excel no les quite ceros ni los vuelva números científicos.
  for (let r = 1; r < datos.length; r++) {
    for (const c of [0, 3, 5]) {
      const ref = XLSX.utils.encode_cell({ r, c });
      if (hoja[ref]) Object.assign(hoja[ref], { t: 's', z: '@' });
    }
  }
  hoja['!cols'] = [{ wch: 8 }, { wch: 42 }, { wch: 7 }, { wch: 12 }, { wch: 34 }, { wch: 12 }];
  hoja['!autofilter'] = { ref: `A1:F${Math.max(datos.length, 1)}` };
  const libro = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(libro, hoja, 'Contratos');
  return XLSX.write(libro, { type: 'buffer', bookType: 'xlsx' });
}

module.exports = { generar, ENCABEZADOS };
