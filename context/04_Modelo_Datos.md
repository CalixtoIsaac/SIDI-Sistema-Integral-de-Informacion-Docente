# Modelo de Datos - SIDI
Responsable: Uziel Armando García Duarte · Motor: PostgreSQL 16

> **Diseño preliminar.** Aún no puede definirse toda la base de datos porque faltan los 3 formatos Excel. Aquí están los campos que ya se sabe que deben mostrarse; lo demás va en `datos_adicionales` hasta tener los formatos.

## 1. Diagrama entidad-relación (resumen)
```
departamentos 1───* docentes *───1 contratos
                       │
   ┌──────────┬────────┼────────────┬──────────────┐
   *          *        *            *              *
titulos  asignaturas  inasistencias  calificaciones_opina
            │  │           │
            │  *──1 tipos_clase 1──*
            *
         horarios
```

## 2. Decisiones de diseño
- Campos conocidos como columnas fijas; columnas extra de los Excel en `datos_adicionales JSONB`.
- OPINA en tabla propia (calificación **semestral**).
- Costo por hora en el catálogo `tipos_clase` (se edita sin tocar código).
- El descuento se guarda calculado en cada falta (conserva la tarifa de ese momento).
- Edad y fecha de cumpleaños se derivan de `fecha_nacimiento`.
- "Da clases el semestre actual" = tiene asignaturas en el semestre vigente.

## 3. Tipos de datos clave
| Dato | Tipo | Regla |
|---|---|---|
| CURP | `CHAR(18)` | Único; formato oficial MX |
| Núm. nómina | `VARCHAR(20)` | Único |
| CRN | `VARCHAR(10)` | Único por semestre |
| Estatus | `BOOLEAN` | `TRUE` activo (verde) / `FALSE` inactivo (gris) |
| Fecha de nacimiento | `DATE` | Cumpleaños = día/mes |
| Calificación OPINA | `NUMERIC(4,2)` | 0.00 – 10.00 |
| Montos | `NUMERIC(10,2)` | MXN |

## 4. DDL
```sql
CREATE TABLE departamentos (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE contratos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE docentes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  num_nomina VARCHAR(20) UNIQUE NOT NULL,
  curp CHAR(18) UNIQUE NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  apellido_paterno VARCHAR(100) NOT NULL,
  apellido_materno VARCHAR(100),
  fecha_nacimiento DATE NOT NULL,
  nivel_educativo VARCHAR(30) NOT NULL
    CHECK (nivel_educativo IN ('Bachillerato General','Bachillerato Bilingüe','Profesional')),
  departamento_id INT REFERENCES departamentos(id),
  contrato_id INT REFERENCES contratos(id),
  activo BOOLEAN NOT NULL DEFAULT TRUE,
  datos_adicionales JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE titulos_docente (
  id SERIAL PRIMARY KEY,
  docente_id UUID NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  grado VARCHAR(30) NOT NULL,          -- Licenciatura, Maestría, Doctorado
  nombre_titulo VARCHAR(150) NOT NULL,
  institucion VARCHAR(150),
  anio_obtencion SMALLINT
);

CREATE TABLE tipos_clase (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(50) UNIQUE NOT NULL,
  costo_hora NUMERIC(10,2) NOT NULL    -- ⚠️ a confirmar con el cliente
);

CREATE TABLE asignaturas_docente (
  id SERIAL PRIMARY KEY,
  docente_id UUID NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  crn VARCHAR(10) NOT NULL,
  nombre_materia VARCHAR(100) NOT NULL,
  tipo_clase_id INT REFERENCES tipos_clase(id),
  semestre VARCHAR(10) NOT NULL,       -- 2026-2
  UNIQUE (crn, semestre)
);

CREATE TABLE horarios (
  id SERIAL PRIMARY KEY,
  asignatura_id INT NOT NULL REFERENCES asignaturas_docente(id) ON DELETE CASCADE,
  dia_semana SMALLINT NOT NULL CHECK (dia_semana BETWEEN 1 AND 7),
  hora_inicio TIME NOT NULL,
  hora_fin TIME NOT NULL,
  aula VARCHAR(30)
);

CREATE TABLE inasistencias (
  id SERIAL PRIMARY KEY,
  docente_id UUID NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  asignatura_id INT REFERENCES asignaturas_docente(id),
  tipo_clase_id INT NOT NULL REFERENCES tipos_clase(id),
  fecha DATE NOT NULL,
  horas SMALLINT NOT NULL DEFAULT 1 CHECK (horas > 0),
  justificada BOOLEAN NOT NULL DEFAULT FALSE,
  motivo VARCHAR(30),                  -- Viaje, Incapacidad, Comisión, Personal
  observaciones TEXT,
  monto_descuento NUMERIC(10,2) NOT NULL DEFAULT 0,
  quincena VARCHAR(10) NOT NULL,       -- 2026-10-Q1
  semestre VARCHAR(10) NOT NULL
);

CREATE TABLE calificaciones_opina (
  id SERIAL PRIMARY KEY,
  docente_id UUID NOT NULL REFERENCES docentes(id) ON DELETE CASCADE,
  semestre VARCHAR(10) NOT NULL,
  calificacion NUMERIC(4,2) NOT NULL CHECK (calificacion BETWEEN 0 AND 10),
  UNIQUE (docente_id, semestre)
);

CREATE INDEX idx_docentes_activo ON docentes(activo);
CREATE INDEX idx_docentes_nombre ON docentes(apellido_paterno, nombre);
CREATE INDEX idx_docentes_datos ON docentes USING GIN (datos_adicionales);
CREATE INDEX idx_asignaturas_semestre ON asignaturas_docente(semestre);
CREATE INDEX idx_inasistencias_periodo ON inasistencias(semestre, quincena);
CREATE INDEX idx_opina_semestre ON calificaciones_opina(semestre, calificacion DESC);
```
*Si el cliente confirma inicio de sesión, se agregará la tabla `usuarios`.*

## 5. Regla de descuento
```
monto_descuento = justificada ? 0 : horas × tipos_clase.costo_hora
```

## 6. Pendientes
- Mapeo definitivo de los 3 Excel a columnas fijas / `datos_adicionales`.
- Catálogo real de tipos de clase y tarifas.