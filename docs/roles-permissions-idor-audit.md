# Auditoría de roles, permisos e IDOR

Fecha: 16/10/2026. Alcance: código local y pruebas del API, sin despliegue.

## Diferencias documentales identificadas antes de las pruebas

- `project-context.md` aún describe las tareas como pendientes. El código ya
  contiene TasksModule, Task y su migración; `development-status.md` sí recoge
  su implementación del 16/10. Se usa el código como fuente para los permisos.
- `next-task.md` propone cotizador y menciona 31 e2e y la ausencia de gitignore;
  esos datos son históricos. El catálogo de pruebas y `.gitignore` existen;
  esta auditoría no implementa el cotizador.
- Los conteos históricos de inventario no representan la base actual: antes de
  esta auditoría hay 10 paquetes, 11 movimientos y 0 tareas. Las cinco
  migraciones del repositorio figuran aplicadas, incluida tasks.
- Existen cambios previos en staging y sin staging. Se conservan; la auditoría
  agrega pruebas y documentación sin modificar permisos ni código funcional.

## Conclusión

No se reprodujo acceso indebido a tareas ajenas ni elusión de los permisos por
rol en los escenarios ejecutados. **El inventario tiene acceso global por rol,
sin aislamiento por sucursal o bodega.** Un WAREHOUSE puede operar en cualquier
ubicación válida, aunque tenga otra como predeterminada. Esto sería una brecha
de autorización de objetos si la política esperada fuera limitarlo a su sede;
esa política no está definida como restricción en el código/documentos revisados.

IDOR consiste en cambiar un identificador para acceder o actuar sobre un objeto
sin autorización. Usar CUID/UUID no sustituye la comprobación de permisos. Se
distingue de intentar acceder a una función reservada a otro rol, siguiendo
[OWASP API1:2023 BOLA](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/).

## Roles y cuentas existentes

Los roles son un enum fijo (`UserRole`); no hay editor de roles o permisos
individuales. La BD local consultada al inicio y al final tiene:

| Rol | Etiqueta en pantalla | Cuentas activas | Cuentas inactivas |
| --- | --- | ---: | ---: |
| ADMIN | Administrador | 1 | 0 |
| WAREHOUSE | Bodega | 0 | 0 |
| SALES | Ventas | 0 | 0 |
| READ_ONLY | Solo consulta | 0 | 1 |

Una cuenta inactiva no puede usar los permisos del rol. Los usuarios temporales
creados para las pruebas no se incluyen y fueron eliminados.

## Matriz de permisos efectivos

Todos los permisos requieren usuario activo y sesión válida, excepto login.

| Función | ADMIN | WAREHOUSE | SALES | READ_ONLY |
| --- | --- | --- | --- | --- |
| Consultar paquetes por ID/chip, listado, resumen e historial | Sí, global | Sí, global | Sí, global | Sí, global |
| Consultar familias, referencias, acabados y ubicaciones | Sí | Sí | Sí | Sí |
| Registrar inventario inicial y entradas, individual/lote | Sí | Sí | No | No |
| Registrar salidas de perfiles | Sí | Sí | No | No |
| Trasladar paquete completo | Sí | Sí | No | No |
| Ajustar cantidades con motivo | Sí | No | No | No |
| Crear/actualizar/desactivar familias, referencias y acabados | Sí | No | No | No |
| Crear sucursales, bodegas/almacenes, pasillos y burros | Sí | No | No | No |
| Listar/crear usuarios y activar/desactivar cuentas | Sí | No | No | No |
| Crear tareas propias | Sí | Sí | Sí | Sí |
| Asignar tareas a otras personas activas | Sí | No | No | No |
| Listar tareas y conteos del equipo | Sí | Solo propias | Solo propias | Solo propias |
| Consultar tarea por ID | Cualquiera | Asignado o creador | Asignado o creador | Asignado o creador |
| Completar tareas | Solo asignadas a sí mismo | Solo asignadas a sí mismo | Solo asignadas a sí mismo | Solo asignadas a sí mismo |
| Consultar `/auth/me`, `/health/database` y `/` | Sí | Sí | Sí | Sí |
| Cotizar / gestionar órdenes comerciales | Sin implementar | Sin implementar | Sin implementar | Sin implementar |

Precisiones:

- ADMIN es también el jefe de tareas. No puede completar por otra persona,
  desactivarse a sí mismo ni desactivar al último administrador activo.
- WAREHOUSE maneja entradas, salidas y traslados. No puede crear referencias ni
  hacer ajustes, aunque esos accesos pudieran parecer propios de bodega.
