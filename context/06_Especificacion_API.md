# Especificación de API - SIDI
Responsable: Matías Hernández Garrido (apoyo: Sebastián) · Base URL: `/api/v1` · JSON

> Guía preliminar; los campos de docente se ampliarán al recibir los 3 formatos Excel.

## Formato de respuesta
```json
{ "ok": true, "data": { }, "meta": { "page": 1, "total": 150 } }
{ "ok": false, "error": { "code": "CURP_INVALIDA", "message": "La CURP no tiene un formato válido", "details": [] } }
```

## Códigos HTTP
| Código | Uso |
|---|---|
| 200 | Correcto |
| 201 | Creado |
| 204 | Eliminado |
| 400 | Validación fallida |
| 404 | No encontrado |
| 409 | CURP o nómina duplicada |
| 413 | Archivo demasiado grande |
| 422 | Excel no reconocido |
| 500 | Error interno |

## Docentes
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/docentes` | Tabla. Query: `search` (nombre, CURP, nómina, CRN), `activo`, `semestreActual=true`, `nivel`, `titulo`, `ordenar` (`nombre`\|`edad`\|`titulos`\|`opina`), `page`, `limit`. Cada fila incluye nombre, CURP, fecha de nacimiento, cumpleaños, nivel, títulos, OPINA y total de faltas |
| GET | `/docentes/:id` | Datos extendidos (títulos, asignaturas, horarios, departamento, OPINA, faltas) |
| GET | `/docentes/:id/resumen` | Resumen de hover: nómina, contrato, CRN |
| POST | `/docentes` | Alta manual |
| PUT | `/docentes/:id` | Actualizar |
| PATCH | `/docentes/:id/estatus` | `{ "activo": false }` suspender / reactivar |

Ejemplo `POST /docentes`:
```json
{
  "numNomina": "00129481", "curp": "RAFJ800101HVZMLS09",
  "nombre": "José", "apellidoPaterno": "Félix", "apellidoMaterno": "Ramos",
  "fechaNacimiento": "1980-01-01", "nivelEducativo": "Profesional",
  "contratoId": 1, "departamentoId": 2,
  "titulos": [{ "grado": "Maestría", "nombreTitulo": "M. en Educación" }],
  "asignaturas": [{ "crn": "4821", "nombreMateria": "Cálculo", "tipoClaseId": 1, "semestre": "2026-2",
                    "horarios": [{ "diaSemana": 1, "horaInicio": "07:00", "horaFin": "09:00" }] }]
}
```

## Carga masiva Excel
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/docentes/excel/preview` | `multipart/form-data` (`archivo`). **No guarda**; devuelve cantidad y nombres |
| POST | `/docentes/excel/confirm` | `{ "previewId": "..." }` — agrega todos en una transacción |

```json
{ "ok": true, "data": {
  "previewId": "b7c1...", "total": 51, "aAgregar": 48,
  "docentes": [{ "nombre": "José Félix Ramos", "numNomina": "00129481" }],
  "duplicados": [{ "fila": 9, "curp": "..." }],
  "errores": [{ "fila": 17, "campo": "curp", "mensaje": "Formato inválido" }],
  "columnasNoReconocidas": ["Extensión"]
}}
```

## Inasistencias y descuentos
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/inasistencias` | Query: `docenteId`, `semestre`, `quincena`, `justificada` |
| POST | `/inasistencias` | Registra falta y calcula `montoDescuento` |
| PUT | `/inasistencias/:id` | Editar (recalcula) |
| DELETE | `/inasistencias/:id` | Eliminar |
| GET | `/inasistencias/descuentos?quincena=2026-10-Q1` | Descuento por docente en la quincena |
| GET | `/inasistencias/resumen-semestral?semestre=2026-2` | Número de inasistencias, cuántos profesores faltaron, desglose por razón |
| GET / PUT | `/tipos-clase`, `/tipos-clase/:id` | Catálogo de costo por hora |

## Analítica (panel administrativo)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/analytics/kpis?semestre=` | Docentes activos/inactivos, inasistencias totales, descuento quincenal, promedio OPINA |
| GET | `/analytics/opina?semestre=` | Calificación OPINA por maestro (gráfica de barras) |
| GET | `/analytics/distribucion-nivel` | Docentes por nivel |
| GET | `/analytics/faltas-por-motivo?semestre=` | Para gráfica |
| GET | `/analytics/cumpleanos-mes` | Cumpleaños del mes |

## OPINA
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/opina/ranking?semestre=&limit=` | Maestros ordenados de mejor a peor calificación |
| POST | `/opina/import` | Carga calificaciones semestrales por Excel |
| PUT | `/docentes/:id/opina/:semestre` | Captura manual |

## Reportes
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/reportes/exportar` | `{ "formato": 1\|2\|3, "semestre": "2026-2", "quincena": null }` → `.xlsx` con el formato institucional exacto |