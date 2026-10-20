# Revisión de concurrencia, idempotencia y reintentos

Fecha: 20/10/2026. Alcance: API (`apps/api`) y frontend (`apps/web`) en el
equipo local. Base de pruebas PostgreSQL dedicada; nada se ejecutó contra la
base de desarrollo ni contra producción. Sin despliegue, sin push.

Este informe describe lo **comprobado** bajo las condiciones indicadas. No
afirma ausencia total de errores de concurrencia: cubre los escenarios
listados, en una sola instancia del API, con PostgreSQL 18.6 local.

## 1. Protecciones encontradas en el código (antes de los cambios)

| Área | Protección real |
| --- | --- |
| EPC del paquete | Índice único `bundles.epc` + DTO que recorta y pasa a mayúsculas + verificación previa + `P2002 → 409`, en registro individual y en lote |
| Código de referencia / familia | Índice único + DTO (trim + mayúsculas) + `P2002 → 409` |
| Salida, traslado, ajuste | Transacción interactiva, `SET LOCAL lock_timeout = '5s'`, `SELECT … FOR UPDATE` del paquete, relectura del saldo y ubicación tras el bloqueo, CHECK SQL de saldos, `operationKey` único con reproducción por equivalencia |
| Registro por lote | Una transacción para toda la lista, clave por ítem `bundle-batch:<uuid>:<n>`, reproducción por equivalencia (orden incluido) |
| Completar tarea | `updateMany` condicional (asignado, no completada, no vencida) + CHECK |
| Último administrador | `SELECT … FOR UPDATE` de los ADMIN activos (desactivar y cambiar rol) |
| Edición de catálogo | **Ninguna**: última escritura gana |
| Pruebas e2e | **Escribían en la base de desarrollo** (`DATABASE_URL`), con limpieza por ID |

## 2. Problemas encontrados, impacto y corrección

Cada uno se reprodujo con una prueba que falló por ese motivo antes de
corregirlo.

1. **Las pruebas e2e escribían en la base de desarrollo.**
   Impacto: datos de prueba temporales en la base de trabajo; riesgo de
   afectar datos reales si una limpieza fallaba.
   Corrección: base dedicada `solaluminios_dev_e2e_test` con guardas (§4).
   Evidencia: 4 configuraciones prohibidas detenidas antes de escribir; la
   instantánea de la base de desarrollo (conteos y última modificación de 9
   tablas) quedó idéntica al final de toda la tarea.

2. **Operación bloqueada por otra en curso → 409 definitivo.**
   Con el paquete bloqueado más de 5 s, el API respondía 409. El frontend
   trata un 4xx como rechazo definitivo y **descartaba la `operationKey`**;
   un reintento usaba una clave nueva y, si la operación original terminaba,
   la salida podía aplicarse dos veces.
   Corrección: `RetryableException` → **503 + `Retry-After: 2` +
   `retryable: true`** ("no se aplicó; reintenta con la misma solicitud").
   Prueba: `concurrency.e2e-spec.ts` › "a request blocked by an operation
   still in progress…" (antes: 409; ahora 503 y el reintento con la misma
   clave se aplica una vez).

3. **Errores transitorios de base de datos → 500 genérico.**
   Pool agotado o transacción que no pudo iniciar a tiempo respondían 500;
   el cliente no sabía si reintentar.
   Corrección: filtro global `RetryableErrorFilter`
   (`src/infrastructure/http/retryable.ts`) que convierte condiciones
   transitorias (P2028, P2024, P2034, P1001/2/17, SQLSTATE 55P03, 57014,
   40P01, 40001, tiempo de espera del pool) en 503 reintentable, sin
   exponer detalles internos.
   Prueba: `transient-errors.e2e-spec.ts` (pool de 2 conexiones ocupado).
   Sin el filtro: 500 (reproducido); con el filtro: 503, nada aplicado y el
   reintento con la misma clave se aplica una vez.

4. **Ediciones del catálogo: sobrescritura silenciosa.**
   Dos administradores editando la misma referencia: el segundo reenviaba la
   descripción que tenía en pantalla y borraba el cambio del primero.
   Corrección: `expectedUpdatedAt` opcional en `PATCH /catalog/references/:id`
   y `PATCH /catalog/families/:id`; actualización **condicional** en una
   sola sentencia (`updateMany where id + updatedAt`) → 409 "modificada por
   otra persona". Sin el campo se mantiene el comportamiento anterior.
   El frontend envía la versión vista y **solo los campos cambiados**.
   Prueba: escenario K (antes: 400 por campo desconocido y sobrescritura;
   ahora 409, y con dos ediciones simultáneas exactamente una gana).

