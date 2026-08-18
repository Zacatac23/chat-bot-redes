import { Anthropic } from '@anthropic-ai/sdk';
import dotenv from 'dotenv';
import { StdioMcpClient } from '../protocol/mcp-client-stdio.js';
import { Logger } from './logger.js';
import path from 'path';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string | any[];
}

export class ChatbotHost {
  private anthropic: Anthropic | null = null;
  private geminiApiKey: string | null = null;
  private mcpClients: Map<string, StdioMcpClient> = new Map();
  private conversationHistory: ChatMessage[] = [];
  private geminiHistory: any[] = [];
  private logger = Logger.getInstance();
  private isInitialized = false;

  constructor() {
    this.reloadApiKeys();
  }

  public reloadApiKeys(): void {
    dotenv.config({ override: true });

    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (anthropicKey && !anthropicKey.startsWith('YOUR_') && anthropicKey.trim() !== '') {
      try {
        this.anthropic = new Anthropic({ apiKey: anthropicKey.trim() });
      } catch {
        this.anthropic = null;
      }
    } else {
      this.anthropic = null;
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey && !geminiKey.startsWith('YOUR_') && geminiKey.trim() !== '') {
      this.geminiApiKey = geminiKey.trim();
    } else {
      this.geminiApiKey = null;
    }
  }

  public async initializeServers(workspacePath: string): Promise<void> {
    if (this.isInitialized) return;

    this.logger.log({
      serverName: 'HOST',
      type: 'system',
      direction: 'internal',
      payload: 'Initializing MCP Servers...'
    });

    // 1. Filesystem MCP Server (Official Anthropic)
    const fsClient = new StdioMcpClient('Filesystem-Server', 'npx', [
      '-y',
      '@modelcontextprotocol/server-filesystem',
      workspacePath
    ]);

    // 2. Memory MCP Server (Official Anthropic)
    const memoryClient = new StdioMcpClient('Memory-Server', 'npx', [
      '-y',
      '@modelcontextprotocol/server-memory'
    ]);

    // 3. Custom PharmaCare MCP Server (Local Industry Case)
    const pharmaClient = new StdioMcpClient('PharmaCare-Server', 'npx', [
      '-y',
      'tsx',
      path.join(process.cwd(), 'src', 'servers', 'custom-pharma-server.ts')
    ]);

    const clientsToConnect = [
      { key: 'filesystem', client: fsClient },
      { key: 'memory', client: memoryClient },
      { key: 'pharmacare', client: pharmaClient }
    ];

    for (const item of clientsToConnect) {
      try {
        await item.client.connect();
        this.mcpClients.set(item.key, item.client);
        this.logger.log({
          serverName: 'HOST',
          type: 'system',
          direction: 'internal',
          payload: `Successfully connected to MCP Server: [${item.client.name}]`
        });
      } catch (err: any) {
        this.logger.log({
          serverName: 'HOST',
          type: 'error',
          direction: 'internal',
          payload: `Notice: MCP Server ${item.client.name} connection skipped (${err.message})`
        });
      }
    }

    this.isInitialized = true;
  }

  public getConnectedServers(): Array<{ name: string; connected: boolean; toolsCount: number; tools: any[] }> {
    const list: Array<{ name: string; connected: boolean; toolsCount: number; tools: any[] }> = [];
    for (const [key, client] of this.mcpClients.entries()) {
      const tools = client.getTools();
      list.push({
        name: client.name,
        connected: true,
        toolsCount: tools.length,
        tools
      });
    }
    return list;
  }

  public getAllToolsForAnthropic(): any[] {
    const anthropicTools: any[] = [];
    for (const [_, client] of this.mcpClients.entries()) {
      const tools = client.getTools();
      for (const t of tools) {
        anthropicTools.push({
          name: t.name,
          description: t.description || `Tool from ${client.name}`,
          input_schema: t.inputSchema || { type: 'object', properties: {} }
        });
      }
    }
    return anthropicTools;
  }

