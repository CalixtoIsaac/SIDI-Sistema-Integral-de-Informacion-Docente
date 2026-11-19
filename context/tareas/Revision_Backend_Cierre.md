# Revisión del backend — cierre (19/11/2026)

Endpoints de `06_Especificacion_API.md` que faltaban y se completaron. Pruebas: **258 / 258** en verde (`npm test`), más prueba de punta a punta por HTTP con `data/demo.db`.

## 1. Endpoints nuevos

| Método | Ruta | HU | Archivos |
|---|---|---|---|
| GET | `/analitica/resumen-ejecutivo?periodoId=&compararCon=&graficas=G1,G2,…` | HU-26 | `services/resumenEjecutivoService.js`, `routes/analitica.js` |
| GET | `/analitica/plantilla?periodos=1,2,3` | HU-26 (G15) | ídem |
| GET | `/docentes/:id/opina?periodoId=` | HU-04 / HU-08 | `services/opinaConsultaService.js`, `routes/docentes.js` |
| GET | `/opina/comparativo?periodos=1,2,3` | HU-16 | ídem, `routes/opina.js` |
| GET | `/faltas/resumen-quincena?quincenaId=` | HU-13 | `services/resumenQuincenaService.js`, `routes/faltas.js` |
| PUT | `/periodos/:id` `{ actual: true, fechaInicio?, fechaFin? }` | HU-18 | `services/periodosService.js`, `routes/periodos.js` |
| GET | `/respaldo` | Sistema | `routes/respaldo.js`, `server.js` |

Pruebas nuevas: `tests/servicio-resumen-ejecutivo.test.js`, `tests/servicio-opina-consulta.test.js`, `tests/servicio-resumen-quincena.test.js` y un caso más en `tests/servicio-periodos.test.js`.

**Limpieza HU-00:** se quitó de `lib/db.js` el bloque TEMPORAL que creaba las tablas `usuarios` y `notas` de la plantilla (ya no existen `lib/auth.js` ni `routes/notas.js`).

## 2. Cómo responde el resumen ejecutivo

```json
{ "portada": { "encabezado": "Coordinación de Docentes · Preparatoria Veracruz · AGO-DIC 2026", "periodo": {…}, "compararCon": null, "elaboradoPor": "…", "fecha": "2026-11-19" },
  "kpis": { "docentesActivos": 18, "nuevos": 3, "bajas": 0, "oppCampus": 87.6, "variacionOpp": 1.7, "periodoOpp": {…},
            "promedioMaestros": 82.7, "periodoOpina": {…}, "faltas": 12, "profesoresQueFaltaron": 5, "descontado": 590, "pagadoSuplentes": 173 },
  "diapositivas": [{ "id": "G1", "titulo": "…", "pregunta": "¿Mejoramos o empeoramos?", "tipo": "linea",
                     "conclusion": "El campus subió 1.7 pts en OPINA en ENE-MAY 2026 respecto a AGO-DIC 2025 (87.6 %)", "sinDatos": false, "datos": {…} }, …],
  "hallazgos": [{ "nivel": "alerta|aviso|positivo", "tipo": "OPINA_BAJA", "texto": "…" }] }
```

- Orden fijo: G1 → G2 → G3 → G4 → G9 → G10 → G15 → G16 (el filtro `graficas` no cambia el orden).
- OPINA (G2–G4) usa el semestre elegido si ya tiene OPINA; si no, el último anterior que sí lo tenga (`kpis.periodoOpina`).
- % OPP: si el semestre elegido aún no está capturado, se usa el último capturado (`kpis.periodoOpp`) y sale el hallazgo `SIN_OPP`.
- Sin datos → `sinDatos: true` y `"Sin datos registrados"`. Nunca incluye comentarios de alumnos ni observaciones de baja (hay prueba).

## 3. Puntos a detallar en equipo