5. **Frontend de operaciones (salida/traslado/ajuste).**
   - Tras un resultado incierto (sin respuesta o 500), editar el formulario
     generaba una **clave nueva** → posible duplicado. Ahora la clave se
     conserva mientras el resultado sea incierto; el reenvío es reconocido
     ("La operación anterior sí se había registrado").
   - `ExitForm` se re-montaba con `key={bundle.quantity}` y perdía la clave
     justo cuando el saldo cambiaba. Eliminado.
   - Tras un 409 (saldo insuficiente, etc.) o un resultado incierto la
     pantalla seguía mostrando el saldo viejo. Ahora recarga paquete e
     historial.
   - El aviso de resultado incierto desaparecía al editar. Ahora se mantiene.
   - El 503 reintentable se muestra como temporal y conserva la clave.

6. **Administración: tras un conflicto la fila quedaba en edición con valores
   viejos.** Ahora sale del modo edición y muestra los datos recargados.

## 3. Archivos modificados

API:
- `src/infrastructure/http/retryable.ts` (nuevo): excepción y filtro reintentables.
- `src/app.setup.ts`: registra el filtro global.
- `src/modules/inventory/inventory-operations.service.ts`: bloqueo vencido → 503 reintentable.
- `src/modules/catalog/catalog.service.ts`, `dto/update-reference.dto.ts`,
  `dto/family.dto.ts`: `expectedUpdatedAt` y actualización condicional.
- `package.json`: scripts `test:db:setup`, `test:load`, `start:test-db`.
- `.gitignore`: `test-results/`.
- Pruebas: `vitest.config.e2e.ts` (guardas), `vitest.config.load.ts`,
  `test/support/{test-database,global-setup,worker-setup,concurrency}.ts`,
  `test/support/e2e.ts` (verifica `current_database()`),
  `test/concurrency.e2e-spec.ts`, `test/concurrency-repeat.e2e-spec.ts`,
  `test/transient-errors.e2e-spec.ts`, `test/load/inventory.load-spec.ts`,
  `test/security.e2e-spec.ts` (contrato 503).
- Scripts: `scripts/setup-test-db.mjs`, `scripts/start-test-api.mjs`.

Web:
- `components/OperationsPanel.tsx`, `views/BundleDetailView.tsx`,
  `views/RegisterBundleView.tsx`, `components/admin/FamiliesAdmin.tsx`,
  `components/admin/ReferencesAdmin.tsx`, `api/types.ts`.

Sin migraciones nuevas: `updatedAt` ya existía.

## 4. Base de datos de pruebas

- Variable: `TEST_DATABASE_URL` (entorno o `apps/api/.env.test`, ignorado
  por Git). `pnpm test:db:setup` la deriva de `DATABASE_URL` (mismo
  servidor, base `<dev>_e2e_test`), la guarda en `.env.test` sin mostrarla
  y crea la base si no existe (solo `CREATE DATABASE`).
- Opcional: `TEST_DATABASE_ALLOWED_HOSTS` (por defecto localhost,
  127.0.0.1, ::1).
- Antes de escribir, en este orden:
  1. `resolveTestDatabase()`: protocolo PostgreSQL, host permitido, nombre
     terminado en `_test`, sin "prod" y distinto de la base de `DATABASE_URL`.
  2. *Global setup* (una vez por ejecución): conecta, comprueba
     `current_database()` y aplica `prisma migrate deploy` una sola vez antes
     de los workers.
  3. *Worker setup*: fija `DATABASE_URL` a la base de pruebas antes de
     importar la aplicación; un `import 'dotenv/config'` posterior no la
     reemplaza (dotenv no sobrescribe variables existentes).
  4. `createE2eApp()`: vuelve a consultar `current_database()` y se detiene
     si no coincide.
- Limpieza: cada archivo borra solo sus registros por ID exacto, respetando
  relaciones (movimientos → paquetes → ubicaciones → catálogo → usuarios).
  Nunca reset, DROP ni TRUNCATE.
- La prueba de último administrador sigue en su base aislada
  (`pnpm test:isolated`, `<dev>_isolated_test`).

## 5. Cómo se reproducen las carreras

- Barrera de arranque (`test/support/concurrency.ts`) colocada **dentro del
  servidor** con interceptores solo de prueba:
  - `barrierBeforeBundleCreate`: todas las solicitudes pasan la comprobación
    "¿existe el EPC?" y esperan justo antes del `INSERT`, la carrera clásica
    de comprobar y luego insertar. Solo la restricción única decide.
  - `barrierAtTransactionStart`: las transacciones arrancan a la vez.
- Cada usuario simulado es un cliente distinto: `X-Forwarded-For` propio con
  `TRUST_PROXY=1` (como tablets tras un proxy), para que el limitador por IP
  no interfiera. No se desactiva ningún guard ni validación.
- Se comprueban las respuestas HTTP **y** las filas finales. El verificador
  de libro mayor (`ledgerProblems`) confirma por paquete que los saldos
  encadenan, nunca son negativos, cada salida/ajuste/traslado parte de la
  ubicación vigente y el estado final coincide.
