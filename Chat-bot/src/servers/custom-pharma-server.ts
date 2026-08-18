/**
 * Custom MCP Server: PharmaCare (Industry Case: Pharmacy Inventory & Ordering System)
 * Implemented manually over stdio using standard JSON-RPC 2.0.
 */

import readline from 'readline';

interface Medication {
  id: string;
  name: string;
  category: string;
  symptoms: string[];
  price: number;
  stock: number;
  prescriptionRequired: boolean;
}

interface Order {
  id: string;
  patientName: string;
  items: Array<{ medicationId: string; name: string; quantity: number; unitPrice: number }>;
  total: number;
  address: string;
  status: 'PENDING' | 'DISPATCHED' | 'DELIVERED';
  date: string;
}

// In-Memory Database
const medicationsDb: Medication[] = [
  {
    id: 'MED-001',
    name: 'Paracetamol 500mg',
    category: 'Analgésico / Antipirético',
    symptoms: ['fiebre', 'dolor de cabeza', 'dolor leve'],
    price: 15.50,
    stock: 120,
    prescriptionRequired: false
  },
  {
    id: 'MED-002',
    name: 'Ibuprofeno 400mg',
    category: 'Antiinflamatorio',
    symptoms: ['inflamación', 'dolor muscular', 'fiebre', 'dolor de garganta'],
    price: 22.00,
    stock: 85,
    prescriptionRequired: false
  },
  {
    id: 'MED-003',
    name: 'Amoxicilina 500mg',
    category: 'Antibiótico',
    symptoms: ['infección bacteriana', 'infección respiratoria'],
    price: 65.00,
    stock: 30,
    prescriptionRequired: true
  },
  {
    id: 'MED-004',
    name: 'Loratadina 10mg',
    category: 'Antihistamínico',
    symptoms: ['alergia', 'estornudos', 'rinitis', 'picazón'],
    price: 18.00,
    stock: 95,
    prescriptionRequired: false
  },
  {
    id: 'MED-005',
    name: 'Omeprazol 20mg',
    category: 'Antiácido',
    symptoms: ['acidez', 'gastritis', 'reflujo'],
    price: 35.00,
    stock: 60,
    prescriptionRequired: false
  }
];

const ordersDb: Map<string, Order> = new Map();

// Helper to write JSON-RPC response to stdout
function sendResponse(response: any) {
  const json = JSON.stringify(response);
  process.stdout.write(json + '\n');
}

