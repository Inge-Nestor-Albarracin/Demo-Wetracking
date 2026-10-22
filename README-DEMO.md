# RFID Demo — base de datos, cuentas y arranque del API

Copia independiente para la demostración de activos RFID.

| Elemento | RFID Demo (esta copia) | Proyecto original (no tocar) |
| --- | --- | --- |
| Carpeta | `C:\Users\ASUS\Videos\We tracking demo` | `C:\Users\ASUS\Pictures\Aduvidrios` |
| Base de datos | `rfid_demo` | `solaluminios_dev` |
| Base de pruebas e2e | `rfid_demo_test` | `solaluminios_dev_e2e_test` |
| Puerto API | 3001 | 3000 |
| Puerto web (previsto) | 5174 | 5173 |

> Git: el `.git` de esta copia conserva el remoto `origin` del repositorio
> original. No hagas commit ni push desde esta carpeta hasta que se configure
> un repositorio propio para la demo.

## Configuración (`apps/api/.env`, no versionado)

Variables necesarias (ver `apps/api/.env.example`, sin secretos):

- `DATABASE_URL`: conexión a `rfid_demo` en localhost.
- `RFID_DEMO_DATABASE=rfid_demo`: base autorizada; los scripts se detienen si
  `current_database()` no coincide.
- `PORT=3001`, `HOST=0.0.0.0`, `CORS_ORIGIN=http://localhost:5174`.
- `JWT_SECRET`: propio de esta copia. Para crearlo sin mostrarlo:
  `node scripts/Configure-Jwt.mjs` (desde `apps/api`).

`apps/api/.env.test` define `TEST_DATABASE_URL` → `rfid_demo_test`.

## Modelo de datos

`apps/api/prisma/schema.prisma` contiene solo los modelos **User** (`users`)
y **Asset** (`assets`), con el rol `ADMIN | OPERATOR`. El historial de
migraciones de la demo empieza en
`prisma/migrations/20261022000000_init_rfid_demo` y es independiente de las
migraciones del negocio anterior, que se retiraron de esta copia.

- `assets.epc`: obligatorio, único, normalizado (sin espacios a los lados, en
  mayúsculas, solo letras y números, máximo 128, sin longitud fija).
- `assets.createdById`: se toma de la sesión, nunca del cuerpo de la petición.
- Desactivar un activo (`active=false`) no lo elimina.

## Comandos (PowerShell, desde `apps/api`)

```powershell
cd "C:\Users\ASUS\Videos\We tracking demo"
pnpm install --frozen-lockfile        # solo la primera vez o tras cambiar dependencias
cd apps\api
pnpm db:check                         # muestra current_database() y conteos; no escribe
pnpm db:migrate                       # verifica rfid_demo -> prisma migrate deploy -> verifica
pnpm db:generate                      # genera Prisma Client
pnpm db:seed                          # verifica rfid_demo -> cuentas y 10 activos ficticios
pnpm build
pnpm start:prod                       # API en http://localhost:3001
```

`db:seed` se puede repetir: no duplica cuentas ni activos y no cambia
contraseñas de cuentas existentes.

### Cuentas de la demo

`db:seed` crea `admin@rfid-demo.local` (ADMIN) y `operador@rfid-demo.local`
(OPERATOR), con hash scrypt (mismo mecanismo de `src/infrastructure/security/password.ts`).

- Para elegir las contraseñas, define antes `DEMO_ADMIN_PASSWORD` y
  `DEMO_OPERATOR_PASSWORD` (12 a 128 caracteres) en la sesión de PowerShell.
  Opcionales: `DEMO_ADMIN_EMAIL`, `DEMO_ADMIN_NAME`, `DEMO_OPERATOR_EMAIL` y
  `DEMO_OPERATOR_NAME`.
- Si no se definen, se generan contraseñas aleatorias que se guardan solo en
  `apps/api/.env.demo-credentials`, un archivo ignorado por git. Nunca se
  imprimen.
- El administrador también puede crear cuentas con `POST /users`.

## Volver a iniciar la demo

```powershell
cd "C:\Users\ASUS\Videos\We tracking demo\apps\api"
pnpm db:check        # confirma rfid_demo y que los datos siguen ahí
pnpm start:prod      # o pnpm start:dev durante el desarrollo
```

Los datos viven en PostgreSQL (`rfid_demo`), así que se conservan al detener
y volver a iniciar el API. Para detenerlo, usa Ctrl+C en su terminal.

## Endpoints del API

| Método y ruta | Permiso | Uso |
| --- | --- | --- |
| `POST /auth/login` | público (5/min por IP, bloqueo por cuenta) | iniciar sesión |
| `GET /auth/me` | sesión | usuario actual |
| `POST /assets` | ADMIN, OPERATOR | registrar activo (409 si el EPC ya existe, con `existingAsset`) |
| `GET /assets` | sesión | filtros `name`, `epc`, `category`, `location`, `status=all\|active\|inactive`, `page`, `pageSize≤100`; devuelve `filtered` y `totals` |
| `GET /assets/:id` | sesión | detalle |
| `GET /assets/by-epc/:epc` | sesión | detalle por EPC |
| `POST /assets/resolve` | ADMIN, OPERATOR | lectura masiva, solo consulta (hasta 200 EPC): `found` y `unknown` |
| `PATCH /assets/:id` | ADMIN | editar nombre, descripción, categoría y ubicación |
| `PATCH /assets/:id/active` | ADMIN | activar o desactivar |
| `GET/POST/PATCH /users…` | ADMIN | cuentas existentes |

## Pruebas

```powershell
pnpm build; pnpm lint; pnpm test     # unitarias
pnpm test:db:setup                   # crea rfid_demo_test si falta (CREATE DATABASE)
pnpm test:e2e                        # e2e solo contra rfid_demo_test
```

## Pendiente

El frontend (`apps/web`) todavía usa las pantallas y endpoints del negocio
anterior, y su puerto aún no está ajustado a 5174. Se adaptará en la
siguiente tarea: registrar activo, lectura masiva con el SDK o en modo
simulado, y activos y resumen.