- Sin reintentos genéricos en las pruebas: solo el reintento del protocolo
  (503 → misma clave) en la prueba de carga.

## 6. Comandos

```bash
cd apps/api
pnpm test:db:setup        # una vez: TEST_DATABASE_URL y base de pruebas
pnpm test:e2e             # 13 archivos, incluye concurrencia y repeticiones
pnpm exec vitest run --config ./vitest.config.e2e.ts test/concurrency.e2e-spec.ts test/concurrency-repeat.e2e-spec.ts test/transient-errors.e2e-spec.ts
pnpm test:load            # carga 5/10/25 usuarios; informe en test-results/load-report.json
pnpm test:isolated        # último administrador (base aislada propia)
pnpm test && pnpm lint && pnpm build
```

Pruebas manuales en navegador contra la base de pruebas (nunca desarrollo):
`CORS_ORIGIN=http://localhost:5174 pnpm start:test-db` (API en 3101) y el
frontend con `VITE_API_URL=http://localhost:3101` en el puerto 5174
(configuración `web-alt` de `.claude/launch.json`).

Variables opcionales: `LOAD_DURATION_MS` (por defecto 15000),
`DATABASE_POOL_MAX` (10), `TRUST_PROXY`, `CORS_ORIGIN`.

## 7. Resultados por escenario

| Escenario | Estado | Evidencia |
| --- | --- | --- |
| Base de pruebas: guardas | APROBADO | URL de desarrollo, nombre sin `_test`, host externo y variable vacía → detenido antes de escribir; desarrollo idéntico al final |
| A. Misma referencia simultánea (igual y con espacios/minúsculas) | APROBADO | 201/409, 1 fila, mensaje controlado, sin 500 |
| B. Mismo EPC (individual con barrera antes del INSERT; lotes con claves distintas) | APROBADO | 201/409, 1 paquete y 1 movimiento; el lote perdedor no guarda su otro paquete |
| C. Mismo material, EPC distintos | APROBADO | 201/201, 1 movimiento cada uno, suma +13 |
| D. Salidas 7 y 6 sobre 10 (usuarios y claves distintos) | APROBADO | 201/409 "supera el saldo", saldo 3 o 4, 1 EXIT, 10→3/4 |
| E. Salidas 4 y 6 sobre 10 | APROBADO | 201/201, saldo 0, cadena 10→6→0 o 10→4→0 |
| F. Salida y traslado simultáneos (3 rondas + salida total) | APROBADO | Saldo 7 en destino; el traslado mueve el saldo vigente; con salida total, el traslado posterior se rechaza (409) sin cambios |
| G. Dos traslados simultáneos | APROBADO | Destinos distintos: el segundo parte del destino del primero; mismo destino: 201/400 y 1 TRANSFER |
| H. Ajuste y salida simultáneos | APROBADO | Resultado = un orden válido (10→15→3 o salida rechazada y 10→15); motivo y responsable correctos; ajuste de WAREHOUSE 403 sin cambios |
| I. Fallo dentro de la transacción (salida y lote) | APROBADO | 500 sin detalles internos, saldo y movimientos sin cambios, lote sin paquetes |
| J. Lote con un ítem inválido | APROBADO (API) | 400 con `itemIndex` 1 y "Paquete 2"; nada guardado. Conservación de la lista en la interfaz: verificada el 15/10, sin cambios en ese código; NO re-ejecutada hoy |
| K. Dos administradores editan la misma referencia/familia | FALLIDO → corregido → APROBADO | Antes: sobrescritura. Ahora 409 con versión vieja; simultáneas: 200/409 |
| Idempotencia: misma clave y contenido simultáneos (salida y lote) | APROBADO | 201/200/200, un solo movimiento / 2 paquetes |
| Idempotencia: reintento posterior (respuesta perdida) | APROBADO | 200 `replayed` con el mismo movimiento; sin duplicados (API y navegador) |
| Idempotencia: misma clave con otro contenido, operación, paquete o usuario | APROBADO | 409 sin modificar datos ni devolver el resultado ajeno |
| Idempotencia: lote con otro orden u otro usuario | APROBADO | 409 (el orden forma parte del contrato) |
| Operación en curso (fila bloqueada) | FALLIDO → corregido → APROBADO | Antes 409 definitivo; ahora 503 reintentable y aplicada una vez al reintentar |
| Pool agotado / error transitorio | FALLIDO → corregido → APROBADO | Antes 500; ahora 503 + Retry-After, nada aplicado |
| Permisos en paralelo (READ_ONLY, SALES) | APROBADO | 5×403, sin cambios parciales |
| 20 rondas: mismo EPC | APROBADO | 20/20 "201/409, 1 paquete, 1 movimiento" |
| 20 rondas: salidas 7 y 6 sobre 10 | APROBADO | 20/20 "201/409, saldo 3/4, 1 salida" |
| 20 rondas: misma clave ×3 | APROBADO | 20/20 "201/200/200, saldo 8, 1 salida" |
| Carga 5/10/25 usuarios | APROBADO | Ver §8: 0 inesperados, 0 negativos, 0 descuadres, 0 historiales inválidos |
| Navegador: saldo desactualizado | APROBADO | Pantalla con 10, otro usuario saca 8; salida de 5 → 409 "(2 perfiles)" y la pantalla se recarga |
| Navegador: resultado incierto + edición | FALLIDO → corregido → APROBADO | Misma clave conservada; servidor: "ya se usó"; una sola salida |
| Navegador: 503 reintentable | APROBADO | Misma clave en el reintento; aplicada una vez |
| Navegador: conflicto de edición en Administración | APROBADO | 409 visible; fila con los datos de la otra persona |
| Aislamiento de borradores entre usuarios, recarga, fallo de sessionStorage | NO EJECUTADO hoy | Verificado el 15/10 en navegador; ese código no cambió |
| SSE / tiempo real | NO EJECUTADO (fuera de alcance) | No existe; ver §9 |

