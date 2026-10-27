# Formatos Excel - SIDI
Responsables: Matías Hernández (lectura/escritura) · Uziel García (mapeo a BD) · Validación: Saraí Cecilio (PO)

> **Versión 2.1 (26/10/2026):** incorpora las respuestas del cliente (tarifa $54, 4 meses, jornada = días, vínculo externo de Detalle, fórmula OPINA, contenido del Excel de maestros).
>
> Este documento describe **cada archivo real** que entregó el cliente: qué columnas trae, cómo se interpreta y qué hace el sistema con él. Es la fuente de verdad para los lectores (importación) y los generadores (exportación).

## 0. Resumen
| # | Archivo | Dirección | Frecuencia | ¿Formato modificable? | Estado |
|---|---|---|---|---|---|
| 1 | `DESCUENTO-PREPA Qnn.xlsx` | **Salida** (el sistema lo genera) | Quincenal | **No** (lo exige Nacional) | ✅ Recibido |
| 2 | `INCIDENCIAS PREPA Qnn.xlsx` | **Salida** (el sistema lo genera) | Quincenal | **No** (lo exige Nacional) | ✅ Recibido |
| 3 | Información de maestros | **Entrada** (se importa) | Al inicio del semestre / altas | — | ⏳ **Pendiente de recibir** (se espera: nómina, nombre, edad, CURP) |
| — | `OPINA <periodo>.xlsx / .xlsb` | **Entrada** (se importa) | Semestral | No aplica (solo lectura) | ✅ Recibido (3 periodos) |
| — | Tabla de pagos por tipo de clase | Catálogo inicial (`tipos_clase`) | Al cambiar tarifas | Editable en el sistema | ✅ Recibido |

**Hoy ambos formatos de salida se llenan a mano.** El objetivo es que la coordinadora registre faltas, suplencias y pagos en SIDI y descargue los dos archivos ya llenos, idénticos a los que hoy envía.

`Qnn` = número de quincena del año (Q1 = 1–15 ene … Q16 = 16–31 ago … Q24 = 16–31 dic). Fórmula: `Q = (mes − 1) × 2 + (día ≤ 15 ? 1 : 2)`.

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
- En BD: `nombres`, `apellido_paterno`, `apellido_materno`; cada formato arma el nombre en su orden. Se recortan espacios sobrantes (los originales traen espacios al final y nombres duplicados del tipo *"Yerikc David Ramírez Villagomez Yerikc David"*, que es error de captura).

---

## 3. DESCUENTO-PREPA Qnn.xlsx (salida)
Hoja única **`Descuentos`**. Encabezado en la fila 1, un registro por fila desde la fila 2. Encabezado gris (`FFD9D9D9`), Comic Sans 8 pt; datos Calibri 8 pt; columnas con anchos fijos. Sin tablas de Excel, sin celdas combinadas.

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
| L | No. De contrato | (vacío) | Se deja vacío (así viene) |

### 3.1 Regla del descuento (confirmada con el archivo real)
- **Un registro por cada CRN y por cada día de falta.** Si el docente faltó un día y ese día tenía 4 grupos, son 4 filas.
- `monto = tipos_clase.pago_por_dia` del CRN (según horas a la semana + idioma). Ejemplos reales: CRN de 5 h español → **$90**; 3 h inglés → **$65**; 3 h español → **$54**.
- Comentario generado: `CRN {crn} de {horas} horas a la semana, a descontar {monto} = {monto}`.
- **Casos especiales** (ej. fila 12: coach con faltas injustificadas del 03 al 16/08, 14 días, `6 horas= 14 días`, **$3,183.74**): no salen de la tabla de tarifas. El sistema permite **"descuento manual"**: rango de fechas en texto, horas en texto y monto capturado a mano.

### 3.2 Totales
El archivo no trae fila de total; los totales viven en la hoja `Detalle` de Incidencias (§4.2).

---

## 4. INCIDENCIAS PREPA Qnn.xlsx (salida)
Dos hojas: **`Incidencia`** y **`Detalle`**. Fuente Aptos Narrow.

### 4.1 Hoja `Incidencia` — pagos adicionales del docente en la quincena
- **A1:** texto fijo *"Ruta para enviar solicitudes: Mitec / Entorno del Centro de Experiencia y servicios mi Compensación / … / Incidencias de nómina"* (no se toca).
- **Fila 2:** encabezados. **Fila 3 vacía.** Datos desde la fila 4.
- Los datos están en una **tabla de Excel `Tabla17`** (estilo `TableStyleMedium2`) con fórmulas de referencia estructurada.

