# Próxima tarea: consulta de paquetes y resúmenes de inventario

Estado previo (13/10/2026): familias y registro de paquetes con movimiento
inicial están implementados y probados (ver docs/development-status.md).
Esta propuesta debe ser confirmada por el desarrollador antes de empezar.

## Objetivo

Exponer consultas de solo lectura del inventario actual que necesitan el
formulario de bodega, el frontend de consulta y, más adelante, el cotizador.
No implementar salidas, traslados, ajustes, frontend ni cotizador.

## Inicio

Lee AGENTS.md, docs/project-context.md y docs/development-status.md.
Inspecciona src/modules/inventory, catalog, locations, guards y schema.prisma.
Ejecuta build, lint, `pnpm test` y la suite e2e antes de cambiar código.

## Funcionalidades propuestas

1. `GET /inventory/bundles` con filtros explícitos y paginación:
   referenceId, familyId (vía referencia), finishId, inventoryLocationId,
   branchId, rackId; orden estable; límite máximo documentado.
   Validar parámetros (DTO de query); filtro con ID inexistente → 404.
2. `GET /inventory/summary` agrupando cantidades por referencia + acabado,
   con desglose opcional por ubicación (sucursal/bodega/pasillo/burro).
   Devuelve perfiles (suma de quantity) y número de paquetes.
   Paquetes con quantity 0 no suman perfiles; definir si se listan.
3. Lecturas para cualquier usuario autenticado; sin cambios de permisos.

## Reglas

- Solo lectura: ninguna consulta crea ni modifica paquetes o movimientos.
- No distinguir longitud (pospuesta). Stock esperado/ubicación planeada no
  existen todavía y no deben simularse.
- Sin migraciones salvo índice justificado; revisar su SQL antes de aplicarlo.
- Reutilizar PrismaService, guards, configureApp y test/support/e2e.ts.

## Pruebas mínimas

- Filtros por referencia, familia, acabado y ubicación incluyen/excluyen.
- Totales del resumen correctos con varios paquetes y ubicaciones.
- Paginación y límite; query inválida 400; ID de filtro inexistente 404.
- Sin token 401; READ_ONLY/SALES pueden leer.
- Conteos de paquetes y movimientos sin cambios tras las consultas.
- Datos con sufijo único y limpieza por ID/EPC exactos.

## Después

Salidas, traslados de paquete completo y ajustes con operationKey del cliente
para reintentos idempotentes, bloqueo de concurrencia sobre el paquete y CHECK
de saldos. Antes de implementarlos, confirmar con la empresa el procedimiento
de salidas parciales, el tratamiento de cantidad 0 y los roles autorizados.
