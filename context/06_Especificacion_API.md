# Especificación de API - SIDI
Responsable: Matías Hernández Garrido (apoyo: Sebastián) · Base URL: `/api` · JSON

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
| 413 | Archivo demasiado grande (> 15 MB Excel, > 10 MB por PDF) |
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
| GET / PUT | `/tipos-clase`, `/tipos-clase/:id` | Tarifas (pago al semestre y por día) |
| GET | `/catalogos?tipo=cc_nomina` | Lista por tipo |
| POST / PUT / DELETE | `/catalogos`, `/catalogos/:id` | Alta, edición, baja lógica (`activo = 0`) |
| GET / PUT | `/periodos`, `/periodos/:id` | `PUT { actual: true }` marca el semestre actual |
| GET | `/quincenas?anio=2026` | Lista con totales y estado |
| GET | `/quincenas/actual` | Quincena de hoy |
| PATCH | `/quincenas/:id` | `{ fecha_pago }` · `{ cerrada: true \| false }` |

## Docentes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/docentes` | Tabla. Query: `search` (nombre, CURP, nómina con o sin `L0`, CRN), `activo`, `semestreActual=true`, `genero` (`M`\|`F`), `nivelEstudios`, `campo`, `estudiando` (`true`\|`false`), `antiguedadMin`/`antiguedadMax` (semestres), `gruposMin`/`gruposMax`, `nivelImparte`, `ordenar` (`nombre`\|`edad`\|`antiguedad`\|`grupos`\|`nivelEstudios`\|`opina`), `page`, `limit`. Cada fila trae los **12 campos de consulta** (*07 §7.2*): `nombre, nomina, edad, genero, curp, numGrupos, grupos[{crn,materia}], nivelEstudios, campoFormacion, antiguedad{anios,semestres,desde}, estudiando{si,nivel}, trabajoExterno` + `cumpleanos, opina{porcentaje,respuestas}, faltas, incompleto[]` |
| GET | `/docentes/:id` | Datos extendidos (títulos, asignaturas+horarios, departamento, faltas, suplencias cubiertas, OPINA por periodo) |
| GET | `/docentes/:id/resumen` | Hover: nómina, contratos, CRN del semestre |
| GET | `/docentes/:id/contratos?periodoId=` | Contratos del docente (de sus asignaturas) → lista para el contrato del suplente |
| GET | `/docentes/:id/cv` | Descarga el PDF del CV (`application/pdf`) · `404` si no tiene |
| POST | `/docentes/alta-rapida` | `{ nomina, nombre }` → docente mínimo (`origen = alta_rapida`) para suplentes |
| POST / PUT / DELETE | `/docentes/:id/titulos`, `/titulos/:id` | Títulos con `grado`, `nombreTitulo`, `institucion`, `periodoTexto`, `estatus`, `cedula` |
| GET | `/docentes/:id/opina?periodoId=` | Detalle OPINA: `global { respuestas, positivas, porcentaje }`, `porCrn [...]`, reactivos v2, comentarios |
| POST | `/docentes` | Alta manual (la nómina se normaliza) |
| PUT | `/docentes/:id` | Actualizar |
| PATCH | `/docentes/:id/estatus` | `{ "activo": false }` suspender / reactivar |
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
| POST | `/opina/preview` | `multipart` (`archivo` .xlsx/.xlsb). Detecta versión y periodo; filtra **presencial + Veracruz**; **no guarda** |
| POST | `/opina/confirm` | `{ previewId, reemplazar: true }` — inserta respuestas; crea docentes y asignaturas faltantes |
| GET | `/opina/importaciones` | Historial de cargas |
| DELETE | `/opina/importaciones/:id` | Elimina una carga y sus respuestas |
| GET | `/opina/ranking?periodoId=&limit=&incluirMuestraInsuficiente=false` | Docentes ordenados por **calificación global** (Σ Sí ÷ Σ respuestas de todos sus CRN) |
| GET | `/opina/comparativo?periodos=1,2,3` | % por docente en varios periodos |

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
| GET | `/faltas/resumen-semestral?periodoId=` | Núm. de faltas, profesores que faltaron, desglose por motivo |

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

## Analítica (panel)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/analitica/kpis?periodoId=&quincenaId=` | Activos/inactivos, faltas quincena y semestre, descontado, pagado a suplentes, promedio OPINA |
| GET | `/analitica/opina?periodoId=` | % por maestro (barras) |
| GET | `/analitica/distribucion-nivel` | Docentes por nivel que imparten |
| GET | `/analitica/perfil-docentes` | Conteos por género, nivel de estudios, campo de formación y rangos de antigüedad |
| GET | `/analitica/faltas-por-motivo?periodoId=` | Para gráfica |
| GET | `/analitica/cumpleanos-mes` | Cumpleaños del mes |

## Rutas que se eliminan de la plantilla
`/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/me`, `/api/notas/*`.
