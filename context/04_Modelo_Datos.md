# Modelo de Datos - SIDI
Responsable: Uziel Armando García Duarte · Motor: **SQLite** (`better-sqlite3`, archivo `data/app.db`)

> **Versión 2.1 (26/10/2026):** aplicadas las respuestas del cliente (tarifa $54, pago en 4 meses, jornada = días, se conserva el vínculo externo de Detalle, OPINA global ponderada, Excel de maestros = nómina/nombre/edad/CURP). Pendientes vigentes en *07 §9*.

> Ajustado a los archivos reales (OPINA, Descuentos, Incidencias, tabla de pagos). El Excel de maestros solo traerá **nómina, nombre, edad y CURP**; títulos, departamento, grupos y horarios se capturan a mano. Columnas extra → `datos_adicionales`.

## 1. Diagrama entidad-relación (resumen)
```
periodos 1──* asignaturas *──1 docentes 1──* titulos_docente
               │    │  └──1 tipos_clase        │
               │    └──* horarios              ├──* faltas ──0..1 suplencias ──1 incidencias
               │                               ├──* incidencias *──1 quincenas
               └──* opina_respuestas *─────────┘        faltas *──1 quincenas
opina_importaciones 1──* opina_respuestas
departamentos 1──* docentes        catalogos (cc_nomina, motivos, CeCo, textos)        configuracion (clave/valor)
```

## 2. Decisiones de diseño
- **Nómina canónica** `L` + 8 dígitos (`L03560330`). Al importar se normaliza cualquier forma (`3560330`, `19011`, `L00019011`). Cada formato de salida la escribe como la pide (ver *07 §1*).
- **El contrato es por CRN** (Descuentos trae un contrato distinto por cada grupo del mismo docente) → `asignaturas.num_contrato`. Los pagos de Incidencias traen su propio contrato → `incidencias.num_contrato`.
- **Tipo de clase = horas/semana + idioma.** Determina la tarifa por día. Se asigna a cada asignatura (CRN).
- **Falta = 1 registro por CRN y por día** (así lo exige Descuentos). El monto se guarda calculado (conserva la tarifa del momento).
- **Suplencia** liga una falta con el docente que cubrió y con la incidencia de pago que se generó.
- **OPINA:** se guardan las respuestas crudas; la calificación se calcula con una vista. Así un cambio de fórmula no exige reimportar.
- **Periodos** como los nombra la institución: `AGO-DIC 2024`, `ENE-MAY 2025`, `ENE-MAY 2026`. "Da clases el semestre actual" = tiene asignaturas en el periodo marcado como `actual`.
- **Quincenas** numeradas 1–24 por año (`2026-Q16` = 16–31 ago 2026).
- **Sin tabla `usuarios`** (no hay login). Las preferencias del perfil van en `configuracion`.
- SQLite: fechas como `TEXT` ISO, booleanos como `INTEGER 0/1`, JSON como `TEXT` (con `json_extract`). `PRAGMA foreign_keys = ON` (ya está en la plantilla).

## 3. Tipos de datos clave
| Dato | Tipo SQLite | Regla |
|---|---|---|
| Nómina | `TEXT` | Único; `^L\d{8}$` |
| CURP | `TEXT` | Único si existe; 18 caracteres formato MX; de ella se deriva la fecha de nacimiento |
| CRN | `TEXT` | Único por periodo |
| Contrato | `TEXT` | 7 dígitos (se guarda texto para no perder ceros) |
| CeCo / cuenta de cargo | `TEXT` | 10 dígitos |
| Estatus | `INTEGER` | `1` activo (verde) / `0` inactivo (gris) |
| Fechas | `TEXT` | `YYYY-MM-DD` |
| Montos | `REAL` | MXN, 2 decimales |
| % OPINA | calculado | 0–100 |

