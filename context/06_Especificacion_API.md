# Especificación de API - SIDI
Responsable: Matías Hernández Garrido (apoyo: Sebastián) · Base URL: `/api` · JSON

> **Versión 2.4 (29/10/2026): retroalimentación de la vista previa.** Baja con observaciones y recontratable, docentes disponibles para suplir, ranking con filtros y promedio, comparativo del campus, contratos por CRN, envío de reportes por correo y resumen ejecutivo. Límite de OPINA a 30 MB.
>
> **Versión 2.3 (27/10/2026).** Agrega importación del **Excel de grupos** y de **CV (PDF)**, los 12 campos de consulta en `/docentes`, contratos del suplente y faltas pendientes de reportar; se quita la ruta del vínculo externo.
>
> Versión 2 (26/10/2026): sin autenticación (no hay login): ninguna ruta lleva `Authorization`. Se sigue la convención de la plantilla para que `UI.api` funcione sin cambios.

## Formato de respuesta
- **Éxito:** objeto con el recurso con nombre, p. ej. `{ "docente": {…} }`, `{ "docentes": [...], "total": 45 }`.
- **Error:** `{ "error": "Mensaje para la usuaria", "code": "NOMINA_DUPLICADA", "details": [] }` (`code` y `details` opcionales).
- Descargas: `200` con `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` y `Content-Disposition: attachment; filename="DESCUENTO-PREPA Q16.xlsx"`.

## Códigos HTTP
| Código | Uso |
|---|---|
| 200 | Correcto |
| 201 | Creado |
| 204 | Eliminado |
| 400 | Validación fallida |
| 404 | No encontrado |
| 409 | Nómina/CURP duplicada · falta repetida (mismo docente, CRN, día y sesión) |
| 413 | Archivo demasiado grande (> 15 MB Excel, 🆕 > 30 MB OPINA, > 10 MB por PDF) |
| 422 | Archivo no reconocido (columnas, versión o formato de CV desconocido) · contrato que no pertenece al suplente |
| 423 | Quincena cerrada (no se puede modificar) |
| 500 | Error interno |

## Sistema
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | `{ status, timestamp }` (ya existe) |
| GET | `/configuracion` | `{ configuracion: { "tema.modo": "automatico", "tema.color": "#DB2777", "perfil.nombre": "...", "opina.muestra_minima": "10", "opina.campus": "Veracruz", "opina.solo_presencial": "1", "reportes.agrupar_suplencias": "1" } }` |
| PUT | `/configuracion` | Actualiza una o varias claves. Valida `tema.color` como hex con contraste suficiente y `tema.modo ∈ {claro, oscuro, automatico}` |
| GET | `/respaldo` | Descarga una copia de `app.db` (`db.backup()`) |

## Catálogos
| Método | Ruta | Descripción |
|---|---|---|
| GET / PUT | `/tipos-clase`, `/tipos-clase/:id` | Tarifas (pago al semestre y por día; 🆕 `pagoMensual` calculado, solo lectura) |
| GET | `/catalogos?tipo=cc_nomina` | Lista por tipo |
| POST / PUT / DELETE | `/catalogos`, `/catalogos/:id` | Alta, edición, baja lógica (`activo = 0`) |
| GET / PUT | `/periodos`, `/periodos/:id` | `PUT { actual: true }` marca el semestre actual |
| GET | `/quincenas?anio=2026` | Lista con totales y estado |
| GET | `/quincenas/actual` | Quincena de hoy |
| PATCH | `/quincenas/:id` | `{ fecha_pago }` · `{ cerrada: true \| false }` |

