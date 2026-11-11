const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('../lib/horario');

test('duracionSesion: fin + 1 min, redondeo a 0.5 h (07 §7.0.1)', () => {
  assert.equal(h.duracionSesion('11:00', '12:29'), 1.5);
  assert.equal(h.duracionSesion('16:00', '17:35'), 1.5);
  assert.equal(h.duracionSesion('10:30', '11:29'), 1);
  assert.equal(h.duracionSesion('07:30', '08:59'), 1.5);
  assert.equal(h.duracionSesion('13:30', '15:00'), 1.5);
  assert.equal(h.duracionSesion('7:00', '8:59'), 2);
});

test('duracionSesion: horas inválidas', () => {
  assert.equal(h.duracionSesion('12:00', '11:00'), null);
  assert.equal(h.duracionSesion('25:00', '26:00'), null);
  assert.equal(h.duracionSesion('', '11:29'), null);
});

test('aMinutos: texto y fracción de día de Excel', () => {
  assert.equal(h.aMinutos('07:30'), 450);
  assert.equal(h.aMinutos('7:30:00'), 450);
  assert.equal(h.aMinutos(0.3125), 450); // 07:30 como número de Excel
  assert.equal(h.normalizarHora(0.479166666), '11:30');
  assert.equal(h.normalizarHora('9:05'), '09:05');
});

test('horasSemana: 3 h, 5 h y CRN con dos sesiones el mismo día', () => {
  const tresHoras = [
    { dia: 1, inicio: '07:30', fin: '08:59' },
    { dia: 4, inicio: '07:30', fin: '08:59' },
  ];
  assert.equal(h.horasSemana(tresHoras), 3);

  // Caso 16452: miércoles 11:00–12:29 y 13:30–15:00 (dos filas, mismo día)
  const dosSesionesMiercoles = [
    ...h.sesionesDeFila(['', '', 'SI', '', ''], '11:00', '12:29'),
    ...h.sesionesDeFila(['', '', 'SI', '', ''], '13:30', '15:00'),
  ];
  assert.equal(dosSesionesMiercoles.length, 2);
  assert.equal(h.horasSemana(dosSesionesMiercoles), 3);

  assert.equal(h.horasSemana([]), 0);
  assert.equal(h.horasSemana([{ dia: 1, inicio: 'x', fin: '08:59' }]), null);
});

test('sesionesDeFila: columnas Lunes–Viernes con SI', () => {
  const s = h.sesionesDeFila({ Lunes: 'SI', Martes: '', Miércoles: 'si', Jueves: null, Viernes: ' SI ' }, '9:00', '10:29');
  assert.deepEqual(s, [
    { dia: 1, inicio: '09:00', fin: '10:29' },
    { dia: 3, inicio: '09:00', fin: '10:29' },
    { dia: 5, inicio: '09:00', fin: '10:29' },
  ]);
});

test('idiomaSugerido y plan', () => {
  assert.equal(h.idiomaSugerido('BSMA2003', 'Teórica'), 'EN');
  assert.equal(h.idiomaSugerido('bscn3002', 'Teórica'), 'EN');
  assert.equal(h.idiomaSugerido('BSMA2001', 'Bachillerato Intercultural'), 'EN');
  assert.equal(h.idiomaSugerido('BSMA2001', 'Teórica'), 'ES');
  assert.equal(h.plan('Bachillerato Intercultural'), 'Bachillerato General Bilingüe');
  assert.equal(h.plan('Teórica'), 'Bachillerato General');
});

test('debeOmitirse: F61 y F62 en línea (configurable)', () => {
  assert.equal(h.debeOmitirse('F61'), true);
  assert.equal(h.debeOmitirse(' f62 '), true);
  assert.equal(h.debeOmitirse('611'), false);
  assert.equal(h.debeOmitirse(611), false);
  assert.equal(h.debeOmitirse('F63', 'F61,F62,F63'), true);
  assert.equal(h.debeOmitirse('F61', ''), false); // si se configura vacío, no se omite nada
});

test('seEmpalman: mismo día y horas cruzadas', () => {
  const a = { dia: 3, inicio: '11:00', fin: '12:29' };
  assert.equal(h.seEmpalman(a, { dia: 3, inicio: '12:00', fin: '13:29' }), true);
  assert.equal(h.seEmpalman(a, { dia: 3, inicio: '12:30', fin: '13:59' }), false); // consecutivas
  assert.equal(h.seEmpalman(a, { dia: 2, inicio: '11:00', fin: '12:29' }), false); // otro día
  assert.equal(h.seEmpalman(a, { dia: 3, inicio: '10:00', fin: '11:00' }), true);
});

test('diaSemana y nombreDia', () => {
  assert.equal(h.diaSemana('2026-08-17'), 1); // lunes
  assert.equal(h.diaSemana('2026-11-08'), 7); // domingo
  assert.equal(h.nombreDia(3), 'Miércoles');
  assert.equal(h.diaSemana('17/08/2026'), null);
});
