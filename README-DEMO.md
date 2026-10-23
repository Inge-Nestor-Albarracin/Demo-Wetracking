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

Desde la raíz, abre dos terminales de PowerShell:

```powershell
# Terminal 1: API
pnpm.cmd dev:api
```

```powershell
# Terminal 2: web
pnpm.cmd dev:web
```

Abre `http://localhost:5174`. `pnpm.cmd` evita el bloqueo de `pnpm.ps1`
cuando PowerShell tiene deshabilitada la ejecución de scripts, sin cambiar
la política de Windows. La raíz no tiene un script `dev`; dentro de
`apps/api` el comando es `pnpm.cmd start:dev`, no `pnpm start run:dev`.
Si aparece `EADDRINUSE` en 3001 o `Port 5174 is already in use`, comprueba
si la demo ya está abierta. Para reiniciar, detén primero el servidor en
su terminal con Ctrl+C.

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

## Frontend (`apps/web`, http://localhost:5174)

```powershell
cd "C:\Users\ASUS\Videos\We tracking demo"
pnpm --dir apps/api start     # API en 3001 (compila antes de escuchar: espera el log "Nest application successfully started")
pnpm --dir apps/web dev       # web en 5174 (strictPort)
```

`VITE_API_URL` es opcional; por defecto el frontend llama a `http://localhost:3001`.

Pantallas: **Inicio**, **Registrar activo** (EPC, nombre, categoría,
ubicación y descripción), **Lectura masiva**, **Activos y resumen** (filtros
por nombre, EPC, categoría, ubicación y estado, con totales y paginación),
**Consultar EPC**, detalle del activo (solo ADMIN edita o activa/desactiva) y
**Usuarios** (solo ADMIN).

Lectura masiva:
- Lector real: pistola Chafon H100/H102/H103 por Web Bluetooth (Chrome con
  HTTPS o localhost) o en modo teclado (HID). No se ha comprobado con la pistola
  en esta copia.
- Simulación: «Modo teclado, código manual o simulación» → «Simular lectura».
  Lee los 10 EPC de la semilla y un EPC desconocido (`D3E0…00FF`) varias veces.
  La sesión queda marcada como simulada.
- Evento de lectura: cada detección con código no vacío. Los EPC únicos son
  los registrados detectados más los desconocidos, y las repeticiones son los
  eventos menos los EPC únicos.
- La sesión vive en memoria y se borra al recargar, al cerrar la página o al
  cerrar sesión. Leer no crea ni modifica activos.

## Pendiente

- Registrar un activo con la pistola en modo Bluetooth: en el formulario se
  usa el modo teclado o se escribe el código, y desde Lectura masiva se abre
  el registro con el EPC desconocido ya cargado.
- Las pruebas e2e del API necesitan crear `rfid_demo_test`.
