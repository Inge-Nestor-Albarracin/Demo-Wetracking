# Solaluminios: contexto del proyecto

Actualizado: 13 de octubre de 2026. Este documento reúne las decisiones vigentes
de la conversación de desarrollo. No sustituye la inspección del repositorio.

## Empresa, objetivo y alcance

Solaluminios distribuye perfiles de aluminio, incluidos perfiles importados de
China. La operación actual utiliza hojas Excel para existencias, entradas,
salidas y ubicaciones. El aplicativo digitalizará el inventario por paquete,
permitirá consultar ubicación y disponibilidad, cotizar y organizar tareas.

Módulos principales: inventarios, cotizador y tareas. Funciones transversales:
usuarios/permisos, sucursales, espacios de inventario y catálogos.
Se reportó un plazo inicial de aproximadamente 45 días; priorizar entregables
funcionales de fase 1. Cronograma final y alcance detallado se deben actualizar
con la empresa, no deducir fechas de entrega del historial del chat.

## Fase 1 vigente

Se registra tanto mercancía existente antes del software como recién recibida.
El personal pega/usa un sticker UHF, lee su EPC de fábrica y lo asocia al paquete.
No escribe ni recodifica el chip. El lector Bluetooth entrega los caracteres al
campo RFID/EPC si admite y está configurado en modo teclado; verificar el equipo
real antes de dar la integración de hardware por completada.

Formulario previsto:
1. Elegir inventario existente o entrada nueva.
2. Escoger familia para filtrar referencias, o buscar directamente la referencia.
3. Seleccionar referencia y acabado.
4. Registrar perfiles físicos disponibles en el paquete.
5. Indicar llegada exacta, mes/año conocido o llegada desconocida.
6. Seleccionar sucursal/bodega de operación, pasillo y burro.
7. Leer EPC y guardar.

El orden visual puede ajustarse; estos son los datos y reglas, no una obligación
de navegar varias pantallas. Sucursal/bodega pueden estar preseleccionadas.
Si una referencia no existe, debe poder crearse con permisos apropiados; los
roles habilitados para creación desde bodega aún deben confirmarse.

Un paquete contiene una referencia y un acabado. Bundle guarda directamente
el EPC único. No hay tablas de etiquetas/asignaciones independientes.
Longitud, Product y SKU fueron pospuestos explícitamente para simplificar esta
etapa. Por tanto, inventario y cotización no distinguen longitudes actualmente.
No reintroducir esos campos sin cambio de alcance.

Guardar crea el paquete y su primer movimiento en una transacción:
- INITIAL_STOCK para lo que ya estaba en bodega.
- ENTRY para recepción nueva.

En inventario antiguo se carga la cantidad que queda, no una cantidad histórica
de llegada que ya se consumió. No se inventan salidas históricas ausentes.
Un EPC ya registrado identifica el paquete existente; no lo duplica ni suma
otra vez sus perfiles. El responsable viene del usuario autenticado.

La fase 1 incluye consulta, entradas/salidas, traslado y ajustes. Una salida
puede descontar perfiles; el traslado previsto mueve el paquete completo.
Dividir un paquete, traslado parcial y manejo específico de excedentes a almacén
requieren definir el procedimiento antes de implementarlos.

No se implementa lectura continua ni eventos de portal en esta fase. Consultar
inventario actual para cotizar no implica usar WebSockets/SSE.

## Fase 2 prevista; no implementar ahora

- Codificación de etiquetas en China.
- Cargamentos esperados y ubicación planeada antes de llegar según existencias
  y mercancía esperada; posible cálculo de capacidad/volumen, todavía pendiente.
- Integración de antena en portal/puerta para entradas y salidas automatizadas.
- Pantallas/tablets para mostrar referencia y destino de ubicación.

Stock esperado no es disponible. Ubicación planeada no es ubicación física
confirmada. Una lectura de antena no debe convertirse sin validación en un
movimiento: dirección, repetición de lecturas y reglas operativas se definirán.

## Catálogos y acabados confirmados

