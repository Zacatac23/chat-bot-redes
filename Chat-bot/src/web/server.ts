import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import dotenv from 'dotenv';
import { ChatbotHost } from '../core/chatbot.js';
import { Logger } from '../core/logger.js';

dotenv.config();

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.json());
app.use(express.static(path.join(process.cwd(), 'src', 'web', 'public')));

const PORT = process.env.PORT || 3000;
const host = new ChatbotHost();
const logger = Logger.getInstance();

// Broadcast new log to all connected WebSocket UI clients
logger.on('new_log', (logEntry) => {
  const data = JSON.stringify({ type: 'log', data: logEntry });
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  }
});

// API Routes
app.get('/api/status', (req, res) => {
  const connectedServers = host.getConnectedServers();
  res.json({
    initialized: true,
    servers: connectedServers
  });
});

app.get('/api/logs', (req, res) => {
  res.json(logger.getLogs());
});

app.post('/api/chat', async (req, res) => {
  const { message } = req.body;
  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    const reply = await host.sendMessage(message);
    res.json({ reply, history: host.getHistory() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/clear-logs', (req, res) => {
  logger.clearLogs();
  res.json({ success: true });
});

app.post('/api/clear-history', (req, res) => {
  host.clearHistory();
  res.json({ success: true });
});

// Start Server & Initialize MCP Clients
server.listen(PORT, async () => {
  console.log(`====================================================`);
  console.log(`🚀 MCP Host Web Server running on http://localhost:${PORT}`);
  console.log(`====================================================`);

  const workspaceDir = process.cwd();
  console.log(`🔌 Initializing MCP Servers in workspace: ${workspaceDir}...`);
  try {
    await host.initializeServers(workspaceDir);
    console.log(`✅ MCP Servers initialization completed!`);
  } catch (err: any) {
    console.error(`❌ MCP Initialization error: ${err.message}`);
  }
});
