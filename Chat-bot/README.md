# MCP Host Chatbot - Model Context Protocol Implementation

A full-featured Model Context Protocol (MCP) host application featuring a **manual JSON-RPC 2.0 protocol implementation** (without third-party MCP SDKs), supporting local (`stdio`) and remote (`HTTP`) MCP servers, interactive Terminal CLI, and an aesthetic real-time Web Inspector UI.

Developed for **CC3067 Computer Networks** at Universidad del Valle de Guatemala.

---

## 📖 Overview

The **Model Context Protocol (MCP)** is an open standard introduced by Anthropic that enables Large Language Models (LLMs) to securely interface with tools, data sources, and external environments. This project functions as an **MCP Host** that orchestrates communication with multiple MCP servers using raw JSON-RPC 2.0 messages over standard I/O streams and HTTP network sockets.

### Key Architectural Highlights
* **Manual JSON-RPC 2.0 Engine:** Implements the complete JSON-RPC 2.0 specification (`initialize`, `notifications/initialized`, `tools/list`, `tools/call`, structured errors) from scratch, strictly complying with the academic constraint prohibiting high-level abstractions like FastMCP or official MCP client SDKs.
* **Dual Transport Architecture:**
  * **Local Transport (`stdio`):** Spawns local child processes and communicates via line-delimited JSON-RPC streams.
  * **Remote Transport (`HTTP POST`):** Connects to cloud-hosted MCP servers over HTTP/HTTPS with JSON-RPC payloads.
* **LLM API Integration & Context Memory:** Communicates with LLM APIs (Google Gemini) and preserves conversational context across multiple turns. Includes a resilient fallback simulation engine for offline demonstrations.
* **Real-Time Protocol Inspector:**
  * **Terminal CLI:** Interactive command-line interface with colorized JSON-RPC packet inspection.
  * **Web Inspector UI (+15% Extra):** Responsive dashboard built with Express and WebSockets displaying live request/response packet flows and tool execution metrics.

---

## 🛠️ Supported MCP Servers

| Server | Transport | Description | Key Tools |
| :--- | :---: | :--- | :--- |
| **Filesystem Server** | `stdio` | Official Anthropic Filesystem MCP server | `read_file`, `write_file`, `list_directory` |
| **Git MCP Server** | `stdio` | Custom local repository management server | `git_init`, `git_status`, `git_add`, `git_commit`, `git_log` |
| **PharmaCare Server (Local)** | `stdio` | Local pharmacy inventory and purchase order engine | `search_medications`, `check_inventory`, `create_order`, `get_order_status` |
| **PharmaCare Server (Remote)** | `HTTP` | Cloud-ready HTTP MCP server for deployment on Cloud Run or Render | `search_medications`, `check_inventory`, `create_order`, `get_order_status` |

---

## 🚀 Getting Started

### Prerequisites
* **Node.js** v20.0.0 or higher
* **npm** v9.0.0 or higher
* **Git** installed on your system

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Zacatac23/chat-bot-redes.git
   cd chat-bot-redes/Chat-bot
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the `Chat-bot` directory based on `.env.example`:
   ```env
   # Google Gemini API Key (free from https://aistudio.google.com/)
   GEMINI_API_KEY=YOUR_GEMINI_API_KEY

   # Web Inspector Port
   PORT=3000

   # Remote MCP Server Port (for local testing of the remote server)
   REMOTE_PORT=8080

   # Remote MCP Server Endpoint URL
   # (Leave empty to use local stdio PharmaCare server, or set URL to use Remote MCP)
   REMOTE_PHARMA_MCP_URL=http://localhost:8080/mcp
   ```

---

## 💻 Running the Application

### 1. Terminal CLI Mode
Launch the interactive command-line interface:
```bash
npm run cli
```

#### Available CLI Commands:
* `/scenario-git`: Automatically runs the complete Git + Filesystem scenario (`git_init` ➔ `write_file` ➔ `git_add` ➔ `git_commit` ➔ `git_log`).
* `/scenario-pharma`: Demonstrates searching medications by symptom and placing a purchase order via JSON-RPC.
* `/servers`: Lists all currently connected MCP servers and their exposed tools.
* `/logs`: Prints the most recent JSON-RPC requests, responses, and notifications.
* `/clear`: Resets the session and clears conversation memory.
* `/help`: Displays the help menu.
* `exit`: Disconnects servers and exits cleanly.

---