## Docentes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/docentes` | Tabla. Query: `search` (nombre, CURP, nómina con o sin `L0`, CRN), `activo`, `semestreActual=true`, `genero` (`M`\|`F`), `nivelEstudios`, `campo`, `estudiando` (`true`\|`false`), `antiguedadMin`/`antiguedadMax` (semestres), `gruposMin`/`gruposMax`, `nivelImparte`, 🆕 `recontratable` (`true`\|`false`), `ordenar` (`nombre`\|`edad`\|`antiguedad`\|`grupos`\|`nivelEstudios`\|`opina`), `page`, `limit`. Cada fila trae los **12 campos de consulta** (*07 §7.2*): `nombre, nomina, edad, genero, curp, numGrupos, grupos[{crn,materia}], nivelEstudios, campoFormacion, antiguedad{anios,semestres,desde}, estudiando{si,nivel}, trabajoExterno` + `cumpleanos, opina{porcentaje,respuestas}, faltas, incompleto[]` |
| GET | `/docentes/:id` | Datos extendidos (títulos, asignaturas+horarios con 🆕 `tarifaDiaria` y `tarifaMensual` por CRN y `totalMensual`, departamento, faltas, suplencias cubiertas, OPINA por periodo, 🆕 `bajas`, `recontratable`) |
| GET | `/docentes/:id/resumen` | Hover: nómina, contratos, CRN del semestre |
| GET | `/docentes/:id/contratos?periodoId=` | Contratos del docente (de sus asignaturas) → lista para el contrato del suplente |
| GET | `/docentes/:id/cv` | Descarga el PDF del CV (`application/pdf`) · `404` si no tiene |
| POST | `/docentes/alta-rapida` | `{ nomina, nombre }` → docente mínimo (`origen = alta_rapida`) para suplentes |
| POST / PUT / DELETE | `/docentes/:id/titulos`, `/titulos/:id` | Títulos con `grado`, `nombreTitulo`, `institucion`, `periodoTexto`, `estatus`, `cedula` |
| GET | `/docentes/:id/opina?periodoId=` | Detalle OPINA: `global { respuestas, positivas, porcentaje }`, `porCrn [...]`, reactivos v2, comentarios |
| POST | `/docentes` | Alta manual (la nómina se normaliza) |
| PUT | `/docentes/:id` | Actualizar |
| PATCH | `/docentes/:id/estatus` | 🆕 Suspender: `{ "activo": false, "motivo": "Sin disponibilidad de horario", "observaciones": "…", "recontratable": true }` (motivo, observaciones y recontratable **obligatorios** → `400`). Reactivar: `{ "activo": true, "confirmarNoRecontratable": true }` (si la última baja es no recontratable y falta la confirmación → `409`) |
| GET | `/docentes/:id/bajas` | 🆕 Historial de bajas `[{ fecha, periodo, motivo, observaciones, recontratable, fechaReactivacion }]` |
| POST | `/docentes/:id/asignaturas` | Agregar grupo o actividad: `{ periodoId, crn \| nombreActividad, materia, numeroGrupo, modalidad, idioma, tipoClaseId, numContrato, horarios: [{ dia, inicio, fin }] }` (si no se manda `tipoClaseId` se calcula de horario + idioma) |
| PUT / DELETE | `/asignaturas/:id` | Editar (contrato, idioma, tipo de clase; quedan marcados como editados a mano) / eliminar |

Ejemplo `POST /docentes`:
```json
{
  "nomina": "3500001",
  "nombres": "María", "apellidoPaterno": "López", "apellidoMaterno": "Ruiz",
  "curp": "LORM950208MVZPZR09", "fechaNacimiento": null, "genero": null,   // si son null se derivan de la CURP
  "campoFormacion": "Ingeniería y Tecnología", "trabajoExterno": null, "primerSemestre": "AGO-DIC 2022",
  "titulos": [{ "grado": "Licenciatura", "nombreTitulo": "Ingeniería Industrial", "estatus": "Titulado" }],
  "asignaturas": [{ "periodoId": 4, "crn": "16001", "materia": "…", "numContrato": "5500001",
                    "horarios": [{ "dia": 1, "inicio": "07:30", "fin": "08:59" }, { "dia": 4, "inicio": "07:30", "fin": "08:59" }] }]
}
```
Respuesta `201`: `{ "docente": { "id": 12, "nomina": "L03500001", "genero": "F", "edad": 31, … } }`

