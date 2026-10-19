# Plantilla Express + SQLite

Plantilla base para crear aplicaciones web **de un solo usuario** con el mismo stack que *My Best DataBase*, pero con **SQLite** en lugar de MySQL:

- **Backend:** Node.js + Express, `better-sqlite3`, sesiones con JWT (`jsonwebtoken`) y contraseñas con `bcryptjs`.
- **Frontend:** HTML, CSS y JavaScript **sin frameworks** (sin React, sin Tailwind, sin paso de compilación). Cada pantalla es un módulo IIFE.
- **Diseño:** estilo visual limpio inspirado en las interfaces que generan herramientas como Lovable (tarjetas, bordes suaves, acento violeta), **recreado con CSS propio**. Incluye tema claro y oscuro.

Ya trae funcionando:

- Un **login** sencillo. La primera vez que se abre, pide crear la cuenta; después solo pide usuario y contraseña.
- Una **pantalla principal** tras iniciar sesión, con menú lateral, saludo, tarjetas de resumen y actividad reciente.
- Un **módulo de ejemplo (Notas)** con alta, edición, eliminación, búsqueda y filtro, para copiarlo como modelo.

---

## 1. Requisitos

- **Node.js 20 o superior** (recomendado 22 LTS) y npm.
- Nada más: SQLite no se instala aparte, viene dentro de `better-sqlite3`.

> En Windows, `better-sqlite3` descarga un binario ya compilado para tu versión de Node. Si `npm install` falla al compilarlo, usa una versión LTS de Node o instala las "Herramientas de compilación de C++" de Visual Studio.

## 2. Instalación y arranque

```bash
npm install
cp .env.example .env        # en Windows: copy .env.example .env
npm run dev                 # se reinicia solo al guardar cambios del servidor
```

Abre **http://localhost:3000**, crea tu cuenta y listo.

Genera un valor para `JWT_SECRET` (así la sesión no se cierra cada vez que reinicias):

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

| Script | Para qué |
|---|---|
| `npm run dev` | Desarrollo: reinicia el servidor al guardar (`node --watch`). |
| `npm start` | Ejecución normal. |

Los cambios en `public/` no requieren reiniciar: basta con recargar el navegador.

## 3. Estructura

```
plantilla-express-sqlite/
├── server.js              # Express: cabeceras de seguridad, rutas y páginas
├── lib/
│   ├── db.js              # Conexión a SQLite y creación de tablas
│   └── auth.js            # JWT, middleware requireAuth y limitador de intentos
├── routes/
│   ├── auth.js            # /api/auth: status, setup, login, me
│   └── notas.js           # /api/notas: CRUD de ejemplo
├── data/                  # Aquí se crea app.db (no se sube a git)
└── public/
    ├── login.html         # Pantalla de inicio de sesión
    ├── app.html           # Estructura de la app (menú + contenido)
    ├── css/
    │   ├── theme.css      # Colores del tema claro y oscuro (variables)
    │   ├── base.css       # Botones, formularios, tarjetas, modales, toasts
    │   ├── login.css
    │   └── app.css        # Menú lateral, barra superior y vistas
    └── js/
        ├── theme.js       # Cambio de tema (se carga en el <head>)
        ├── ui-kit.js      # UI.escape, UI.api, UI.toast, UI.confirm, UI.formModal…
        ├── login.js
        ├── app.js         # Sesión, menú y navegación entre vistas
        ├── inicio.js      # Vista "Inicio"
        └── notas.js       # Vista "Notas" (módulo modelo)
```

## 4. Cómo agregar un módulo nuevo

Ejemplo: un módulo **Clientes**.

**1. La tabla** — en `lib/db.js`, dentro de `SCHEMA`:

```sql
CREATE TABLE IF NOT EXISTS clientes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nombre     TEXT NOT NULL,
  correo     TEXT NOT NULL DEFAULT '',
  creado_en  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);
```

**2. Las rutas** — copia `routes/notas.js` como `routes/clientes.js`, cambia las consultas y la validación, y regístralo en `server.js` **después** de `app.use('/api', requireAuth)`:

```javascript
app.use('/api/clientes', require('./routes/clientes'));
```

**3. La vista** — copia `public/js/notas.js` como `public/js/clientes.js` (el objeto se llamará `Clientes`).

