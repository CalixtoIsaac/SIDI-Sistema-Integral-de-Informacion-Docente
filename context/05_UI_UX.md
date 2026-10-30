# Especificación de Pantallas UI/UX - SIDI
Responsable: Sebastián Huesca Ramírez · Validación con el cliente: Saraí Cecilio Rascón (PO)

> **Versión 2.4 (29/10/2026): retroalimentación de la vista previa.** ✅ El cliente **aprobó el diseño** y las vistas Panel, Docentes, Formación, Excel de grupos, Registrar falta, Incidencias, OPINA y Reportes. Se agregan: **resumen ejecutivo** (§1.1, gráficas por elegir), **tarifa mensual** en la ficha, **baja con observaciones y recontratable**, **grupos a suplir y docentes disponibles** al registrar falta, **ranking completo con filtros** y **comparativo del campus por semestre** en OPINA, **envío por correo** en Reportes y la carga del **reporte de contratos**.
>
> **Versión 2.3 (27/10/2026).** Tabla de docentes con los **12 campos de consulta** del cliente (*07 §7.2*); carga del **Excel de grupos** y de **CV en PDF**; faltas con justificación IMSS y 2ª sesión; suplencias agrupadas y contrato del suplente; reportes sin vínculo externo.
>
> Versión 2 (26/10/2026): sin pantalla de login, con Perfil (color y modo) y las vistas de faltas, incidencias, OPINA y reportes de Nacional.

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
Docentes por nivel que imparten (General / Bilingüe)   Por nivel de estudios   Por género   Faltas por motivo   🎂 Cumpleaños del mes
```
Gráficas con Chart.js usando `--primary` para las barras y tonos neutros para el resto; se redibujan al cambiar tema o color.

Botón arriba a la derecha del panel: **[▶ Resumen ejecutivo]**.

## 1.1 Resumen ejecutivo 🆕 (presentación formal)
> **Es parte de SIDI, no un archivo aparte.** Se abre desde el **Panel administrativo** con el botón **[▶ Resumen ejecutivo]** y se arma **con los datos que ya están en el sistema** al momento de abrirlo; no se carga ningún archivo. El HTML del prototipo solo sirve para validar el diseño con el cliente; en SIDI vive en `public/js/resumen.js` y pide sus datos a `GET /api/analitica/resumen-ejecutivo`.

| Diapositiva | Datos en SIDI (de dónde salen) |
|---|---|
| KPIs | `opina_campus_semestre`, `v_opina_docente`, `faltas`, `suplencias`, `docentes` |
| G1 % OPP Preparatoria Veracruz | `opina_campus_semestre` (2 números capturados por semestre en OPINA → Comparativo) |
| G2, G3, G4 OPINA por maestro | `v_opina_docente` (OPINA por alumno importado en OPINA, HU-08) |
| G9 Faltas por tipo | `faltas` del semestre agrupadas en **2 tipos**: *Asunto personal* y *Incapacidad médica* (*04 §5 tipo_resumen*) |
| G10 Descontado vs. pagado | `faltas.monto_descuento` y `suplencias.monto` por quincena de reporte |
| G15 Altas y bajas | `asignaturas` por periodo (activos y nuevos) + `docente_bajas` (bajas, recontratables) |
| G16 Perfil docente | `docentes` (género de la CURP) + `v_docente_estudios` (nivel y si estudia) |
| Hallazgos | Se generan de los mismos datos |

Si una sección aún no tiene datos (p. ej. al inicio del semestre sin faltas), la diapositiva muestra *"Sin datos registrados en este semestre"* en lugar de la gráfica; **nunca** muestra datos de ejemplo. Las etiquetas "Datos de ejemplo" existen solo en el prototipo.

Vista a pantalla completa con **diapositivas 16:9**, navegación ◀ ▶ (y teclado), selector de **semestre** (y "comparar con") y **[⬇ Exportar PDF]** (impresión del navegador, una diapositiva por página). Fondo blanco/neutro, tipografía sobria, color principal solo en acentos y logo/encabezado *"Coordinación de Docentes · Preparatoria Veracruz · {semestre}"*. Cada gráfica lleva un **titular con la conclusión** (p. ej. *"El campus subió 2.1 pts en OPINA respecto a ENE-MAY 2025"*), generado de los datos.

Estructura fija: **1. Portada** → **2. Indicadores clave (KPIs)** → diapositivas con las gráficas elegidas → **última: hallazgos y alertas** (texto generado: docentes con OPINA < 70 %, docentes con más faltas, CRN sin contrato, etc.).

**Catálogo de gráficas propuestas.** ✅ **Decisión (29/10): se implementan las 8 recomendadas — G1, G2, G3, G4, G9, G10, G15, G16.** No existe un resumen ejecutivo previo del cliente: el formato lo define SIDI. El resto queda como catálogo para versiones futuras.
| # | Gráfica | Tipo | Qué responde | Datos |
|---|---|---|---|---|
| **OPINA (desempeño)** |||||
| G1 | Evolución del **% OPP de Preparatoria Veracruz** por semestre (cifra oficial del reporte institucional) | Línea | ¿Mejoramos o empeoramos? | `opina_campus_semestre` |
| G2 | Distribución de docentes por rango de calificación (< 70, 70–79, 80–89, 90–100 %) por semestre | Barras apiladas 100 % | ¿Cuántos maestros están en zona de riesgo? | OPINA |
| G3 | Top 5 y bottom 5 del semestre | Barras horizontales | ¿Quiénes destacan y quiénes necesitan apoyo? | OPINA |
| G4 | Cambio por docente entre dos semestres | Puntos conectados (antes → después) | ¿Quién mejoró o bajó más? | OPINA 2 semestres |
| G5 | Los 5 reactivos (conocimiento, retos, colaboración, confianza, inspiración) del campus | Barras horizontales | ¿En qué aspecto estamos más fuertes/débiles? | OPINA formato 2026 |
| G6 | OPINA por programa (General vs. Bilingüe) o por materia | Barras | ¿Hay diferencias por programa/área? | OPINA + grupos |
| G7 | OPINA vs. antigüedad / nivel de estudios | Dispersión / barras | ¿La experiencia o el grado se relaciona con la calificación? | OPINA + CV |
| **Asistencia y pagos** |||||
| G8 | Faltas por quincena del semestre | Columnas | ¿Cuándo se concentran las faltas? | Faltas |
| G9 | Faltas por tipo: **Asunto personal** (incluye no justificadas) vs. **Incapacidad médica** (incapacidad + cita IMSS) — ✅ solo 2 tipos (*07 §8 #29*) | Barras horizontales | ¿Por qué faltan? | Faltas |
| G10 | Descontado vs. pagado a suplentes por quincena | Columnas agrupadas + línea de diferencia | ¿Cuánto cuesta realmente cubrir faltas? | Faltas + suplencias |
| G11 | Docentes con más faltas (top 10) | Barras horizontales | ¿A quién hay que dar seguimiento? | Faltas |
| G12 | % de faltas cubiertas con suplente y docentes que más suplen | Indicador + barras | ¿Qué tan bien se cubren las clases? | Suplencias |
| G13 | Faltas por día de la semana | Columnas | ¿Hay días críticos? | Faltas + horarios |
| G14 | Pagos adicionales por concepto (tutoreo, PAD, coach, talleres, suplencias) | Barras | ¿En qué se va el presupuesto de incidencias? | Incidencias |
| **Plantilla docente** |||||
| G15 | Docentes activos, nuevos y bajas por semestre (con recontratables / no recontratables) | Columnas apiladas | ¿Cómo cambia la plantilla? | Docentes + bajas |
| G16 | Perfil: género, nivel de estudios, docentes estudiando | Barras pequeñas (3 en una diapositiva) | ¿Cómo está formada la plantilla? | CV |
| G17 | Antigüedad y edad (rangos) | Histogramas | ¿Plantilla nueva o con experiencia? | CV + historial |
| G18 | Carga: grupos por docente y horas/semana (español vs. inglés) | Barras | ¿Está equilibrada la carga? | Excel de grupos |
| **Cruce** |||||
| G19 | OPINA vs. número de faltas por docente | Dispersión con cuadrantes | ¿Los que más faltan son los peor evaluados? | OPINA + faltas |

**Elegidas** (8 diapositivas de gráficas, una idea por diapositiva): **G1, G2, G3, G4, G9, G10, G15, G16**. Orden final: Portada → KPIs → G1 → G2 → G3 → G4 → G9 → G10 → G15 → G16 → Hallazgos (11 diapositivas).

**Prototipo v2 (29/10):** `Resumen_Ejecutivo_SIDI_prototipo.html` (fuera del repositorio). **G1 y los KPI de OPINA usan el % OPP real** de Preparatoria Veracruz (88.3 → 85.9 → 87.6 %). G2–G4 usan docentes de ejemplo y, opcionalmente, leen el OPINA por alumno `.xlsx`/`.xlsb` **en el navegador** (SheetJS) con la misma regla de SIDI (presencial + Veracruz, global ponderada, muestra mínima 10). Dibuja las 11 diapositivas con Chart.js, cada gráfica con *Ver tabla*, claro/oscuro y **Exportar PDF** (16:9, una diapositiva por página). G9, G10, G15 y G16 usan **datos de ejemplo** marcados hasta que SIDI registre faltas, pagos y bajas. Sirve de referencia visual y de lógica para HU-26. Las observaciones de baja y los comentarios de alumnos **no** aparecen en el resumen (solo conteos).

## 2. Tabla de docentes
```
[🔍 Nombre, CURP, Nómina o CRN]  [☑ Solo semestre actual]  Estatus[▾] Género[▾] Nivel de estudios[▾] Campo[▾]
                                 Antigüedad[▾] Estudiando[▾] Grupos[▾]  Ordenar[Alfabético▾]  [▦ Columnas]
