# Chat-Bot MCP Host

Un chatbot basado en Model Context Protocol (MCP) con implementación manual del protocolo JSON-RPC y una interfaz web para inspección de mensajes.

## Descripción

Este proyecto integra un modelo de lenguaje (Gemini) con servidores MCP para ejecutar herramientas personalizadas, como consulta de inventario farmacéutico, gestión de archivos y operaciones con Git.

## Scripts Disponibles

- `npm run dev`: Inicia el servidor web con interfaz de inspección.
- `npm run cli`: Ejecuta la interfaz de línea de comandos.
- `npm run pharma-server`: Inicia el servidor de farmacia personalizado.
- `npm run build`: Compila el proyecto TypeScript.

## Tecnologías

- TypeScript
- Node.js / Express
- WebSockets (`ws`)
- Google GenAI SDK
- Model Context Protocol (MCP)