## 4. DDL (`lib/migraciones/001_inicial.sql`)
```sql
-- ===== Configuración del perfil (sin login) =====
CREATE TABLE IF NOT EXISTS configuracion (
  clave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);
-- semillas: tema.modo='automatico', tema.color='#DB2777', perfil.nombre='Coordinación de Docentes',
--           opina.muestra_minima='10', opina.campus='Veracruz',
--           reportes.ruta_descuentos='<carpeta NOMINA AD2026 del original>' (vínculo externo de la hoja Detalle)

-- ===== Catálogos =====
CREATE TABLE IF NOT EXISTS departamentos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tipos_clase (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,                    -- 'Clase de 5 hrs en español'
  horas_semana REAL NOT NULL,                     -- 5, 4, 3, 1.5
  idioma TEXT NOT NULL CHECK (idioma IN ('ES','EN')),
  pago_semestre REAL NOT NULL,                    -- 11760.00
  pago_por_dia REAL NOT NULL,                     -- 90.00  (monto a descontar por día de falta en ese CRN)
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (horas_semana, idioma)
);

-- Catálogo genérico para listas del formato de Nacional
CREATE TABLE IF NOT EXISTS catalogos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo TEXT NOT NULL CHECK (tipo IN ('cc_nomina','motivo_incidencia','cuenta_cargo',
                                     'motivo_falta','horas_falta','situacion','estatus_falta','tipo_contrato')),
  valor TEXT NOT NULL,
  descripcion TEXT,
  orden INTEGER NOT NULL DEFAULT 0,
  activo INTEGER NOT NULL DEFAULT 1,
  UNIQUE (tipo, valor)
);
-- semillas (de los archivos Q16):
--  cc_nomina: 'Sueldo Carga Académica', 'Imp.Clase Artis.Cult.yDep', 'Flex Act. Acad de Apoyo'
--  motivo_incidencia: 'BB_Tutoreo (Preparatoria).', 'B2_Cap.Profr(CADI Asore, Compet.)',
--                     'D1_Activ. Artísticas, Cult Y Dep.', 'LB_Impart CursoTallGral'
--  cuenta_cargo: '5420103000' (académico), '5422101001' (artístico/cultural/deportivo)
--  motivo_falta: 'Falta por asunto personal', 'Falta injustificada', 'Suspensión'
--  horas_falta: '8 horas= 1 día completo', '4 horas= 1/2 día'
--  situacion: 'Se hace descuento correspondiente por permiso personal sin justificación.'
--  estatus_falta: 'Se descuenta y se toma la falta correspondiente.'
--  tipo_contrato: 'determinado'

CREATE TABLE IF NOT EXISTS periodos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  clave TEXT NOT NULL UNIQUE,                     -- 'ENE-MAY 2026'
  etiqueta_opina TEXT UNIQUE,                     -- '2026 Ene - May' (como viene en OPINA)
  fecha_inicio TEXT,
  fecha_fin TEXT,
  actual INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS quincenas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  anio INTEGER NOT NULL,
  numero INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 24),
  fecha_inicio TEXT NOT NULL,                     -- 2026-08-16
  fecha_fin TEXT NOT NULL,                        -- 2026-08-31
  fecha_pago TEXT NOT NULL,                       -- 2026-08-30 (editable; se usa en "A partir de qué periodo")
  cerrada INTEGER NOT NULL DEFAULT 0,             -- 1 = ya se enviaron los reportes (bloquea edición)
  UNIQUE (anio, numero)
);

-- ===== Docentes =====
CREATE TABLE IF NOT EXISTS docentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nomina TEXT NOT NULL UNIQUE CHECK (nomina GLOB 'L[0-9][0-9][0-9][0-9][0-9][0-9][0-9][0-9]'),
  nombres TEXT NOT NULL,
  apellido_paterno TEXT NOT NULL,
  apellido_materno TEXT,
  curp TEXT UNIQUE,                               -- Excel de maestros
  fecha_nacimiento TEXT,                          -- derivada de la CURP (AAMMDD, posiciones 5–10); editable
  edad_reportada INTEGER,                         -- edad del Excel de maestros; solo para validar contra la CURP
  nivel_educativo TEXT CHECK (nivel_educativo IN
    ('Bachillerato General','Bachillerato General Bilingüe','Profesional')),
  tipo_contrato TEXT DEFAULT 'determinado',
  departamento_id INTEGER REFERENCES departamentos(id),
  activo INTEGER NOT NULL DEFAULT 1,
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','excel_maestros','opina')),
  datos_adicionales TEXT NOT NULL DEFAULT '{}',   -- JSON
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  actualizado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS titulos_docente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  grado TEXT NOT NULL,                            -- Licenciatura, Maestría, Doctorado
  nombre_titulo TEXT NOT NULL,
  institucion TEXT,
  anio_obtencion INTEGER
);

-- Un grupo (CRN) que imparte un docente en un periodo
CREATE TABLE IF NOT EXISTS asignaturas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  crn TEXT NOT NULL,                              -- '16434'
  clave_grupo TEXT,                               -- 'Veracruz_BSCN1006_611'
  clave_materia TEXT,                             -- 'BSCN1006'
  materia TEXT NOT NULL,
  plan TEXT,                                      -- 'Bachillerato General' | '... Bilingüe'
  tipo_clase_id INTEGER REFERENCES tipos_clase(id),  -- captura manual (no viene en ningún Excel)
  num_contrato TEXT,                              -- contrato de ese CRN (Descuentos col. B)
  UNIQUE (crn, periodo_id)
);

CREATE TABLE IF NOT EXISTS horarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asignatura_id INTEGER NOT NULL REFERENCES asignaturas(id) ON DELETE CASCADE,
  dia_semana INTEGER NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio TEXT NOT NULL,                      -- '07:00'
  hora_fin TEXT NOT NULL,
  aula TEXT
);

-- ===== Faltas y descuentos (→ DESCUENTO-PREPA Qnn.xlsx) =====
CREATE TABLE IF NOT EXISTS faltas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER NOT NULL REFERENCES quincenas(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  asignatura_id INTEGER REFERENCES asignaturas(id),  -- NULL solo en descuento manual sin CRN
  fecha TEXT,                                     -- día de la falta (NULL si es rango manual)
  fecha_texto TEXT,                               -- '03/08/2026 al 16/08/2026' (solo manual)
  dias INTEGER NOT NULL DEFAULT 1 CHECK (dias >= 1), -- col. D "Jornada de trabajo" = número de días (confirmado)
  motivo TEXT NOT NULL,                           -- catálogo motivo_falta
  horas_texto TEXT NOT NULL DEFAULT '8 horas= 1 día completo',
  cuenta_cargo TEXT NOT NULL DEFAULT '5420103000',
  justificada INTEGER NOT NULL DEFAULT 0,
  modo_calculo TEXT NOT NULL DEFAULT 'tarifa' CHECK (modo_calculo IN ('tarifa','manual')),
  tarifa_aplicada REAL,                           -- copia de tipos_clase.pago_por_dia
  monto_descuento REAL NOT NULL DEFAULT 0,
  comentario TEXT,                                -- generado: 'CRN 16434 de 3 horas a la semana, a descontar 54.00 = 54.00'
  ticket TEXT,
  situacion TEXT,                                 -- para hoja Detalle
  estatus TEXT,                                   -- para hoja Detalle
  observaciones TEXT,                             -- motivo detallado (viaje, examen…), uso interno
  creado_en TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (docente_id, asignatura_id, fecha)
);

-- ===== Pagos adicionales (→ INCIDENCIAS PREPA Qnn.xlsx, hoja Incidencia) =====
CREATE TABLE IF NOT EXISTS incidencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  quincena_id INTEGER NOT NULL REFERENCES quincenas(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  num_contrato TEXT NOT NULL,
  tipo_contrato TEXT NOT NULL DEFAULT 'determinado',
  cc_nomina TEXT NOT NULL,                        -- catálogo cc_nomina
  motivo TEXT NOT NULL,                           -- catálogo motivo_incidencia
  detalle TEXT NOT NULL,                          -- col. G
  ceco TEXT NOT NULL,                             -- col. H (10 caracteres)
  elemento_pep TEXT,                              -- col. I (24 caracteres)
  orden_interna TEXT,                             -- col. J (12 caracteres)
  importe_total REAL NOT NULL CHECK (importe_total >= 0),
  num_periodos INTEGER NOT NULL DEFAULT 1 CHECK (num_periodos >= 1),
  a_partir_de TEXT NOT NULL,                      -- col. N; por defecto quincenas.fecha_pago
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual','suplencia')),
  orden INTEGER NOT NULL DEFAULT 0                -- orden de las filas en el Excel
);

CREATE TABLE IF NOT EXISTS suplencias (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  falta_id INTEGER NOT NULL UNIQUE REFERENCES faltas(id) ON DELETE CASCADE,
  docente_suplente_id INTEGER NOT NULL REFERENCES docentes(id),
  incidencia_id INTEGER UNIQUE REFERENCES incidencias(id) ON DELETE SET NULL,
  monto REAL NOT NULL                             -- por defecto = faltas.monto_descuento
);

-- ===== OPINA =====
CREATE TABLE IF NOT EXISTS opina_importaciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  archivo TEXT NOT NULL,
  version_formato TEXT NOT NULL CHECK (version_formato IN ('v1','v2')),
  filtro_campus TEXT,                             -- 'Veracruz' o NULL (todos)
  filas INTEGER NOT NULL,
  importado_en TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS opina_respuestas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  importacion_id INTEGER NOT NULL REFERENCES opina_importaciones(id) ON DELETE CASCADE,
  periodo_id INTEGER NOT NULL REFERENCES periodos(id),
  docente_id INTEGER NOT NULL REFERENCES docentes(id),
  crn TEXT NOT NULL,
  response_id TEXT,                               -- solo v1
  campus_grupo TEXT,
  recomienda INTEGER NOT NULL,                    -- 1 = 'Sí', 0 = 'No'
  por_que_si TEXT,                                -- v1
  por_que_no TEXT,                                -- v1
  items TEXT,                                     -- v2 JSON: {"conocimiento":"Sí","retos":"No estoy seguro",...}
  comentario TEXT
);

-- Calificación por grupo (un docente puede tener varias: distintas materias y grados)
CREATE VIEW IF NOT EXISTS v_opina_crn AS
SELECT periodo_id, docente_id, crn,
       COUNT(*)                                AS respuestas,
       SUM(recomienda)                         AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas
GROUP BY periodo_id, docente_id, crn;

-- Calificación GLOBAL del docente en el periodo: todas sus respuestas juntas
-- (ponderada por alumnos; NO es el promedio de los porcentajes de cada CRN)
CREATE VIEW IF NOT EXISTS v_opina_docente AS
SELECT periodo_id, docente_id,
       COUNT(*)                                AS respuestas,
       SUM(recomienda)                         AS positivas,
       ROUND(100.0 * SUM(recomienda) / COUNT(*), 1) AS porcentaje
FROM opina_respuestas
GROUP BY periodo_id, docente_id;

-- ===== Índices =====
CREATE INDEX IF NOT EXISTS idx_docentes_activo   ON docentes(activo);
CREATE INDEX IF NOT EXISTS idx_docentes_nombre   ON docentes(apellido_paterno, nombres);
CREATE INDEX IF NOT EXISTS idx_asig_periodo      ON asignaturas(periodo_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_faltas_quincena   ON faltas(quincena_id, docente_id);
CREATE INDEX IF NOT EXISTS idx_inc_quincena      ON incidencias(quincena_id, orden);
CREATE INDEX IF NOT EXISTS idx_opina_periodo     ON opina_respuestas(periodo_id, docente_id);
```

