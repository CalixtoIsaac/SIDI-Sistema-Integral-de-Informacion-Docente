# Arquitectura y Convenciones - SIDI

## 1. Arquitectura general
API REST desacoplada (cliente-servidor):

```
[ React SPA (Vite) ]  --HTTP/JSON-->  [ API Express + TS ]  --Prisma-->  [ PostgreSQL ]
                                             |
                                             +--> ExcelJS / SheetJS (importación y plantillas)
```

Backend en capas: **routes → controllers → services → repositories (Prisma)**.
- *Controllers:* validan entrada (Zod) y responden.
- *Services:* lógica de negocio (cálculo de descuentos, parser Excel, métricas).
- *Repositories:* acceso a datos.

## 2. Estructura de carpetas
```
sidi/
├── backend/
│   ├── prisma/            # schema.prisma, migraciones, seed.ts
│   ├── src/
│   │   ├── routes/
│   │   ├── controllers/
│   │   ├── services/      # excelService.ts, descuentoService.ts, metricsService.ts
│   │   ├── repositories/
│   │   ├── middlewares/   # auth, errores, upload
│   │   ├── validators/    # esquemas Zod
│   │   └── app.ts
│   ├── templates/         # 3 plantillas Excel institucionales + mapeos .map.json
│   └── tests/
├── frontend/
│   ├── src/
│   │   ├── components/    # Tabla, Popover, FichaDocente, KPI, Charts
│   │   ├── pages/         # Dashboard, Docentes, Inasistencias, Reportes, Login
│   │   ├── hooks/
│   │   ├── services/      # clientes de la API (axios)
│   │   └── utils/
├── docs/                  # estos documentos .md
└── README.md
```

## 3. Convenciones de código
| Elemento | Convención | Ejemplo |
|---|---|---|
| Variables y funciones | camelCase | `calcularDescuento()` |
| Componentes React | PascalCase | `TablaDocentes.tsx` |
| Archivos de servicio | camelCase + sufijo | `excelService.ts` |
| Tablas y columnas BD | snake_case, plural en tablas | `docentes.num_nomina` |
| Constantes | MAYÚSCULAS | `MAX_TAMANO_EXCEL` |
| Endpoints | kebab-case, sustantivos en plural | `/api/v1/docentes/excel-preview` |

- Idioma del dominio en español (docente, inasistencia); términos técnicos en inglés aceptados.
- ESLint + Prettier obligatorios; no se aprueban PRs con errores de linter.
- Funciones de más de ~40 líneas se dividen.

## 4. Commits (Conventional Commits)
```
<tipo>(<alcance>): <descripción en presente>
```
Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`.
Ejemplos: `feat(excel): agregar vista previa de importación`, `fix(descuentos): excluir faltas justificadas`.

## 5. Flujo de trabajo Git
```
main      ←── (fin de sprint, solo Isaac) ── develop ←── PRs diarios ── feature/* , fix/*
```
1. **`main`**: protegida; código estable/entregable. Solo **Calixto Isaac Galeana** fusiona.
2. **`develop`**: integración diaria; protegida; requiere PR aprobado por Isaac.
3. **Ramas de trabajo:** `feature/hu-02-carga-excel`, `fix/validacion-curp` (desde `develop`).
4. **Un PR por día por integrante** como mínimo, con:
   - Resumen del cambio y HU relacionada.
   - Capturas o evidencia de pruebas.
   - Tareas completadas del día.
5. Configuración en GitHub: *Branch protection* en `main` y `develop`, "Require pull request review", Isaac como único *CODEOWNER* con permiso de merge.
6. Prohibido `push --force` a `main`/`develop`.

## 6. Plantilla de Pull Request
```markdown
## Resumen
## Historia de usuario
HU-XX
## Cambios
- 
## Evidencia
(capturas / resultado de pruebas)
## Checklist
- [ ] Cumple criterios de aceptación
- [ ] Sin errores de linter/consola
- [ ] Probado con datos de ejemplo
- [ ] Documentación actualizada
```