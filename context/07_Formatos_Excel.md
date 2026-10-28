# Formatos Excel - SIDI
Responsables: Matías Hernández (lectura/escritura) · Uziel García (mapeo a BD) · Validación: Saraí Cecilio (PO)

> **Versión 2.3 (27/10/2026, noche):** se **cierran los pendientes** (§8: tarifa $54 final, Detalle con valores, contrato del suplente, fila de total, antigüedad) y se documentan los dos archivos nuevos: **Excel de grupos docentes** (§7) y **CV en PDF** (§7.1). Cambios marcados con 🆕🆕.
>
> **Versión 2.2 (27/10/2026):** incorpora las respuestas a los pendientes 2, 3 y 4, la **nota de campos de consulta del docente** (hoy §7.2) y el análisis de los archivos reales **Q16 a Q20** (10 archivos). Cambios marcados con 🆕.
>
> **Versión 2.1 (26/10/2026):** respuestas del cliente (tarifa $54, 4 meses, jornada = días, vínculo externo de Detalle, fórmula OPINA, contenido del Excel de maestros).
>
> Este documento describe **cada archivo real** que entregó el cliente: qué columnas trae, cómo se interpreta y qué hace el sistema con él. Es la fuente de verdad para los lectores (importación) y los generadores (exportación).

## 0. Resumen
| # | Archivo | Dirección | Frecuencia | ¿Formato modificable? | Estado |
|---|---|---|---|---|---|
| 1 | `DESCUENTO-PREPA Qnn.xlsx` | **Salida** (el sistema lo genera) | Quincenal | **No** (lo exige Nacional) | ✅ Recibido 🆕 **Q16–Q20** |
| 2 | `INCIDENCIAS PREPA Qnn.xlsx` | **Salida** (el sistema lo genera) | Quincenal | **No** (lo exige Nacional) | ✅ Recibido 🆕 **Q16–Q20** |
| 3 | 🆕🆕 `GRUPOS_DOCENTES_<PERIODO>.xlsx` (información de maestros) | **Entrada** (se importa) | Al inicio del semestre / cambios de carga | No aplica (solo lectura) | ✅ Recibido (AGO-DIC 2026) — §7 |
| 4 | 🆕🆕 CV de docentes (`.pdf`, formato "A1 CURRICULUM VITAE DOCENTES") | **Entrada** (se importa) | Altas / actualización | No aplica (solo lectura) | ✅ Recibidos (37) — §7.1 |
| — | `OPINA <periodo>.xlsx / .xlsb` | **Entrada** (se importa) | Semestral | No aplica (solo lectura) | ✅ Recibido (3 periodos) |
| — | Tabla de pagos por tipo de clase | Catálogo inicial (`tipos_clase`) | Al cambiar tarifas | Editable en el sistema | ✅ Recibido |

**Hoy ambos formatos de salida se llenan a mano.** El objetivo es que la coordinadora registre faltas, suplencias y pagos en SIDI y descargue los dos archivos ya llenos, idénticos a los que hoy envía.

🆕 **Formato confirmado:** los 5 pares de archivos (Q16–Q20) tienen exactamente los mismos encabezados, fuentes, colores, anchos de columna y formatos numéricos. Las únicas diferencias son de captura manual (ver §3.3 y §4.4). Q16 sigue siendo el caso de prueba principal; Q17–Q20 sirven como casos de prueba adicionales.

### 0.1 Numeración de quincenas 🆕 (aclarado con Q16–Q20)
`Qnn` = número de la **quincena de pago** del año (Q1 = 1–15 ene … Q16 = 16–31 ago … Q24 = 16–31 dic). Fórmula: `Q = (mes − 1) × 2 + (día ≤ 15 ? 1 : 2)`, aplicada a la **fecha de pago**, no a la fecha de la falta.

| Archivo | Fecha de pago ("A partir de qué periodo") | Fechas de falta que incluye |
|---|---|---|
| Q16 | 30/08/2026 | 03/08 – 18/08 |
| Q17 | 15/09/2026 | 19/08 – 04/09 |
| Q18 | 30/09/2026 | 03/09 – 18/09 |
| Q19 | 15/10/2026 | 14/09 – 02/10 |
| Q20 | 31/10/2026 | 25/09 – 19/10 |

**Consecuencia para el diseño:** un archivo Qnn **no** contiene solo faltas de esa quincena; incluye todas las faltas y suplencias **aún no reportadas** hasta la fecha de corte (hay faltas que se reportan 2–3 semanas después). Por eso:
- Cada falta y cada incidencia guarda la quincena en la que **se reporta** (`quincena_id`), que se asigna al generar los archivos, no se calcula de la fecha.
- Al generar Qnn, SIDI propone todo lo **pendiente de reportar** con fecha ≤ fin de la quincena; la coordinadora puede quitar elementos para dejarlos a la siguiente.
- Al cerrar la quincena, esos registros quedan bloqueados (ya existe `quincenas.cerrada`).
- `fecha_pago` es editable: el día 15 o el último día del mes (en Q16 se usó 30/08 en lugar de 31/08).

---

## 1. Nómina: regla de normalización (aplica a TODOS los archivos)
La misma persona aparece con nómina escrita de 3 formas:

| Archivo | Ejemplo | Forma |
|---|---|---|
| OPINA | `L03560330`, `L00019011` | Texto `L` + 8 dígitos |
| Descuentos | `3560330` | Número **sin "L0"** (lo dice el encabezado) |
| Incidencias | `3560330`, `19011` | Número sin `L` ni ceros a la izquierda |

- **En BD se guarda canónica:** `'L' + dígitos rellenados a 8` → `19011` ⇒ `L00019011`.
- **Al exportar** Descuentos/Incidencias: se escribe el número sin `L` y sin ceros (`19011`), como **número**, no texto.
- Validado: 17 de 20 nóminas de Incidencias y la de Descuentos coinciden con OPINA al normalizar.