## Carga del Excel de grupos docentes
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/grupos/excel/preview` | `multipart/form-data` (`archivo`). Detecta periodo; **no guarda**; devuelve docentes y CRN nuevos/cambiados |
| POST | `/grupos/excel/confirm` | `{ "previewId": "...", "inactivarAusentes": false }` — agrega/actualiza en una transacción; no pisa campos editados a mano |
| GET | `/grupos/importaciones` | Historial |

🆕 La vista previa agrega `"omitidos": [{ "crn": "22023", "grupo": "F61", "motivo": "En línea" }]` (grupos F61 y F62) y `"noRecontratables": [{ "nomina": "…", "nombre": "…" }]`; `sinTarifa` ya no incluye los CRN omitidos.

## Contratos por CRN 🆕 (*07 §7.3*)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/contratos/plantilla?periodoId=` | Descarga `CONTRATOS_<PERIODO>.xlsx` prellenado (CRN, materia, grupo, nómina, docente; Contrato vacío o con el valor actual) |
| POST | `/contratos/preview` | `multipart` (`archivo`). Detecta columnas CRN/Contrato/Nómina por alias; **no guarda**. Devuelve `{ previewId, filas, nuevos, cambian: [{crn, antes, despues}], sinContrato, avisos: [{crn, tipo: 'CRN_NO_EXISTE'|'NOMINA_NO_CORRESPONDE'|'CONTRATO_INVALIDO'}] }` |
| POST | `/contratos/confirm` | `{ previewId, conservarManual: [crn…] }` — actualiza `asignaturas.num_contrato` en una transacción |

```json
{ "previewId": "c42e...", "periodo": "AGO-DIC 2026", "filas": 152, "crn": 147,
  "docentes": { "nuevos": [{ "nomina": "L03500004", "nombre": "Ana Pérez Gómez", "grupos": 1 }], "existentes": 35 },
  "grupos": { "nuevos": 147, "cambianDocente": [], "yaNoVienen": [] },
  "sinTarifa": [{ "crn": "22023", "horasSemana": 4.5 }],
  "idiomaSugeridoEN": 26, "sinContrato": 147 }
```

## Carga de CV (PDF)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/docentes/cv/preview` | `multipart/form-data` (`archivos[]`, hasta 60 PDF). Lee cada CV; **no guarda**; propone docente y datos |
| POST | `/docentes/cv/confirm` | `{ previewId, items: [{ archivo, docenteId \| nomina \| omitir, datos: { …editados } }] }` — guarda campos, títulos y el PDF en `data/cv/` |

```json
{ "previewId": "f10a...", "total": 37, "leidos": 36, "noLeidos": [{ "archivo": "x.docx", "motivo": "No es PDF" }],
  "items": [{ "archivo": "López Ruiz  María.pdf",
              "coincidencia": { "docenteId": 12, "por": "curp" },
              "propuesta": { "curp": "LORM950208MVZPZR09", "fechaNacimiento": "1995-02-08", "genero": "F",
                             "titulos": [{ "grado": "Licenciatura", "estatus": "Titulado", "institucion": "…" },
                                         { "grado": "Maestría", "estatus": "Estudios en curso" }],
                             "trabajoExterno": null },
              "conflictos": [{ "campo": "fechaNacimiento", "cv": "1995-02-09", "curp": "1995-02-08" }] }] }
```
Las vistas previas se guardan en memoria 30 minutos.