- SALES actualmente tiene los mismos permisos efectivos que READ_ONLY. El rol
  está preparado en el enum, pero el cotizador no está implementado.
- READ_ONLY significa consulta en inventario; **no es solo lectura en todo el
  sistema**, porque crea y completa tareas propias por decisión documentada.
- Completar exige que la tarea no haya vencido; repetir una ya completada es
  idempotente. No existen rutas para editar, borrar, reasignar, prorrogar o
  reabrir tareas.
- Un antiguo ADMIN que creó una tarea mantiene acceso al detalle como creador
  después de cambiar su rol en BD; las listas/conteos pasan a mostrar solo sus
  asignadas. Es la regla explícita `canSee`, no una omisión accidental del guard.
- ADMIN elige rol al crear usuario. No hay endpoint para cambiar después el
  rol, restablecer contraseña o editar la cuenta. La prueba de cambio de rol
  usa exclusivamente un usuario temporal y una actualización directa de BD.
- No hay CRUD completo de ubicaciones: actualmente se crean y consultan.
- La UI tiene inventario y tareas; la administración de usuarios, catálogos y
  ubicaciones se encuentra en el API, sin pantallas de gestión completas.

## Evidencia de IDOR y autorización

| Superficie / intento | Resultado observado |
| --- | --- |
| Dos usuarios distintos del mismo rol WAREHOUSE, SALES o READ_ONLY: cambiar `task.id` para leer una tarea ajena | 404, mismo cuerpo que tarea inexistente |
| Completar tarea de ese compañero, incluso enviando `assigneeId`/`userId` falsos en body | 404; asignado y completedAt permanecen intactos |
| Cambiar `assigneeId` en listado o resumen de tareas | 403 para los tres roles no ADMIN |
| Asignar una nueva tarea a otro usuario sin ADMIN | 403 |
| ADMIN intenta completar tarea de otra persona | 403; poder verla no permite completarla |
| READ_ONLY crea y completa su propia tarea | 201 y 200, respectivamente: permiso intencional |
| No ADMIN consulta/crea usuarios o cambia `users/:id/active` | 403, incluyendo ID propio, de otro usuario e inexistente |
| No ADMIN envía POST/PATCH directos a catálogos o POST a ubicaciones | 403 |
| SALES/READ_ONLY registran paquetes o envían salida, traslado o ajuste con IDs válidos | 403 |
| WAREHOUSE intenta ajuste de cantidad | 403 |
| Falsificar `createdById` al crear tarea o `performedById` en registro/salida | 400; responsable proviene de la sesión |
| Cambiar usuario o paquete al reutilizar `operationKey` de una salida | 409; sin descontar del segundo paquete |
| Reutilizar clave de guardado de lote con otro usuario | 409, cubierto por inventory-batch |
| Enviar burro válido de una bodega con ID de otra | 400; pertenencia física validada |
| Alterar `userId` de query en `/auth/me` | Devuelve siempre el usuario de sesión; query no altera la identidad |
| Degradar rol en BD conservando el token emitido | `/auth/me` refleja el rol actual y la salida pasa a 403 |
| Desactivar usuario con token ya emitido | 401, probado por security.e2e-spec.ts |
| Solicitudes sin sesión a objetos y operaciones protegidas | 401 |

Los ensayos HTTP usan la aplicación Nest real, guards globales, ValidationPipe
y PostgreSQL. Los tokens de usuarios temporales se firman con el JwtService
configurado, mediante el helper existente; no se usan credenciales del admin
real ni se desactivan guards o límites de login.

## Observaciones y decisiones pendientes

1. **Prioridad principal: alcance por bodega/sucursal.** Las consultas de
   inventario no reciben el usuario para limitar objetos. Las operaciones
   usan su ID como responsable, sin comprobar una relación de acceso con la
   ubicación. `defaultInventoryLocationId` no es un permiso. La prueba asignó
   bodega A como predeterminada y registró, leyó, descontó y trasladó un paquete
   de B con éxito. Las cuatro cuentas pudieron leer el inventario de B por ID,
   EPC, historial y filtros. La ausencia de restricción entre sucursales se
   observa en código; el ensayo usó dos bodegas de una misma sucursal.
   Si se exige aislamiento, definir ubicaciones autorizadas por usuario y
   comprobarlas tanto en listados como en cada objeto, en origen/destino de
   traslados y en reintentos. No basta ocultar selectores en la UI.
2. **Nombres de roles:** aclarar que Solo consulta permite tareas personales,
   y que Ventas todavía no ofrece funciones comerciales adicionales. No se
   cambiaron estos permisos porque coinciden con las decisiones actuales.