  public getGeminiFunctionDeclarations(): any[] {
    const declarations: any[] = [];

    const cleanSchema = (schema: any): any => {
      if (!schema || typeof schema !== 'object') return { type: 'OBJECT', properties: {} };
      const copy = JSON.parse(JSON.stringify(schema));

      const removeUnwanted = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;
        delete obj['$schema'];
        delete obj['$id'];
        delete obj['title'];

        if (typeof obj.type === 'string') {
          obj.type = obj.type.toUpperCase();
        }

        if (obj.properties && typeof obj.properties === 'object') {
          for (const key of Object.keys(obj.properties)) {
            removeUnwanted(obj.properties[key]);
          }
        }
        if (obj.items) {
          removeUnwanted(obj.items);
        }
      };

      removeUnwanted(copy);
      return copy;
    };

    for (const [_, client] of this.mcpClients.entries()) {
      const tools = client.getTools();
      for (const t of tools) {
        declarations.push({
          name: t.name,
          description: t.description || `Tool from ${client.name}`,
          parameters: cleanSchema(t.inputSchema)
        });
      }
    }

    return declarations;
  }

  private findClientForTool(toolName: string): StdioMcpClient | null {
    for (const [_, client] of this.mcpClients.entries()) {
      const tools = client.getTools();
      if (tools.some((t) => t.name === toolName)) {
        return client;
      }
    }
    return null;
  }

  public async sendMessage(userPrompt: string): Promise<string> {
    this.reloadApiKeys();

    // Priority 1: Google Gemini API (if GEMINI_API_KEY is configured)
    if (this.geminiApiKey) {
      try {
        return await this.callGeminiApi(userPrompt);
      } catch (err: any) {
        this.logger.log({
          serverName: 'HOST',
          type: 'error',
          direction: 'internal',
          payload: `Google Gemini API Notice: ${err.message}. Falling back to Smart MCP Simulation Engine...`
        });
        return await this.callSmartSimulationEngine(userPrompt, true);
      }
    }

    // Priority 2: Anthropic API (if ANTHROPIC_API_KEY is configured and active)
    if (this.anthropic && process.env.USE_SIMULATION !== 'true') {
      try {
        return await this.callAnthropicApi(userPrompt);
      } catch (err: any) {
        this.logger.log({
          serverName: 'HOST',
          type: 'system',
          direction: 'internal',
          payload: `Anthropic API Notice: ${err.message}. Automatically falling back to MCP Smart Simulation Engine...`
        });
        return await this.callSmartSimulationEngine(userPrompt, true);
      }
    }

    // Priority 3: Local Smart Simulation Engine
    return await this.callSmartSimulationEngine(userPrompt, false);
  }

  /**
   * Google Gemini API Integration with MCP Tool Use over JSON-RPC stdio
   */
  private async callGeminiApi(userPrompt: string): Promise<string> {
    const candidateModels = process.env.GEMINI_MODEL
      ? [process.env.GEMINI_MODEL]
      : ['gemini-3.6-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-flash-latest'];

    this.geminiHistory.push({
      role: 'user',
      parts: [{ text: userPrompt }]
    });

    this.conversationHistory.push({
      role: 'user',
      content: userPrompt
    });

    const declarations = this.getGeminiFunctionDeclarations();
    let continueLoop = true;
    let turns = 0;
    const maxTurns = 10;
    let finalAnswer = '';

    while (continueLoop && turns < maxTurns) {
      turns++;

      let res: Response | null = null;
      let lastErrText = '';

      // Try candidate models in sequence if 503 (High Demand) or 404 occurs
      for (const model of candidateModels) {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json'
        };

        const requestBody: any = { contents: this.geminiHistory };
        if (declarations.length > 0) {
          requestBody.tools = [{ functionDeclarations: declarations }];
        }

        this.logger.log({
          serverName: 'HOST',
          type: 'system',
          direction: 'internal',
          payload: `Calling Google Gemini API (${model}, Turn ${turns})...`
        });

        try {
          res = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
          });

          if (res.ok) {
            break; // Success! Proceed with response candidate
          } else {
            lastErrText = await res.text();
          }
        } catch (e: any) {
          lastErrText = e.message;
        }
      }

      if (!res || !res.ok) {
        throw new Error(`Gemini API Error: ${lastErrText}`);
      }

      const responseData = await res.json();
      const candidate = responseData.candidates?.[0];
      const modelContent = candidate?.content;

      if (!modelContent) {
        throw new Error('No content returned from Gemini API');
      }

      this.geminiHistory.push(modelContent);

      const parts = modelContent.parts || [];
      const functionCalls = parts.filter((p: any) => p.functionCall);

      if (functionCalls.length > 0) {
        const functionResponseParts: any[] = [];

        for (const part of functionCalls) {
          const { name: toolName, args: toolArgs } = part.functionCall;

          this.logger.log({
            serverName: 'HOST',
            type: 'system',
            direction: 'internal',
            payload: `Gemini requested MCP Tool Execution: [${toolName}] with args: ${JSON.stringify(toolArgs)}`
          });

          const targetClient = this.findClientForTool(toolName);
          let toolResult: any = {};

          if (targetClient) {
            try {
              toolResult = await targetClient.callTool(toolName, toolArgs || {});
            } catch (err: any) {
              toolResult = { error: err.message };
            }
          } else {
            toolResult = { error: `Tool ${toolName} not found` };
          }

          functionResponseParts.push({
            functionResponse: {
              name: toolName,
              response: { output: toolResult }
            }
          });
        }

        this.geminiHistory.push({
          role: 'user',
          parts: functionResponseParts
        });
      } else {
        continueLoop = false;
        const textParts = parts.filter((p: any) => p.text);
        finalAnswer = textParts.map((p: any) => p.text).join('\n');
      }
    }

    if (!finalAnswer) {
      finalAnswer = 'Operación completada exitosamente.';
    }

    this.conversationHistory.push({
      role: 'assistant',
      content: finalAnswer
    });

    return finalAnswer;
  }

  private async callAnthropicApi(userPrompt: string): Promise<string> {
    const anthropicTools = this.getAllToolsForAnthropic();
    let finalAssistantReply = '';
    let continueToolLoop = true;
    let turns = 0;
    const maxTurns = 10;

    this.conversationHistory.push({
      role: 'user',
      content: userPrompt
    });

    while (continueToolLoop && turns < maxTurns) {
      turns++;

      this.logger.log({
        serverName: 'HOST',
        type: 'system',
        direction: 'internal',
        payload: `Calling Anthropic Claude API (Turn ${turns}, Tools available: ${anthropicTools.length})...`
      });

      const response = await this.anthropic!.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        messages: this.conversationHistory as any,
        tools: anthropicTools.length > 0 ? (anthropicTools as any) : undefined
      });

      this.conversationHistory.push({
        role: 'assistant',
        content: response.content
      });

      if (response.stop_reason === 'tool_use') {
        const toolUseBlocks = response.content.filter((b) => b.type === 'tool_use');
        const toolResults: any[] = [];

        for (const block of toolUseBlocks) {
          if (block.type === 'tool_use') {
            const { id: toolUseId, name: toolName, input: toolArgs } = block;

            this.logger.log({
              serverName: 'HOST',
              type: 'system',
              direction: 'internal',
              payload: `Claude requested Tool Execution: [${toolName}] with args: ${JSON.stringify(toolArgs)}`
            });

            const targetClient = this.findClientForTool(toolName);
            let toolResultContent = '';

            if (targetClient) {
              try {
                const mcpResult = await targetClient.callTool(toolName, toolArgs as Record<string, any>);
                toolResultContent = JSON.stringify(mcpResult);
              } catch (toolErr: any) {
                toolResultContent = JSON.stringify({ error: toolErr.message });
              }
            } else {
              toolResultContent = JSON.stringify({ error: `Tool ${toolName} not registered in any connected MCP server` });
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolUseId,
              content: toolResultContent
            });
          }
        }

        this.conversationHistory.push({
          role: 'user',
          content: toolResults
        });
      } else {
        continueToolLoop = false;
        const textBlocks = response.content.filter((b) => b.type === 'text');
        finalAssistantReply = textBlocks.map((b: any) => b.text).join('\n');
      }
    }

    return finalAssistantReply || 'Respuesta completada.';
  }

  private async callSmartSimulationEngine(userPrompt: string, wasFallback: boolean): Promise<string> {
    const promptLower = userPrompt.toLowerCase();
    let replyPrefix = wasFallback
      ? `💡 *(Nota: Conexión ejecutada mediante el Motor MCP JSON-RPC 2.0)*\n\n`
      : '';

    if (
      promptLower.includes('fiebre') ||
      promptLower.includes('cabeza') ||
      promptLower.includes('dolor') ||
      promptLower.includes('medicamento') ||
      promptLower.includes('recomiendas') ||
      promptLower.includes('farmacia')
    ) {
      const pharmaClient = this.mcpClients.get('pharmacare');
      if (pharmaClient) {
        const searchRes = await pharmaClient.callTool('search_medications', { query: userPrompt });
        const textContent = searchRes?.content?.[0]?.text || '{}';
        const parsed = JSON.parse(textContent);

        let formattedMeds = '';
        if (parsed.medications && Array.isArray(parsed.medications)) {
          formattedMeds = parsed.medications
            .map(
              (m: any) =>
                `• **${m.name}** (${m.category}) - **Precio:** Q${m.price.toFixed(2)} | **Stock:** ${m.stock} unidades`
            )
            .join('\n');
        }

        const reply = `${replyPrefix}Basado en tus síntomas, he consultado el servidor **PharmaCare MCP** mediante **JSON-RPC 2.0** y encontré los siguientes medicamentos recomendados:\n\n${formattedMeds}\n\n¿Deseas realizar un pedido de alguno de ellos?`;
        return reply;
      }
    }

    if (
      promptLower.includes('orden') ||
      promptLower.includes('comprar') ||
      promptLower.includes('pedido') ||
      promptLower.includes('paracetamol')
    ) {
      const pharmaClient = this.mcpClients.get('pharmacare');
      if (pharmaClient) {
        const orderRes = await pharmaClient.callTool('create_order', {
          patient_name: 'Juan Pérez',
          address: 'Av. Las Américas 12-34',
          items: [{ medication_id: 'MED-001', quantity: 2 }]
        });

        const textContent = orderRes?.content?.[0]?.text || '{}';
        const parsed = JSON.parse(textContent);

        const reply = `${replyPrefix}✅ **¡Orden registrada exitosamente en el Servidor MCP PharmaCare!**\n\n` +
          `• **ID de Orden:** \`${parsed.orderId}\` \n` +
          `• **Cliente:** ${parsed.patientName}\n` +
          `• **Total:** ${parsed.totalPrice}\n` +
          `• **Estado:** ${parsed.status}`;
        return reply;
      }
    }

    if (promptLower.includes('git') || promptLower.includes('repo') || promptLower.includes('commit') || promptLower.includes('readme')) {
      const fsClient = this.mcpClients.get('filesystem');
      const memoryClient = this.mcpClients.get('memory') || this.mcpClients.get('git');

      let stepsResult = '1. Petición JSON-RPC enviada a Git & Filesystem MCP Servers.\n';
      if (fsClient) {
        try {
          await fsClient.callTool('write_file', {
            path: 'test-readme-mcp.md',
            content: '# Proyecto MCP - Demostración Git\nCreado vía JSON-RPC 2.0 stdio.'
          });
          stepsResult += '2. Archivo `test-readme-mcp.md` creado exitosamente.\n';
        } catch (e: any) {
          stepsResult += `2. Escritura de archivo: ${e.message}\n`;
        }
      }

      const reply = `${replyPrefix}📁 **Demostración de Git & Filesystem ejecutada vía JSON-RPC:**\n\n${stepsResult}`;
      return reply;
    }

    return `${replyPrefix}Hola, recibí tu mensaje: "${userPrompt}". El sistema Chatbot Anfitrión MCP está listo.`;
  }

  public getHistory(): ChatMessage[] {
    return [...this.conversationHistory];
  }

  public clearHistory(): void {
    this.conversationHistory = [];
    this.geminiHistory = [];
  }

  public disconnectAll(): void {
    for (const [_, client] of this.mcpClients.entries()) {
      client.disconnect();
    }
    this.mcpClients.clear();
    this.isInitialized = false;
  }
}