## 2. Nombres
- OPINA: `Apellidos␣␣Nombres` (dos espacios separan apellidos de nombres), p. ej. `Carbajal Sardá  Pablo de Jesús`. Se usa para separar los campos al importar.
- Descuentos/Incidencias: `Nombres Apellidos` (p. ej. `Pablo de Jesús Carbajal Sardá`).
- En BD: `nombres`, `apellido_paterno`, `apellido_materno`; cada formato arma el nombre en su orden. Se recortan espacios sobrantes (los originales traen espacios al inicio y al final, dobles espacios, nombres pegados como *"Frida IsabelPaz Gómez"* y nombres duplicados del tipo *"Yerikc David Ramírez Villagomez Yerikc David"*; todo es error de captura).

---

## 3. DESCUENTO-PREPA Qnn.xlsx (salida)
Hoja única **`Descuentos`**. Encabezado en la fila 1, un registro por fila desde la fila 2. Encabezado gris (`FFD9D9D9`), Comic Sans 8 pt; datos Calibri 8 pt; columnas con anchos fijos. Sin tablas de Excel, sin celdas combinadas. Fecha con formato `mm-dd-yy` (Excel la muestra según la configuración regional) y K con formato moneda `$`.

| Col | Encabezado original | Ejemplo | Origen en SIDI |
|---|---|---|---|
| A | Nomina (Sin L0) | `3560330` | `docentes.nomina` sin `L` ni ceros |
| B | Contrato | `5568351` | `asignaturas.num_contrato` (**el contrato es por CRN**, no por docente) |
| C | Nombre (Completo) | `Alessandro Bruno Cámpoli` | Nombres + apellidos |
| D | Jornada de trabajo (turno que tenía en la fecha de la falta) | `1`, `14` | `faltas.dias` — **número de días** de la falta (confirmado). `1` en cada falta normal (una fila por día); en descuento manual, los días del rango (p. ej. `14`) |
| E | Fecha de la falta (dd/mm/aaaa) (1 registro por cada falta) | `17/08/2026` | `faltas.fecha` (fecha real); en casos especiales texto `03/08/2026 al 16/08/2026` |
| F | Motivo de falta (Falta/Suspensión) | `Falta por asunto personal` | `faltas.motivo` (catálogo) |
| G | total de horas de la falta (8 h = 1 día; 4 h = ½ día) | `8 horas= 1 día completo` | `faltas.horas_texto` (catálogo) |
| H | Cuenta de cargo (10 dígitos) | `5420103000` | `faltas.cuenta_cargo` (CeCo) |
| I | Comentarios | `CRN 16434 de 3 horas a la semana, a descontar 54.00 = 54.00` | **Texto generado** (ver §3.1) |
| J | Ticket | (vacío) | `faltas.ticket` |
| K | *(sin encabezado)* | `54` | `faltas.monto_descuento` (formato moneda `$`) |
| L | No. De contrato | (vacío) | Se deja vacío (así viene en los 5 archivos) |

### 3.1 Regla del descuento (confirmada con el archivo real)
- **Un registro por cada CRN y por cada día de falta.** Si el docente faltó un día y ese día tenía 4 grupos, son 4 filas.
- `monto = tipos_clase.pago_por_dia` del CRN (según horas a la semana + idioma). Ejemplos reales: CRN de 5 h español → **$90**; 3 h inglés → **$65**; 3 h español → **$54** (✅ respuesta final; los $53 de Q20 fueron errores de captura).
- Comentario generado: `CRN {crn} de {horas} horas a la semana, a descontar {monto} = {monto}`.
- 🆕 **Actividades sin CRN — "Ruta exploratoria":** también se descuentan y se cubren. Aparecen con el mismo contrato que un CRN del docente y el comentario `Ruta exploratoria de 5 horas a la semana, a descontar 90.00 = 90.00` (se paga como clase de 5 h en español). → En SIDI, una asignatura puede ser un **CRN** o una **actividad** (sin CRN, con nombre, horas e idioma); el comentario usa el nombre de la actividad en lugar de `CRN {crn}`.
- 🆕 **Solo se descuenta la falta no justificada.** Las faltas con **incapacidad o cita del IMSS** **no** van a Descuentos, pero el suplente **sí** se paga y la falta aparece en `Detalle` con descontado = 0 (ver §4.2). Los permisos personales se descuentan aunque se hayan avisado con anticipación (viaje avisado desde la contratación, funeral, hijo enfermo, accidente vehicular, etc.).
- **Casos especiales** (ej. Q16 fila 12: coach con faltas injustificadas del 03 al 16/08, 14 días, `6 horas= 14 días`, motivo `Falta injustificadas`, **$3,183.74**): no salen de la tabla de tarifas. El sistema permite **"descuento manual"**: rango de fechas en texto, horas en texto y monto capturado a mano.
- 🆕 El monto de cada fila debe poder **editarse antes de generar** (en los archivos reales hay montos que no coinciden con la tabla, ver §3.3). SIDI propone el de la tabla y avisa si se cambia.

### 3.2 Totales 🆕
- Q17, Q18 y Q19 traen una fila extra al final con `=SUM(K2:Kn)` **solo en la columna K** (sin texto). Q16 y Q20 no la traen.
- 🆕🆕 ✅ **Confirmado:** SIDI agrega **siempre** esa fila de total. `Detalle` ya no depende de las filas de Descuentos (escribe valores, §4.3).

