# Estado de desarrollo

Fecha de traspaso: 13 de octubre de 2026.
Fuente: conversación con el desarrollador y resultados que él ejecutó en su
equipo. El proyecto local completo no fue inspeccionado desde ChatGPT.

## Evidencia confirmada

- PostgreSQL local conectado; GET /health/database devolvió status ok y
  database connected antes de autenticación; luego fue probado con token.
- Esquema inicial válido; dos migraciones iniciales sincronizadas. Después se
  generó y aplicó inventory_phase1; las tablas de inventario ya existen.
- Se verificaron cinco CHECK en pgAdmin:
  - bundles_arrival_date_consistent
  - bundles_epc_normalized
  - bundles_quantity_nonnegative
  - inventory_movements_balance_consistent
  - inventory_movements_quantities_valid
- products tenía 0 filas. Se dieron instrucciones para retirarlo mediante
  remove_unused_products; la eliminación final debe verificarse en local.
- Módulo locations agregado: creación y listas jerárquicas. Script ejecutado
  dos veces produjo dos árboles de prueba; el usuario confirmó limpieza de la
  prueba anterior desde pgAdmin, preservando la reciente.
- Usuarios y AuthModule incorporados al proyecto. Admin local creado.
- Test-Auth.ps1 ejecutado correctamente el 13/10/2026:
  `OK: login, protected endpoints, roles, safe responses, duplicate email, password validation and inactive user.`
- Segunda ejecución con contraseña deliberadamente incorrecta produjo 401
  Correo o contraseña incorrectos y se detuvo en el login. No fue una segunda
  ejecución completa de todas las pruebas.
- Existe al menos un usuario READ_ONLY de prueba inactivo. No borrar usuarios
  o volver a generar admin/secreto para iniciar la tarea del catálogo.

## API existente que debe preservarse

| Método | Ruta | Función |
| --- | --- | --- |
| POST | /auth/login | Login público con límite de frecuencia |
| GET | /auth/me | Usuario de sesión |
| GET/POST | /users | Administración de usuarios (ADMIN) |
| PATCH | /users/:id/active | Activar/desactivar por ADMIN |
| GET | /health/database | Conexión BD, actualmente protegida |
| GET/POST | /catalog/references | Referencias |
| GET/PATCH | /catalog/references/:id | Consulta/actualización |
| GET/POST | /catalog/finishes | Acabados |
| PATCH | /catalog/finishes/:id | Actualización |
| GET/POST | /catalog/families | Familias (13/10/2026) |
| PATCH | /catalog/families/:id | Nombre/estado de familia (13/10/2026) |
| POST | /inventory/bundles | Registrar paquete + movimiento inicial (ADMIN, WAREHOUSE) |
| GET | /inventory/bundles/epc/:epc | Consulta exacta por EPC |
| GET | /inventory/bundles/:id | Detalle de paquete |
| GET/POST | /locations/branches | Sucursales |
| GET | /locations/branches/:branchId/inventory-locations | Bodegas/almacenes |
| POST | /locations/inventory-locations | Crear bodega/almacén |
| GET | /locations/inventory-locations/:inventoryLocationId/aisles | Pasillos |
| POST | /locations/aisles | Crear pasillo |
| GET | /locations/aisles/:aisleId/racks | Burros |
| POST | /locations/racks | Crear burro |

Revisar controladores reales para confirmar nombres/contratos. Esta lista no
autoriza recrear archivos existentes ni sobrescribir cambios locales.

## Archivos/patrones esperados

- src/infrastructure/database/database.module.ts y prisma.service.ts.
- src/modules/catalog (DTO, controller, service, module).
- src/modules/locations (DTO, controller, service, module).
- src/modules/auth y src/modules/users.
- src/infrastructure/security/password.ts.
- src/scripts/create-admin.ts.
- scripts/Configure-Jwt.mjs, Create-Admin.ps1, Test-Auth.ps1 (en apps/api).
- Test-Locations.ps1 se entregó en la raíz; no manda token, por lo que ahora
  falla con 401 salvo que se adapte. Ese resultado no indica una regresión.

## Verificación local por Claude Code (13/10/2026)

- La carpeta no es un repositorio Git: no hay `git status` ni historial.
- pnpm 11.4.0 está declarado en `devEngines` de la raíz (no hay campo
  `packageManager`). Node v24.11.0. Prisma/client/adapter-pg 7.8.0.
- 4 migraciones: init_references, setup_catalog_and_locations,
  inventory_phase1, remove_unused_products. `prisma migrate status`:
  "Database schema is up to date" → la tabla products ya fue retirada.