## OPINA
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/opina/preview` | `multipart` (`archivo` .xlsx/.xlsb, hasta 30 MB). Detecta versión y periodo; filtra **presencial + Veracruz**; **no guarda** |
| POST | `/opina/confirm` | `{ previewId, reemplazar: true }` — inserta respuestas; crea docentes y asignaturas faltantes |
| GET | `/opina/importaciones` | Historial de cargas |
| DELETE | `/opina/importaciones/:id` | Elimina una carga y sus respuestas |
| GET | `/opina/ranking?periodoId=&filtro=todos\|mejores\|peores\|rango&n=10&min=&max=&compararCon=&incluirMuestraInsuficiente=false` | 🆕 **Ranking completo** por calificación global (Σ Sí ÷ Σ respuestas de todos sus CRN) con filtro de mejores/peores/rango. Respuesta: `{ periodo, promedioMaestros, calificacionCampus, docentes, ranking: [{ posicion, docenteId, nombre, porcentaje, respuestas, variacion }] }` |
| GET | `/opina/ranking/excel?…` | 🆕 Mismos parámetros, descarga `.xlsx` |
| GET | `/opina/comparativo?periodos=1,2,3` | % por docente en varios periodos (tabla docente × semestre) |
| GET | `/opina/campus` | 🆕 % OPP oficial de Preparatoria Veracruz por semestre: `[{ periodo, alumnos, positivas, opp, variacion, regionOpp? }]` (G1) + `promedioMaestros` y distribución de cada periodo si hay OPINA por alumno |
| PUT | `/opina/campus/:periodoId` | 🆕 `{ alumnos, positivas, regionOpp?, fuente? }` captura/edita el dato del semestre (`positivas ≤ alumnos`, si no `400`) |

Respuesta de `/opina/preview`:
```json
{ "previewId": "a91f...", "version": "v2", "periodo": "ENE-MAY 2026", "periodoExiste": true,
  "filas": 3716, "filasFiltradas": 3714, "profesores": 45, "grupos": 146,
  "profesoresNuevos": [{ "nomina": "L03113593", "nombre": "Yesenia Reyes Severiano" }],
  "yaImportado": true }
```

## Faltas y descuentos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/faltas?quincenaId=&docenteId=&periodoId=&pendientes=true` | Lista con monto y suplente; `pendientes=true` = aún sin quincena de reporte |
| POST | `/faltas/preview` | Calcula sin guardar (montos, comentario, totales) |
| POST | `/faltas` | Registra una o varias faltas (una por CRN y día) con sus suplencias, en una transacción |
| PUT | `/faltas/:id` | Editar (recalcula monto y actualiza la incidencia de la suplencia) |
| DELETE | `/faltas/:id` | Elimina la falta, su suplencia y la incidencia generada |
| PUT | `/faltas/:id/suplencia` | `{ docenteSuplenteId, numContrato, monto }` asignar/cambiar quién cubrió (`numContrato` debe ser del suplente → `422`) |
| DELETE | `/faltas/:id/suplencia` | Quitar suplencia |
| GET | `/faltas/resumen-quincena?quincenaId=` | Descontado, pagado a suplentes y diferencia por docente (= hoja Detalle) |
| GET | `/faltas/resumen-semestral?periodoId=` | Núm. de faltas, profesores que faltaron, desglose por motivo y 🆕 por tipo de resumen (*Asunto personal* / *Incapacidad médica*) |
| POST | `/faltas/disponibles` | 🆕 `{ docenteId, fechas: ["2026-08-17"], asignaturaIds: [101, 102] }` → **grupos a suplir** y **docentes disponibles** por sesión (sin empalme de horario, activos, sin falta ese día), ordenados por misma materia → da clases ese día → menos suplencias |

Respuesta de `/faltas/disponibles`:
```json
{ "gruposASuplir": [
    { "asignaturaId": 101, "crn": "16434", "materia": "Química I", "grupo": "611", "fecha": "2026-08-17", "sesion": 1,
      "inicio": "07:30", "fin": "08:59",
      "disponibles": [ { "docenteId": 30, "nombre": "Vanessa Cervantes", "mismaMateria": true, "daClaseEseDia": true,
                         "suplenciasPeriodo": 2, "recontratable": null } ],
      "totalDisponibles": 12 } ] }
```

