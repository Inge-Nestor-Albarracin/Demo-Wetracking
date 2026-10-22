> **RFID Demo.** Esta carpeta (`C:\Users\ASUS\Videos\We tracking demo`) es una copia
> independiente para la demo de activos RFID. Base `rfid_demo`, API 3001, web 5174.
> No trabajes ni escribas en `C:\Users\ASUS\Pictures\Aduvidrios` (proyecto original)
> ni en sus bases. No uses git ni hagas push desde esta copia: su remoto es el
> repositorio original. Lee primero `README-DEMO.md`. Las reglas del negocio
> anterior que siguen abajo son históricas y no aplican a la demo.

# Solaluminios: instrucciones compartidas para agentes de desarrollo

## Antes de trabajar

Lee `docs/project-context.md` y `docs/development-status.md`. Para la siguiente
tarea lee también `docs/next-task.md`. Después inspecciona el código real,
`package.json`, `pnpm-workspace.yaml`, `apps/api/prisma/schema.prisma`, las
migraciones, `main.ts` y `app.module.ts`. Los documentos explican decisiones;
el código y los resultados ejecutados determinan qué está implementado.
Si hay diferencias, documéntalas antes de basarte en una suposición.

## Convenciones

- Monorepo pnpm: `apps/api` (NestJS/TypeScript/ESM) y `apps/web` (React/Vite).
- PostgreSQL local; Prisma, client y adapter-pg se mantienen en 7.8.0.
- Respeta la versión de pnpm declarada en el proyecto. No actualices paquetes
  principales por avisos del CLI durante una tarea funcional.
- Mantén módulos en `apps/api/src/modules`. Reutiliza PrismaService y los
  patrones existentes. No crees otro proyecto ni otro servicio de conexión.
- Imports relativos ESM terminan en `.js`, aunque el archivo fuente sea `.ts`.
- Los DTO usados por decoradores del controlador son imports reales; los
  imports exclusivos de tipos pueden usar `import type`.
- Nombres de modelos/campos en inglés; interfaz y mensajes de negocio en español.
- IDs internos CUID; EPC almacenado como texto, sin perder ceros iniciales.
- Conserva los contratos de endpoints existentes salvo cambio solicitado.
- No edites a mano Prisma Client generado, node_modules o dist.

## Reglas del negocio

- Fase 1: lector UHF Bluetooth entrega EPC de fábrica al campo RFID. El software
  lo asocia al paquete; no recodifica etiquetas ni usa lectura continua.
- EPC único directamente en Bundle. No añadir RfidTag, RfidTagAssignment,
  Product, SKU o longitud a esta fase sin un cambio de alcance explícito.
- Familia agrupa referencias; referencia identifica el perfil; acabado es color.
- Inventario inicial y entrada nueva son operaciones distintas. Escanear un EPC
  existente no vuelve a sumar stock.
- Fecha de llegada física y fecha de registro digital son distintas. No inventes
  un día cuando solo se conoce mes/año o no se conoce la llegada.
- Cantidad en perfiles enteros; confirmar unidades al importar datos antiguos.
- Cambios de cantidad/ubicación se registran con movimientos y transacciones.
- El responsable se obtiene de la sesión, nunca de un userId arbitrario del body.
- Guardar una cotización no descuenta ni reserva inventario automáticamente.

## Base de datos y acceso

- No resetees la BD, borres datos reales o modifiques migraciones ya aplicadas.
  Prepara migraciones nuevas cuando se necesiten; revisa su SQL y efectos.
- No uses db push para sustituir el historial de migraciones del proyecto.
- Conserva los mapeos existentes: InventoryLocation usa la tabla warehouses;
  Aisle.inventoryLocationId usa la columna warehouseId.
- No muestres ni copies contraseñas, tokens, connection strings o secretos de
  .env en respuestas, logs, ejemplos o commits. Carga la configuración existente.
- Reutiliza los guards globales de autenticación y roles. No conviertas rutas
  protegidas en públicas para que una prueba pase.
- No cambies JWT_SECRET ni vuelvas a crear el administrador como parte de una
  tarea del catálogo. El administrador local ya existe.
- No publiques, hagas push o despliegues salvo que el usuario lo solicite.

## Forma de trabajo y pruebas

- Inspecciona `git status`; conserva cambios del usuario y evita tocar archivos
  ajenos a la tarea. Si no hay Git, informa y limita igualmente el alcance.
- Comunica un plan breve y ejecuta la tarea autorizada; no detengas cada paso
  para pedir una confirmación adicional de cambios rutinarios.
- Una IA editora por tarea en la misma carpeta. No coordines ediciones paralelas
  de archivos ni ejecuciones simultáneas de migraciones.
- Usa rg para búsquedas cuando esté disponible y comandos compatibles con el
  entorno observado (Windows/PowerShell en el equipo del usuario).
- Verifica con la compilación y pruebas pertinentes. No afirmes que una prueba
  pasó si no se ejecutó. Si falta el API, acceso a BD o credenciales, describe
  exactamente qué falta y proporciona la prueba pendiente sin exponer secretos.
- Pruebas de integración: IDs/códigos únicos de prueba, sin modificar datos
  reales. Documenta registros creados y limpieza; no borres por prefijos amplios.
- Evita volver a ejecutar scripts que crean datos si ya hay evidencia suficiente.
- No fuerces desactivar límites de login para probar; usa sesión existente o
  respeta la ventana si recibes 429.
- Al terminar informa archivos cambiados, comportamiento, comandos/pruebas y
  resultados, límites pendientes; actualiza docs/development-status.md.