- `test/app.e2e-spec.ts` (plantilla Nest) fallaba durante la tarea de familias:
  no cargaba `.env` (JWT_SECRET) y `GET /` ya requiere sesión. Corregido en la
  tarea de paquetes (ver abajo) sin hacer pública ninguna ruta.

## Tarea completada: familias y asociación de referencias (13/10/2026)

Sin migraciones ni cambios en schema.prisma; usa ProductFamily y
Reference.familyId existentes. Permisos: guards globales sin cambios
(GET autenticado; POST/PATCH solo ADMIN).

Endpoints:
- `GET /catalog/families[?active=true|false]`: sin `active` devuelve todas
  (igual que referencias/acabados); orden por code. Otro valor → 400.
- `POST /catalog/families` `{ code, name }`: code trim + mayúsculas, máx. 50,
  mismo patrón que referencias (`A-Z0-9 . _ / -`); name trim, no vacío, máx. 100.
  Duplicado → 409.
- `PATCH /catalog/families/:id` `{ name?, active? }`: code no editable; vacío → 400;
  inexistente → 404. Desactivar no toca referencias, paquetes ni historial.
- `POST /catalog/references` acepta `familyId` opcional (null/omitido = sin familia).
- `PATCH /catalog/references/:id` acepta `familyId`: omitido conserva, null
  desasocia, ID asocia/cambia. Ahora basta con enviar solo familyId.
- Asociación nueva a familia inexistente → 404; inactiva → 400. Reenviar la
  familia actual (aunque esté inactiva) no se considera asociación nueva.
- `GET /catalog/references?familyId=<id>`: filtra; familia inexistente → 404;
  valor vacío → 400. Sin filtro: misma respuesta que antes (array plano).
  Nota: al validar la query, parámetros desconocidos en GET /catalog/references
  ahora reciben 400 (forbidNonWhitelisted).

Archivos: `src/modules/catalog/catalog.controller.ts`, `catalog.service.ts`,
`dto/create-reference.dto.ts`, `dto/update-reference.dto.ts`,
`dto/family.dto.ts` (nuevo), `test/catalog-families.e2e-spec.ts` (nuevo).

Comandos y resultados (apps/api):
- `pnpm build` → OK. `pnpm lint` → OK (exit 0, sin avisos).
- `pnpm test` → 1/1 OK (spec existente).
- `pnpm exec vitest run --config ./vitest.config.e2e.ts test/catalog-families.e2e-spec.ts`
  → 7/7 OK contra la BD local: creación/consulta, 409, 400 (vacío, longitud,
  PATCH vacío, code en PATCH, query inválida), 404, familia inactiva 400,
  filtro incluye/excluye, PATCH omitido/null/ID, READ_ONLY lee y recibe 403,
  sin token 401, regresión de referencias sin filtro y acabados.

Datos de prueba: el e2e crea 2 usuarios temporales (ADMIN y READ_ONLY,
correo `e2e-*-<sufijo>@test.local`, contraseña aleatoria descartada), firma
sus tokens en proceso con el JwtService de la app (no se imprimen) y crea
familias/referencias `E2E-*-<sufijo>`. En afterAll los borra por ID exacto.
Comprobado tras la ejecución: 0 usuarios @test.local, 0 familias y 0
referencias con código `E2E-`. No se tocó el admin real ni JWT_SECRET.
La tabla product_families no tiene registros reales todavía (count = 0).

## Tarea completada: registro de paquetes y movimiento inicial (13/10/2026)

Sin migraciones ni cambios en schema.prisma; usa Bundle e InventoryMovement
de inventory_phase1 y sus CHECK SQL. Sin longitud, SKU, Product ni tablas RFID.

### Paso previo: e2e antiguo y configuración de pruebas
- `src/app.setup.ts` (nuevo): `configureApp()` aplica el ValidationPipe global;
  lo usan `main.ts` y las pruebas, así validan igual.
- `test/support/e2e.ts` (nuevo): carga `.env` (dotenv), crea la app y usuarios
  temporales `e2e-<rol>-<sufijo>@test.local` con contraseña aleatoria
  descartada; sus tokens se firman en proceso con el JwtService de la app y
  nunca se imprimen. No se usa el admin real ni se cambia JWT_SECRET.
- `test/app.e2e-spec.ts`: `GET /` sin sesión → 401; con sesión → 200.
  Ninguna ruta se hizo pública.
- `test/catalog-families.e2e-spec.ts` pasó a usar el helper (misma cobertura).
- Resultado antes de implementar inventario: build OK, lint OK, unit 1/1,
  e2e 9/9 (app 2 + familias 7).