[+ Nuevo docente] [⬆ Subir Excel de grupos] [⬆ Subir CV (PDF)]
+--+------------------------+---------+----+---+------------+------+-------------------+-----------+--------------+-----------+------------------+-----------------+-------+------+
|● | Nombre                 | Nómina  |Edad|Gén| CURP       |Grupos| Grupos asignados  | Nivel est.| Campo        | Antigüedad| Estudiando       | Trabajo externo | OPINA |Faltas|
+--+------------------------+---------+----+---+------------+------+-------------------+-----------+--------------+-----------+------------------+-----------------+-------+------+
|🟢| María López Ruiz       |L03500001| 31 | F | LORM9502.. |  3   | 16001, 17001, 2001…| Licenciat.| Ingeniería y…| 2 a · 4 s | No               | —               | 91 %  |  4   |
|🟢| José Félix Ramos       |L03500002| 29 | M | RAFJ9705.. |  4   | 16002, 17002, …   | Licenciat.| —            | 3 a · 6 s | Sí · Especialidad| Despacho contable| 89 %  |  3   |
|⚪| Heidi Castro Díaz      |L03500003| —  | — | —          |  0   | —                 | —         | —            | —         | —                | —               | 91 %  |  0   |
+--+------------------------+---------+----+---+------------+------+-------------------+-----------+--------------+-----------+------------------+-----------------+-------+------+
```
- **Columnas por defecto** = los 12 campos que pidió el cliente (*07 §7.2*) + OPINA y Faltas. Con **[▦ Columnas]** se ocultan/muestran (también Cumpleaños y Nivel que imparte); la elección se recuerda.
- "Grupos asignados" muestra los primeros CRN; hover → lista completa `CRN · materia · grupo · horario`.
- "Antigüedad" = desde el **primer semestre que dio clases** (años y semestres). Si no se puede calcular, "—" con enlace "Capturar primer semestre".
- "Estudiando" = *Sí · {nivel}* o *No*, calculado de los títulos con estatus *Estudios en curso*.
- Campos vacíos se muestran con "—" y una etiqueta discreta **"Datos incompletos"** cuando falta CURP, campo de formación, primer semestre o el contrato de algún CRN. Clic en la etiqueta → abre la ficha en modo edición en el dato que falta.
- La columna OPINA muestra la **calificación global** del docente (todas sus respuestas del periodo juntas). Con menos de 10 respuestas: valor en gris con tooltip "Muestra insuficiente (n respuestas)".
- **Hover sobre el nombre** → resumen: Nómina `L03560330` · Contrato(s) · CRN del semestre.
- **Clic en el nombre** → datos extendidos debajo, con pestañas:
  1. Datos personales (nómina, CURP, fecha de nacimiento, edad, género, cumpleaños, correo institucional) — con insignia de origen (Excel / CV / manual)
  2. Formación y trayectoria (títulos con grado, institución, periodo y estatus; campo de formación; nivel de estudios; si está estudiando; trabajo independiente; cursos e idiomas del CV; departamento; tipo de contrato; **antigüedad** y primer semestre) · botón **[📄 Ver CV]**
  3. Asignaturas y horarios (CRN o actividad, materia, grupo, modalidad, días y horas, horas/semana, idioma, tipo de clase, **Tarifa (diaria)**, 🆕 **Tarifa (mensual)** justo a su derecha, **contrato**) — aviso ámbar en CRN "Sin contrato" o "Sin tarifa". Fila final con el **total mensual** del docente
     ```
     (ejemplo ilustrativo)
     | CRN   | Materia            | Horario            | h/sem | Idioma | Tarifa (diaria) | Tarifa (mensual) | Contrato |
     | 16022 | Math III           | Lu-Mi 10:30–11:59  |  3    | Inglés |  $65.00         |  $2,116.75       | 5568351  |
     | 16101 | Biología I         | Ma-Ju 07:30–09:59  |  5    | Español|  $90.00         |  $2,940.00       | 5568352  |
     |                                                          Total mensual:    $5,056.75 |
     ```
  4. Faltas, descuentos y suplencias que cubrió
  5. OPINA: calificación global por periodo + % por cada grupo (CRN, materia, núm. de respuestas); en 2026, desglose de los 5 reactivos; comentarios de alumnos
- Botón **Suspender / Reactivar** con confirmación. 🆕 **Suspender (dar de baja)** abre un formulario:
  ```
  Dar de baja a María López Ruiz (L03500001)
   Motivo*:          [Sin disponibilidad de horario ▾]   (catálogo editable)
   Observaciones*:   [ No tiene disponibilidad para el turno matutino en ENE-MAY 2027 ...    ]
   ¿Recontratable?*  (●) Sí, recontratable   ( ) No recontratable
                     ↳ se sugiere según el motivo: "Sin disponibilidad" → Sí; "No cumplió expectativas" / "Problemas" → No
                                                                       [Cancelar]  [Dar de baja]
  ```
  - En la tabla, junto al punto gris: insignia **"Recontratable"** (gris) o **"No recontratable"** (roja). Filtro nuevo **Recontratable [Todos / Sí / No]**.
  - La ficha muestra el **historial de bajas** (fecha, semestre, motivo, observaciones, recontratable, reactivación). Las observaciones solo se ven aquí.
  - **Reactivar** a alguien "No recontratable" pide confirmación con las observaciones a la vista. Si un docente "No recontratable" viene en un nuevo Excel de grupos o se elige como suplente, aparece ⚠.

## 3. Captura de docentes
**Opción 1 – Formulario manual** en pasos: Datos personales (CURP → llena fecha de nacimiento y género) → Formación (títulos con estatus, campo de formación, trabajo externo, primer semestre) → Laborales (tipo de contrato, departamento) → Asignaturas (CRN o actividad, materia, horario, horas/semana, idioma, **contrato**). La nómina acepta `3560330` o `L03560330` y muestra la forma normalizada.

**Opción 2 – Subir Excel de grupos** (`GRUPOS_DOCENTES_<PERIODO>.xlsx`):
```
Paso 1: [ Arrastra aquí el Excel de grupos ]
Paso 2: Confirma la información
  Periodo detectado: AGO-DIC 2026 · 147 grupos · 47 docentes
  Se agregarán 12 docentes nuevos · 35 ya existían (se actualizarán sus grupos)
   1. (ejemplo) Ana Pérez Gómez (L03500004) · 1 grupo
   ...
  Grupos: 147 nuevos · 0 cambiaron de docente · 0 ya no vienen
  ⚠️ 2 grupos sin tarifa (4.5 h/semana: 22023, 22024) → asígnalos después
  ℹ️ 26 grupos con idioma sugerido "Inglés" (versión en inglés o Bachillerato Intercultural) — [Revisar]
  ℹ️ Los contratos no vienen en este archivo: 147 grupos quedarán "Sin contrato"