| Col | Encabezado | Ejemplo | Origen en SIDI |
|---|---|---|---|
| A | Nómina | `3028312` | Nómina sin `L` ni ceros |
| B | # Contrato | `3077466` | Contrato del docente para ese concepto |
| C | Nombre | `Eduardo Jesús Zanata Zarate` | Nombres + apellidos |
| D | Tipo de contrato | `determinado` | `docentes.tipo_contrato` |
| E | Propuesta de cc-nómina | `Sueldo Carga Académica` | Catálogo `cc_nomina` |
| F | Motivo | `BB_Tutoreo (Preparatoria).` | Catálogo `motivos_incidencia` |
| G | Detalle del Pago (actividad, fecha, horario, tabulador) | `Tutoreo de 48 alumnos de 1er semestre` | Texto libre o **generado** para suplencias |
| H | CeCo (10 caracteres) | `5420103000` | Catálogo `cuentas_cargo` |
| I | ELEMENTO PEP (24 caracteres incluyendo guión) | (vacío) | Opcional |
| J | ORDEN INTERNA (12 caracteres) | (vacío) | Opcional |
| K | Importe Total | `10960` | `incidencias.importe_total` |
| L | No. de periodos a repartir el pago | `9` | `incidencias.num_periodos` |
| M | Importe por Periodo | `=Tabla17[[#This Row],[Importe Total]]/Tabla17[[#This Row],[No. de periodos a repartir el pago]]` | **Se conserva la fórmula** (cuando `num_periodos = 1` el original trae el valor directo; ambos válidos) |
| N | A partir de qué periodo (dd/mm/aaaa) | `30/08/2026` | `incidencias.a_partir_de` (por defecto: fecha de pago de la quincena) |

**Tipos de pago encontrados (catálogos iniciales):**

| cc-nómina (E) | Motivo (F) | Ejemplo de detalle | Importe típico | Periodos | CeCo |
|---|---|---|---|---|---|
| Sueldo Carga Académica | `BB_Tutoreo (Preparatoria).` | Tutoreo de 48 alumnos de 1er semestre | $10,960 | 9 | 5420103000 |
| Sueldo Carga Académica | `B2_Cap.Profr(CADI Asore, Compet.)` | PAD de 12 profesores | $16,463 | 9 | 5420103000 |
| Imp.Clase Artis.Cult.yDep | `D1_Activ. Artísticas, Cult Y Dep.` | Coach de sociedad Agua con 130 alumnos 20 HRS | $3,400 | 8 | 5422101001 |
| Flex Act. Acad de Apoyo | `LB_Impart CursoTallGral` | Instructor Taller Ruta Exploratoria … | $11,760 | 9 | 5420103000 |
| Flex Act. Acad de Apoyo | `LB_Impart CursoTallGral` | Instructor de taller de inducción NI – Aleks | $1,176 | 1 | 5420103000 |
| Flex Act. Acad de Apoyo | `B2_Cap.Profr(CADI Asore, Compet.)` | **Suplencia** (ver abajo) | = monto descontado al titular | 1 | 5420103000 |
| Flex Act. Acad de Apoyo | `B2_Cap.Profr(CADI Asore, Compet.)` | Cubre a coach de gimnasio … por faltas injustificadas | $796 | 1 | 5422101001 |

**Suplencias (se generan solas a partir de la falta):** cuando se registra una falta y se indica quién cubrió, SIDI crea la incidencia del suplente con el mismo monto que se descontó al titular y este texto:
```
Sustituyó al docente {titular}, nómina: {L0nnnnnnn} CRN {crn} de {h} horas a la semana, del día {d} de {mes}, a pagar 1 día. 1 día* {tarifa} = {monto} {motivo/observaciones}
```
(En este campo la nómina del titular **sí** va con `L0`.)

### 4.2 Hoja `Detalle` — conciliación descuentos vs. suplencias
| Col | Encabezado | Cálculo |
|---|---|---|
| A | No. De nomina | Docente que faltó |
| B | Nombre del docente | |
| C | Cantidad descontada total | Suma de sus filas en Descuentos |
| D | Cantidad a pagar a docentes que cubrieron | Suma de las incidencias de suplencia ligadas a sus faltas |
| E | Diferencia | `C − D` |
| F | Situación | Texto (catálogo), p. ej. *"Se hace descuento correspondiente por permiso personal sin justificación."* |
| G | Estatus | Texto (catálogo), p. ej. *"Se descuenta y se toma la falta correspondiente."* |
| — | Última fila | `Total` con `SUM` de C, D y E |

