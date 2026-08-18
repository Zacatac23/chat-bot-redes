/**
 * Manual implementation of JSON-RPC 2.0 Protocol structures and helper utilities.
 * Complies with standard JSON-RPC 2.0 specification without external MCP SDK dependencies.
 */

export interface JsonRpcRequest<T = any> {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: T;
}

export interface JsonRpcNotification<T = any> {
  jsonrpc: '2.0';
  method: string;
  params?: T;
}

export interface JsonRpcResponseSuccess<T = any> {
  jsonrpc: '2.0';
  id: string | number;
  result: T;
}

export interface JsonRpcResponseError {
  jsonrpc: '2.0';
  id: string | number | null;
  error: {
    code: number;
    message: string;
    data?: any;
  };
}

export type JsonRpcResponse<T = any> = JsonRpcResponseSuccess<T> | JsonRpcResponseError;
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export class JsonRpcProtocol {
  private static currentId = 1;

  public static generateId(): number {
    return this.currentId++;
  }

  public static createRequest<T = any>(method: string, params?: T, id?: string | number): JsonRpcRequest<T> {
    return {
      jsonrpc: '2.0',
      id: id ?? this.generateId(),
      method,
      ...(params !== undefined ? { params } : {})
    };
  }

  public static createNotification<T = any>(method: string, params?: T): JsonRpcNotification<T> {
    return {
      jsonrpc: '2.0',
      method,
      ...(params !== undefined ? { params } : {})
    };
  }

  public static createSuccessResponse<T = any>(id: string | number, result: T): JsonRpcResponseSuccess<T> {
    return {
      jsonrpc: '2.0',
      id,
      result
    };
  }

  public static createErrorResponse(
    id: string | number | null,
    code: number,
    message: string,
    data?: any
  ): JsonRpcResponseError {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
        ...(data !== undefined ? { data } : {})
      }
    };
  }

  public static serialize(message: JsonRpcMessage): string {
    return JSON.stringify(message);
  }

  public static parse(payload: string): JsonRpcMessage | null {
    try {
      const obj = JSON.parse(payload);
      if (obj && obj.jsonrpc === '2.0') {
        return obj as JsonRpcMessage;
      }
      return null;
    } catch {
      return null;
    }
  }

  public static isRequest(msg: any): msg is JsonRpcRequest {
    return msg && msg.jsonrpc === '2.0' && typeof msg.method === 'string' && msg.id !== undefined;
  }

  public static isNotification(msg: any): msg is JsonRpcNotification {
    return msg && msg.jsonrpc === '2.0' && typeof msg.method === 'string' && msg.id === undefined;
  }

  public static isResponse(msg: any): msg is JsonRpcResponse {
    return msg && msg.jsonrpc === '2.0' && msg.id !== undefined && ('result' in msg || 'error' in msg);
  }
}
