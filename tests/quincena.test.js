const test = require('node:test');
const assert = require('node:assert/strict');
const q = require('../lib/quincena');

test('numeroQuincena: casos de 07 §0.1 (se numera por fecha de pago)', () => {
  assert.equal(q.numeroQuincena('2026-08-30'), 16); // Q16 se pagó el 30/08
  assert.equal(q.numeroQuincena('2026-09-15'), 17);
  assert.equal(q.numeroQuincena('2026-09-30'), 18);
  assert.equal(q.numeroQuincena('2026-10-15'), 19);
  assert.equal(q.numeroQuincena('2026-10-31'), 20);
  assert.equal(q.numeroQuincena('2026-01-01'), 1);
  assert.equal(q.numeroQuincena('2026-12-31'), 24);
});

test('numeroQuincena: acepta DD/MM/YYYY y Date', () => {
  assert.equal(q.numeroQuincena('30/08/2026'), 16);
  assert.equal(q.numeroQuincena(new Date(2026, 7, 16)), 16);
  assert.equal(q.numeroQuincena(new Date(2026, 7, 15)), 15);
});

test('numeroQuincena: fechas inválidas dan null', () => {
  for (const v of ['2026-02-30', '2026-13-01', 'hola', null, 20260830, new Date('x')]) {
    assert.equal(q.numeroQuincena(v), null, `valor: ${v}`);
  }
});

test('rangoQuincena y fecha de pago por defecto', () => {
  assert.deepEqual(q.rangoQuincena(2026, 16), { inicio: '2026-08-16', fin: '2026-08-31' });
  assert.deepEqual(q.rangoQuincena(2026, 3), { inicio: '2026-02-01', fin: '2026-02-15' });
  assert.deepEqual(q.rangoQuincena(2026, 4), { inicio: '2026-02-16', fin: '2026-02-28' });
  assert.deepEqual(q.rangoQuincena(2028, 4), { inicio: '2028-02-16', fin: '2028-02-29' }); // bisiesto
  assert.equal(q.fechaPagoPorDefecto(2026, 17), '2026-09-15');
  assert.equal(q.fechaPagoPorDefecto(2026, 16), '2026-08-31');
  assert.throws(() => q.rangoQuincena(2026, 0), RangeError);
  assert.throws(() => q.rangoQuincena(2026, 25), RangeError);
});

test('quincenasDelAnio: 24 quincenas continuas y sin huecos', () => {
  const lista = q.quincenasDelAnio(2026);
  assert.equal(lista.length, 24);
  assert.equal(lista[0].fechaInicio, '2026-01-01');
  assert.equal(lista[23].fechaFin, '2026-12-31');
  assert.equal(lista[15].etiqueta, 'Q16');
  for (const item of lista) {
    assert.equal(q.numeroQuincena(item.fechaInicio), item.numero);
    assert.equal(q.numeroQuincena(item.fechaFin), item.numero);
    assert.equal(item.fechaPago, item.fechaFin);
  }
});

test('quincenaDeFecha', () => {
  assert.deepEqual(q.quincenaDeFecha('2026-08-17'), {
    anio: 2026, numero: 16, inicio: '2026-08-16', fin: '2026-08-31',
  });
  assert.equal(q.quincenaDeFecha('nope'), null);
});
