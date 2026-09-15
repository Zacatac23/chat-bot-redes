import dotenv from 'dotenv';
import readline from 'readline';
import { ChatbotHost } from './core/chatbot.js';
import { Logger } from './core/logger.js';

dotenv.config();

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        🤖 MCP Host Chatbot CLI - Universidad del Valle            ║');
  console.log('║        Protocolo: Model Context Protocol (JSON-RPC 2.0 Manual)    ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  const host = new ChatbotHost();
  const logger = Logger.getInstance();
  const workspaceDir = process.cwd();

  console.log(`🔌 Conectando a Servidores MCP en: ${workspaceDir}...`);
  await host.initializeServers(workspaceDir);

  const connected = host.getConnectedServers();
  console.log('\n📦 Servidores MCP Conectados:');
  for (const s of connected) {
    const isRemote = s.name.toLowerCase().includes('remote');
    const badge = isRemote ? '🌐 [REMOTO HTTP]' : '💻 [LOCAL STDIO]';
    console.log(`  • ${badge} ${s.name} (${s.toolsCount} herramientas)`);
    for (const t of s.tools) {
      console.log(`     └─ ${t.name}: ${t.description || ''}`);
    }
  }

  console.log('\n───────────────────────────────────────────────────────────────────');
  console.log('💡 Comandos rápidos disponibles:');
  console.log('   /scenario-git    -> Ejecuta demostración Git + Filesystem (Punto 4)');
  console.log('   /scenario-pharma -> Ejecuta consulta y orden PharmaCare (Punto 5 y 6)');
  console.log('   /servers         -> Lista servidores MCP conectados');
  console.log('   /logs            -> Muestra las últimas interacciones JSON-RPC');
  console.log('   /clear           -> Limpia el historial de conversación');
  console.log('   /help            -> Muestra este menú de ayuda');
  console.log('   exit / salir     -> Cierra el chatbot');
  console.log('───────────────────────────────────────────────────────────────────\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptUser = () => {
    rl.question('\n👤 Usuario > ', async (input) => {
      const trimmed = input.trim();

      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'salir') {
        console.log('\n👋 Cerrando Chatbot Anfitrión MCP...');
        host.disconnectAll();
        rl.close();
        process.exit(0);
      }

      if (!trimmed) {
        promptUser();
        return;
      }

      // Handle CLI Commands
      if (trimmed.startsWith('/')) {
        const cmd = trimmed.toLowerCase();

        if (cmd === '/help') {
          console.log('\n📋 Menú de Comandos:');
          console.log('  /scenario-git    - Ejecuta el escenario Git: init, write_file, git_add, git_commit');
          console.log('  /scenario-pharma - Consulta medicamentos por síntoma y genera una orden de compra');
          console.log('  /servers         - Muestra servidores y herramientas activas');
          console.log('  /logs            - Imprime las últimas 10 tramas JSON-RPC');
          console.log('  /clear           - Reinicia la sesión y borra el historial');
          console.log('  exit             - Salir del programa');
          promptUser();
          return;
        }

        if (cmd === '/servers') {
          console.log('\n📡 Servidores MCP Activos:');
          const currentServers = host.getConnectedServers();
          for (const s of currentServers) {
            console.log(`  • ${s.name}: ${s.toolsCount} herramientas`);
          }
          promptUser();
          return;
        }

        if (cmd === '/logs') {
          const recentLogs = logger.getLogs().slice(-10);
          console.log(`\n📜 Últimas ${recentLogs.length} Interacciones JSON-RPC:`);
          for (const log of recentLogs) {
            const icon = log.direction === 'sent' ? '➔' : log.direction === 'received' ? '⬅' : 'ℹ';
            console.log(`\n[${log.timestamp}] [${log.serverName}] ${icon} [${log.type.toUpperCase()}]`);
            console.log(JSON.stringify(log.payload, null, 2));
          }
          promptUser();
          return;
        }

        if (cmd === '/clear') {
          host.clearHistory();
          logger.clearLogs();
          console.log('\n🧹 Historial y logs reiniciados correctamente.');
          promptUser();
          return;
        }

        if (cmd === '/scenario-git') {
          console.log('\n⏳ Ejecutando escenario oficial Git + Filesystem vía JSON-RPC 2.0...');
          const result = await host.executeGitScenario();
          console.log(`\n${result}\n`);
          promptUser();
          return;
        }

        if (cmd === '/scenario-pharma') {
          console.log('\n⏳ Ejecutando escenario PharmaCare vía JSON-RPC 2.0...');
          const reply1 = await host.sendMessage('¿Qué medicamento me recomiendas para la fiebre y dolor de cabeza?');
          console.log(`\n🤖 Chatbot (Consulta):\n${reply1}\n`);
          const reply2 = await host.sendMessage('Deseo comprar 2 unidades de Paracetamol 500mg a nombre de Jonathan Morales en Zona 10');
          console.log(`\n🤖 Chatbot (Orden):\n${reply2}\n`);
          promptUser();
          return;
        }

        console.log(`⚠️ Comando desconocido: "${trimmed}". Escribe /help para ver la lista de comandos.`);
        promptUser();
        return;
      }

      console.log('\n⏳ Procesando mensaje e interactuando con servidores MCP...');
      try {
        const reply = await host.sendMessage(trimmed);
        console.log(`\n🤖 Chatbot:\n${reply}`);
      } catch (err: any) {
        console.error(`❌ Error al procesar mensaje: ${err.message}`);
      }

      promptUser();
    });
  };

  promptUser();
}

main().catch((err) => {
  console.error('Fatal CLI Error:', err);
  process.exit(1);
});
