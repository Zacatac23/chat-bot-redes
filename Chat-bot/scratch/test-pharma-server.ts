import { StdioMcpClient } from '../src/protocol/mcp-client-stdio.js';
import path from 'path';

async function test() {
  console.log('Testing custom PharmaCare MCP Server via manual JSON-RPC stdio client...');
  const serverPath = path.join(process.cwd(), 'src', 'servers', 'custom-pharma-server.ts');
  const client = new StdioMcpClient('PharmaCare-Test', 'npx', ['-y', 'tsx', serverPath]);

  await client.connect();
  console.log('Handshake & Connect successful!');

  const tools = client.getTools();
  console.log(`Discovered ${tools.length} tools:`, tools.map(t => t.name));

  console.log('\nCalling search_medications tool (query: "fiebre")...');
  const searchResult = await client.callTool('search_medications', { query: 'fiebre' });
  console.log('Result:', JSON.stringify(searchResult, null, 2));

  console.log('\nCalling check_inventory tool (medication_id: "MED-001")...');
  const invResult = await client.callTool('check_inventory', { medication_id: 'MED-001' });
  console.log('Result:', JSON.stringify(invResult, null, 2));

  client.disconnect();
  console.log('\nTest passed successfully!');
}

test().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
