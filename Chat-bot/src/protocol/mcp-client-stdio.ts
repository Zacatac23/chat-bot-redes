import { spawn, ChildProcess } from 'child_process';
import readline from 'readline';
import { JsonRpcProtocol, JsonRpcResponse } from './jsonrpc.js';
import { Logger } from '../core/logger.js';

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, any>;
}

export class StdioMcpClient {
  public readonly name: string;
  private command: string;
  private args: string[];
  private process: ChildProcess | null = null;
  private pendingRequests = new Map<string | number, { resolve: (res: any) => void; reject: (err: any) => void }>();
  private tools: McpTool[] = [];
  private isConnected = false;
  private logger = Logger.getInstance();

  constructor(name: string, command: string, args: string[] = []) {
    this.name = name;
    this.command = command;
    this.args = args;
  }

  public async connect(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      try {
        this.logger.log({
          serverName: this.name,
          type: 'system',
          direction: 'internal',
          payload: `Starting subprocess: ${this.command} ${this.args.join(' ')}`
        });

        // Spawn subprocess using shell execution to support Windows npx/node binaries
        this.process = spawn(this.command, this.args, {
          shell: true,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        if (!this.process.stdout || !this.process.stdin) {
          throw new Error('Failed to open process stdin/stdout streams');
        }

        // Set up line-delimited JSON-RPC reader on stdout
        const rl = readline.createInterface({
          input: this.process.stdout,
          terminal: false
        });

        rl.on('line', (line: string) => {
          const trimmed = line.trim();
          if (!trimmed) return;

          const parsed = JsonRpcProtocol.parse(trimmed);
          if (parsed) {
            this.handleIncomingMessage(parsed);
          } else {
            // Unrecognized stdout output (could be server debug log)
            this.logger.log({
              serverName: this.name,
              type: 'system',
              direction: 'received',
              payload: `[RAW STDOUT] ${trimmed}`
            });
          }
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          const stderrText = data.toString('utf-8').trim();
          if (stderrText) {
            this.logger.log({
              serverName: this.name,
              type: 'system',
              direction: 'received',
              payload: `[RAW STDERR] ${stderrText}`
            });
          }
        });

        this.process.on('error', (err) => {
          this.logger.log({
            serverName: this.name,
            type: 'error',
            direction: 'internal',
            payload: `Subprocess error: ${err.message}`
          });
          this.isConnected = false;
          reject(err);
        });

        this.process.on('exit', (code, signal) => {
          this.logger.log({
            serverName: this.name,
            type: 'system',
            direction: 'internal',
            payload: `Subprocess exited with code ${code}, signal ${signal}`
          });
          this.isConnected = false;
        });

        // Perform MCP Handshake
        this.performHandshake()
          .then(async () => {
            await this.refreshTools();
            this.isConnected = true;
            resolve(true);
          })
          .catch((err) => reject(err));
      } catch (err: any) {
        reject(err);
      }
    });
  }

  private async performHandshake(): Promise<void> {
    const initReq = JsonRpcProtocol.createRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'custom-mcp-host', version: '1.0.0' }
    });

    const initRes = await this.sendRequest(initReq);
    this.logger.log({
      serverName: this.name,
      type: 'system',
      direction: 'internal',
      payload: `Handshake successful with ${this.name}: ${JSON.stringify(initRes?.serverInfo || {})}`
    });

    // Send initialized notification
    const initNotification = JsonRpcProtocol.createNotification('notifications/initialized');
    this.sendNotification(initNotification);
  }

  public async refreshTools(): Promise<McpTool[]> {
    const listReq = JsonRpcProtocol.createRequest('tools/list');
    const res = await this.sendRequest(listReq);
    if (res && Array.isArray(res.tools)) {
      this.tools = res.tools;
    } else {
      this.tools = [];
    }
    return this.tools;
  }

  public getTools(): McpTool[] {
    return this.tools;
  }

  public async callTool(toolName: string, args: Record<string, any>): Promise<any> {
    const callReq = JsonRpcProtocol.createRequest('tools/call', {
      name: toolName,
      arguments: args
    });

    const res = await this.sendRequest(callReq);
    return res;
  }

  public async sendRequest(req: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process || !this.process.stdin) {
        return reject(new Error(`Server ${this.name} is not connected`));
      }

      this.pendingRequests.set(req.id, { resolve, reject });

      const rawMessage = JsonRpcProtocol.serialize(req) + '\n';
      this.logger.log({
        serverName: this.name,
        type: 'request',
        direction: 'sent',
        payload: req
      });

      this.process.stdin.write(rawMessage, 'utf-8', (err) => {
        if (err) {
          this.pendingRequests.delete(req.id);
          reject(err);
        }
      });

      // Timeout safety (30s)
      setTimeout(() => {
        if (this.pendingRequests.has(req.id)) {
          this.pendingRequests.delete(req.id);
          reject(new Error(`Request timeout (${req.method}, ID: ${req.id}) to ${this.name}`));
        }
      }, 30000);
    });
  }

  public sendNotification(notification: any): void {
    if (!this.process || !this.process.stdin) return;
    const rawMessage = JsonRpcProtocol.serialize(notification) + '\n';
    this.logger.log({
      serverName: this.name,
      type: 'notification',
      direction: 'sent',
      payload: notification
    });
    this.process.stdin.write(rawMessage, 'utf-8');
  }

  private handleIncomingMessage(msg: any): void {
    if (JsonRpcProtocol.isResponse(msg)) {
      this.logger.log({
        serverName: this.name,
        type: 'response',
        direction: 'received',
        payload: msg
      });

      if (msg.id !== null && msg.id !== undefined) {
        const pending = this.pendingRequests.get(msg.id);
        if (pending) {
          this.pendingRequests.delete(msg.id);
          if ('error' in msg) {
            pending.reject(new Error(msg.error.message || 'JSON-RPC Error'));
          } else {
            pending.resolve(msg.result);
          }
        }
      }
    } else if (JsonRpcProtocol.isNotification(msg)) {
      this.logger.log({
        serverName: this.name,
        type: 'notification',
        direction: 'received',
        payload: msg
      });
    } else if (JsonRpcProtocol.isRequest(msg)) {
      this.logger.log({
        serverName: this.name,
        type: 'request',
        direction: 'received',
        payload: msg
      });
    }
  }

  public disconnect(): void {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
    this.isConnected = false;
  }
}