**4. Regístrala** — en `app.html`, agrega el `<script>` antes de `app.js` y el enlace del menú:

```html
<a class="nav-link" href="#clientes" data-view="clientes"><span data-icon="notes"></span>Clientes</a>
<script src="/js/clientes.js"></script>
```

y en `public/js/app.js`:

```javascript
const VIEWS = {
  inicio:   { title: 'Inicio',   module: () => Inicio },
  notas:    { title: 'Notas',    module: () => Notas },
  clientes: { title: 'Clientes', module: () => Clientes }
};
```

## 5. Componentes del UI kit

```javascript
UI.escape(texto)                                  // escapa HTML: úsalo con TODO dato del usuario
await UI.api('/clientes')                          // GET con el token de sesión
await UI.api('/clientes', { method: 'POST', body: { nombre: 'Ana' } })
UI.toast('Guardado.', 'success')                   // 'success' | 'error' | 'info'
if (await UI.confirm({ title: '¿Eliminar?', message: '…', danger: true })) { … }
const guardado = await UI.formModal({
  title: 'Nuevo cliente',
  fields: [{ name: 'nombre', label: 'Nombre', required: true }],
  onSubmit: (values) => UI.api('/clientes', { method: 'POST', body: values })
});
UI.icon('plus')                                   // SVG del icono
UI.formatDate('2026-10-19 09:30:00')              // fecha legible
```

## 6. Cambiar el diseño

- **Colores y radios:** todos están en `public/css/theme.css`. Si tienes un diseño de referencia (por ejemplo, uno hecho en Lovable), copia sus colores a estas variables y toda la app se actualiza.
- **Nombre de la app:** busca "Mi Proyecto" en `login.html`, `app.html` y `app.js`.
- **Logotipo:** el icono `logo` está en `ICONS` dentro de `ui-kit.js`.
- **Tipografía:** Inter desde Google Fonts. Sin internet se usa la fuente del sistema.

## 7. API

Salvo `/api/health` y `/api/auth/*` (excepto `/me`), todas las rutas requieren la cabecera `Authorization: Bearer <token>`.

| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| `GET` | `/api/health` | — | `{ status, timestamp }` |
| `GET` | `/api/auth/status` | — | `{ hasUser }` |
| `POST` | `/api/auth/setup` | `{ nombre, usuario, password }` | `{ token, user }` (solo sin cuentas) |
| `POST` | `/api/auth/login` | `{ usuario, password }` | `{ token, user }` |
| `GET` | `/api/auth/me` | — | `{ user }` |
| `GET` | `/api/notas` | — | `{ notas, resumen }` |
| `POST` | `/api/notas` | `{ titulo, contenido, estado }` | `{ nota }` |
| `PUT` | `/api/notas/:id` | `{ titulo, contenido, estado }` | `{ nota }` |
| `DELETE` | `/api/notas/:id` | — | `{ status, id }` |

Errores: `{ "error": "mensaje" }` con código `400`, `401`, `404`, `409`, `429` o `500`.

## 8. Seguridad incluida

- Contraseñas con `bcrypt` (costo 10) y mensaje de error único en el login.
- JWT de 8 horas verificado con `HS256`; en producción el servidor no arranca sin `JWT_SECRET`.
- Límite de intentos: 10 logins y 5 altas de cuenta por IP cada 15 minutos.
- Consultas SQL siempre con parámetros; escape de HTML en toda la interfaz.
- Cabeceras `X-Frame-Options`, `X-Content-Type-Options` y `Referrer-Policy`.

## 9. Respaldo y reinicio

- **Respaldo:** detén el servidor y copia `data/app.db`.
- **Empezar de cero:** detén el servidor y borra `data/app.db` (y los archivos `app.db-wal` / `app.db-shm` si existen). Al arrancar se crea vacío y el login vuelve a pedir crear la cuenta.
- **Olvidé mi contraseña:** igual que "empezar de cero", o borra solo la fila de la tabla `usuarios` con cualquier visor de SQLite (por ejemplo, DB Browser for SQLite).

## 10. Ideas para crecer

- Varios usuarios: quitar la restricción de `/setup` y agregar una pantalla de registro.
- Empaquetar como app de escritorio con Electron (SQLite encaja muy bien).
- Pruebas automáticas de las rutas con `node:test`.