3. **Lecturas permitidas por defecto:** `RolesGuard` deja pasar cualquier GET,
   HEAD u OPTIONS autenticado sin `@Roles`; las escrituras sin declaración son
   solo ADMIN. No se encontró una elusión actual en usuarios/tareas, pero una
   ruta nueva de lectura sensible requiere declarar permiso o filtrar objetos.
   Conviene exigir políticas explícitas y pruebas al añadir endpoints.
4. **Sesiones, aparte de IDOR:** la desactivación se comprueba por solicitud,
   pero reactivar antes de que venza el token vuelve a habilitar ese token.
   La prueba existente lo confirma. El cierre de sesión web es local y no hay
   revocación individual de tokens. Evaluar revocación si se necesita expulsar
   sesiones de forma definitiva.

## Archivos clave revisados

- [RolesGuard](../apps/api/src/modules/auth/roles.guard.ts),
  [JwtAuthGuard](../apps/api/src/modules/auth/jwt-auth.guard.ts),
  [AuthModule](../apps/api/src/modules/auth/auth.module.ts).
- [Usuarios](../apps/api/src/modules/users/users.controller.ts) y su servicio.
- [Controlador de inventario](../apps/api/src/modules/inventory/inventory.controller.ts),
  [consultas](../apps/api/src/modules/inventory/inventory-queries.service.ts),
  [registro](../apps/api/src/modules/inventory/inventory.service.ts),
  [operaciones](../apps/api/src/modules/inventory/inventory-operations.service.ts).
- [Autorización de tareas](../apps/api/src/modules/tasks/tasks.service.ts),
  su controlador y DTO; controladores/servicios de catálogos y ubicaciones.
- Prisma schema, cinco migraciones, main.ts, app.module.ts, app.setup.ts,
  package.json/workspace; permisos y navegación de React, TasksView/TaskCard.

## Verificación ejecutada

Desde la raíz, pnpm 11.4.0, sin actualizar dependencias:

```powershell
pnpm.cmd --dir apps/api exec vitest run --config ./vitest.config.e2e.ts test/authorization-idor.e2e-spec.ts test/tasks.e2e-spec.ts test/security.e2e-spec.ts test/inventory-batch.e2e-spec.ts test/inventory-operations.e2e-spec.ts --no-file-parallelism
pnpm.cmd --dir apps/api build
pnpm.cmd --dir apps/api lint
pnpm.cmd --dir apps/api test
pnpm.cmd --dir apps/web build
pnpm.cmd --dir apps/web lint
```

- E2E: **53/53**, cinco archivos: auditoría nueva 20, tareas 9, seguridad 6,
  lotes 10 y operaciones 8. Una sola ejecución, archivos secuenciales.
- Unitarias: **8/8**, tres archivos. Build API y web: OK.
- Lint API: salida 0 con aviso preexistente en `test/tasks.e2e-spec.ts:120`
  (`require-array-sort-compare`). Lint web: OK.
- Avisos preexistentes de `pg` y `vite-tsconfig-paths`; el error de Nest
  «Fallo simulado de prueba» pertenece al ensayo intencional de rollback que
  pasó. No se ocultaron errores de prueba ni se actualizaron paquetes.
- Auditoría nueva: 7 usuarios, 6 tareas, 2 paquetes, 4 movimientos y catálogo/
  ubicaciones temporales (2 familias, 2 referencias, 2 acabados, 1 sucursal,
  3 ubicaciones, 4 pasillos, 5 burros). Limpieza por IDs exactos, con paquetes
  seleccionados por las referencias exactas creadas por el fixture.
- Los otros cuatro e2e usan sus fixtures existentes y limpieza por IDs. Los
  conteos de todas las tablas revisadas al final coinciden con el inicio:
  users 2, tasks 0, bundles 10, inventory_movements 11, branches 1,
  warehouses 1, aisles 1, racks 1, references 2, finishes 7, product_families 1.
- No hubo cambios funcionales, migraciones, ajustes de cuentas reales,
  publicación, push ni despliegue. Se agregan este informe y el nuevo e2e, y
  se actualiza development-status.md.

Límites: es una revisión del código local con pruebas de escenarios concretos,
no una garantía de ausencia de vulnerabilidades. No se verificó el proceso
que pudiera estar sirviendo el puerto 3000, un despliegue remoto, ni la UI en
navegador durante esta auditoría. No se repitió la suite completa ni las
pruebas de BD aislada del último administrador; sí se ejecutaron los cinco
archivos enumerados. Queda por definir la política de aislamiento por sede.