Paso 3: [Cancelar]  [Confirmar e importar]
```

🆕 En el Paso 2 se agrega: `ℹ️ Grupos F61 y F62 (en línea) se omiten — se pagan en otro sistema: 22023, 22024, …` y desaparece el aviso de "sin tarifa" para ellos.

**Opción 2b 🆕 – Subir reporte de contratos** (*07 §7.3*): *[⬇ Descargar plantilla de contratos]* (Excel con todos los CRN presenciales del periodo, solo falta escribir el contrato; si RH entrega su propio reporte, se sube ese) → *[⬆ Subir contratos]* → vista previa: `145 CRN · 140 contratos nuevos · 3 cambian · 2 sin contrato · ⚠ 1 nómina no corresponde al CRN 16434` → *[Confirmar]*.

**Opción 3 – Subir CV (PDF)** (uno o varios a la vez):
```
Paso 1: [ Arrastra aquí los CV en PDF ]  (37 archivos)
Paso 2: Revisa lo que se leyó   (datos de ejemplo, ficticios)
| Archivo                         | Docente encontrado          | CURP          | Nac.       | Gén | Nivel de estudios | Estudiando        | Trabajo externo        |   |
| López Ruiz  María.pdf           | ✅ María López Ruiz (CURP)  | LORM950208…   | 08/02/1995 | F   | Licenciatura      | No                | —                      | ✏ |
| Pérez Gómez  Ana.pdf            | ⚠️ Sin coincidencia [Elegir docente ▾] [Capturar nómina] [Omitir]                                           | ✏ |
| Ramos Félix  José.pdf           | ✅ José Félix Ramos (nombre)| ⚠️ no se encontró CURP → capturar                                                 | ✏ |
  ⚠️ 1 fecha de nacimiento del CV no coincide con la CURP → se marcará "Revisar"
  ℹ️ Domicilio, teléfono, RFC y estado civil no se guardan
