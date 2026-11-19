const test = require('node:test');
const assert = require('node:assert/strict');
const curp = require('../lib/curp');

// CURP ficticias con dígito verificador correcto (no son de personas reales).
const MUJER_1995 = 'LORM950208MVZPZR00';
const HOMBRE_1956 = 'GODE561231HDFRRN00';
const MUJER_2005 = 'PEGA050101MVZRRNA6';

test('validar: CURP correctas', () => {
  for (const c of [MUJER_1995, HOMBRE_1956, MUJER_2005]) {
    assert.deepEqual(curp.validar(c), { valida: true, curp: c, errores: [] });
  }
  assert.equal(curp.validar(' lorm950208mvzpzr00 ').valida, true); // limpia espacios y minúsculas
});

test('validar: errores detectados', () => {
  assert.deepEqual(curp.validar('LORM950208').errores, ['LONGITUD']);
  assert.deepEqual(curp.validar('1ORM950208MVZPZR00').errores, ['FORMATO']);
  assert.deepEqual(curp.validar('LORM950208MXXPZR00').errores, ['ENTIDAD', 'DIGITO_VERIFICADOR']);
  assert.deepEqual(curp.validar('LORM950230MVZPZR00').errores, ['FECHA', 'DIGITO_VERIFICADOR']);
  // El ejemplo de 06_Especificacion_API trae un dígito verificador que no cuadra.
  assert.deepEqual(curp.validar('LORM950208MVZPZR09').errores, ['DIGITO_VERIFICADOR']);
  assert.equal(curp.validar(null).valida, false);
});

test('fechaNacimiento: el carácter 17 decide el siglo', () => {
  assert.equal(curp.fechaNacimiento(MUJER_1995), '1995-02-08');
  assert.equal(curp.fechaNacimiento(HOMBRE_1956), '1956-12-31');
  assert.equal(curp.fechaNacimiento(MUJER_2005), '2005-01-01');
  assert.equal(curp.fechaNacimiento('LORM950230MVZPZR00'), null);
});

test('genero: H → M, M → F', () => {
  assert.equal(curp.genero(MUJER_1995), 'F');
  assert.equal(curp.genero(HOMBRE_1956), 'M');
  assert.equal(curp.genero('XXXX000000XVZXXX00'), null);
});

test('edad: años cumplidos', () => {
  assert.equal(curp.edad('1995-02-08', '2026-11-10'), 31);
  assert.equal(curp.edad('1995-11-10', '2026-11-10'), 31); // cumple hoy
  assert.equal(curp.edad('1995-11-11', '2026-11-10'), 30); // cumple mañana
  assert.equal(curp.edad('2000-02-29', '2026-02-28'), 25);
  assert.equal(curp.edad('2030-01-01', '2026-11-10'), null);
  assert.equal(curp.edad(null, '2026-11-10'), null);
});

test('derivar: todo en una llamada (alta de docente sin fecha ni género)', () => {
  assert.deepEqual(curp.derivar(MUJER_1995, '2026-11-10'), {
    valida: true, curp: MUJER_1995, errores: [], fechaNacimiento: '1995-02-08', genero: 'F', edad: 31,
  });
});