### Endpoints
| Método | Ruta | Permiso |
| --- | --- | --- |
| POST | /inventory/bundles | ADMIN, WAREHOUSE (`@Roles`) |
| GET | /inventory/bundles/epc/:epc | Cualquier usuario autenticado |
| GET | /inventory/bundles/:id | Cualquier usuario autenticado |

Body de POST: `epc, referenceId, finishId, quantity, inventoryLocationId,
rackId, registrationType (INITIAL_STOCK|ENTRY), arrivalDatePrecision
(EXACT|MONTH|UNKNOWN), arrivalDate?, arrivalYear?, arrivalMonth?, notes?`.
Cualquier otro campo (p. ej. performedById, length) → 400.

Ejemplo:
```json
{ "epc": "e2003412ab01", "referenceId": "<id>", "finishId": "<id>",
  "quantity": 10, "inventoryLocationId": "<id>", "rackId": "<id>",
  "registrationType": "INITIAL_STOCK", "arrivalDatePrecision": "MONTH",
  "arrivalYear": 2024, "arrivalMonth": 3 }
```

Respuesta (POST 201 y ambos GET): el paquete con reference (+family),
finish, inventoryLocation (+branch), rack (+aisle) y movements (+performedBy
id/nombre/rol). La familia se obtiene de la referencia; no se guarda en Bundle.

### Reglas implementadas
- EPC: trim + mayúsculas; solo `A-Z0-9`, sin espacios internos ni guiones;
  máx. 128; sin longitud fija; se conservan ceros iniciales. El patrón
  alfanumérico es una decisión provisional: confirmar con el lector real.
- quantity: entero JSON ≥ 1 (máx. 1.000.000 como límite de sanidad); "10"
  como texto, 0, negativos o decimales → 400.
- Referencia/acabado: inexistente 404; inactivo 400.
- Ubicación: inexistente 404; ubicación o sucursal inactiva 400.
- Burro: obligatorio en este endpoint; inexistente 404; inactivo o pasillo
  inactivo 400; burro de otra ubicación 400.
- Llegada: EXACT exige solo `arrivalDate` AAAA-MM-DD válida; MONTH exige solo
  arrivalYear (1900–9999) y arrivalMonth (1–12); UNKNOWN no admite ninguno.
  Fechas/meses futuros → 400, comparando con el día actual en America/Bogota.
  Cualquier precisión vale para ambos tipos de registro (no se inventa día).
- EPC existente → 409 (verificación previa + índice único; en concurrencia la
  segunda transacción recibe P2002 y se traduce a 409).
- Transacción interactiva: validaciones, Bundle e InventoryMovement en la misma
  `$transaction`. Movimiento: tipo = registrationType, quantity = cantidad,
  quantityBefore 0, quantityAfter = cantidad, destino = ubicación y burro,
  origen null, performedById = usuario de la sesión, operationKey
  `bundle-registration:<uuid>` generado en backend.
- Fechas: Bundle guarda la llegada física (exacta/mes/desconocida);
  `movement.occurredAt` y `bundle.createdAt` son el momento del registro
  digital. Nunca se copia la llegada histórica a occurredAt.
- Consultar por EPC (normaliza trim/mayúsculas, coincidencia exacta) o por ID
  no crea ni modifica nada; inexistente → 404.

### Archivos
- Nuevos: `apps/api/src/app.setup.ts`, `src/modules/inventory/inventory.module.ts`,
  `inventory.controller.ts`, `inventory.service.ts`,
  `dto/register-bundle.dto.ts`, `test/support/e2e.ts`,
  `test/inventory-bundles.e2e-spec.ts`.
- Modificados: `src/main.ts` (usa configureApp, mismo comportamiento),
  `src/app.module.ts` (registra InventoryModule), `test/app.e2e-spec.ts`,
  `test/catalog-families.e2e-spec.ts`.

### Comandos y resultados (apps/api)
- `pnpm build` → OK. `pnpm lint` → OK (exit 0, sin avisos).
- `pnpm test` → 1/1 OK.
- `pnpm exec vitest run --config ./vitest.config.e2e.ts` → 3 archivos,
  17/17 OK (app 2, familias 7, paquetes 8) contra la BD local.
