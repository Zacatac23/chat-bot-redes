let logs = [];
let socket = null;
let allExpanded = false;
let currentMobileTab = 'chat';
let currentFilter = 'all';
let userIsScrolledUp = false;

document.addEventListener('DOMContentLoaded', () => {
  fetchServerStatus();
  fetchInitialLogs();
  initWebSocket();
  setupScrollListener();
});

function setupScrollListener() {
  const logContainer = document.getElementById('inspectorLogs');
  if (logContainer) {
    logContainer.addEventListener('scroll', () => {
      const threshold = 35; // 35px threshold
      const distanceFromBottom = logContainer.scrollHeight - logContainer.clientHeight - logContainer.scrollTop;
      userIsScrolledUp = distanceFromBottom > threshold;
    });
  }
}

function scrollToBottomIfNeeded() {
  const logContainer = document.getElementById('inspectorLogs');
  if (logContainer && !userIsScrolledUp) {
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

function initWebSocket() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${location.host}`;
  socket = new WebSocket(wsUrl);

  socket.onopen = () => {
    console.log('WebSocket connected to MCP Host');
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'log') {
        logs.push(msg.data);
        appendLogToUI(msg.data);
        updateLogCounter();
      }
    } catch (e) {
      console.error('Error parsing WebSocket message:', e);
    }
  };

  socket.onclose = () => {
    console.log('WebSocket closed, retrying in 3s...');
    setTimeout(initWebSocket, 3000);
  };
}

async function fetchServerStatus() {
  try {
    const res = await fetch('/api/status');
    const data = await res.json();
    renderServerBadges(data.servers || []);
  } catch (err) {
    console.error('Failed to fetch server status:', err);
  }
}

function renderServerBadges(servers) {
  const container = document.getElementById('serverBadges');
  if (!servers || servers.length === 0) {
    container.innerHTML = `
      <div class="status-indicator loading">
        <span class="status-dot"></span>
        <span class="status-label">Iniciando...</span>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="status-indicator" title="${servers.map(s => s.name).join(', ')}">
      <span class="status-dot"></span>
      <span class="status-label">${servers.length} servidores activos</span>
    </div>`;
}

async function fetchInitialLogs() {
  try {
    const res = await fetch('/api/logs');
    logs = await res.json();
    renderLogs();
    updateLogCounter();
    
    // Force scroll to bottom on initial load
    const logContainer = document.getElementById('inspectorLogs');
    if (logContainer) {
      logContainer.scrollTop = logContainer.scrollHeight;
    }
  } catch (err) {
    console.error('Failed to fetch initial logs:', err);
  }
}

function updateLogCounter() {
  const counterEl = document.getElementById('logCounter');
  if (counterEl) {
    const jsonRpcCount = logs.filter(l => l.type !== 'system').length;
    counterEl.innerText = jsonRpcCount;
  }
}

function setInspectorFilter(filterName) {
  currentFilter = filterName;
  
  const tabs = document.querySelectorAll('.nav-tabs .btn-tab');
  tabs.forEach(t => {
    if (t.getAttribute('data-filter') === filterName) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  renderLogs();
}

function matchesFilterAndSearch(log, filter, search, hideSystem) {
  if (hideSystem && log.type === 'system') return false;
  if (filter !== 'all' && log.type !== filter) return false;
  if (!search) return true;

  const payloadText = typeof log.payload === 'object' ? JSON.stringify(log.payload) : String(log.payload);
  const fullText = `${log.serverName} ${log.type} ${payloadText}`.toLowerCase();
  return fullText.includes(search);
}

function appendLogToUI(logEntry) {
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const hideSystem = document.getElementById('hideSystemCheckbox')?.checked ?? true;

  if (!matchesFilterAndSearch(logEntry, currentFilter, search, hideSystem)) {
    return;
  }

  const container = document.getElementById('inspectorLogs');
  const card = createLogCardElement(logEntry);
  container.appendChild(card);
  
  scrollToBottomIfNeeded();
}

function renderLogs() {
  const container = document.getElementById('inspectorLogs');
  const search = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const hideSystem = document.getElementById('hideSystemCheckbox')?.checked ?? true;

  container.innerHTML = '';

  const filtered = logs.filter((l) => matchesFilterAndSearch(l, currentFilter, search, hideSystem));
  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 2.5rem; font-size: 0.78rem; font-family: var(--font-mono);">
        Sin registros de tráfico para el filtro seleccionado
      </div>`;
    return;
  }

  filtered.forEach((l) => {
    container.appendChild(createLogCardElement(l));
  });
  
  scrollToBottomIfNeeded();
}

function filterLogs() {
  renderLogs();
}