## 8. Carga acotada (equipo de desarrollo)

Entorno: Windows 11 (NT 10.0.26200), AMD Ryzen 7 7730U (16 hilos), 15 GB,
Node v24.11.0, PostgreSQL 18.6 local, pool 10, API y base en el mismo
equipo. 15 s por nivel, pausa de 150 ms por usuario virtual. Mezcla: 45 %
resumen, 20 % listado, 15 % consulta por EPC, 17 % salidas de 1–3 perfiles
sobre 8 paquetes compartidos de 40, 3 % lotes de 1 paquete. **No representa
la capacidad del VPS.**

| Usuarios | Solicitudes | Sol./s | Mediana ms | p95 ms | Salidas (estados) | Lotes | 409 esperados | Reintentos 503 | Inesperados | Negativos/descuadres/historiales |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 5 | 444 | 30 | 13 | 26 | 49 (201×49) | 14 | 0 | 0 | 0 | 0/0/0 |
| 10 | 886 | 59 | 15 | 32 | 141 (201×134, 409×7) | 18 | 7 | 0 | 0 | 0/0/0 |
| 25 | 2151 | 143 | 19 | 47 | 347 (201×159, 409×188) | 64 | 188 | 0 | 0 | 0/0/0 |

Los 409 son salidas rechazadas por saldo insuficiente al agotarse los
paquetes compartidos. Las cifras varían ligeramente entre ejecuciones.

## 9. Actualización de pantallas (mecanismo real)

- No hay SSE, EventSource ni WebSockets. No se implementaron.
- Inventario: cada vista consulta al abrirse, al cambiar filtros o página y,
  en el detalle, después de una operación propia y ahora también tras un
  conflicto o resultado incierto. **Sin sondeo periódico.**
- Tareas: lista y contador del menú se refrescan cada 60 s.
- Comportamiento observado con dos usuarios: si B registra una salida, A
  sigue viendo el saldo anterior hasta navegar o recargar. Si A intenta
  operar con ese dato viejo, el API valida contra el saldo real (409) y la
  pantalla de A se actualiza en ese momento.

## 10. Limitaciones y pendientes

- Las carreras se reprodujeron en **una instancia** del API. El limitador por
  IP y el contador de intentos de login son en memoria por instancia; con
  varias instancias haría falta un almacenamiento compartido.
- Las barreras son interceptores de prueba sobre `$transaction`/`create` en
  el mismo proceso; la concurrencia contra PostgreSQL es real.
- La pérdida de respuesta y el 503 en el navegador se simularon
  interceptando `fetch`; el servidor sí procesó la solicitud real.
- `POST /inventory/bundles` (registro individual, no usado por el frontend)
  no acepta `operationKey`: el EPC único impide duplicados, pero un
  reintento tras perder la respuesta responde 409 "ya existe".
- Crear tareas no tiene clave de reintento (un reintento tras respuesta
  perdida podría duplicar una tarea; impacto bajo). Crear usuarios o
  elementos de catálogo responde 409 por correo/código único.
- `expectedUpdatedAt` es opcional por compatibilidad: un cliente que no lo
  envíe mantiene "gana la última escritura". Cambios de rol y activación de
  usuarios siguen sin versión (envían el estado objetivo explícito).
- Tras un resultado incierto en la lista de registro, quitar un elemento
  genera clave nueva; el EPC único evita duplicados y el API lista los ya
  registrados.
- Inventario sin aislamiento por sucursal (ver `roles-permissions-idor-audit.md`).
- `lock_timeout` fijo de 5 s.