### 3.3 Inconsistencias encontradas en los archivos reales 🆕
No se replican; sirven para justificar validaciones en SIDI.
| Caso | Archivo | Qué pasa | Qué hace SIDI |
|---|---|---|---|
| Horas del CRN distintas entre quincenas | Q17 vs Q20 | CRN 15976 dice "3 horas" en Q17 y "5 horas" en Q20; CRN 17934 dice "5 horas" en Q17 y "4 horas" en Q20 | Las horas salen de la asignatura, siempre iguales |
| Horas y monto que no cuadran | Q17 | CRN 16025 "de 5 horas … a descontar 54.00" | El texto y el monto salen del mismo tipo de clase |
| Montos fuera de tabla | Q17–Q20 | 4 h español: $68 (Q17), $69 (Q19), $70 (Q20); 5 h inglés: $107 (Q17) y $106 (Q20); CRN 17934: $82 (Q17) y $85 (Q20); 3 h español $53 (Q20) | ✅ Confirmado: **errores de captura**. Monto de la tabla + edición con aviso |
| Mismo CRN y mismo día dos veces | Q17 | Anabel Ávila, CRN 16452 el 19/08 en dos filas ($54 c/u); en Incidencias lo cubren dos suplentes distintos. 🆕🆕 El Excel de grupos muestra que ese CRN tiene **dos sesiones los miércoles** | ✅ Caso especial aislado: se permite una 2ª falta del mismo CRN y día con confirmación (`sesion = 2`) |
| Contrato con forma `1` + nómina | Q17, Q20 | `100019011` (nómina 19011), `103028312` (nómina 3028312) | Se acepta cualquier contrato; no se valida longitud fija de 7 dígitos |
| Espacios y textos variables | todos | Espacios dobles, al inicio, punto final opcional en comentarios | El texto generado siempre sale limpio |

---

## 4. INCIDENCIAS PREPA Qnn.xlsx (salida)
Dos hojas: **`Incidencia`** y **`Detalle`** (🆕 en Q17–Q20 se llama **`detalle`**, en minúsculas). Fuente Aptos Narrow.

### 4.1 Hoja `Incidencia` — pagos adicionales del docente en la quincena
- **A1:** texto fijo *"Ruta para enviar solicitudes: Mitec / Entorno del Centro de Experiencia y servicios mi Compensación / … / Incidencias de nómina"* (no se toca).
- **Fila 2:** encabezados. **Fila 3 vacía.** Datos desde la fila 4.
- Los datos están en una **tabla de Excel `Tabla17`** (estilo `TableStyleMedium2`) con fórmulas de referencia estructurada.

| Col | Encabezado | Ejemplo | Origen en SIDI |
|---|---|---|---|
| A | Nómina | `3028312` | Nómina sin `L` ni ceros |
| B | # Contrato | `3077466` | Contrato del docente para ese concepto (🆕 **puede ir vacío**: en Q20 dos suplentes no traen contrato). 🆕🆕 En suplencias: **cualquiera de los contratos del suplente** (§8 #15) |
| C | Nombre | `Eduardo Jesús Zanata Zarate` | Nombres + apellidos |
| D | Tipo de contrato | `determinado` | `docentes.tipo_contrato` (en los 5 archivos siempre `determinado`) |
| E | Propuesta de cc-nómina | `Sueldo Carga Académica` | Catálogo `cc_nomina` |
| F | Motivo | `BB_Tutoreo (Preparatoria).` | Catálogo `motivos_incidencia` |
| G | Detalle del Pago (actividad, fecha, horario, tabulador) | `Tutoreo de 48 alumnos de 1er semestre` | Texto libre o **generado** para suplencias |
| H | CeCo (10 caracteres) | `5420103000` | Catálogo `cuentas_cargo` |
| I | ELEMENTO PEP (24 caracteres incluyendo guión) | (vacío) | Opcional |
| J | ORDEN INTERNA (12 caracteres) | (vacío) | Opcional |
| K | Importe Total | `10960` | `incidencias.importe_total` |
| L | No. de periodos a repartir el pago | `9` | `incidencias.num_periodos` |
| M | Importe por Periodo | `=Tabla17[[#This Row],[Importe Total]]/Tabla17[[#This Row],[No. de periodos a repartir el pago]]` | **Se conserva la fórmula** (cuando `num_periodos = 1` el original trae el valor directo; ambos válidos) |
| N | A partir de qué periodo (dd/mm/aaaa) | `30/08/2026` | `quincenas.fecha_pago` de la quincena que se genera (✅ confirmado: el `30/01/2026` de Q16 fue error de captura) |

**Tipos de pago encontrados (catálogos iniciales):**

| cc-nómina (E) | Motivo (F) | Ejemplo de detalle | Importe típico | Periodos | CeCo |
|---|---|---|---|---|---|
| Sueldo Carga Académica | `BB_Tutoreo (Preparatoria).` | Tutoreo de 48 alumnos de 1er semestre | $10,960 | 9 | 5420103000 |
| Sueldo Carga Académica | `B2_Cap.Profr(CADI Asore, Compet.)` | PAD de 12 profesores | $16,463 | 9 | 5420103000 |
| Imp.Clase Artis.Cult.yDep | `D1_Activ. Artísticas, Cult Y Dep.` | Coach de sociedad Agua con 130 alumnos 20 HRS | $3,400 | 8 | 5422101001 |
| Flex Act. Acad de Apoyo | `LB_Impart CursoTallGral` | Instructor Taller Ruta Exploratoria … | $11,760 | 9 (🆕 **7** en Q17: talleres que inician a mitad de semestre) | 5420103000 |
| Flex Act. Acad de Apoyo | `LB_Impart CursoTallGral` | Instructor de taller de inducción NI – Aleks | $1,176 | 1 | 5420103000 |
| Flex Act. Acad de Apoyo | `B2_Cap.Profr(CADI Asore, Compet.)` | **Suplencia** (ver abajo) | = monto descontado al titular | 1 | 5420103000 |
| Flex Act. Acad de Apoyo | `B2_Cap.Profr(CADI Asore, Compet.)` | Cubre a coach de gimnasio … por faltas injustificadas | $796 | 1 | 5422101001 |

🆕 Los pagos recurrentes (tutoreo, PAD, coach, talleres) aparecen **solo en la quincena en que se dan de alta** (Q16 y Q17); de Q18 a Q20 la hoja solo trae suplencias. → No se repiten cada quincena: se capturan una vez con su número de periodos.

