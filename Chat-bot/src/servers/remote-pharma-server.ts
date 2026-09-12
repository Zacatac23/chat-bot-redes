/**
 * Remote MCP Server: PharmaCare (Industry Case: Pharmacy Inventory & Ordering System)
 * Implemented over HTTP POST using standard JSON-RPC 2.0 without MCP SDK dependencies.
 * Ready for cloud deployment on Google Cloud Run, Render, Cloudflare, Railway, etc.
 */

import express, { Request, Response } from 'express';
import dotenv from 'dotenv';

dotenv.config();

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

const app = express();
app.use(express.json());

// Enable CORS for external / browser clients
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Definition of Available Tools
const PHARMA_TOOLS = [
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
];

function executeTool(name: string, args: any): any {
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

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ count: results.length, medications: results }, null, 2)
          }
        ]
      };
    }

    case 'check_inventory': {
      const id = (args?.medication_id || '').toUpperCase();
      const med = medicationsDb.find((m) => m.id === id);

      if (!med) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: `Medicamento con ID ${id} no fue encontrado en la base de datos.` })
            }
          ]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                id: med.id,
                name: med.name,
                stock: med.stock,
                unitPrice: `Q${med.price.toFixed(2)}`,
                available: med.stock > 0,
                prescriptionRequired: med.prescriptionRequired
              },
              null,
              2
            )
          }
        ]
      };
    }

    case 'create_order': {
      const { patient_name, address, items } = args || {};

      if (!patient_name || !address || !Array.isArray(items) || items.length === 0) {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'Parámetros inválidos para crear la orden (se requiere patient_name, address y lista de items).' })
            }
          ]
        };
      }

      let total = 0;
      const orderItems: any[] = [];

      for (const item of items) {
        const med = medicationsDb.find((m) => m.id === item.medication_id);
        if (!med) {
          return {
            isError: true,
            content: [{ type: 'text', text: JSON.stringify({ error: `Medicamento ${item.medication_id} no existe.` }) }]
          };
        }

        if (med.stock < item.quantity) {
          return {
            isError: true,
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: `Stock insuficiente para ${med.name}. Disponible: ${med.stock}, Solicitado: ${item.quantity}` })
              }
            ]
          };
        }

        med.stock -= item.quantity;
        const subtotal = med.price * item.quantity;
        total += subtotal;

        orderItems.push({
          medicationId: med.id,
          name: med.name,
          quantity: item.quantity,
          unitPrice: med.price
        });
      }

      const orderId = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;
      const order: Order = {
        id: orderId,
        patientName: patient_name,
        address,
        items: orderItems,
        total,
        status: 'PENDING',
        date: new Date().toISOString()
      };

      ordersDb.set(orderId, order);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                message: 'Orden creada exitosamente en PharmaCare MCP Remote Server',
                orderId: order.id,
                patientName: order.patientName,
                address: order.address,
                itemsCount: order.items.length,
                totalPrice: `Q${order.total.toFixed(2)}`,
                status: order.status
              },
              null,
              2
            )
          }
        ]
      };
    }

    case 'get_order_status': {
      const orderId = (args?.order_id || '').toUpperCase();
      const order = ordersDb.get(orderId);

      if (!order) {
        return {
          isError: true,
          content: [{ type: 'text', text: JSON.stringify({ error: `Orden ${orderId} no encontrada.` }) }]
        };
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(order, null, 2)
          }
        ]
      };
    }

    default:
      throw new Error(`Tool not found: ${name}`);
  }
}

// Health check endpoint for cloud hosting
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    server: 'pharmacare-remote-mcp-server',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// Server info endpoint
app.get('/mcp', (req: Request, res: Response) => {
  res.json({
    name: 'pharmacare-remote-mcp-server',
    version: '1.0.0',
    protocol: 'JSON-RPC 2.0 over HTTP',
    endpoints: {
      post_mcp: '/mcp',
      health: '/health'
    },
    tools: PHARMA_TOOLS.map((t) => t.name)
  });
});

// Main JSON-RPC 2.0 endpoint
app.post('/mcp', (req: Request, res: Response) => {
  const body = req.body;

  if (!body || body.jsonrpc !== '2.0') {
    return res.status(400).json({
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: {
        code: -32600,
        message: 'Invalid Request: jsonrpc version must be "2.0"'
      }
    });
  }

  const { id, method, params } = body;
  console.log(`[REMOTE MCP] Received JSON-RPC Method: "${method}" (ID: ${id})`);

  // Handle Notifications (messages with no id)
  if (id === undefined) {
    if (method === 'notifications/initialized') {
      console.log(`[REMOTE MCP] Client handshake acknowledged: notifications/initialized`);
    }
    return res.status(204).end();
  }

  // Handle Requests
  switch (method) {
    case 'initialize':
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'pharmacare-remote-mcp-server',
            version: '1.0.0'
          }
        }
      });

    case 'tools/list':
      return res.json({
        jsonrpc: '2.0',
        id,
        result: {
          tools: PHARMA_TOOLS
        }
      });

    case 'tools/call': {
      try {
        const { name, arguments: args } = params || {};
        const toolResult = executeTool(name, args);
        return res.json({
          jsonrpc: '2.0',
          id,
          result: toolResult
        });
      } catch (err: any) {
        return res.json({
          jsonrpc: '2.0',
          id,
          error: {
            code: -32603,
            message: err.message || 'Internal error executing tool'
          }
        });
      }
    }

    default:
      return res.status(404).json({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Method not found: ${method}`
        }
      });
  }
});

const PORT = process.env.REMOTE_PORT || 8080;

app.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🌐 PharmaCare Remote MCP Server running on port ${PORT}`);
  console.log(`   Protocol: JSON-RPC 2.0 over HTTP`);
  console.log(`   Endpoint: http://localhost:${PORT}/mcp`);
  console.log(`   Health:   http://localhost:${PORT}/health`);
  console.log('====================================================');
});