function createLogCardElement(logEntry) {
  const card = document.createElement('div');
  card.className = `log-item ${logEntry.type}`;

  const timeStr = new Date(logEntry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dirIcon = logEntry.direction === 'sent' ? '➔' : logEntry.direction === 'received' ? '⬅' : '•';
  const summaryTitle = generateSummaryTitle(logEntry);

  let formattedBodyHtml = '';
  if (typeof logEntry.payload === 'object' && logEntry.payload !== null) {
    formattedBodyHtml = syntaxHighlightJson(logEntry.payload);
  } else {
    formattedBodyHtml = escapeHtml(String(logEntry.payload));
  }

  const displayState = allExpanded ? 'block' : 'none';

  card.innerHTML = `
    <div class="log-header" onclick="toggleLogBody(this)">
      <span class="log-dir">${dirIcon}</span>
      <span class="log-type ${logEntry.type}">${logEntry.type}</span>
      <span class="log-server">${logEntry.serverName}</span>
      <span class="log-title">${summaryTitle}</span>
      <span class="log-time">${timeStr}</span>
    </div>
    <div class="log-code" style="display: ${displayState};">${formattedBodyHtml}</div>
  `;

  return card;
}

function generateSummaryTitle(logEntry) {
  const payload = logEntry.payload;
  if (!payload || typeof payload !== 'object') {
    return String(payload || 'Sistema');
  }

  if (logEntry.type === 'request' || payload.method) {
    if (payload.method === 'initialize') return `initialize`;
    if (payload.method === 'tools/list') return `tools/list`;
    if (payload.method === 'tools/call') return `tools/call -> ${payload.params?.name || ''}`;
    return payload.method;
  }

  if (logEntry.type === 'response' || payload.result !== undefined || payload.error !== undefined) {
    if (payload.error) return `error -> ${payload.error.message || 'error'}`;
    if (payload.result?.tools) return `tools -> ${payload.result.tools.length} disponibles`;
    if (payload.result?.serverInfo) return `connected -> ${payload.result.serverInfo.name}`;
    if (payload.result?.content) return `result ok`;
    return `success`;
  }

  if (logEntry.type === 'notification') {
    return payload.method || 'notification';
  }

  return 'event';
}

function toggleLogBody(headerEl) {
  const body = headerEl.nextElementSibling;
  if (body) {
    body.style.display = body.style.display === 'none' ? 'block' : 'none';
  }
}

function toggleExpandAll() {
  allExpanded = !allExpanded;
  const btn = document.getElementById('btnExpandAll');
  if (btn) {
    btn.innerText = allExpanded ? 'Colapsar todo' : 'Expandir todo';
  }

  const bodies = document.querySelectorAll('.log-code');
  bodies.forEach((b) => {
    b.style.display = allExpanded ? 'block' : 'none';
  });
}

function syntaxHighlightJson(jsonObj) {
  const json = JSON.stringify(jsonObj, null, 2);
  const escaped = escapeHtml(json);

  return escaped.replace(
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g,
    (match) => {
      let cls = 'json-number';
      if (/^"/.test(match)) {
        if (/:$/.test(match)) {
          cls = 'json-key';
        } else {
          cls = 'json-string';
        }
      } else if (/true|false/.test(match)) {
        cls = 'json-boolean';
      } else if (/null/.test(match)) {
        cls = 'json-null';
      }
      return `<span class="${cls}">${match}</span>`;
    }
  );
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

async function sendMessage() {
  const inputEl = document.getElementById('chatInput');
  const prompt = inputEl.value.trim();
  if (!prompt) return;

  inputEl.value = '';
  appendChatMessage('user', prompt);

  const btnSend = document.getElementById('btnSend');
  btnSend.disabled = true;
  btnSend.innerText = 'Procesando...';

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt })
    });
    const data = await res.json();

    if (data.error) {
      appendChatMessage('assistant', `Error: ${data.error}`);
    } else {
      appendChatMessage('assistant', data.reply);
    }
  } catch (err) {
    appendChatMessage('assistant', `Error de conexión: ${err.message}`);
  } finally {
    btnSend.disabled = false;
    btnSend.innerText = 'Enviar ➔';
  }
}

function appendChatMessage(role, text) {
  const historyEl = document.getElementById('chatHistory');
  const msgDiv = document.createElement('div');
  msgDiv.className = `chat-row ${role}-row`;

  msgDiv.innerHTML = `<div class="msg-content">${formatMarkdown(text)}</div>`;

  historyEl.appendChild(msgDiv);
  historyEl.scrollTop = historyEl.scrollHeight;
}

function formatMarkdown(text) {
  let html = escapeHtml(text);
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  html = html.replace(/\n/g, '<br>');
  return html;
}

function handleKeyDown(event) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
}

function sendPreset(text) {
  const inputEl = document.getElementById('chatInput');
  inputEl.value = text;
  sendMessage();
}

async function clearChat() {
  await fetch('/api/clear-history', { method: 'POST' });
  const historyEl = document.getElementById('chatHistory');
  historyEl.innerHTML = `
    <div class="chat-row assistant-row">
      <div class="msg-content">Historial de chat limpiado.</div>
    </div>
  `;
}

async function clearLogs() {
  await fetch('/api/clear-logs', { method: 'POST' });
  logs = [];
  renderLogs();
  updateLogCounter();
}

function switchMobileTab(tab) {
  currentMobileTab = tab;
  const chatPanel = document.getElementById('chatPanel');
  const inspectorPanel = document.getElementById('inspectorPanel');
  const tabChatBtn = document.getElementById('tabChatBtn');
  const tabInspectorBtn = document.getElementById('tabInspectorBtn');

  if (tab === 'chat') {
    chatPanel.classList.remove('mobile-hidden');
    inspectorPanel.classList.add('mobile-hidden');
    tabChatBtn.classList.add('active');
    tabInspectorBtn.classList.remove('active');
  } else {
    chatPanel.classList.add('mobile-hidden');
    inspectorPanel.classList.remove('mobile-hidden');
    tabChatBtn.classList.remove('active');
    tabInspectorBtn.classList.add('active');
  }
}