### 4.3 Reglas de generación (para no "romper" el formato)
1. Se parte de una **plantilla vacía** guardada en `templates/` (copia del original sin datos). Nunca se crea el archivo desde cero.
2. Solo se escriben valores en celdas; se conservan fuentes, anchos, formatos de número, el texto de A1 y el estilo de tabla.
3. **`Tabla17` se redimensiona** al número de filas generadas. (En el archivo real la tabla llega a `A2:N36` pero hay datos hasta la fila 40: esas 4 filas quedaron fuera de la tabla por error manual.)
4. **`Detalle` conserva el vínculo externo** (confirmado: no se cambia hasta que Nacional lo autorice). Cómo está armado el original y qué hace SIDI:
   - Columna C = fórmula a otro libro: `=[1]Descuentos!$K$2+[1]Descuentos!$K$3+…`, una referencia por cada fila del docente en el archivo de Descuentos. Columna D = fórmula interna `=Incidencia!M34+…`. E = `C − D` (en el original a veces viene `0` fijo). Fila `Total` con `SUM`.
   - `[1]` es `xl/externalLinks/externalLink1.xml`, que apunta (en `_rels`) a `…/Documentos/NOMINA AD2026/DESCUENTO-PREPA Q16.xlsx` en el OneDrive/SharePoint de quien envía, y guarda una **copia en caché** de los valores de `K` para mostrarlos sin abrir el otro archivo (en el original la caché está incompleta: solo K2–K4).
   - SIDI genera C con las referencias `[1]Descuentos!$K$n` a las filas **reales** del Descuentos que genera para esa misma quincena, **actualiza la ruta del vínculo** a `{ruta configurada}/DESCUENTO-PREPA%20Q{nn}.xlsx` y **llena la caché completa** con todos los montos, para que los totales se vean correctos aunque el vínculo no se actualice.
   - La ruta base es configurable (`reportes.ruta_descuentos` en Configuración); por defecto la del original.
   - `externalLink2.xml` (apunta a un `INCIDENCIAS PREPA-Q22.xlsx` y ninguna celda lo usa) es un residuo del archivo que se copió; se deja tal cual para no alterar la estructura.
   - Implementación: **ExcelJS no conserva vínculos externos**, así que el Excel de Incidencias se genera editando el XML de la plantilla con JSZip (ver *03 §1*). Se elimina `calcChain.xml` y se marca `fullCalcOnLoad` para que Excel recalcule al abrir.
   - Si en el futuro Nacional autoriza quitar el vínculo, basta con escribir valores en C (cambio pequeño en el generador).
5. Nombre del archivo: `DESCUENTO-PREPA Q{nn}.xlsx` e `INCIDENCIAS PREPA Q{nn}.xlsx`.
6. Prueba obligatoria: abrir el archivo generado en Excel de escritorio sin mensajes de reparación y compararlo lado a lado con el original de Q16 (los datos de Q16 sirven como caso de prueba de punta a punta).

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

Columnas ignoradas: `Flex`, `Flex Connect`, `SE`, `SEED`, `CAG`, `MAPS`, `count`, `Zona grupo`, `Campus alumno`, `Tipo de Periodo`, `Formato`, `Nivel`. (`Positiva`/`Negativa` se recalculan de `recomienda`.)

### 5.2 Cálculo de la calificación OPINA
**Fórmula confirmada por el cliente:** porcentaje de recomendación = alumnos que responden "Sí" ÷ total de alumnos que respondieron × 100.
- **Por grupo (CRN):** un profesor puede tener varios porcentajes porque imparte varias materias a varios grados. Se muestran en la ficha.
- **Calificación global del docente en el periodo (la que calcula el programa):** se juntan **todas** sus respuestas de todos sus grupos: `Σ "Sí" ÷ Σ respuestas × 100`. Es un promedio **ponderado** por alumnos, no el promedio de los porcentajes de cada grupo. Ejemplo: grupo A 30/30 (100 %) y grupo B 5/10 (50 %) → global 35/40 = **87.5 %**, no 75 %.
- La calificación global es la que aparece en la tabla de docentes, el panel y el ranking.
- Referencia real: promedio general ≈ 88 % en los tres periodos; mediana por docente ≈ 91–93 %.
- **Muestra mínima (propuesta del equipo):** docentes con menos de 10 respuestas aparecen con la etiqueta "muestra insuficiente" y fuera del ranking (hay casos con 1 respuesta y 0 % o 100 %). Valor configurable.
- **Filtro de campus (⏳ por confirmar):** por defecto solo grupos con `Campus grupo = Veracruz`. ENE-MAY 25 trae 206 respuestas de *Tecmilenio Online* y grupos de otros campus que inflan la lista a 77 profesores. Configurable al importar.
- En v2 se muestran además los 5 reactivos (% Sí) como desglose en la ficha.
- Se guardan las respuestas crudas, así cualquier ajuste de la fórmula solo recalcula.
- Los comentarios de alumnos son sensibles: solo se muestran en la ficha del docente, nunca en el panel.

### 5.3 Flujo de importación
Subir archivo → SIDI detecta versión y periodo → vista previa (periodo, filas, profesores, grupos, profesores sin coincidencia en BD) → confirmar. Reimportar el mismo periodo **reemplaza** las respuestas de ese periodo (con confirmación).

---