| Entidad | Ejemplo | Significado |
| --- | --- | --- |
| ProductFamily | 3831 — Ventana proyectante | Sistema o agrupación |
| Reference | 173 — Sillar proyectante | Perfil identificado por código |
| Finish | BM — Blanco mate | Color/acabado |
| Bundle | EPC particular, 10 perfiles, P12/B7 | Paquete físico |

Descripción oficial por referencia, no por ubicación. La descripción no es
única: dos referencias distintas pueden llamarse Jamba. El acabado se muestra
por separado y no necesita repetirse en la descripción del catálogo.
familyId sigue opcional para completar gradualmente el catálogo.

| Código interno | Notación cliente | Descripción |
| --- | --- | --- |
| BM | B/M | Blanco mate |
| BP | B/P | Blanco pintura |
| NP | N/P | Negro pintura |
| CR | CR | Crudo |
| BR | BR | Brillo |
| CH | CH | Champaña |

Estas definiciones sustituyen las anteriores. BP NO significa Plata/Silver;
NP NO significa Negro perla. CR sustituyó el código CRUDO. Los registros de
acabados fueron ajustados mediante SQL: comprobar contenido local, no volver
a cargarlos ni renombrar IDs. La equivalencia de Silver de China está pendiente.

## Ubicaciones y Excel

Estructura: Branch → InventoryLocation → Aisle → Rack.
Bogotá puede tener bodega y almacén contiguo en la misma sucursal; otra sede
puede tener otros espacios. InventoryLocation.type: WAREHOUSE o RETAIL_STORE.
Preparar el modelo de almacén no equivale a desarrollar toda la venta minorista.
La operación minorista detallada se pospone, con manejo de excedentes pendiente.

Pasillo y burro se guardan separados de la identidad del perfil. Un código
histórico P12B7-173BM combina pasillo 12, burro 7, referencia 173, acabado BM.
Un traslado no cambia la referencia. Se mencionaron cuatro pisos y numeración
secuencial de pasillos (1–3, 4–6, 7–9, 10–12); verificar distribución física.
floorNumber es configurable, no deducirla permanentemente de una fórmula.

Archivos revisados: Inventario 07-08-26.xlsx y Contenedor #10.xlsx. No se debe
asumir que estén presentes en la carpeta local. El primero contiene las hojas
BODEGA PRINCIPAL, ALMACEN IMPORTADO y ALMACEN VITRAL. Los nombres de hojas no
prueban por sí solos el número de establecimientos físicos.

Hallazgos:
- Encabezados como 3831 VENTANA PROYECTANTE agrupan referencias.
- Resumen de stock y tablas de entradas/salidas están colocadas al lado, pero
  son tablas independientes; sus filas no comparten necesariamente mercancía.
- Stock = existencia inicial + entradas − salidas.
- Hay saldos negativos y códigos especiales (CURVO, sufijos antiguos, MADERA,
  etc.) que requieren conciliación; no importarlos ciegamente como paquetes.
- Cantidades del resumen están agrupadas por ubicación; no identifican cada
  paquete ni su EPC. Confirmar la unidad de STOCK antes de importación masiva.
- El conteo físico inicial no puede sumarse a un saldo ya importado sin un
  proceso explícito de conciliación/reclasificación, pues duplicaría el stock.

China: Item No. = código del proveedor; Surface/Description = acabado; Length
(M) = longitud; Quantity (pcs) = perfiles; Bundles = paquetes. El reparto exacto
por paquete no se deduce de un promedio. SLU173 → 173 es candidato, no equivalencia
confirmada. No implementar importación ni mapeos de proveedores en la tarea actual.

## Modelo actual de inventario

Prisma: apps/api/prisma/schema.prisma. Revisar localmente el contenido vigente.

| Modelo | Tabla física | Datos principales |
| --- | --- | --- |
| Branch | branches | code, name, address, active |
| InventoryLocation | warehouses | branchId, code, name, type, active |
| Aisle | aisles | inventoryLocationId mapeado a warehouseId, number, floorNumber |
| Rack | racks | aisleId, number, active |
| ProductFamily | product_families | code, name, active |
| Reference | references | code, description opcional, familyId opcional, active |
| Finish | finishes | code, description opcional, active |
| User | users | name, email, passwordHash, role, defaultInventoryLocationId, active |
| Bundle | bundles | epc, referenceId, finishId, quantity, inventoryLocationId, rackId, llegada, notes |
| InventoryMovement | inventory_movements | bundleId, type, quantity, saldos, origen/destino, fecha, usuario, operationKey |

