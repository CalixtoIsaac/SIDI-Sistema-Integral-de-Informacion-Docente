# Documentación final de SIDI

Entrega final del proyecto · 26/11/2026 · versión evaluada: `develop` @ `800e561`, instalador v1.0.1.

| Documento | Para quién | Qué contiene |
|---|---|---|
| [Reporte técnico](REPORTE_TECNICO.md) | Jurado de la Feria de Ingenierías y profesor | Arquitectura, funcionalidades, fundamentación cuantitativa, pruebas y errores corregidos con capturas, seguridad y privacidad, impacto, riesgos, despliegue, lecciones aprendidas y mejoras |
| [Manual de usuario](MANUAL_USUARIO.md) | Coordinación de Docentes | Uso diario de cada pantalla, rutinas de inicio de semestre y de cada quincena, respaldo y preguntas frecuentes |
| [Manual técnico](MANUAL_TECNICO.md) | Quien instala o mantiene SIDI | Stack, estructura, instalación, configuración, base de datos, API, frontend, pruebas, despliegue, respaldo, seguridad y solución de problemas |

Las imágenes están en [`img/`](img/) y usan **datos de demostración** (`node scripts/demo.js`): ningún nombre, nómina o CURP es real.

## SIDI en cifras

| Dato | Valor |
|---|---|
| Historias de usuario implementadas | 27 (134 puntos, 3 sprints) |
| Pruebas automáticas | 267 / 267 en verde |
| Búsqueda de docente (p95) | < 6 ms (meta: 500 ms) |
| OPINA de 4,000 filas, vista previa (p95) | 0.35 s (meta: 10 s) |
| Generación de los dos Excel de Nacional (p95) | < 12 ms |
| Inconsistencias en los reportes manuales Q16–Q20 (línea base) | 24 |
| Commits / PR fusionados | 129 / 44 |

## Cómo se tomaron las evidencias

- **Capturas de la aplicación:** navegador sin interfaz (Chrome) sobre la base de demostración, 1440 × 900 px.
- **Errores E1–E6:** se volvió al commit anterior a cada corrección, se ejecutó la prueba que lo detecta (captura "antes") y después la misma prueba con la corrección (captura "después").
- **Mediciones:** script con `fetch` contra el servidor local, 5 a 30 repeticiones por operación; se reportan mediana y percentil 95.
