/**
 * CV FICTICIOS en el formato "A1 CURRICULUM VITAE DOCENTES" (07 §7.1) para las pruebas.
 * Ningún dato es de una persona real.
 */
const { PDFDocument, StandardFonts } = require('pdf-lib');

const TEXTO_CV = [
  'A1 CURRICULUM VITAE DOCENTES',
  '1. DATOS GENERALES',
  '1.1 Datos personales',
  'Nombre: María López Ruiz',
  'Fecha de nacimiento: 8 de febrero de 1995',
  'Nacionalidad: Mexicana',
  'Estado civil: Soltera',
  'CURP: LORM950208MVZPZR00',
  'RFC: LORM950208XX1',
  'Domicilio: Calle Ficticia 123, Veracruz',
  'Teléfono: 2290000000',
  'Lugar laboral actual: Despacho Contable Ejemplo',
  'Correo personal: maria@example.com',
  'Correo institucional: maria.lopez@example.edu.mx',
  '1.2 Formación académica',
  '1.2.1 Formación académica (Licenciatura)',
  'Institución: Universidad Ficticia de Veracruz',
  'Ciudad: Veracruz',
  'Periodo: 2013-2017',
  'Estatus: Titulado',
  'Cédula: 12345678',
  '1.2.2 Formación académica (Especialidad con Diploma –Posgrado)',
  'Institución:',
  'Periodo:',
  'Estatus:',
  '1.2.3 Formación académica (Maestría)',
  'Institución:',
  'Instituto Ejemplo',
  'Periodo: 2025 a la fecha',
  'Estatus: Estudios en curso',
  '1.2.4 Formación académica (Doctorado)',
  'Institución:',
  '1.3 Cursos',
  '1.3.1 Curso',
  'Nombre del curso: Diseño instruccional',
  'Institución: Plataforma Ejemplo',
  'Horas: 40',
  '1.4 Idiomas',
  'Idioma: Inglés',
  'Grado de dominio: Avanzado',
  'Idioma: Francés',
  'Grado de dominio: Básico',
  '2. Experiencia docente',
  'Institución: Universidad Tecmilenio',
  'Asignatura: Matemáticas',
  'Periodo: Agosto 2022 a la fecha',
  'Institución: Colegio Ejemplo',
  'Periodo: Enero 2019',
  '3. Experiencia académico-administrativa',
  'Cargo: Coordinadora',
].join('\n');

/** PDF de 4 páginas: el CV en las 3 primeras (cortado en partes) y un "comprobante" al final. */
async function pdfCv(texto = TEXTO_CV) {
  const doc = await PDFDocument.create();
  const fuente = await doc.embedFont(StandardFonts.Helvetica);
  const lineas = texto.split('\n');
  const porPagina = Math.ceil(lineas.length / 3);
  for (let p = 0; p < 3; p++) {
    const pagina = doc.addPage([612, 1200]);
    lineas.slice(p * porPagina, (p + 1) * porPagina).forEach((l, i) => {
      pagina.drawText(l, { x: 40, y: 1160 - i * 18, size: 11, font: fuente });
    });
  }
  doc.addPage().drawText('COMPROBANTE ESCANEADO', { x: 40, y: 700, size: 11, font: fuente });
  return Buffer.from(await doc.save());
}

module.exports = { TEXTO_CV, pdfCv };