Paso 3: [Cancelar]  [Confirmar 35 CV]
```
- ✏ abre el detalle editable de lo leído (títulos con estatus, lugar laboral, cursos) antes de confirmar.
- Si el docente ya tiene datos capturados a mano, se muestran ambos valores y se elige cuál conservar.

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
3. **CRN a los que faltó**: casillas con los grupos que el docente tiene **ese día de la semana** (según su horario), cada uno con su tipo de clase y tarifa; se pueden marcar otros. Si falta el contrato del CRN, se pide ahí mismo (y se recuerda). Si el CRN no existe, **"+ Agregar grupo / actividad"**. Caso especial: **"+ 2ª sesión"** para registrar dos faltas del mismo CRN el mismo día (con confirmación).
4. Motivo (catálogo), horas de la falta (8 h = día completo / 4 h = medio día), cuenta de cargo, ticket, **justificación**: *Ninguna (permiso personal) · Incapacidad IMSS · Cita IMSS* (+ folio), observaciones (van al texto de la suplencia).
5. 🆕 **Grupos que necesitarán suplirse** y **docentes disponibles** (aprobado por el cliente): por cada CRN, día y sesión se muestra el horario y una lista de docentes **sin clase que se empalme** a esa hora:
   ```
   Grupos a suplir · lunes 17/08/2026
   | CRN 16434 · Química I · 611 · 07:30–08:59 | ¿Quién cubre? [Vanessa Cervantes ▾]  Disponibles (12): ★ Vanessa Cervantes (misma materia) · José Félix (da clase ese día) · … |
   | CRN 17507 · Ética · 602 · 11:00–12:29     | ¿Quién cubre? [— elegir — ▾]          Disponibles (9): …                                                     |
   ```
   - Orden: ★ misma materia → ya da clases ese día → menos suplencias en el semestre. Los inactivos no aparecen; los "No recontratable" al final con ⚠. Opción "Ver todos" para elegir a alguien con empalme (pide confirmación).
   - **¿Quién cubrió?** es opcional (se puede asignar después); **"+ Alta rápida"** con nómina y nombre para suplentes nuevos; **contrato del suplente** (lista de *sus* contratos; se propone el primero).
6. Vista previa: *"Se registrarán 4 faltas · Descuento $263.00 · Se pagarán $263.00 a 4 suplentes"*. Con IMSS: *"Descuento $0.00 · Se pagarán $270.00"*. El monto de la tabla se puede editar (queda marcado ✎) → **Guardar**.

Opción **"Descuento manual"** (casos especiales, p. ej. coach con 14 días de faltas): periodo en texto, **número de días**, horas en texto y monto capturado.

La lista muestra arriba las faltas **pendientes de reportar** (de cualquier fecha) y abajo las ya reportadas en la quincena elegida.

## 6. Incidencias (pagos de la quincena)
```
Quincena: [Q16 ▾]                     [+ Nuevo pago] [⧉ Copiar pagos de la quincena anterior]
| Docente | Concepto (cc-nómina) | Motivo | Detalle | Importe total | Periodos | Por periodo | A partir de | Origen |
| …       | Sueldo Carga Académica | BB_Tutoreo | Tutoreo de 48 alumnos… | $10,960.00 | 9 | $1,217.78 | 30/08/2026 | Manual |
| …       | Flex Act. Acad de Apoyo | B2_Cap.Profr | Sustituyó al docente… | $54.00 | 1 | $54.00 | 30/08/2026 | 🔗 Suplencia |
```
- Las filas de suplencia se crean desde Faltas; aquí solo se ven (icono 🔗 que lleva a la falta). Varias faltas del mismo suplente, titular y CRN se ven como **una fila** ("del 1 al 4 de septiembre, a pagar 4 días"); se puede desagrupar.
- Formulario de pago: docente → contrato (lista de sus contratos o nuevo), cc-nómina, motivo, detalle, CeCo, PEP, orden interna (opcionales, con contador de caracteres 24/12), importe total, periodos, a partir de. Muestra el importe por periodo.

## 7. OPINA
```
[⬆ Subir archivo OPINA (.xlsx / .xlsb)]
Paso 2: Revisa
  Periodo detectado: ENE-MAY 2026 · Formato 2026 · 3,716 respuestas · 45 profesores · 146 grupos
  ☑ Solo grupos presenciales del campus Veracruz (excluye 2 respuestas de otros campus / en línea)
  ⚠️ 3 profesores no están registrados → se crearán como "Datos incompletos"
  ⚠️ Ya existe OPINA de este periodo → se reemplazará