**Suplencias (se generan solas a partir de la falta):** cuando se registra una falta y se indica quién cubrió, SIDI crea la incidencia del suplente con el mismo monto que se descontó al titular (✅ confirmado: **siempre es igual**) y este texto:
```
Sustituyó al docente {titular}, nómina: {L0nnnnnnn} CRN {crn} de {h} horas a la semana, del día {d} de {mes}, a pagar 1 día. 1 día* {tarifa} = {monto} {motivo/observaciones}
```
(En este campo la nómina del titular **sí** va con `L0`.)

🆕 **Agrupación por varios días** (Q17, Q18, Q19): si el **mismo suplente** cubre el **mismo CRN** del **mismo titular** en varios días, va **una sola fila** con el total:
```
… CRN 16101 de 5 horas a la semana, del 1 al 4 de septiembre, a pagar 4 días. 4 días* 90.00 = 360.00 …
… CRN 17934 de 4 horas a la semana, del día 24, 25, 27 y 28 de agosto, a pagar 4 días. 4 días* 82.00 = 328.00 …
… CRN 16397 de 5 horas a la semana, del día 01 y 02 de octubre, a pagar 2 días. 2 días* 90.00 = 180.00 …
```
Reglas del texto de fechas: días consecutivos → `del {d1} al {dn} de {mes}`; no consecutivos → `del día {d1}, {d2} y {dn} de {mes}`. Si los días son de meses distintos se generan filas separadas por mes. La agrupación es opcional (casilla "agrupar días" al generar, por defecto **sí**), porque en Q16 y Q20 se capturó un día por fila.

🆕 Variantes que el generador debe soportar en el texto:
- Actividad sin CRN: `…nómina: L03577730 Ruta exploratoria de 5 horas a la semana, …`
- Clase en inglés: en algún caso se escribe `CRN 17515 bilingue de 3 horas…` (opcional; SIDI puede omitir "bilingue").
- Las observaciones (motivo del permiso, folio de incapacidad del IMSS) son texto libre de la falta.

### 4.2 Hoja `Detalle` — conciliación descuentos vs. suplencias
| Col | Encabezado | Cálculo |
|---|---|---|
| A | No. De nomina | Docente que faltó |
| B | Nombre del docente | |
| C | Cantidad descontada total | Suma de sus filas en Descuentos, 🆕🆕 **escrita como valor** (🆕 **0** si la falta fue justificada por IMSS) |
| D | Cantidad a pagar a docentes que cubrieron | Suma de las incidencias de suplencia ligadas a sus faltas |
| E | Diferencia | `C − D` (🆕 negativa cuando no hubo descuento pero sí se pagó suplente) |
| F | Situación | Texto (catálogo) |
| G | Estatus | Texto (catálogo) |
| — | Última fila | `Total` con `SUM` de C, D y `=C−D` en E |

🆕 **Catálogo Situación / Estatus** (de Q16–Q20):
| Caso | Situación (F) | Estatus (G) |
|---|---|---|
| Permiso personal | `Se hace descuento correspondiente por permiso personal sin justificación.` | `Se descuenta y se toma la falta correspondiente.` |
| Incapacidad IMSS | `No se hace descuento correspondiente por incapacidad del IMSS` | `No se descuenta y no se toma la falta correspondiente.` |
| Cita médica IMSS | `No se hace descuento correspondiente por cita médica IMSS` | `No se descuenta y no se toma la falta/permiso con goce correspondiente.` |

→ La falta guarda un **tipo de justificación** (`ninguna`, `incapacidad_imss`, `cita_imss`) con folio opcional; de ahí salen si se descuenta y los textos de F y G. Una fila por docente que faltó en la quincena, aunque no se le haya descontado.

### 4.3 Reglas de generación (para no "romper" el formato)
1. Se parte de una **plantilla vacía** guardada en `templates/` (copia del original sin datos). Nunca se crea el archivo desde cero. 🆕🆕 La plantilla se toma de **Q19** (hoja `detalle` en minúsculas, columna C con valores) y se le **quitan los vínculos externos residuales** (`externalLinks/`, `INCIDENCIAS PREPA-Q22.xlsx`) para que Excel no muestre el aviso "Actualizar vínculos" al abrirla. Lo visible no cambia.
2. Solo se escriben valores en celdas; se conservan fuentes, anchos, formatos de número, el texto de A1 y el estilo de tabla.
3. **`Tabla17` se redimensiona** al número de filas generadas. 🆕 En los 5 archivos reales la tabla está mal dimensionada (Q16 `A2:N36` con datos hasta la 40; Q17 `A2:N10` hasta la 43; Q18–Q20 `A2:N3` hasta la 11, 17 y 30). Nacional los acepta así, pero SIDI la deja correcta.
4. 🆕🆕 **`Detalle` se escribe con valores** (✅ confirmado 27/10: así se enviaron Q17–Q19 y Nacional los aceptó):
   - C = suma de los montos del docente en el Descuentos de la quincena, como número (0 si no se le descontó).
   - D = `=Incidencia!K{fila}+…` con las filas reales de sus suplencias (fórmula interna, como en Q20) o el valor; ambas opciones dan lo mismo.
   - E = `=C−D`. Fila `Total` con `SUM` de C, D y `=C−D` en E.
   - Ya **no** se usa `reportes.ruta_descuentos` ni se edita ningún vínculo.
   - Implementación: se sigue editando el XML de la plantilla con **JSZip** (conserva `Tabla17`, sus fórmulas estructuradas y el estilo sin riesgo), pero el generador es mucho más simple: sin `externalLink*.xml` ni caché. Se elimina `calcChain.xml` y se marca `fullCalcOnLoad` para que Excel recalcule al abrir.
5. Nombre del archivo: `DESCUENTO-PREPA Q{nn}.xlsx` e `INCIDENCIAS PREPA Q{nn}.xlsx`.
6. Prueba obligatoria: abrir el archivo generado en Excel de escritorio sin mensajes de reparación y compararlo lado a lado con el original. 🆕 Casos de prueba: **Q16** (descuento manual, pagos recurrentes), **Q17** (agrupación de días, incapacidad IMSS, CRN con dos sesiones), **Q19** (cita IMSS) y **Q20** (suplentes sin contrato). En la comparación se corrigen primero los errores de captura conocidos ($53→$54, C de Detalle en IMSS = 0).

