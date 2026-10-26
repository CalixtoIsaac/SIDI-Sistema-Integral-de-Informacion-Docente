# Especificación de Pantallas UI/UX - SIDI
Responsable: Sebastián Huesca Ramírez · Validación con el cliente: Saraí Cecilio Rascón (PO)

> **Versión 2 (26/10/2026).** Sin pantalla de login, con Perfil (color y modo) y las vistas de faltas, incidencias, OPINA y reportes de Nacional.

## Principios
- Usuaria sin conocimientos técnicos: lenguaje claro, botones con icono + texto, nada de códigos técnicos en pantalla.
- Máximo 2 clics para cualquier consulta frecuente.
- **Apariencia formal:** fondos neutros; el **color principal** (rosa por defecto, elegido en Perfil) solo en acentos: botón primario, elemento activo del menú, enlaces, foco, barras de gráficas.
- Colores de estado **fijos** (no cambian con el tema): **verde** activo, **gris** inactivo, **rojo** faltas/alerta, **ámbar** pendiente.
- Confirmación antes de acciones masivas, de suspender, de reemplazar un OPINA o de cerrar una quincena.
- Se reutilizan los componentes de la plantilla (`UI.toast`, `UI.confirm`, `UI.formModal`, tarjetas, tablas).

## Layout general
Se abre directo en el Panel (sin login).
```
+---------------------------------------------------------------------------+
| [logo] SIDI · Sistema Integral de Información Docente  [🔍 Buscar]  [☀/🌙] |
+----------------+----------------------------------------------------------+
| 📊 Panel        |  ← primera vista al abrir                                |
| 👩‍🏫 Docentes     |                                                          |
| 📅 Faltas       |                                                          |
| 💵 Incidencias  |                                                          |
| ⭐ OPINA        |                                                          |
| 📄 Reportes     |                                                          |
| ⚙ Configuración |                                                          |
| ─────────────  |                                                          |
| 👤 Perfil       |  (abajo del menú, con el nombre configurado)             |
+----------------+----------------------------------------------------------+
```
Arriba de las vistas quincenales hay un selector de quincena: `Quincena: [Q16 · 16–31 ago 2026 ▾]` con chip **Abierta / Cerrada**.

## 1. Panel administrativo (primera vista)
```
+-----------------+ +-------------------+ +--------------------+ +-------------------+ +----------------+
| Docentes activos| | Faltas quincena   | | Descontado quinc.  | | Pagado a suplentes| | OPINA promedio |
|     43 / 45     | |        11         | |    $ 3,950.74      | |     $ 1,563.00    | |     87.6 %     |
+-----------------+ +-------------------+ +--------------------+ +-------------------+ +----------------+
Calificación OPINA por maestro (ENE-MAY 2026)        [periodo ▾]
 Maestro A  ████████████████████ 100 %
 Maestro B  ███████████████████  97 %
 ...
Docentes por nivel (General / Bilingüe)   Faltas por motivo   🎂 Cumpleaños del mes
```
Gráficas con Chart.js usando `--primary` para las barras y tonos neutros para el resto; se redibujan al cambiar tema o color.

