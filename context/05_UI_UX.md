# Especificación de Pantallas UI/UX - SIDI
Responsable: Sebastián Huesca Ramírez · Validación con el cliente: Saraí Cecilio Rascón (PO)

## Principios
- Pensado para una usuaria sin conocimientos técnicos: lenguaje claro, botones con icono + texto.
- Máximo 2 clics para cualquier consulta frecuente.
- Colores: **verde** activo, **gris** inactivo, **rojo** faltas/alerta, **ámbar** pendiente.
- Confirmación antes de acciones masivas o de suspender.

## Layout general
```
+-------------------------------------------------------------------+
| SIDI · Sistema Integral de Información Docente   [🔍 Buscar]       |
+-------------+-----------------------------------------------------+
| 📊 Panel     |  ← primera vista al abrir                           |
| 👩‍🏫 Docentes  |                                                     |
| 📅 Faltas    |                                                     |
| 📄 Reportes  |                                                     |
+-------------+-----------------------------------------------------+
```

## 1. Panel administrativo (primera vista)
```
+-----------------+ +-------------------+ +------------------+ +----------------+
| Docentes activos| | Inasistencias tot.| | Descuento quinc. | | Promedio OPINA |
|    142 / 150    | |        38         | |   $ (calculado)  | |      9.1       |
+-----------------+ +-------------------+ +------------------+ +----------------+
Calificaciones del OPINA
 Maestro José:    ===================
 Maestro Félix:   =================
 Maestra Heidi:   ================
 Maestro Carlos:  =======
Docentes por nivel (General / Bilingüe / Profesional)   Faltas por motivo   🎂 Cumpleaños del mes
```

## 2. Tabla de docentes
```
[🔍 Nombre, CURP, Nómina o CRN]  [☑ Solo semestre actual] Estatus[▾] Nivel[▾] Ordenar[Alfabético▾]
[+ Nuevo docente] [⬆ Subir Excel]
+--+-------------------+-----------+-----------+----------+-------------+-------------+-------+-------+
|● | Nombre            | CURP      | F. nacim. | Cumpleaños| Nivel      | Títulos     | OPINA | Faltas|
+--+-------------------+-----------+-----------+----------+-------------+-------------+-------+-------+
|🟢| José Félix Ramos  | RAFJ8001..| 01/01/1980| 1 de ene | Profesional | Maestría    |  9.8  |   0   |
|⚪| Heidi Castro Díaz | CADH8505..| 05/05/1985| 5 de may | Bach. Bilingüe| Licenciatura| 9.5 |   2   |
+--+-------------------+-----------+-----------+----------+-------------+-------------+-------+-------+
```
- **Pasar el mouse sobre el nombre** → resumen pequeño: Núm. de nómina · Contrato · CRN.
- **Clic en el nombre** → datos extendidos debajo, con pestañas:
  1. Datos personales (CURP, fecha de nacimiento, edad, cumpleaños)
  2. Trayectoria académica y profesional (títulos, nivel, departamento)
  3. Asignaturas y horarios (CRN, materia, tipo de clase, días y horas)
  4. Inasistencias y descuentos
- Botón **Suspender / Reactivar** con confirmación (cambia el punto a gris/verde).
- Filtros: orden alfabético, edad, títulos, nivel, estatus, "solo los que dan clases este semestre".

## 3. Captura de datos
**Opción 1 – Formulario manual** en pasos: Datos personales → Laborales → Académicos → Asignaturas y horarios. Validación inmediata (CURP, nómina repetida).

**Opción 2 – Subir Excel:**
```
Paso 1: [ Arrastra aquí tu archivo Excel ]
Paso 2: Confirma la información
  Se agregarán 48 maestros:
   1. José Félix Ramos
   2. Heidi Castro Díaz
   ...
  ⚠️ 2 ya existen (se omitirán)   ❌ 1 con error (fila 17: CURP inválida)
Paso 3: [Cancelar]  [Confirmar y agregar 48 maestros]
```

## 4. Búsqueda
- Una sola barra que busca por Nombre, CURP, número de nómina o CRN, mostrando resultados mientras se escribe.
- Chips de filtros activos con "✕" y "Limpiar filtros".

## 5. Inasistencias
**Por quincena (descuentos):**
```
Quincena: [1ª oct 2026 ▾]                       [+ Registrar falta]
| Docente   | Fecha | Tipo de clase | Horas | Justificada | Descuento |
Total de descuentos de la quincena: $ ...
```
Formulario de falta: docente, fecha, clase/tipo de clase, horas, ¿justificada?, motivo. Muestra el **descuento calculado antes de guardar**.

**Por semestre:**
```
Semestre: [2026-2 ▾]
+--------------------+ +-------------------------+
| Inasistencias: 38  | | Profesores que faltaron: 12 |
+--------------------+ +-------------------------+
Razones: Viaje (justificada) 10 · Incapacidad 8 · Personal 20
```

## 6. Reportes
Elegir formato (1, 2 o 3) y periodo → **Descargar Excel** con el formato institucional exacto.