import dotenv from 'dotenv';
import readline from 'readline';
import { ChatbotHost } from './core/chatbot.js';

dotenv.config();

async function main() {
  console.log('====================================================');
  console.log('🤖 MCP Host Chatbot CLI - Proyecto 1 (Parte 1)');
  console.log('   Manual JSON-RPC Protocol Implementation');
  console.log('====================================================\n');

  const host = new ChatbotHost();
  const workspaceDir = process.cwd();

  console.log(`🔌 Conectando a servidores MCP locales en: ${workspaceDir}...`);
  await host.initializeServers(workspaceDir);

  const connected = host.getConnectedServers();
  console.log('\n✅ Servidores MCP Conectados:');
  for (const s of connected) {
    console.log(`  • [${s.name}]: ${s.toolsCount} herramientas disponibles`);
    for (const t of s.tools) {
      console.log(`     - ${t.name}: ${t.description || ''}`);
    }
  }

  console.log('\n💬 Chatbot listo. Escribe tu mensaje (o "exit" / "salir" para terminar):\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    rl.question('👤 Usuario: ', async (input) => {
      const trimmed = input.trim();
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'salir') {
        console.log('👋 Cerrando chatbot...');
        host.disconnectAll();
        rl.close();
        process.exit(0);
      }

      if (!trimmed) {
        promptUser();
        return;
      }

      console.log('🤖 Pensando e interactuando con servidores MCP...');
      const reply = await host.sendMessage(trimmed);
      console.log(`\n🤖 Chatbot:\n${reply}\n`);
      console.log('----------------------------------------------------\n');

      promptUser();
    });
  };

  promptUser();
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
