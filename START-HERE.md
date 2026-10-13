# Configurar Claude Code para Solaluminios

## Ubicación

Coloca AGENTS.md y CLAUDE.md en la raíz del monorepo, al mismo nivel que apps,
package.json y pnpm-workspace.yaml. Coloca la carpeta docs junto a ellos.
La raíz conocida es C:\Users\ASUS\Pictures\Aduvidrios; usar la copia actual
si elegiste otra ubicación con el mismo proyecto.

Si ya existen archivos de instrucciones, conserva las reglas vigentes y
combina el contenido. No reemplaces ciegamente instrucciones de la empresa.
En un CLAUDE.md existente puedes agregar la línea @AGENTS.md fuera de un bloque
de código. Los archivos entregados son instrucciones, no una copia del código.

## Inicio

Si ya abriste Claude Code en VS Code o en otra interfaz con esta carpeta,
continúa allí. No hace falta instalar una segunda interfaz. Si trabajas desde
terminal y ya está instalado:

```powershell
cd C:\Users\ASUS\Pictures\Aduvidrios
claude --version
claude
```

Inicia sesión con el acceso de Claude que te dio la empresa si lo solicita.
ChatGPT Plus y Claude son servicios distintos; este paquete comparte archivos,
no suscripciones, credenciales o historiales de conversación.

Tras copiar las instrucciones, abre una sesión nueva para que las cargue.
Puedes usar /context para comprobar la carga de CLAUDE.md en versiones que lo
ofrecen. También pide que confirme qué instrucciones/documentos leyó.

## Primer encargo

Copia este mensaje en Claude Code:

```text
Trabaja en este proyecto Solaluminios.
Lee CLAUDE.md, AGENTS.md, docs/project-context.md,
docs/development-status.md y docs/next-task.md.

Inspecciona el repositorio real, git status, package.json, schema.prisma,
migraciones, módulo catalog y guards. Confirma qué está implementado
y si hay diferencias con el estado documentado, sin mostrar secretos.

Después implementa la tarea de docs/next-task.md: familias y asociación
de referencias. Conserva endpoints existentes y permisos; no cambies
el modelo de paquetes ni las migraciones aplicadas.

Ejecuta compilación y pruebas pertinentes. Para HTTP utiliza una sesión
local sin mostrar credenciales o tokens. Si no puedes ejecutar alguna
prueba, explica el bloqueo y deja los pasos preparados.

Al terminar, informa archivos cambiados y resultados, y actualiza
docs/development-status.md. No amplíes esta tarea al frontend/cotizador.
```

## Trabajo diario

Una tarea concreta por turno. Mantener una sola IA editora en la carpeta.
Claude implementa y verifica; ChatGPT puede revisar el diff o ayudarte a decidir
reglas del negocio. Actualizar documentos tras una tarea completada, no duplicar
reglas contradictorias en ambos archivos de instrucciones.

Si Git ya está configurado, revisar git status/git diff y conservar puntos de
avance después de verificar. No incluir .env, secretos, node_modules o dist.
Los documentos pueden versionarse porque no contienen credenciales.

## Documentación oficial consultada

- Inicio: https://code.claude.com/docs/en/quickstart
- Instrucciones/importaciones: https://code.claude.com/docs/en/memory
- AGENTS.md de Codex: https://developers.openai.com/codex/guides/agents-md

Los comandos de sesión disponibles dependen de la versión/interfaz. Si no
encuentras uno, utiliza /help o los controles de esa interfaz; el encargo en
texto y la lectura explícita de documentos siguen siendo utilizables.
