# Próximo bloque: cotizador (empresas, contactos y cotizaciones)

Estado previo (13/10/2026): el bloque de inventario de fase 1 está completo en
backend y frontend (ver docs/development-status.md). Esta propuesta debe ser
confirmada por el desarrollador y la empresa antes de implementarse; varias
reglas comerciales siguen abiertas.

## Antes de empezar

1. Lee AGENTS.md, docs/project-context.md y docs/development-status.md.
2. Ejecuta en apps/api: `pnpm build`, `pnpm lint`, `pnpm test` y
   `pnpm exec vitest run --config ./vitest.config.e2e.ts` (31 pruebas hoy).
   En apps/web: `pnpm build` y `pnpm lint`.
3. Revisa `git status`. Recomendación pendiente del bloque anterior: añadir un
   `.gitignore` en la raíz con `node_modules/` y dejar de versionar
   `node_modules` en un commit separado, decidido por el desarrollador.

## Decisiones que deben confirmarse con la empresa

- Datos mínimos de empresa cliente/proveedor y de contacto (NIT, dirección,
  ciudad, condiciones de pago, plazo de entrega).
- Precio: ¿lista por referencia + acabado, por kilo, por perfil? ¿Cambia por
  cliente? Moneda e impuestos (IVA) y descuentos permitidos.
- Numeración y vigencia de cotizaciones; estados (borrador, enviada,
  aceptada, vencida, anulada) y quién puede cambiarlos.
- Paso de cotización a orden del cliente (SalesOrder) y relación con salidas.
- Si una cotización aceptada reserva inventario (hoy NO hay reservas: guardar
  una cotización no descuenta ni reserva stock).
- Roles: ¿SALES crea cotizaciones? ¿quién aprueba descuentos?
- Formato de documento para el cliente (PDF) y datos de la empresa emisora.

## Alcance técnico propuesto (tras confirmar)

1. Migración nueva (revisar SQL antes de aplicarla): Company, Contact,
   Quotation, QuotationLine. Las líneas guardan copia de descripción, precio
   y condiciones al momento de cotizar (no dependen de cambios posteriores
   del catálogo).
2. Endpoints con permisos explícitos y operationKey para creaciones
   repetibles desde el frontend.
3. Consulta de disponibilidad desde la cotización usando
   `GET /inventory/summary` (referencia + acabado); sin WebSockets/SSE.
4. Frontend: listado y formulario de cotización reutilizando sesión,
   `useLoad`, selectores y estilos existentes.

## No incluir

- Reservas o descuentos automáticos de inventario.
- Tareas semanales (bloque posterior).
- Integración del lector UHF o antena; importación de Excel.
- Longitud, SKU o Product.

## Pendientes del bloque de inventario que siguen abiertos

- Validar el lector UHF Bluetooth real (formato del EPC, Enter final).
- ¿Paquetes sin burro (almacén minorista)? Hoy rackId es obligatorio.
- División de paquetes, traslado parcial, excedentes a almacén.
- ¿Motivo/documento obligatorio en salidas? Hoy es opcional.
- Persistencia de sesión (refresh token) y gestión de catálogos/ubicaciones/
  usuarios desde la interfaz.