Paso 3: [Cancelar] [Importar]

Pestañas: [Ranking completo] [Comparativo del campus] [Importaciones]

Ranking completo 🆕   Periodo [ENE-MAY 2026 ▾]   Mostrar: (●) Todos  ( ) Mejores [10]  ( ) Peores [10]  ( ) Rango [80]–[90] %
                      [☐ Incluir muestra insuficiente]   [Comparar con: ENE-MAY 2025 ▾]
┌─────────────────────────────────────────────────────────────────────────────┐
│ Promedio de todos los maestros (ENE-MAY 2026): 88.4 %   ·  Campus: 87.9 %  ·  45 docentes │
└─────────────────────────────────────────────────────────────────────────────┘
| # | Docente | % recomendación | Respuestas | vs. ENE-MAY 2025 |
| 1 | …       | 100.0 %         | 64         | ▲ 3.2            |
| … |         |                 |            |                  |
| 45| …       |  61.5 %         | 39         | ▼ 8.0            |
```
- Por defecto se ve el **ranking completo**; filas del top en verde suave y del bottom en rojo suave (no dependen solo del color: llevan ▲/▼ y posición). Clic en un docente → su ficha (pestaña OPINA).
- El cuadro de promedios cambia con el periodo elegido. *[⬇ Exportar ranking a Excel]*.

```
Comparativo del campus 🆕 · % de Opinión Positiva al Profesor (OPP) · Preparatoria Veracruz   (reporte institucional OPINA)
 Línea: 88.3 % (ENE-MAY 25) → 85.9 % (AGO-DIC 25) → 87.6 % (ENE-MAY 26)