### 4.4 Inconsistencias de Detalle en los archivos reales 🆕
| Archivo | Qué pasa |
|---|---|
| Q17 | Emily Utrera (incapacidad IMSS) aparece con C = $1,080 aunque no está en Descuentos y su estatus dice "No se descuenta" → C debió ser 0 |
| Q19 | Luis Arturo Meza (incapacidad IMSS) aparece con C = $270 aunque no está en Descuentos; Yerikc Ramírez (cita IMSS) con C vacío; la fila Total no suma C |
| Q20 | Emily Utrera con C = 0 y D = 90 → Diferencia −90 (este es el comportamiento correcto) |
| Q18/Q20 | Suplencias de fechas anteriores (14/09, 25/09) reportadas semanas después; Q18 dice "03 de octubre" para una falta de un archivo pagado el 30/09 (probablemente 03 de septiembre) |

---

## 5. OPINA (entrada, semestral)
Encuesta de alumnos. **Una fila = la evaluación de un alumno a un grupo (CRN).** El cliente lo mandó dividido por periodo; el `.xlsb` de AGO-DIC 24 es el mismo contenido que el `.xlsx` (formato binario), así que el lector debe aceptar `.xlsx` y `.xlsb`.

| Archivo | Filas | Profesores | Grupos (CRN) | Versión de formato |
|---|---|---|---|---|
| OPINA AGO-DIC 24 | 3,903 | 40 | 138 | **v1** |
| OPINA ENE-MAY 25 | 4,033 | 77 (36 con grupos en campus Veracruz) | 190 | **v1** |
| OPINA ENE-MAY 26 | 3,716 | 45 | 146 | **v2** |

### 5.1 Columnas que se usan (los nombres cambian entre versiones → mapeo por alias)
| Campo SIDI | v1 (2024–2025) | v2 (2026) |
|---|---|---|
| `periodo` | `Periodo` / `DWH_Periodo` (`2024 Ago - Dic`) | `DWH_Periodo` (`2026 Ene - May`) |
| `plan` (nivel) | `Plan` (`Bachillerato General` / `Bachillerato General Bilingüe`) | igual |
| `crn` | `CRN` | igual |
| `clave_grupo` | ` Clave de grupo` (¡con espacio inicial!) / `Clave de grupo` | `Clave de grupo` |
| `clave_materia` | `Clave de Materia` (solo 2024) | Se deriva de la clave de grupo: `Veracruz_BSCN1006_611` → `BSCN1006` |
| `materia` | `Materia` | `Nombre de la materia` |
| `profesor`, `nomina` | `Profesor`, `Nómina` | igual |
| `campus_grupo` | `Campus Grupo` / `Campus grupo` | `Campus grupo` |
| `recomienda` | `¿Recomendarías a un compañero tomar clase con este profesor?` (Sí/No) | igual |
| `por_que_si`, `por_que_no` | `¿Por qué sí?`, `¿Por qué no?` (una razón) | — |
| `items` (JSON) | — | 5 reactivos con `Sí / No / No estoy seguro`: conocimiento, retos, colaboración, confianza, inspiración |
| `comentario` | `Comentario` | `¿Deseas compartir algún comentario adicional…?` |
| `response_id` | `ResponseId` (id del alumno) | no existe |

Columnas ignoradas: `Flex`, `Flex Connect`, `SE`, `SEED`, `CAG`, `MAPS`, `count`, `Zona grupo`, `Campus alumno`, `Tipo de Periodo`, `Nivel`. (`Positiva`/`Negativa` se recalculan de `recomienda`.) 🆕 `Formato` deja de ignorarse: se usa para el filtro de modalidad presencial (§5.2).

### 5.2 Cálculo de la calificación OPINA
**Fórmula confirmada por el cliente:** porcentaje de recomendación = alumnos que responden "Sí" ÷ total de alumnos que respondieron × 100.
- **Por grupo (CRN):** un profesor puede tener varios porcentajes porque imparte varias materias a varios grados. Se muestran en la ficha.
- **Calificación global del docente en el periodo (la que calcula el programa):** se juntan **todas** sus respuestas de todos sus grupos: `Σ "Sí" ÷ Σ respuestas × 100`. Es un promedio **ponderado** por alumnos, no el promedio de los porcentajes de cada grupo. Ejemplo: grupo A 30/30 (100 %) y grupo B 5/10 (50 %) → global 35/40 = **87.5 %**, no 75 %.
- La calificación global es la que aparece en la tabla de docentes, el panel y el ranking.
- Referencia real: promedio general ≈ 88 % en los tres periodos; mediana por docente ≈ 91–93 %.
- **Muestra mínima (propuesta del equipo):** docentes con menos de 10 respuestas aparecen con la etiqueta "muestra insuficiente" y fuera del ranking (hay casos con 1 respuesta y 0 % o 100 %). Valor configurable.
- **Filtro de campus y modalidad (✅ confirmado 27/10/2026):** **solo grupos presenciales del campus Veracruz**. Se excluyen *Tecmilenio Online*, los grupos en línea y los de otros campus. Al importar, la vista previa muestra cuántas filas se descartan por este filtro. (Con esto, ENE-MAY 25 baja de 77 a 36 profesores.)
- En v2 se muestran además los 5 reactivos (% Sí) como desglose en la ficha.
- Se guardan las respuestas crudas, así cualquier ajuste de la fórmula solo recalcula.
- Los comentarios de alumnos son sensibles: solo se muestran en la ficha del docente, nunca en el panel.

### 5.3 Flujo de importación
Subir archivo → SIDI detecta versión y periodo → vista previa (periodo, filas, filas descartadas por campus/modalidad, profesores, grupos, profesores sin coincidencia en BD) → confirmar. Reimportar el mismo periodo **reemplaza** las respuestas de ese periodo (con confirmación).