## 6. Tabla de pagos por tipo de clase (catálogo `tipos_clase`)
| Tipo de clase | Horas/semana | Idioma | Pago total al semestre (4 meses) | Pago por día |
|---|---|---|---|---|
| Clase de 5 hrs en español | 5 | ES | $11,760.00 | $90.00 |
| Clase de 5 hrs en inglés | 5 | EN | $14,112.00 | $106.00 |
| Clase de 4 hrs en español | 4 | ES | $9,408.00 | $70.00 |
| Clase de 4 hrs en inglés | 4 | EN | $11,290.00 | $85.00 |
| Clase de 3 hrs en español | 3 | ES | $7,056.00 | **$54.00** |
| Clase de 3 hrs en inglés | 3 | EN | $8,467.00 | $65.00 |
| Clase de 1.5 hrs en español | 1.5 | ES | $3,528.00 | $26.00 |
| Clase de 1.5 hrs en inglés | 1.5 | EN | $4,234.00 | $32.00 |

- Se carga como semilla y **se edita desde la pantalla de Configuración** (sin tocar código). Cada falta guarda el monto del momento (si cambia la tarifa, las faltas pasadas no cambian).
- `Pago total al semestre` también se usa en Incidencias: un taller se paga como una clase de 5 h en español ($11,760 en 9 periodos).
- **Confirmado:** la tarifa de 3 h en español es **$54** (la tabla original decía $53 por error; el Excel real y el cálculo proporcional dan $54).
- **Confirmado:** el "(4)" del encabezado original significa que el semestre se paga en **4 meses**.

---

## 7. Información de maestros (entrada) — ⏳ archivo pendiente de recibir
**Confirmado con el cliente:** el Excel muy probablemente traerá **solo** los maestros con su **nómina, nombre, edad y CURP**. El resto de la información la obtiene la coordinadora preguntando al docente, de su CV o de archivos separados → se **captura a mano** en SIDI.

| Dato | De dónde sale |
|---|---|
| Nómina, nombre, CURP | **Excel de maestros** |
| Edad | Excel de maestros (solo se usa para validar) |
| **Fecha de nacimiento y cumpleaños** | **Se obtienen de la CURP** (posiciones 5–10 = `AAMMDD`; el carácter 17 indica el siglo: dígito → 1900, letra → 2000). Se compara con la edad del Excel y, si no cuadra, se marca para revisión |
| CRN, materia, clave de grupo, plan (General/Bilingüe) de semestres pasados | OPINA |
| CRN del semestre actual, horas/semana, idioma, contrato por CRN | **Captura manual** ("+ Agregar grupo") — indispensable para calcular descuentos |
| Tipo de contrato | Incidencias / captura manual |
| Títulos, departamento, horarios, trayectoria | **Captura manual** (CV / entrevista) |

Consecuencias en el diseño:
- El importador de maestros es sencillo (4 columnas); si trae columnas extra van a `datos_adicionales`.
- Importar **actualiza** a los docentes que ya existían (creados desde OPINA) usando la nómina como llave.
- La ficha del docente debe permitir editar todo cómodamente, y la tabla marca **"Datos incompletos"** a quien le falten títulos, departamento o grupos del semestre.
- OPINA llega **al terminar** el semestre, así que tampoco trae los CRN del semestre en curso: la captura manual de grupos es el único camino para registrar faltas del semestre actual.

---

## 8. Decisiones confirmadas con el cliente (26/10/2026)
| # | Pregunta | Respuesta |
|---|---|---|
| 1 | Tarifa 3 h español | **$54** por día |
| 2 | "(4)" en pago total al semestre | El semestre se paga en **4 meses** |
| 3 | Columna D "Jornada de trabajo" | **Número de días** |
| 6 | ¿Detalle con valores en lugar del vínculo externo? | **No** por ahora: se conserva el vínculo hasta que Nacional autorice el cambio (§4.3) |
| 8 | Fórmula OPINA | % de recomendación (Sí ÷ total); por CRN y **global unificada** por docente (§5.2) |
| 9 | Contenido del Excel de maestros | Nómina, nombre, edad y CURP; lo demás se captura a mano (§7) |

## 9. Pendientes de confirmar con el cliente (Saraí)
1. ¿Las faltas **justificadas** (p. ej. viaje avisado con anticipación) se descuentan? En Q16 el viaje avisado **sí** se descontó y se pagó al suplente.
2. ¿El monto al suplente siempre es igual al descontado? (En Q16 sí; la columna "Diferencia" sugiere que puede variar.)
3. Fecha "A partir de qué periodo" de las suplencias en Q16 dice `30/01/2026` y el resto `30/08/2026`: ¿error de captura?
4. OPINA: ¿se incluyen los grupos en línea (*Tecmilenio Online*) y de otros campus, o solo Veracruz?
5. Recibir el archivo real de información de maestros.
