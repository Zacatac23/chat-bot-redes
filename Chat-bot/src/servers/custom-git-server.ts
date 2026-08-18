/**
 * Git MCP Server: Local Git Repository Management
 * Implemented over stdio using standard JSON-RPC 2.0.
 * Supports git init, status, add, commit, and log operations.
 */

import readline from 'readline';
import { execSync } from 'child_process';
import path from 'path';

function sendResponse(response: any) {
  const json = JSON.stringify(response);
  process.stdout.write(json + '\n');
}

function runGitCmd(cmd: string, cwd?: string): { success: boolean; output: string } {
  try {
    const targetDir = cwd || process.cwd();
    const output = execSync(cmd, { cwd: targetDir, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { success: true, output: output.trim() || 'Comando ejecutado exitosamente sin salida de texto.' };
  } catch (err: any) {
    const errorMsg = err.stderr ? err.stderr.toString() : err.message;
    return { success: false, output: errorMsg.trim() || 'Error al ejecutar comando git.' };
  }
}

const rl = readline.createInterface({
  input: process.stdin,
  terminal: false
});

rl.on('line', (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) return;

  try {
    const msg = JSON.parse(trimmed);
    if (!msg || msg.jsonrpc !== '2.0') return;

    if (msg.id !== undefined && msg.method) {
      handleRequest(msg);
    } else if (msg.method === 'notifications/initialized') {
      // Handshake complete
    }
  } catch (err) {
    // Ignore invalid JSON lines
  }
});

function handleRequest(req: any) {
  const { id, method, params } = req;

  switch (method) {
    case 'initialize':
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'git-mcp-server',
            version: '1.0.0'
          }
        }
      });
      break;

    case 'tools/list':
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          tools: [
            {
              name: 'git_init',
              description: 'Inicializa un nuevo repositorio Git en la carpeta de trabajo actual o subcarpeta especificada.',
              inputSchema: {
                type: 'object',
                properties: {
                  directory: { type: 'string', description: 'Ruta o nombre de la carpeta (opcional, por defecto el directorio del proyecto)' }
                }
              }
            },
            {
              name: 'git_status',
              description: 'Muestra el estado del repositorio Git (archivos modificados, sin seguimiento, en staging).',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            },
            {
              name: 'git_add',
              description: 'Agrega archivos al área de preparación (staging area) de Git.',
              inputSchema: {
                type: 'object',
                properties: {
                  files: { type: 'string', description: 'Archivos a agregar (ej. "." para todos o "README.md")' }
                },
                required: ['files']
              }
            },
            {
              name: 'git_commit',
              description: 'Realiza un commit en el repositorio Git con un mensaje descriptivo.',
              inputSchema: {
                type: 'object',
                properties: {
                  message: { type: 'string', description: 'Mensaje descriptivo del commit' }
                },
                required: ['message']
              }
            },
            {
              name: 'git_log',
              description: 'Muestra el historial de commits del repositorio Git.',
              inputSchema: {
                type: 'object',
                properties: {
                  max_count: { type: 'number', description: 'Número máximo de commits a mostrar (opcional, por defecto 5)' }
                }
              }
            }
          ]
        }
      });
      break;

    case 'tools/call':
      handleToolCall(id, params);
      break;

    default:
      sendResponse({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      });
      break;
  }
}

function handleToolCall(id: number | string, params: any) {
  const { name, arguments: args } = params || {};

  try {
    switch (name) {
      case 'git_init': {
        const dirParam = args?.directory;
        const targetPath = dirParam ? path.resolve(process.cwd(), dirParam) : process.cwd();
        const res = runGitCmd('git init', targetPath);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ message: res.output, success: res.success }, null, 2) }]
          }
        });
        break;
      }

      case 'git_status': {
        const res = runGitCmd('git status');
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ status: res.output, success: res.success }, null, 2) }]
          }
        });
        break;
      }

      case 'git_add': {
        const files = args?.files || '.';
        const res = runGitCmd(`git add ${files}`);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ message: `git add ${files} ejecutado`, output: res.output, success: res.success }, null, 2) }]
          }
        });
        break;
      }

      case 'git_commit': {
        const msg = (args?.message || 'Update repository').replace(/"/g, '\\"');
        const res = runGitCmd(`git commit -m "${msg}"`);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ message: res.output, success: res.success }, null, 2) }]
          }
        });
        break;
      }

      case 'git_log': {
        const count = args?.max_count || 5;
        const res = runGitCmd(`git log -n ${count} --oneline`);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify({ commits: res.output, success: res.success }, null, 2) }]
          }
        });
        break;
      }

      default:
        sendResponse({
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Tool non-existent: ${name}` }
        });
        break;
    }
  } catch (err: any) {
    sendResponse({
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: `Internal server error: ${err.message}` }
    });
  }
}