Todos tienen id y fechas del sistema. Llegada en Bundle: arrivalDate (DATE),
arrivalYear, arrivalMonth y arrivalDatePrecision (EXACT/MONTH/UNKNOWN).
Movimientos incluyen quantityBefore/quantityAfter, source/destinationLocationId,
source/destinationRackId, occurredAt, performedById y reason. operationKey es
único y se usará para evitar repetir la misma operación.

Tipos de movimiento: INITIAL_STOCK, ENTRY, EXIT, TRANSFER, ADJUSTMENT_IN,
ADJUSTMENT_OUT. Los saldos no negativos, normalización EPC y coherencia de fecha
están protegidos por CHECK SQL. Conservar el SQL personalizado de migraciones.
Validar pertenencia del burro a bodega, activos, permisos y transacción en API.

Product/products era un modelo antiguo. Se confirmó COUNT(*)=0 y se indicó su
retiro con remove_unused_products. Verificar si esa migración se aplicó antes
de afirmar que la tabla ya no existe.

## Arquitectura técnica

Raíz local conocida: C:\Users\ASUS\Pictures\Aduvidrios. Si se trabaja en otra
copia, localizar la raíz que contiene apps/api y apps/web, no hardcodear el path.
Frontend React/TypeScript/Vite; backend NestJS modular ESM; PostgreSQL local
solaluminios_dev, schema public; Prisma 7.8.0 con adapter-pg. Gestor pnpm: usar
versión declarada en packageManager y lockfile del proyecto, verificar en local.

Prisma generator: prisma-client, output ../src/generated/prisma, moduleFormat
esm, extensiones fuente ts e imports js. URL se carga desde prisma.config.ts
con dotenv/env y desde configuración del proceso; no ponerla en schema ni UI.
DatabaseModule/PrismaService en src/infrastructure/database. ValidationPipe
global: transform, whitelist y forbidNonWhitelisted.

Flujo: React → API NestJS → reglas/permisos → Prisma → PostgreSQL.
El navegador no se conecta directamente a PostgreSQL. Hosting no seleccionado;
se evaluó VPS de Dongee y Supabase. No desplegar como parte de esta tarea.

## Autenticación implementada

AuthModule: JWT HS256 con vencimiento de una hora, issuer/audience y secreto
en .env. Password helper: scrypt de Node.js, salt aleatorio, formato scrypt-v1.
Guards globales: throttling, JWT y roles. Se consulta el usuario activo y su rol
actual en cada solicitud; desactivación bloquea tokens ya emitidos.

Roles: ADMIN, WAREHOUSE, SALES, READ_ONLY. Usuarios se administran por ADMIN.
Lecturas existentes requieren sesión; escrituras existentes son ADMIN salvo
Roles explícitos. No hacer público un endpoint porque pruebas antiguas den 401.
Sin registro público, refresh tokens o flujo de recuperación de contraseña aún.
No añadir bypass ni credenciales fijas. El admin inicial ya fue creado localmente.

## Cotizador y tareas pendientes

Cotizador: empresas cliente/proveedor, contactos y condiciones comerciales;
consulta inventario actual por referencia/acabado; conceptos y totales;
cotización → orden de compra del cliente (SalesOrder, no compra a China).
Conservar precios/descripciones/condiciones del documento. Cotizar no descuenta
stock. Reservas, descuentos/impuestos específicos y despacho parcial se deben
definir. Tablas de estos módulos se propusieron, no están implementadas aún.

Tareas: el usuario programa las propias; administrador asigna a usuarios;
vista semanal. Recurrencia automática no está confirmada. No asumirla.

## Preguntas pendientes que no bloquean familias

Equivalencia Silver, normalización de códigos especiales/proveedor, unidad
histórica STOCK, operación minorista y excedentes, paquetes mixtos/divisiones,
reservas comerciales y capacidades de hardware. No inventar respuestas.