// Line Reader for Stdio
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

    // Handle Requests
    if (msg.id !== undefined && msg.method) {
      handleRequest(msg);
    } else if (msg.method === 'notifications/initialized') {
      // Client initialized notification, no response required
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
            name: 'pharmacare-mcp-server',
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
              name: 'search_medications',
              description: 'Busca medicamentos por nombre, síntoma (ej. fiebre, acidez, dolor de cabeza) o categoría médica.',
              inputSchema: {
                type: 'object',
                properties: {
                  query: { type: 'string', description: 'Nombre del medicamento o síntoma que presenta el paciente' },
                  category: { type: 'string', description: 'Categoría médica opcional' }
                },
                required: ['query']
              }
            },
            {
              name: 'check_inventory',
              description: 'Consulta el stock en inventario y precio de un medicamento mediante su ID.',
              inputSchema: {
                type: 'object',
                properties: {
                  medication_id: { type: 'string', description: 'ID único del medicamento (ej. MED-001)' }
                },
                required: ['medication_id']
              }
            },
            {
              name: 'create_order',
              description: 'Registra un pedido de compra de medicamentos para entrega a domicilio.',
              inputSchema: {
                type: 'object',
                properties: {
                  patient_name: { type: 'string', description: 'Nombre completo del paciente o cliente' },
                  address: { type: 'string', description: 'Dirección de entrega' },
                  items: {
                    type: 'array',
                    description: 'Lista de ítems a comprar',
                    items: {
                      type: 'object',
                      properties: {
                        medication_id: { type: 'string', description: 'ID del medicamento' },
                        quantity: { type: 'number', description: 'Cantidad deseada' }
                      },
                      required: ['medication_id', 'quantity']
                    }
                  }
                },
                required: ['patient_name', 'address', 'items']
              }
            },
            {
              name: 'get_order_status',
              description: 'Obtiene el estado detallado de una orden mediante su ID de orden.',
              inputSchema: {
                type: 'object',
                properties: {
                  order_id: { type: 'string', description: 'ID de la orden (ej. ORD-9821)' }
                },
                required: ['order_id']
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
      case 'search_medications': {
        const query = (args?.query || '').toLowerCase();
        const category = (args?.category || '').toLowerCase();

        const results = medicationsDb.filter((med) => {
          const matchQuery =
            med.name.toLowerCase().includes(query) ||
            med.symptoms.some((s) => s.toLowerCase().includes(query)) ||
            med.category.toLowerCase().includes(query);
          const matchCategory = !category || med.category.toLowerCase().includes(category);
          return matchQuery && matchCategory;
        });

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ count: results.length, medications: results }, null, 2)
              }
            ]
          }
        });
        break;
      }

      case 'check_inventory': {
        const medId = (args?.medication_id || '').toUpperCase();
        const med = medicationsDb.find((m) => m.id === medId);

        if (!med) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({ error: `Medicamento con ID ${medId} no encontrado` })
                }
              ]
            }
          });
          return;
        }

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    id: med.id,
                    name: med.name,
                    price: `Q${med.price.toFixed(2)}`,
                    stock: med.stock,
                    available: med.stock > 0,
                    prescriptionRequired: med.prescriptionRequired
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
        break;
      }

      case 'create_order': {
        const { patient_name, address, items } = args || {};
        if (!patient_name || !address || !Array.isArray(items) || items.length === 0) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Invalid params for create_order' }
          });
          return;
        }

        let grandTotal = 0;
        const orderedItems: Array<{ medicationId: string; name: string; quantity: number; unitPrice: number }> = [];

        for (const item of items) {
          const med = medicationsDb.find((m) => m.id === item.medication_id.toUpperCase());
          if (!med) {
            sendResponse({
              jsonrpc: '2.0',
              id,
              result: {
                content: [{ type: 'text', text: JSON.stringify({ error: `Medicamento ${item.medication_id} no existe` }) }]
              }
            });
            return;
          }

          if (med.stock < item.quantity) {
            sendResponse({
              jsonrpc: '2.0',
              id,
              result: {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify({
                      error: `Stock insuficiente para ${med.name}. Disponible: ${med.stock}, Solicitado: ${item.quantity}`
                    })
                  }
                ]
              }
            });
            return;
          }

          // Deduct stock
          med.stock -= item.quantity;
          const subtotal = med.price * item.quantity;
          grandTotal += subtotal;

          orderedItems.push({
            medicationId: med.id,
            name: med.name,
            quantity: item.quantity,
            unitPrice: med.price
          });
        }

        const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
        const newOrder: Order = {
          id: orderId,
          patientName: patient_name,
          address,
          items: orderedItems,
          total: grandTotal,
          status: 'PENDING',
          date: new Date().toISOString()
        };

        ordersDb.set(orderId, newOrder);

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    message: 'Orden creada exitosamente',
                    orderId: newOrder.id,
                    patientName: newOrder.patientName,
                    address: newOrder.address,
                    totalPrice: `Q${newOrder.total.toFixed(2)}`,
                    status: newOrder.status,
                    items: newOrder.items
                  },
                  null,
                  2
                )
              }
            ]
          }
        });
        break;
      }

      case 'get_order_status': {
        const orderId = (args?.order_id || '').toUpperCase();
        const order = ordersDb.get(orderId);

        if (!order) {
          sendResponse({
            jsonrpc: '2.0',
            id,
            result: {
              content: [{ type: 'text', text: JSON.stringify({ error: `Orden ${orderId} no encontrada` }) }]
            }
          });
          return;
        }

        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: JSON.stringify(order, null, 2)
              }
            ]
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
