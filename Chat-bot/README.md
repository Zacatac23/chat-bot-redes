# MCP Chatbot Host & JSON-RPC Protocol Inspector (Project 1 - Part 1)

This repository contains the full implementation of **Project 1 (Part 1)** for the **CC3067 Computer Networks** course at Universidad del Valle de Guatemala (UVG).

It implements a Model Context Protocol (MCP) Host Chatbot that communicates manually with multiple local MCP servers using **JSON-RPC 2.0 over `stdio`** without relying on high-level MCP SDKs (such as FastMCP).

---

## 🌟 Key Features

1. **Manual JSON-RPC 2.0 Protocol Engine:**
   - Handcrafted JSON-RPC 2.0 request/response/notification parsing and validation.
   - Low-level stdio process IPC (`stdin`/`stdout`) via process spawning and line streaming.
   - MCP Handshake protocol (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`).

2. **Integration with Official & Custom MCP Servers:**
   - **Filesystem MCP Server (Official):** Local file creation, modification, and inspection.
   - **Git MCP Server (Official):** Automated Git repository creation, staging, and commits.
   - **PharmaCare MCP Server (Custom Industry Case):** Local pharmacy server providing medication search by symptoms, inventory checking, and purchase order creation.

3. **LLM Connection & Context Retention:**
   - Powered by Anthropic Claude API (`claude-3-5-sonnet-20241022`).
   - Maintains full multi-turn conversational context memory.
   - Dynamic MCP tool translation to Claude tool schemas.

4. **Web UI & Live JSON-RPC Inspector (+15% Extra Bonus):**
   - Web Chatbot interface built with Vanilla CSS (dark theme, glassmorphism, responsive).
   - Real-time JSON-RPC Traffic Inspector streaming requests, responses, and system events via WebSockets.
   - Preset buttons for automated scenario testing (Git repo creation, pharmacy search & ordering).

---

## 🏗️ Architecture & Project Structure

```text
Chat-bot/
├── package.json                   # Project metadata & npm dependencies
├── tsconfig.json                  # TypeScript compiler settings
├── .env.example                   # Environment variable template
├── mcp_specs/
│   └── pharma_mcp_spec.json       # Specification document for the custom pharmacy server
├── src/
│   ├── protocol/
│   │   ├── jsonrpc.ts             # Manual JSON-RPC 2.0 structures & serializer
│   │   └── mcp-client-stdio.ts    # Manual stdio MCP Client transport & handshake
│   ├── servers/
│   │   └── custom-pharma-server.ts# Custom Local Pharmacy MCP Server (stdio)
│   ├── core/
│   │   ├── chatbot.ts             # Chatbot Host coordinating Anthropic LLM API & MCP Clients
│   │   └── logger.ts              # In-memory ring buffer & WebSocket log emitter
│   ├── web/
│   │   ├── server.ts              # Express API & WebSocket Server
│   │   └── public/                # Web UI Frontend assets
│   │       ├── index.html
│   │       ├── style.css
│   │       └── app.js
│   └── cli.ts                     # Terminal CLI interface entry point
└── README.md                      # English documentation (this file)
```

---

## 🚀 Installation & Usage

### Prerequisites
- Node.js v18+ and `npm` installed.
- Anthropic API Key (Claude API).

### 1. Installation
Clone the repository and install dependencies:
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file from `.env.example` and set your `ANTHROPIC_API_KEY`:
```env
ANTHROPIC_API_KEY=your_actual_anthropic_api_key_here
PORT=3000
```

### 3. Running the Application

#### Option A: Web UI & JSON-RPC Inspector (Recommended)
Start the Web Application:
```bash
npm run dev
```
Open your browser and navigate to:
```text
http://localhost:3000
```

#### Option B: Terminal CLI Mode
If you prefer running in command line:
```bash
npm run cli
```

---

## 🧪 Demonstration Scenarios

### Scenario 1: Git & Filesystem Operations
Prompt the chatbot:
> *"Create a new git repository named `mcp-test-repo`, create a file `README.md` containing `# Hello MCP`, add it to staging, and make a commit."*

The chatbot will invoke the `Filesystem` and `Git` MCP servers using manual JSON-RPC 2.0 calls. All request and response payloads will be displayed in real-time inside the **JSON-RPC Inspector**.

### Scenario 2: Pharmacy Inventory & Ordering (Custom MCP Server)
Prompt the chatbot:
> *"I have a fever and headache. What medications do you recommend and do you have stock available?"*

Followed by:
> *"Please place an order for 2 boxes of Paracetamol 500mg for Juan Pérez at Av. Las Américas 12-34."*

The chatbot will call `search_medications`, `check_inventory`, and `create_order` on the custom **PharmaCare** MCP server.

---

## 📖 Custom MCP Server Specification (`pharmacare-mcp-server`)

The custom local MCP server is implemented in `src/servers/custom-pharma-server.ts`.

| Tool Name | Description | Arguments |
| :--- | :--- | :--- |
| `search_medications` | Searches medications by name, symptom, or category. | `query` (string, required), `category` (string, optional) |
| `check_inventory` | Checks stock level and price for a medication ID. | `medication_id` (string, required, e.g. `MED-001`) |
| `create_order` | Places a delivery order for items in stock. | `patient_name` (string), `address` (string), `items` (array) |
| `get_order_status` | Retrieves status of a placed order. | `order_id` (string, e.g. `ORD-1234`) |

Full JSON specification is available in [`mcp_specs/pharma_mcp_spec.json`](file:///c:/Users/jonat/Desktop/Chat-bot/mcp_specs/pharma_mcp_spec.json).

---

## 📜 License & Academic Integrity

Created for **CC3067 Redes - Universidad del Valle de Guatemala**.
All code written according to academic guidelines.