## 2. Tabla de docentes
```
[🔍 Nombre, CURP, Nómina o CRN]  [☑ Solo semestre actual] Estatus[▾] Nivel[▾] Ordenar[Alfabético▾]
[+ Nuevo docente] [⬆ Subir Excel de maestros]
+--+--------------------+-----------+-----------+-----------+-------------+-------------+-------+-------+
|● | Nombre             | CURP      | F. nacim. | Cumpleaños| Nivel       | Títulos     | OPINA | Faltas|
+--+--------------------+-----------+-----------+-----------+-------------+-------------+-------+-------+
|🟢| José Félix Ramos   | RAFJ8001..| 01/01/1980| 1 de ene  | Bach. General| Maestría   | 98 %  |   0   |
|⚪| Heidi Castro Díaz  | —         | —         | —         | Bach. Bilingüe| —         | 91 %  |   2   |
+--+--------------------+-----------+-----------+-----------+-------------+-------------+-------+-------+
```
- Campos vacíos se muestran con "—" (docentes creados desde OPINA hasta que llegue el Excel de maestros) y una etiqueta discreta **"Datos incompletos"**.
- OPINA con menos de 10 respuestas: valor en gris con tooltip "Muestra insuficiente (n respuestas)".
- **Hover sobre el nombre** → resumen: Nómina `L03560330` · Contrato(s) · CRN del semestre.
- **Clic en el nombre** → datos extendidos debajo, con pestañas:
  1. Datos personales (nómina, CURP, nacimiento, edad, cumpleaños)
  2. Trayectoria académica y profesional (títulos, nivel, departamento, tipo de contrato)
  3. Asignaturas y horarios (CRN, materia, tipo de clase, contrato, días y horas)
  4. Faltas, descuentos y suplencias que cubrió
  5. OPINA (por periodo y por CRN; en 2026, desglose de los 5 reactivos; comentarios de alumnos)
- Botón **Suspender / Reactivar** con confirmación.

## 3. Captura de docentes
**Opción 1 – Formulario manual** en pasos: Datos personales → Laborales → Académicos → Asignaturas (CRN, materia, horas/semana, idioma, contrato) y horarios. La nómina acepta `3560330` o `L03560330` y muestra la forma normalizada.

**Opción 2 – Subir Excel de maestros** (⏳ formato pendiente):
```
Paso 1: [ Arrastra aquí tu archivo Excel ]
Paso 2: Confirma la información
  Se agregarán 48 maestros · 5 se actualizarán (ya existían desde OPINA)
   1. José Félix Ramos
   ...
  ⚠️ 2 duplicados (se omitirán)   ❌ 1 con error (fila 17: CURP inválida)
  ℹ️ Columnas no reconocidas: "Extensión" (se guardarán como datos adicionales)
Paso 3: [Cancelar]  [Confirmar y agregar 48 maestros]
```

## 4. Búsqueda
Una sola barra (también en la barra superior) que busca por nombre, CURP, nómina o CRN mientras se escribe. Chips de filtros activos con "✕" y "Limpiar filtros".

## 5. Faltas (descuentos de la quincena)
```
Quincena: [Q16 · 16–31 ago 2026 ▾]  (Abierta)                     [+ Registrar falta]
| Docente                  | Fecha      | CRN   | Tipo de clase   | Motivo                     | Descuento | Cubrió              |
| Alessandro Bruno Cámpoli | 17/08/2026 | 16434 | 3 h español     | Falta por asunto personal  |  $54.00   | —  [Asignar]        |
| Alessandro Bruno Cámpoli | 17/08/2026 | 17507 | 3 h español     | Falta por asunto personal  |  $54.00   | Vanessa Cervantes   |
...
Total descontado: $3,950.74 · Pagado a suplentes: $1,563.00 · Diferencia: $2,387.74
```
**Formulario "Registrar falta"** (modal):
1. Docente (buscador).
2. Fecha(s) de la falta (se pueden elegir varios días).
3. **CRN a los que faltó**: casillas con los grupos del docente en el semestre actual, cada uno con su tipo de clase y tarifa. Si el CRN no existe todavía, botón **"+ Agregar grupo"** (CRN, materia, horas/semana, idioma, contrato).
4. Motivo (catálogo), horas de la falta (8 h = día completo / 4 h = medio día), cuenta de cargo, ticket, ¿justificada?, observaciones.
5. Por cada CRN/día: **¿Quién cubrió?** (opcional, buscador de docentes).
6. Vista previa: *"Se registrarán 4 faltas · Descuento $263.00 · Se pagarán $263.00 a 4 suplentes"* → **Guardar**.

Opción **"Descuento manual"** (casos especiales, p. ej. coach con 14 días de faltas): periodo en texto, jornada, horas en texto y monto capturado.