- Cobertura de paquetes: INITIAL_STOCK (WAREHOUSE, llegada MONTH, EPC con
  ceros iniciales/minúsculas/espacios) y ENTRY (ADMIN, llegada EXACT) y UNKNOWN;
  exactamente un movimiento con saldos, destino, operationKey y occurredAt de
  registro; responsable = sesión y performedById en body → 400; EPC duplicado
  (también con otra capitalización) → 409 sin segundo paquete/movimiento y sin
  cambiar cantidad; 3 solicitudes simultáneas → [201, 409, 409] y 1 paquete +
  1 movimiento; 26 casos de validación (cantidad, fechas, tipo, burro de otra
  ubicación, inactivos, inexistentes, campo `length`) sin registros; EPC
  vacío/espacios/guion → 400; sin token 401; READ_ONLY y SALES 403 en POST;
  fallo inyectado en la creación del movimiento → 500 y ni paquete ni
  movimiento, luego el mismo EPC se registra bien; consulta por EPC e ID
  (READ_ONLY/SALES), prefijo de EPC → 404, conteos globales sin cambios.
- Aviso observado: `DeprecationWarning: Calling client.query() when the client
  is already executing a query` del paquete `pg`, solo con `$transaction`
  interactivo de @prisma/adapter-pg 7.8.0. No es un fallo; no se actualizaron
  paquetes. Revisar cuando se planifique una actualización de Prisma.

### Datos de prueba y limpieza
Cada ejecución crea, con sufijo aleatorio: 4 usuarios (ADMIN, WAREHOUSE,
SALES, READ_ONLY @test.local), 1 familia, 2 referencias, 2 acabados,
1 sucursal, 2 ubicaciones, 2 pasillos, 3 burros, y paquetes con EPC
`E2E<sufijo>…`/`0000<sufijo>A1` más sus movimientos. afterAll borra
movimientos y paquetes por los EPC exactos usados y el resto por ID exacto.
Comprobado tras la ejecución: 0 registros de prueba restantes; la BD local
tiene 0 paquetes y 0 movimientos reales (no se tocó ningún dato real).

### Pendientes de esta área
- Confirmar con el lector UHF real el formato que entrega (hex, separadores).
- Confirmar si un registro sin burro (p. ej. almacén minorista) debe permitirse;
  hoy rackId es obligatorio en el endpoint aunque la columna admite null.
- Idempotencia por clave del cliente: hoy el EPC único evita duplicar el
  registro; las operaciones futuras (salidas, traslados, ajustes) necesitarán
  operationKey enviado por el cliente para reintentos seguros.
- Roles autorizados a crear referencias desde bodega: sigue sin confirmar.

## Pendiente

1. ~~Familias: endpoints y asociación/filtro de referencias~~ (hecho 13/10/2026).
   Pendiente de negocio: cargar familias reales y qué roles crean referencias
   desde bodega.
2. ~~Bundle: registro transaccional con movimiento inicial y usuario de sesión~~
   (hecho 13/10/2026).
3. EPC: ~~consulta exacta y duplicados~~ (hecho). Pendiente: idempotencia por
   clave enviada por el cliente para reintentos de salidas/traslados/ajustes.
4. Resúmenes de inventario por referencia/acabado/ubicación (próxima tarea,
   ver docs/next-task.md).
5. Frontend funcional de registro y consulta.
6. Salidas, traslados y ajustes con validación y concurrencia.
7. Empresas/contactos, cotizador, orden y relación con despacho.
8. Tareas semanales, usuarios propios y asignación administrativa.
9. Importación conciliada, pruebas operativas/hardware, despliegue y capacitación.

Se estimó aproximadamente 20–30% del backend de fase 1, como apreciación de
alcance, no medición objetiva ni dato para certificar entregables.

## Verificación al recibir el proyecto

Revisar git status, package.json/lockfile, app.module.ts, guards, catálogos,
schema.prisma y directorios de migraciones. Ejecutar validación/build apropiados.
No inferir la versión actual de pnpm ni cantidad final de migraciones: leerlas.
Si PostgreSQL está disponible, migrate status es lectura. No resetear ante drift.
Si se requiere sesión para HTTP, pedir al desarrollador autenticarse mediante
el mecanismo existente sin enviar credenciales al chat. Reutilizar esa sesión
de manera local y no imprimir el token.

## Registro de trabajo futuro

Actualizar por cada tarea terminada:
- Fecha y objetivo.
- Archivos/endpoints cambiados.
- Comandos ejecutados y resultados concretos.
- Migraciones nuevas/aplicadas, si corresponde.
- Datos de prueba creados y limpieza realizada.
- Pendientes y siguiente tarea.

No marcar una función completada porque exista su tabla. No marcar pruebas
como ejecutadas si solo fueron preparadas para ejecución por el usuario.