Ejemplo `POST /faltas`:
```json
{
  "docenteId": 12,                       // la quincena se asigna al generar el reporte
  "modo": "tarifa",
  "fechas": ["2026-08-17"],
  "asignaturaIds": [101, 102, 103, 104],
  "motivo": "Falta por asunto personal",
  "horasTexto": "8 horas= 1 día completo",
  "cuentaCargo": "5420103000",
  "justificacion": "ninguna",            // "incapacidad_imss" | "cita_imss" (+ "folioImss")
  "observaciones": "Viaja a CDMX por examen de UNAM",
  "suplencias": [{ "asignaturaId": 102, "fecha": "2026-08-17", "sesion": 1, "docenteSuplenteId": 30, "numContrato": "5695304" }]
}
```
Descuento manual: `"modo": "manual"`, `"fechaTexto": "03/08/2026 al 16/08/2026"`, `"dias": 14`, `"horasTexto": "6 horas= 14 días"`, `"monto": 3183.74`, `"comentario": "6 horas a la semana, a descontar $3183.74"`.

## Incidencias (pagos adicionales)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/incidencias?quincenaId=&origen=` | Lista ordenada como saldrá en el Excel |
| POST | `/incidencias` | Alta manual |
| PUT / DELETE | `/incidencias/:id` | Editar / borrar (las de `origen = suplencia` se editan desde la falta) |
| POST | `/incidencias/copiar` | `{ desdeQuincenaId, haciaQuincenaId }` copia los pagos manuales recurrentes |
| PATCH | `/incidencias/orden` | `{ ids: [..] }` reordenar filas |

## Reportes de Nacional
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/reportes/descuentos/validar?quincenaId=` | Lista lo que se incluirá (pendientes con fecha ≤ corte) y avisos (faltas sin CeCo, CRN sin tarifa o sin contrato…) |
| GET | `/reportes/descuentos?quincenaId=&excluir=1,2` | Asigna los pendientes a la quincena y descarga `DESCUENTO-PREPA Qnn.xlsx` (con fila de total) |
| GET | `/reportes/incidencias/validar?quincenaId=` | Avisos (suplencias sin contrato del suplente, PEP > 24 caracteres…) |
| GET | `/reportes/incidencias?quincenaId=` | Descarga `INCIDENCIAS PREPA Qnn.xlsx` (hojas Incidencia + detalle, **con valores**; suplencias agrupadas por días) |
| POST | `/reportes/enviar` | 🆕 `{ quincenaId, modo: "borrador"\|"mailto", para?, cc?, cco?, asunto?, cuerpo? }` (si se omiten, se usan los de configuración). Genera los 2 Excel y valida (avisos rojos → `400`). `borrador` → descarga `Reportes PREPA Qnn.eml` (`message/rfc822`, `X-Unsent: 1`, ambos Excel adjuntos); `mailto` → `{ mailto: "mailto:…?subject=…&body=…", archivos: [urls] }`. Registra en `envios_correo` |
| GET | `/reportes/envios?quincenaId=` | 🆕 Bitácora de envíos |

## Analítica (panel)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/analitica/kpis?periodoId=&quincenaId=` | Activos/inactivos, faltas quincena y semestre, descontado, pagado a suplentes, promedio OPINA |
| GET | `/analitica/opina?periodoId=` | % por maestro (barras) |
| GET | `/analitica/distribucion-nivel` | Docentes por nivel que imparten |
| GET | `/analitica/perfil-docentes` | Conteos por género, nivel de estudios, campo de formación y rangos de antigüedad |
| GET | `/analitica/faltas-por-motivo?periodoId=` | Para gráfica |
| GET | `/analitica/cumpleanos-mes` | Cumpleaños del mes |
| GET | `/analitica/resumen-ejecutivo?periodoId=&compararCon=&graficas=G1,G2,…` | 🆕 Datos de todas las diapositivas en una sola llamada: `{ portada, kpis, diapositivas: [{ id: "G1", titulo, conclusion, datos }], hallazgos: [] }`. Sin observaciones de baja ni comentarios de alumnos |
| GET | `/analitica/plantilla?periodos=` | 🆕 Activos, nuevos y bajas (recontratables / no) por semestre (G15) |

## Rutas que se eliminan de la plantilla
`/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/me`, `/api/notas/*`.
