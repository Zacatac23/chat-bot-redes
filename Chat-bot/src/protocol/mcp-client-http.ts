import { JsonRpcProtocol } from './jsonrpc.js';
import { Logger } from '../core/logger.js';
import { McpTool } from './mcp-client-stdio.js';

export interface IMcpClient {
  readonly name: string;
  connect(): Promise<boolean>;
  refreshTools(): Promise<McpTool[]>;
  getTools(): McpTool[];
  callTool(toolName: string, args: Record<string, any>): Promise<any>;
  sendRequest(req: any): Promise<any>;
  sendNotification(notification: any): void;
  disconnect(): void;
}

/**
 * Remote MCP Client communicating over HTTP POST using manual JSON-RPC 2.0.
 * Designed for standard MCP cloud deployments (Cloud Run, Cloudflare, Render, etc.).
 */
export class HttpMcpClient implements IMcpClient {
  public readonly name: string;
  private endpointUrl: string;
  private tools: McpTool[] = [];
  private isConnected = false;
  private logger = Logger.getInstance();

  constructor(name: string, endpointUrl: string) {
    this.name = name;
    this.endpointUrl = endpointUrl;
  }

  public async connect(): Promise<boolean> {
    this.logger.log({
      serverName: this.name,
      type: 'system',
      direction: 'internal',
      payload: `Connecting to remote MCP server at: ${this.endpointUrl}...`
    });

    try {
      // 1. Perform MCP Handshake: initialize
      const initReq = JsonRpcProtocol.createRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'custom-mcp-http-client', version: '1.0.0' }
      });

      const initRes = await this.sendRequest(initReq);
      this.logger.log({
        serverName: this.name,
        type: 'system',
        direction: 'internal',
        payload: `Handshake successful with remote [${this.name}]: ${JSON.stringify(initRes?.serverInfo || {})}`
      });

      // 2. Send initialized notification
      const initNotification = JsonRpcProtocol.createNotification('notifications/initialized');
      this.sendNotification(initNotification);

      // 3. Query available tools: tools/list
      await this.refreshTools();
      this.isConnected = true;
      return true;
    } catch (err: any) {
      this.isConnected = false;
      this.logger.log({
        serverName: this.name,
        type: 'error',
        direction: 'internal',
        payload: `Failed to connect to remote server ${this.name} (${this.endpointUrl}): ${err.message}`
      });
      throw err;
    }
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
    this.logger.log({
      serverName: this.name,
      type: 'request',
      direction: 'sent',
      payload: req
    });

    try {
      const response = await fetch(this.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JsonRpcProtocol.serialize(req)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status} ${response.statusText}: ${errorText}`);
      }

      const json = await response.json();

      this.logger.log({
        serverName: this.name,
        type: 'response',
        direction: 'received',
        payload: json
      });

      if (!JsonRpcProtocol.isResponse(json)) {
        throw new Error(`Invalid JSON-RPC 2.0 response format received from ${this.name}`);
      }

      if ('error' in json) {
        throw new Error(json.error.message || `JSON-RPC Error code ${json.error.code}`);
      }

      return json.result;
    } catch (err: any) {
      this.logger.log({
        serverName: this.name,
        type: 'error',
        direction: 'received',
        payload: `Error during HTTP request to ${this.name}: ${err.message}`
      });
      throw err;
    }
  }

  public sendNotification(notification: any): void {
    this.logger.log({
      serverName: this.name,
      type: 'notification',
      direction: 'sent',
      payload: notification
    });

    fetch(this.endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JsonRpcProtocol.serialize(notification)
    }).catch((err) => {
      this.logger.log({
        serverName: this.name,
        type: 'error',
        direction: 'internal',
        payload: `Notification error to ${this.name}: ${err.message}`
      });
    });
  }

  public disconnect(): void {
    this.isConnected = false;
    this.logger.log({
      serverName: this.name,
      type: 'system',
      direction: 'internal',
      payload: `Disconnected from remote MCP server ${this.name}`
    });
  }
}