1. **Dependencias de la plantilla.** `package.json` aún trae `bcryptjs` y `jsonwebtoken` (nadie los usa) y se llama `plantilla-express-sqlite`. No se tocaron aquí para no desincronizar `package-lock.json`. Propuesta: en una PC con internet, `npm uninstall bcryptjs jsonwebtoken`, renombrar a `sidi` y subir ambos archivos.
2. **Tablas viejas en bases existentes.** Las `app.db` que ya existen conservan `usuarios` y `notas` vacías. No estorban. ¿Agregamos `003_quitar_tablas_plantilla.sql` con `DROP TABLE IF EXISTS`?
3. **Nombres en el resumen ejecutivo.** G3 y el hallazgo `OPINA_BAJA` muestran nombres y % de docentes con OPINA < 70 %. Confirmar con Saraí que está bien en una presentación para directivos.
4. **Umbral de "docentes con más faltas".** Hoy son los 3 primeros con 2 faltas o más. ¿Es el criterio que quiere la coordinadora?
5. **Textos de los reactivos v2** (`ETIQUETAS_REACTIVOS` en `opinaConsultaService.js`): se tomaron de los encabezados del archivo 2026. Validar la redacción que se mostrará en la ficha.
6. **`PUT /periodos/:id` solo acepta `actual: true`.** Para cambiar de semestre se marca otro (siempre queda uno). ¿Les parece bien o prefieren permitir "ninguno"?
7. **El respaldo contiene datos personales** (CURP, fechas de nacimiento). El botón debe avisarlo, y el archivo no se sube a git ni se comparte por chat.
8. **Frontend pendiente que ya puede consumir estos endpoints:** visor `public/js/resumen.js` (HU-26), pestaña OPINA de la ficha con reactivos y comentarios, tabla del comparativo, selector de "semestre actual" en Catálogos, botón "Descargar respaldo" en Perfil y el resumen por docente en Reportes antes de generar.
9. **HU-25:** sigue pendiente la prueba manual del `.eml` en el Outlook de la coordinadora.
10. Actualizar los estados de `Tareas_Matias_Backend.md` cuando se fusionen los PR.

## 4. Vista Docentes rediseñada (revisión grupal 19/11)

| Punto de la revisión | Cómo quedó |
|---|---|
| 1. Limitar profesores en pantalla y paginar | Las filas por página se calculan con el alto de la ventana para que la tabla se vea completa **sin scroll** (mín. 4, máx. 30; se recalcula al cambiar el tamaño). Pie con "Mostrando 1–9 de 60" y paginador `‹ 1 2 … 7 ›`. El backend ya devuelve solo la página pedida (`page`, `limit`, `paginas`). |
| 2. Solo lo relevante a primera vista | Columnas: Nombre (punto de estatus + ⚠ si faltan datos), Nómina, Grupos, Antigüedad, OPINA (punto verde / ámbar / rojo), Faltas del semestre y Estado. Pestañas **Todos · Activos · Inactivos · Datos incompletos** con conteo (`GET /docentes` → `conteos`; nuevo filtro `incompleto=true`). Los filtros detallados quedan tras el botón **Filtros**. |
| 3. Ficha a pantalla completa | Clic en cualquier parte de la fila → `#docentes?ficha=<id>`: "‹ Volver a docentes", tarjeta con avatar, nómina · nivel · campo, aviso de datos faltantes o de baja, acciones (Editar, Ver CV, Suspender/Reactivar), indicadores (OPINA, faltas, grupos, horas, antigüedad, total mensual) y pestañas. *Asignaturas y horario* muestra una tarjeta por materia; *OPINA* ya usa `/docentes/:id/opina` (por grupo, reactivos y comentarios). "Volver" regresa a la misma página, pestaña y filtros. |

Archivos: `public/js/docentes.js`, `public/css/sidi.css`, `services/docentesService.js`, `tests/servicio-docentes.test.js`.

**Para decidir en equipo:**
- Se quitó el selector de **Columnas** (HU-03 lo pedía): todos los campos siguen en la ficha. ¿Lo regresamos como opción?
- Colores: OPINA < 70 % rojo · 70–84.9 % ámbar · ≥ 85 % verde; faltas 0 gris · 1–2 ámbar · 3+ rojo. Ajustables en `tonoOpina` / `tonoFaltas`.
- En pantallas de menos de ~700 px de alto se muestran 4 filas como mínimo y puede quedar un scroll pequeño.