| Semestre     | Alumnos que opinaron | Opiniones positivas | % OPP  | Cambio    |      |
| ENE-MAY 2025 | 3,837                | 3,387               | 88.3 % | —         | ✏    |
| AGO-DIC 2025 | 3,590                | 3,085               | 85.9 % | ▼ 2.4 pts | ✏    |
| ENE-MAY 2026 | 3,804                | 3,333               | 87.6 % | ▲ 1.7 pts | ✏    |
[+ Agregar semestre]   (se copian 2 números de la fila Preparatoria → Veracruz del reporte; el % se calcula)
```
- Debajo, opcional: promedio de los maestros por semestre (del OPINA por alumno) para comparar.

## 8. Reportes (Nacional)
```
Quincena: [Q16 · 16–31 ago 2026 ▾]
+-----------------------------------------+  +---------------------------------------------+
| DESCUENTO-PREPA Q16.xlsx                |  | INCIDENCIAS PREPA Q16.xlsx                  |
| 11 faltas · 3 docentes · $3,950.74      |  | 37 pagos · 3 docentes en Detalle            |
| [⬇ Descargar]                           |  | [⬇ Descargar]                               |
+-----------------------------------------+  +---------------------------------------------+
Incluirá: 9 faltas pendientes con fecha ≤ 31/08/2026  [Revisar / quitar alguna]
⚠️ Avisos antes de descargar: "2 faltas sin cuenta de cargo", "1 suplencia sin contrato del suplente", "1 CRN sin tarifa"
[🔒 Cerrar quincena]  (ya se enviaron a Nacional; impide cambios)
```
🆕 **Envío por correo** (*07 §10*, desde Outlook institucional): debajo de las dos tarjetas
```
[✉ Enviar a Nacional]   Para: garcia.sandra@… ; ruben.salas@… ; jjbarradas@…   (Configurar)      Último borrador: 30/08/2026 10:42
```
- Descarga `Reportes PREPA Q16.eml`; al abrirlo, **Outlook** muestra el correo con los 2 Excel adjuntos, los 3 destinatarios, asunto y cuerpo: ella revisa y presiona *Enviar*.
- Si su Outlook no lo abre como borrador: opción *"Abrir correo y descargar archivos"* (correo nuevo con destinatarios/asunto/cuerpo + los 2 Excel descargados para arrastrarlos).
- Con avisos rojos de validación el botón queda deshabilitado. El historial se ve en la quincena.

Además: inasistencias por semestre (número de faltas, profesores que faltaron, faltas por motivo).

## 9. Configuración
- **Tarifas por tipo de clase** (tabla editable: pago al semestre, pago por día; 🆕 **pago mensual** calculado = semestre ÷ 4, solo lectura).
- 🆕 **Correo**: destinatarios (Para, CC, CCO; inicial: los 3 correos de Nacional), asunto y cuerpo con variables, "preparar el correo al cerrar la quincena". Sin contraseñas (Outlook envía).
- 🆕 **Contratos**: descargar plantilla / subir reporte de contratos del periodo.
- 🆕 **Motivos de baja** (con recontratable sugerido) y grupos a omitir (F61, F62: en línea).
- Catálogos de Incidencias y Faltas (cc-nómina, motivos, CeCo, textos de situación/estatus).
- Periodos (cuál es el actual) y quincenas (fecha de pago).
- OPINA: muestra mínima, campus (Veracruz) y solo presencial.
- **Reportes**: agrupar suplencias por días (sí/no). *(Ya no hay ruta de vínculo externo.)*
- **Perfil docente**: catálogos de nivel de estudios y campo de formación.
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
