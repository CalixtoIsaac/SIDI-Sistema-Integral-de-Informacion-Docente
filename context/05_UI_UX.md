# Especificación de Pantallas UI/UX - SIDI
Responsable: Sebastián Huesca Ramírez · Validación con el cliente: Saraí Cecilio Rascón (PO)

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
  3. Asignaturas y horarios (CRN o actividad, materia, grupo, modalidad, días y horas, horas/semana, idioma, tipo de clase/tarifa, **contrato**) — aviso ámbar en CRN "Sin contrato" o "Sin tarifa"
  4. Faltas, descuentos y suplencias que cubrió
  5. OPINA: calificación global por periodo + % por cada grupo (CRN, materia, núm. de respuestas); en 2026, desglose de los 5 reactivos; comentarios de alumnos
- Botón **Suspender / Reactivar** con confirmación.

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
5. Por cada CRN/día: **¿Quién cubrió?** (opcional, buscador de docentes; **"+ Alta rápida"** con nómina y nombre para suplentes nuevos) y **contrato del suplente** (lista de *sus* contratos; se propone el primero).
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
Incluirá: 9 faltas pendientes con fecha ≤ 31/08/2026  [Revisar / quitar alguna]
⚠️ Avisos antes de descargar: "2 faltas sin cuenta de cargo", "1 suplencia sin contrato del suplente", "1 CRN sin tarifa"
[🔒 Cerrar quincena]  (ya se enviaron a Nacional; impide cambios)
```
Además: inasistencias por semestre (número de faltas, profesores que faltaron, faltas por motivo).

## 9. Configuración
- **Tarifas por tipo de clase** (tabla editable: pago al semestre, pago por día).
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
