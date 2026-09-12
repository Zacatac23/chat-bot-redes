import { spawn } from 'child_process';
import { HttpMcpClient } from '../src/protocol/mcp-client-http.js';

async function testRemoteMcp() {
  console.log('=== Starting Remote MCP Server Integration Test ===');
  const port = 8085;
  const endpoint = `http://localhost:${port}/mcp`;

  // Start the remote server process
  const serverProcess = spawn('npx', ['-y', 'tsx', 'src/servers/remote-pharma-server.ts'], {
    shell: true,
    env: { ...process.env, REMOTE_PORT: port.toString() },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout?.on('data', (d) => {
    // console.log(`[SERVER]: ${d.toString().trim()}`);
  });

  // Wait 2 seconds for server startup
  await new Promise((r) => setTimeout(r, 2000));

  try {
    console.log(`\nConnecting HttpMcpClient to ${endpoint}...`);
    const client = new HttpMcpClient('PharmaCare-Remote-Test', endpoint);

    const connected = await client.connect();
    console.log('Handshake & Handshake notification completed successfully! Status:', connected);

    const tools = client.getTools();
    console.log(`Discovered ${tools.length} tools via JSON-RPC:`, tools.map((t) => t.name));

    if (tools.length === 0) {
      throw new Error('No tools discovered from remote server');
    }

    console.log('\n--- 1. Testing tool: search_medications ("fiebre") ---');
    const searchRes = await client.callTool('search_medications', { query: 'fiebre' });
    console.log('Response content:', searchRes?.content?.[0]?.text);

    console.log('\n--- 2. Testing tool: create_order ---');
    const orderRes = await client.callTool('create_order', {
      patient_name: 'Jonathan Morales',
      address: '7ma Avenida 15-45, Zona 10',
      items: [{ medication_id: 'MED-001', quantity: 2 }]
    });
    console.log('Order created response:', orderRes?.content?.[0]?.text);
    const parsedOrder = JSON.parse(orderRes?.content?.[0]?.text);
    const orderId = parsedOrder.orderId;

    console.log(`\n--- 3. Testing tool: get_order_status (${orderId}) ---`);
    const statusRes = await client.callTool('get_order_status', { order_id: orderId });
    console.log('Order status response:', statusRes?.content?.[0]?.text);

    client.disconnect();
    console.log('\n✅ All Remote MCP JSON-RPC Tests PASSED successfully!');
  } finally {
    if (serverProcess.pid) {
      try {
        process.kill(serverProcess.pid);
      } catch {}
    }
  }
}

testRemoteMcp()
  .then(() => {
    setTimeout(() => process.exit(0), 500);
  })
  .catch((err) => {
    console.error('❌ Remote MCP Test failed:', err);
    process.exit(1);
  });
