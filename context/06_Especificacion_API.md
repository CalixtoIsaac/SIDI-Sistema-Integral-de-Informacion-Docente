# Especificación de API - SIDI
Responsable: Matías Hernández Garrido (apoyo: Sebastián) · Base URL: `/api` · JSON

> **Versión 2 (26/10/2026).** Sin autenticación (no hay login): ninguna ruta lleva `Authorization`. Se sigue la convención de la plantilla para que `UI.api` funcione sin cambios.

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
| 409 | Nómina/CURP duplicada · falta repetida (mismo docente, CRN y día) |
| 413 | Archivo demasiado grande (> 15 MB) |
| 422 | Excel no reconocido (columnas o versión desconocida) |
| 423 | Quincena cerrada (no se puede modificar) |
| 500 | Error interno |

## Sistema
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/health` | `{ status, timestamp }` (ya existe) |
| GET | `/configuracion` | `{ configuracion: { "tema.modo": "automatico", "tema.color": "#DB2777", "perfil.nombre": "...", "opina.muestra_minima": "10", "opina.campus": "Veracruz", "reportes.ruta_descuentos": "https://…/NOMINA%20AD2026/" } }` |
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
| GET | `/docentes` | Tabla. Query: `search` (nombre, CURP, nómina con o sin `L0`, CRN), `activo`, `semestreActual=true`, `nivel`, `titulo`, `ordenar` (`nombre`\|`edad`\|`titulos`\|`opina`), `page`, `limit`. Cada fila: nombre, CURP, nacimiento, cumpleaños, nivel, títulos, OPINA del periodo actual (% y respuestas), total de faltas, `incompleto` |
| GET | `/docentes/:id` | Datos extendidos (títulos, asignaturas+horarios, departamento, faltas, suplencias cubiertas, OPINA por periodo) |
| GET | `/docentes/:id/resumen` | Hover: nómina, contratos, CRN del semestre |
| GET | `/docentes/:id/opina?periodoId=` | Detalle OPINA: `global { respuestas, positivas, porcentaje }`, `porCrn [...]`, reactivos v2, comentarios |
| POST | `/docentes` | Alta manual (la nómina se normaliza) |
| PUT | `/docentes/:id` | Actualizar |
| PATCH | `/docentes/:id/estatus` | `{ "activo": false }` suspender / reactivar |
| POST | `/docentes/:id/asignaturas` | Agregar grupo: `{ periodoId, crn, materia, tipoClaseId, numContrato, horarios: [] }` |
| PUT / DELETE | `/asignaturas/:id` | Editar (p. ej. asignar tipo de clase) / eliminar |

Ejemplo `POST /docentes`:
```json
{
  "nomina": "3560330",
  "nombres": "Alessandro", "apellidoPaterno": "Bruno", "apellidoMaterno": "Cámpoli",
  "curp": "BUCA950312HVZRMLA4", "fechaNacimiento": null,   // si es null se deriva de la CURP
  "nivelEducativo": "Bachillerato General", "tipoContrato": "determinado",
  "asignaturas": [{ "periodoId": 4, "crn": "16434", "materia": "…", "tipoClaseId": 5, "numContrato": "5568351" }]
}
```
Respuesta `201`: `{ "docente": { "id": 12, "nomina": "L03560330", … } }`

## Carga masiva de maestros (nómina, nombre, edad, CURP)
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/docentes/excel/preview` | `multipart/form-data` (`archivo`). **No guarda**; devuelve cantidad y nombres |
| POST | `/docentes/excel/confirm` | `{ "previewId": "..." }` — agrega/actualiza en una transacción |

```json
{ "previewId": "b7c1...", "total": 51, "aAgregar": 48, "aActualizar": 5,
  "docentes": [{ "nombre": "José Félix Ramos", "nomina": "L00129481" }],
  "duplicados": [{ "fila": 9, "nomina": "..." }],
  "errores": [{ "fila": 17, "campo": "curp", "mensaje": "Formato inválido" }],
  "revisar": [{ "fila": 23, "nomina": "L03109311", "mensaje": "La edad (31) no coincide con la CURP (29)" }],
  "columnasNoReconocidas": ["Extensión"] }
```
Las vistas previas se guardan en memoria 30 minutos.

## OPINA
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/opina/preview` | `multipart` (`archivo` .xlsx/.xlsb, `campus` opcional). Detecta versión y periodo; **no guarda** |
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
| GET | `/faltas?quincenaId=&docenteId=&periodoId=` | Lista con monto y suplente |
| POST | `/faltas/preview` | Calcula sin guardar (montos, comentario, totales) |
| POST | `/faltas` | Registra una o varias faltas (una por CRN y día) con sus suplencias, en una transacción |
| PUT | `/faltas/:id` | Editar (recalcula monto y actualiza la incidencia de la suplencia) |
| DELETE | `/faltas/:id` | Elimina la falta, su suplencia y la incidencia generada |
| PUT | `/faltas/:id/suplencia` | `{ docenteSuplenteId, monto }` asignar/cambiar quién cubrió |
| DELETE | `/faltas/:id/suplencia` | Quitar suplencia |
| GET | `/faltas/resumen-quincena?quincenaId=` | Descontado, pagado a suplentes y diferencia por docente (= hoja Detalle) |
| GET | `/faltas/resumen-semestral?periodoId=` | Núm. de faltas, profesores que faltaron, desglose por motivo |

Ejemplo `POST /faltas`:
```json
{
  "quincenaId": 16, "docenteId": 12,
  "modo": "tarifa",
  "fechas": ["2026-08-17"],
  "asignaturaIds": [101, 102, 103, 104],
  "motivo": "Falta por asunto personal",
  "horasTexto": "8 horas= 1 día completo",
  "cuentaCargo": "5420103000",
  "justificada": false,
  "observaciones": "Viaja a CDMX por examen de UNAM",
  "suplencias": [{ "asignaturaId": 102, "fecha": "2026-08-17", "docenteSuplenteId": 30 }]
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
| GET | `/reportes/descuentos/validar?quincenaId=` | Avisos antes de generar (faltas sin CeCo, CRN sin tipo de clase…) |
| GET | `/reportes/descuentos?quincenaId=` | Descarga `DESCUENTO-PREPA Qnn.xlsx` |
| GET | `/reportes/incidencias/validar?quincenaId=` | Avisos (pagos sin contrato, PEP > 24 caracteres…) |
| GET | `/reportes/incidencias?quincenaId=` | Descarga `INCIDENCIAS PREPA Qnn.xlsx` (hojas Incidencia + Detalle; Detalle con vínculo externo a `DESCUENTO-PREPA Qnn.xlsx` en `reportes.ruta_descuentos`) |

## Analítica (panel)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/analitica/kpis?periodoId=&quincenaId=` | Activos/inactivos, faltas quincena y semestre, descontado, pagado a suplentes, promedio OPINA |
| GET | `/analitica/opina?periodoId=` | % por maestro (barras) |
| GET | `/analitica/distribucion-nivel` | Docentes por nivel |
| GET | `/analitica/faltas-por-motivo?periodoId=` | Para gráfica |
| GET | `/analitica/cumpleanos-mes` | Cumpleaños del mes |

## Rutas que se eliminan de la plantilla
`/api/auth/status`, `/api/auth/setup`, `/api/auth/login`, `/api/auth/me`, `/api/notas/*`.