## 5. Reglas de negocio
```
nomina_canonica(x)   = 'L' + rellenar_ceros(solo_digitos(x), 8)
nomina_nacional(n)   = entero(n sin 'L')                      -- L00019011 → 19011

quincena(fecha)      = (mes − 1) × 2 + (día ≤ 15 ? 1 : 2)

-- Falta con modo 'tarifa' (una por CRN y día)
tarifa_aplicada      = tipos_clase.pago_por_dia  del CRN
monto_descuento      = justificada ? 0 : tarifa_aplicada       -- ⏳ trato de justificadas por confirmar (07 §9)
dias                 = 1                                        -- manual: días del rango (p. ej. 14)
comentario           = 'CRN {crn} de {horas} horas a la semana, a descontar {m} = {m}'

-- Suplencia
suplencias.monto     = faltas.monto_descuento (editable)
incidencia generada  = cc 'Flex Act. Acad de Apoyo', motivo 'B2_Cap.Profr(CADI Asore, Compet.)',
                       periodos 1, importe = monto, detalle 'Sustituyó al docente …'

-- Incidencia
importe_por_periodo  = importe_total / num_periodos            -- en Excel queda como fórmula

-- Detalle (por docente que faltó, en la quincena)
descontado           = Σ faltas.monto_descuento
pagado_suplentes     = Σ suplencias.monto de esas faltas
diferencia           = descontado − pagado_suplentes

-- OPINA
calificacion_crn     = 100 × Σ recomienda / respuestas  del CRN
calificacion_global  = 100 × Σ recomienda / Σ respuestas  de todos sus CRN del periodo
                       -- 'muestra insuficiente' si respuestas < muestra_minima (propuesta del equipo)

-- Docente (Excel de maestros)
fecha_nacimiento     = CURP[5..10] como AAMMDD; siglo = CURP[17] dígito → 19xx, letra → 20xx
edad_calculada       ≠ edad_reportada  → marcar "Revisar fecha de nacimiento"
```
Una quincena `cerrada` no permite editar sus faltas ni incidencias (evita cambiar algo ya enviado a Nacional); se puede reabrir con confirmación.

## 6. Semillas (`lib/semillas.js`)
- `tipos_clase`: las 8 filas de la tabla de pagos (*07 §6*), con **$54** para 3 h en español.
- `catalogos`: valores listados arriba.
- `periodos`: AGO-DIC 2024, ENE-MAY 2025, ENE-MAY 2026, AGO-DIC 2026 (actual).
- `quincenas`: las 24 del año en curso, con `fecha_pago` = día 15 / último día del mes (editable; Q16 2026 se paga el 30/08).
- `configuracion`: valores por defecto del perfil y de OPINA.

## 7. Pendientes
- Recibir el Excel de maestros y confirmar los nombres exactos de sus columnas (nómina, nombre, edad, CURP).
- Trato de faltas justificadas y monto de suplencias (*07 §9*).