---

## 6. Tabla de pagos por tipo de clase (catálogo `tipos_clase`)
| Tipo de clase | Horas/semana | Idioma | Pago total al semestre (4 meses) | Pago por día |
|---|---|---|---|---|
| Clase de 5 hrs en español | 5 | ES | $11,760.00 | $90.00 |
| Clase de 5 hrs en inglés | 5 | EN | $14,112.00 | $106.00 |
| Clase de 4 hrs en español | 4 | ES | $9,408.00 | $70.00 |
| Clase de 4 hrs en inglés | 4 | EN | $11,290.00 | $85.00 |
| Clase de 3 hrs en español | 3 | ES | $7,056.00 | **$54.00** ✅ |
| Clase de 3 hrs en inglés | 3 | EN | $8,467.00 | $65.00 |
| Clase de 1.5 hrs en español | 1.5 | ES | $3,528.00 | $26.00 |
| Clase de 1.5 hrs en inglés | 1.5 | EN | $4,234.00 | $32.00 |

- Se carga como semilla y **se edita desde la pantalla de Configuración** (sin tocar código). Cada falta guarda el monto del momento (si cambia la tarifa, las faltas pasadas no cambian).
- `Pago total al semestre` también se usa en Incidencias: un taller se paga como una clase de 5 h en español ($11,760 en 9 periodos).
- **Confirmado (26/10):** la tarifa de 3 h en español es **$54** (la tabla original decía $53 por error; el Excel real y el cálculo proporcional dan $54).
- 🆕🆕 ✅ **Respuesta final (27/10):** **$54**. Los $53 de Q20 (y $68, $69, $82, $107 en otros archivos) fueron errores de captura o de cálculo manual.
- **Confirmado:** el "(4)" del encabezado original significa que el semestre se paga en **4 meses**.

---

## 7. Excel de grupos docentes (entrada) 🆕 — `GRUPOS_DOCENTES_<PERIODO>.xlsx` ✅ Recibido
Es el archivo de "información de maestros" que entregó el cliente. **No** trae edad ni CURP (esos datos salen de los CV, §7.1); trae la **carga del semestre**: cada grupo (CRN) con su docente y su horario. Ejemplo recibido: `GRUPOS_DOCENTES_AGOSTO_DICIEMBRE_2026.xlsx`.

Hoja única **`Salida`**, encabezados en la fila 1, sin tablas ni celdas combinadas. 152 filas · **147 CRN** · **47 docentes** · 50 materias · campus Veracruz · periodo `2026 Ago - Dic` · nivel `Preparatoria`.

| Col | Encabezado | Ejemplo | Uso en SIDI |
|---|---|---|---|
| A | Campus | `Veracruz` | Validación (solo Veracruz) |
| B | Descripción periodo | `2026 Ago - Dic` | `periodos.etiqueta_opina` (mismo texto que OPINA) → periodo `AGO-DIC 2026` |
| C | Descripción nivel académico materia | `Preparatoria` | Validación |
| D | Clave materia | `BSMA2003` | `asignaturas.clave_materia` |
| E | Nombre largo materia | `Math III: regularity and repetition` | `asignaturas.materia` |
| F | CRN | `16022` (texto) | `asignaturas.crn` |
| G | Número grupo | `611` | `asignaturas.numero_grupo` (601–604, 611–613, 801–802, F61–F62) |
| H | Modalidad grupo | `Teórica` / `Bachillerato Intercultural` | `asignaturas.modalidad` |
| I | Nómina profesor | `L03583117` | `docentes.nomina` (ya viene canónica, con `L`) |
| J | Nombre completo profesor | `Sosa Von Putlitz  Guillermo` | Mismo formato que OPINA: `Apellidos␣␣Nombres` (§2) |
| K–O | Lunes … Viernes | `SI` / vacío | Días de la sesión → `horarios.dia_semana` |
| P | Hora inicio clase | `10:30` (texto) | `horarios.hora_inicio` |
| Q | Hora fin clase | `11:29` (texto) | `horarios.hora_fin` |

**Una fila = un bloque de horario** (mismos días y mismas horas). Si un CRN tiene sesiones con horas distintas, trae **varias filas**: hay 5 CRN con **dos sesiones el mismo día** (16452, 16479, 16485, 17498, 17510: miércoles 11:00–12:29 y 13:30–15:00).

### 7.0.1 Qué calcula SIDI con este archivo
- **Horas por semana del CRN** = Σ duración de cada sesión × días. Las horas de fin terminan en `:29`/`:59`, así que duración = (fin + 1 min) − inicio, redondeada a 0.5 h (`16:00–17:35` = 1.5 h). Resultado en este semestre: 63 CRN de 3 h, 55 de 5 h, 17 de 4 h, 10 de 1.5 h y **2 de 4.5 h** (grupo F61, sin tarifa en la tabla → ver §9).
- **Idioma sugerido:** `EN` si la materia es la versión en inglés (tiene clave propia: `BSMA2003 Math III`, `BSCN2004 Mass and energy II`, `BSHU2004 Great universal writers`, `BSCN3002 Human body care`) **o** si la modalidad es `Bachillerato Intercultural`; en otro caso `ES`. Validado contra Q16–Q20: horas + idioma dan la tarifa cobrada en **41 de 43 CRN** (contando $53/$68/$69/$107 como los errores de captura ya identificados). Los 2 restantes no cuadran en horas: 16434 (en el Excel de grupos es de otro docente, 1.5 h) y 17502 (1.5 h en el Excel, se cobró como 3 h). Es una **sugerencia editable**.
- **Tipo de clase / tarifa** = (horas, idioma) → `tipos_clase`. Si no hay tarifa para esas horas (4.5 h) el CRN queda marcado "Sin tarifa" hasta que se asigne a mano.
- **Plan (General / Bilingüe):** `Bachillerato Intercultural` → Bilingüe; `Teórica` → General.
- **Número de grupos asignados** del docente = CRN distintos del periodo (§7.2).
- Las materias `VSPP…` (Fútbol, Tenis de mesa, Teatro, Acondicionamiento físico) son actividades deportivas/culturales: su CeCo por defecto es `5422101001`.