## 6. Incidencias (pagos de la quincena)
```
Quincena: [Q16 ▾]                     [+ Nuevo pago] [⧉ Copiar pagos de la quincena anterior]
| Docente | Concepto (cc-nómina) | Motivo | Detalle | Importe total | Periodos | Por periodo | A partir de | Origen |
| …       | Sueldo Carga Académica | BB_Tutoreo | Tutoreo de 48 alumnos… | $10,960.00 | 9 | $1,217.78 | 30/08/2026 | Manual |
| …       | Flex Act. Acad de Apoyo | B2_Cap.Profr | Sustituyó al docente… | $54.00 | 1 | $54.00 | 30/08/2026 | 🔗 Suplencia |
```
- Las filas de suplencia se crean desde Faltas; aquí solo se ven (icono 🔗 que lleva a la falta).
- Formulario de pago: docente → contrato (lista de sus contratos o nuevo), cc-nómina, motivo, detalle, CeCo, PEP, orden interna (opcionales, con contador de caracteres 24/12), importe total, periodos, a partir de. Muestra el importe por periodo.

## 7. OPINA
```
[⬆ Subir archivo OPINA (.xlsx / .xlsb)]
Paso 2: Revisa
  Periodo detectado: ENE-MAY 2026 · Formato 2026 · 3,716 respuestas · 45 profesores · 146 grupos
  ☑ Solo grupos del campus Veracruz (excluye 2 respuestas de otros campus)
  ⚠️ 3 profesores no están registrados → se crearán como "Datos incompletos"
  ⚠️ Ya existe OPINA de este periodo → se reemplazará
Paso 3: [Cancelar] [Importar]

Ranking  [Periodo: ENE-MAY 2026 ▾]  [Comparar con: AGO-DIC 2024 ▾]
| # | Docente | % recomendación | Respuestas | Tendencia |
```

## 8. Reportes (Nacional)
```
Quincena: [Q16 · 16–31 ago 2026 ▾]
+-----------------------------------------+  +---------------------------------------------+
| DESCUENTO-PREPA Q16.xlsx                |  | INCIDENCIAS PREPA Q16.xlsx                  |
| 11 faltas · 3 docentes · $3,950.74      |  | 37 pagos · 3 docentes en Detalle            |
| [⬇ Descargar]                           |  | [⬇ Descargar]                               |
+-----------------------------------------+  +---------------------------------------------+
⚠️ Avisos antes de descargar: "2 faltas sin cuenta de cargo", "1 pago sin contrato"
[🔒 Cerrar quincena]  (ya se enviaron a Nacional; impide cambios)
```
Además: inasistencias por semestre (número de faltas, profesores que faltaron, faltas por motivo).

## 9. Configuración
- **Tarifas por tipo de clase** (tabla editable: pago al semestre, pago por día).
- Catálogos de Incidencias y Faltas (cc-nómina, motivos, CeCo, textos de situación/estatus).
- Periodos (cuál es el actual) y quincenas (fecha de pago).
- OPINA: muestra mínima y campus por defecto.
- **Respaldo**: descargar `app.db` / restaurar.

## 10. Perfil
```
Perfil
 Nombre que se muestra: [Coordinación de Docentes        ]

 Color principal
  (●) Rosa   ( ) Frambuesa   ( ) Ciruela   ( ) Azul marino   ( ) Verde azulado   ( ) Grafito
  ( ) Personalizado [#DB2777] [🎨]
      ⚠️ "Este color no tiene suficiente contraste; elige uno más oscuro."

 Apariencia
  ( ) Claro   ( ) Oscuro   (●) Automático (según tu computadora)

 Vista previa:  [ Botón principal ]  enlace  ▮▮▮ barra de gráfica   🟢 Activo  ⚪ Inactivo
                                                [Restablecer]  [Guardar]
```
- El cambio se ve **al instante** en la vista previa y en toda la app; "Guardar" lo persiste.
- El botón ☀/🌙 de la barra superior alterna claro/oscuro rápido y actualiza el Perfil.
- Rosa por defecto en claro `#DB2777`; en oscuro se usa un tono más claro derivado para el texto (`--primary-text`) para mantener contraste.