### 2. Web Inspector UI Mode (Extra UI Feature)
Start the Express server with live WebSocket protocol streaming:
```bash
npm run dev
```
Open your browser at: **[http://localhost:3000](http://localhost:3000)**

* **Chat Interface:** Chat naturally with the bot and test contextual memory.
* **Live JSON-RPC Inspector:** Inspect raw JSON-RPC requests (`sent`) and responses (`received`) in real-time.
* **Server Status:** Monitor active MCP clients and tool definitions.

---

### 3. Running the Standalone Remote MCP Server
To run the remote HTTP server locally (e.g., for Wireshark inspection or container testing):
```bash
npm run pharma-remote
```
Endpoints:
* `POST /mcp`: Main JSON-RPC 2.0 handler.
* `GET /mcp`: Server metadata and tool discovery.
* `GET /health`: Health-check endpoint for cloud container orchestrators.

---

### 4. Running the Remote Integration Test Suite
Execute the automated end-to-end verification script:
```bash
npx tsx scratch/test-remote-mcp.ts
```
This script starts the remote server, performs the initial JSON-RPC handshake (`initialize` + `notifications/initialized`), retrieves the tool catalog (`tools/list`), calls tools, and shuts down cleanly.

---

## ☁️ Cloud Deployment (Google Cloud Run / Render)

The repository includes a production-ready [`Dockerfile`](./Dockerfile) for containerized deployments:

### Deploying to Google Cloud Run
```bash
gcloud run deploy pharma-mcp-server \
  --source . \
  --port 8080 \
  --allow-unauthenticated
```

### Deploying to Render / Railway
1. Connect this repository to Render or Railway.
2. Select **Docker** environment (or set root directory to `Chat-bot`).
3. Set the public service URL in your `.env`:
   ```env
   REMOTE_PHARMA_MCP_URL=https://your-service.onrender.com/mcp
   ```

---

## 🦈 Wireshark Network Packet Analysis Guide

To capture and analyze MCP network packets between the host and the remote server:

1. **Launch Wireshark** and select your network interface:
   * Select **Npcap Loopback Adapter** for local port testing (`localhost:8080` / `localhost:8085`).
   * Select **Wi-Fi** or **Ethernet** for cloud testing.
2. **Apply capture filter:**
   ```wireshark
   http || tcp.port == 8080 || tcp.port == 8085
   ```
3. **Trigger traffic:** Run `npx tsx scratch/test-remote-mcp.ts` or make queries in the CLI.
4. **Inspect packets:**
   * **TCP Handshake:** Locate `[SYN]`, `[SYN, ACK]`, `[ACK]` flags (Transport Layer).
   * **MCP Synchronization:** Inspect `POST /mcp` with `initialize` and server response with `serverInfo`.
   * **Tool Requests:** Inspect `POST /mcp` with `tools/list` and `tools/call`.
   * **Tool Responses:** Inspect `HTTP 200 OK` packets containing JSON-RPC `result`.

A full theoretical breakdown by OSI/TCP-IP layers (Data Link, Network, Transport, and Application) is documented in [`docs/REPORTE_WIRESHARK_Y_ESPECIFICACION.md`](./docs/REPORTE_WIRESHARK_Y_ESPECIFICACION.md).

---

## 📁 Project Structure

```
Chat-bot/
├── Dockerfile                      # Production container definition for Cloud Run / Render
├── README.md                       # Comprehensive project documentation
├── package.json                    # Scripts and dependencies
├── tsconfig.json                   # TypeScript compiler configuration
├── mcp_specs/
│   └── pharma_mcp_spec.json        # Formal JSON Schema specification of PharmaCare tools
├── docs/
│   └── REPORTE_WIRESHARK_Y_ESPECIFICACION.md  # Technical report and Wireshark analysis
├── scratch/
│   └── test-remote-mcp.ts          # Automated end-to-end remote MCP test suite
└── src/
    ├── cli.ts                      # Interactive Terminal CLI with fast commands
    ├── core/
    │   ├── chatbot.ts              # Host orchestrator, LLM caller, tool dispatcher
    │   └── logger.ts               # Centralized event-driven JSON-RPC logger
    ├── protocol/
    │   ├── jsonrpc.ts              # Manual JSON-RPC 2.0 serialization and validator
    │   ├── mcp-client-stdio.ts     # Local Stdio MCP Client
    │   └── mcp-client-http.ts      # Remote HTTP MCP Client
    ├── servers/
    │   ├── custom-git-server.ts    # Custom Local Git MCP Server
    │   ├── custom-pharma-server.ts # Custom Local PharmaCare MCP Server (stdio)
    │   └── remote-pharma-server.ts # Remote HTTP PharmaCare MCP Server (Express)
    └── web/
        ├── server.ts               # Web server and WebSocket log broadcaster
        └── public/                 # Real-time Web Inspector UI (HTML, CSS, JS)
```

---

## 📄 Academic Integrity & References
* **JSON-RPC 2.0 Specification:** [https://www.jsonrpc.org/](https://www.jsonrpc.org/)
* **Model Context Protocol Architecture:** [https://modelcontextprotocol.io/](https://modelcontextprotocol.io/)
* **Google Cloud Run MCP Deployment:** [Google Cloud Blog Tutorial](https://cloud.google.com/blog/topics/developers-practitioners/build-and-deploy-a-remote-mcp-server-to-google-cloud-run-in-under-10-minutes)