### 7.0.2 Lo que **no** trae (sigue siendo captura manual)
- **Contrato por CRN** (columna B de Descuentos). Indispensable para registrar faltas: la ficha marca "Sin contrato" en cada CRN que no lo tenga (ver §9).
- Actividades sin CRN (Ruta exploratoria) → "+ Agregar actividad".
- Suplentes que no dan clases este semestre (Q20: *Dora Vega Aquino*, nómina 22464 — sí aparece en el Excel de grupos de AGO-DIC 2026, pero no en Q16–Q19) → al indicar quién cubrió una falta se puede **dar de alta rápido** un docente con solo nómina y nombre.

### 7.0.3 Flujo de importación
Subir archivo → SIDI detecta periodo → vista previa: *docentes nuevos / existentes (por nómina)*, *CRN nuevos / que cambian / que ya no vienen*, CRN sin tarifa, CRN con idioma sugerido → confirmar. Reimportar el mismo periodo **actualiza** grupos y horarios sin borrar contratos, idiomas ni tipos de clase corregidos a mano (se avisa si un CRN cambió de docente). Docentes del periodo actual que no aparecen en el archivo se sugieren para "Inactivo".

---

## 7.1 CV de docentes (entrada, PDF) 🆕 ✅ Recibidos
El cliente entregó **37 CV** (36 PDF + 1 `.docx` duplicado de un PDF). Todos usan el formato institucional **"A1 CURRICULUM VITAE DOCENTES"** con texto seleccionable (no son escaneos); tienen 4–21 páginas porque después del CV vienen los comprobantes escaneados (títulos, cédulas), que **no** se leen. Nombre de archivo = nombre del docente, normalmente `Apellidos␣␣Nombres.pdf`.

Secciones del formato (página 1–3) y uso en SIDI:
| Sección | Campos | ¿Se extrae? | Uso en SIDI |
|---|---|---|---|
| 1.1 Datos personales | Nombre, Fecha de nacimiento, Nacionalidad, Estado civil, **CURP**, RFC, Domicilio, Teléfono, **Lugar laboral actual**, Correo personal e institucional | Nombre 37/37 · CURP 36/37 · Fecha de nacimiento 37/37 (formatos libres) · Lugar laboral 37/37 | **CURP** → fecha de nacimiento, edad y **género**; **Lugar laboral actual** → sugerencia de "Área o trabajo independiente a Tecmilenio" (cuando no es Tecmilenio). **No se guardan** domicilio, teléfono, RFC, estado civil ni correo personal |
| 1.2.n Formación académica `(Licenciatura)` / `(Especialidad con Diploma –Posgrado)` / `(Maestría)` / `(Doctorado)` | Institución, ciudad, periodo, **estatus** (Titulado / Pasante / Estudios sin concluir / Título en trámite / Estudios en curso), cédula, fecha de expedición | Grado (del encabezado) 36/37 · estatus · periodo 34/37 · **nombre de la carrera solo en 7/37** | `titulos_docente` (grado, institución, periodo, estatus, cédula) → **nivel de estudios** y **¿está estudiando?** (§7.2) |
| 1.3.n Cursos | Nombre, institución, fecha, horas | Sí | Solo se muestran en la ficha (texto) |
| 1.4 Idiomas | Idioma, grado de dominio | 27/37 | Ficha (texto) |
| 2. Experiencia docente | Institución, asignatura (sin fechas casi siempre) | Parcial | Sugerencia del **primer semestre** solo si trae periodo en Tecmilenio (11/37) |
| 3–6 Experiencia académico-administrativa / profesional / investigación / congresos | Cargo, institución, periodo | Parcial | Ficha (texto) |

**Reglas de importación:**
- Se suben **varios PDF a la vez**. El CV **no trae nómina**: se liga al docente por **CURP** (si ya existe) o por **nombre normalizado** (sin acentos, sin importar el orden ni los espacios dobles). En la muestra, 24 CV coinciden con docentes del Excel de grupos; 13 CV son de docentes sin grupos este semestre y 23 docentes del Excel no tienen CV.
- Si no hay coincidencia, la vista previa pide elegir el docente o capturar su nómina (o "omitir").
- Todo dato extraído llega como **propuesta** a la vista previa; nada se guarda sin confirmar, y lo capturado a mano no se sobrescribe sin avisar.
- La fecha de nacimiento se toma de la **CURP** (formatos de fecha del CV muy variados: `dd/mm/aaaa`, `dd/mm/aa`, `12 de marzo de 1990`, `Marzo 12, 1990`, `12 MZO 1990`); si la del CV no coincide, se marca "Revisar".
- El PDF se guarda en la computadora (`data/cv/`, nunca en GitHub) y se puede abrir desde la ficha.
- `.docx`: no se lee (si existe el PDF del mismo docente, se ignora).

---

## 7.2 Campos de consulta del docente (⚠️ nota importante del cliente)
La información que el programa **debe capturar y mostrar** para que la coordinadora encuentre rápido a los profesores:

| # | Campo pedido | Fuente | Cómo se obtiene |
|---|---|---|---|
| 1 | Nombre | Excel de grupos / OPINA / CV | Directo |
| 2 | Nómina | Excel de grupos / OPINA | Directo |
| 3 | Edad | CV (CURP) | **Calculada** de la fecha de nacimiento |
| 4 | Género (M o F) | CV (CURP) | Carácter 11 de la CURP: `H` → **M**, `M` → **F** (⚠️ en la CURP `M` = mujer; en SIDI `M` = masculino). Editable |
| 5 | CURP | CV | Directo (validada: 18 caracteres, formato MX) |
| 6 | Número de grupos asignados | Excel de grupos | **Calculado**: CRN + actividades del periodo actual |
| 7 | Grupos asignados | Excel de grupos | Lista `CRN · materia · grupo · horario` |
| 8 | Nivel de estudios | CV / captura | **Calculado**: grado más alto con estatus *Titulado* (Licenciatura < Especialidad < Maestría < Doctorado). Editable |
| 9 | Campo de formación académica | Captura (el CV casi nunca lo dice) | Catálogo editable (propuesta inicial: Ingeniería y Tecnología, Ciencias Exactas, Ciencias Naturales y de la Salud, Ciencias Sociales, Económico-Administrativas, Educación, Humanidades, Idiomas, Artes, Deporte) |
| 10 | Antigüedad en Tecmilenio | Excel de grupos + OPINA / captura | ✅ **Desde el primer semestre que dio clases.** = primer periodo con grupos u OPINA registrado en SIDI; si dio clases antes de los datos disponibles (OPINA empieza en AGO-DIC 2024) se captura el **primer semestre** a mano (el CV a veces lo sugiere: "Agosto 2017 a la fecha"). Se muestra en años y semestres (p. ej. "4 años · 9 semestres") |
| 11 | ¿Está estudiando? → nivel que estudia | CV / captura | **Calculado**: existe un título con estatus *Estudios en curso*; el nivel es su grado. Editable |
| 12 | Área o trabajo independiente a Tecmilenio | CV (*Lugar laboral actual*) / captura | Texto libre; se sugiere del CV cuando no dice Tecmilenio |

Consecuencias:
- En *04* el antiguo `docentes.nivel_educativo` (General / Bilingüe) se renombra `nivel_imparte` y se calcula de las modalidades de sus grupos; el **nivel de estudios** es otra cosa (su grado académico).
- La **tabla de docentes** (*05 §2*) muestra estos 12 campos (con selector de columnas) y filtra por género, nivel de estudios, campo, antigüedad, "está estudiando" y número de grupos.
- "Datos incompletos" = falta CURP, campo de formación, primer semestre (cuando no se puede calcular) o contrato en algún CRN.

---

## 8. Decisiones confirmadas con el cliente
| # | Fecha | Pregunta | Respuesta |
|---|---|---|---|
| 1 | 26/10 · 27/10 | Tarifa 3 h español | **$54** por día — **respuesta final** (los $53 de Q20 y otros montos fuera de tabla fueron errores de captura o de cálculo manual) |
| 2 | 26/10 | "(4)" en pago total al semestre | El semestre se paga en **4 meses** |
| 3 | 26/10 | Columna D "Jornada de trabajo" | **Número de días** |
| 6 | 26/10 → 27/10 | ¿Detalle con valores en lugar del vínculo externo? | ~~Se conserva el vínculo~~ → **Se escriben valores, como en Q17–Q19** (§4.3) |
| 8 | 26/10 | Fórmula OPINA | % de recomendación (Sí ÷ total); por CRN y **global unificada** por docente (§5.2) |
| 9 | 26/10 → 27/10 | Excel de maestros | ~~Nómina, nombre, edad y CURP~~ → Se recibió el **Excel de grupos** (nómina, nombre, CRN, materia, horario, §7); CURP, edad y género salen de los **CV** (§7.1) |
| 10 | 27/10 | ¿El monto al suplente siempre es igual al descontado? | **Sí, siempre es igual** |
| 11 | 27/10 | Fecha `30/01/2026` en suplencias de Q16 | **Error de captura**; la correcta es la fecha de pago de la quincena |
| 12 | 27/10 | OPINA: ¿grupos en línea y de otros campus? | **Solo presencial y campus Veracruz** |
| 13 | 27/10 | Campos de consulta del docente | Los 12 campos de §7.2 |
| 14 | 27/10 | Mismo CRN el mismo día dos veces (Q17, CRN 16452) | Se trata como **caso especial aislado**: SIDI permite una segunda falta del mismo CRN y día con confirmación (`faltas.sesion = 2`). *Dato de apoyo:* el Excel de grupos muestra que ese CRN tiene dos sesiones los miércoles (11:00 y 13:30); hay 5 CRN así |
| 15 | 27/10 | Contrato del suplente en Incidencias | **Cualquiera de los contratos del docente que suple**, siempre que sea suyo. SIDI propone su primer contrato del periodo y deja elegir entre los suyos; no acepta un contrato de otro docente. Si el suplente no tiene contratos registrados (suplente externo), se permite vacío con aviso (así viene en Q20) |
| 16 | 27/10 | Fila de total en Descuentos | **Siempre** se incluye (`=SUM(K2:Kn)` en K, §3.2) |
| 17 | 27/10 | Antigüedad | **Desde el primer semestre que dio clases** (§7.2 #10) |
| 18 | 27/10 | ¿Las faltas justificadas se descuentan? | Se adopta la regla observada en Q16–Q20: **incapacidad o cita del IMSS → no se descuenta** (el suplente sí se paga y Detalle muestra 0 descontado); **permiso personal → sí se descuenta**, aunque se avise con anticipación |

## 9. Pendientes con el cliente
Las preguntas 1–11 de la versión anterior quedan **cerradas** (§8). Quedan 2 que surgieron con el Excel de grupos y no bloquean el inicio:

| # | Pregunta | Por qué importa | Mientras tanto |
|---|---|---|---|
| 1 | **Tarifa de los grupos de 4.5 h/semana** (CRN 22023 y 22024, grupo F61, 3 sesiones de 1 h 35 min). La tabla de pagos no tiene 4.5 h | Sin tarifa no se puede calcular el descuento de esos CRN | Quedan "Sin tarifa"; si faltan, se usa descuento manual |
| 2 | **¿Existe un reporte con el contrato de cada CRN?** El Excel de grupos no lo trae y hoy se escribe a mano en Descuentos | Sin contrato no se puede generar Descuentos. Son ~147 CRN por semestre | La coordinadora captura el contrato al registrar la primera falta de cada CRN (SIDI lo recuerda) |
