import { EventEmitter } from 'events';

export interface LogEntry {
  id: string;
  timestamp: string;
  serverName: string;
  type: 'request' | 'response' | 'notification' | 'system' | 'error';
  direction: 'sent' | 'received' | 'internal';
  payload: any;
}

export class Logger extends EventEmitter {
  private static instance: Logger;
  private logs: LogEntry[] = [];
  private maxLogs = 500;

  private constructor() {
    super();
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  public log(entry: Omit<LogEntry, 'id' | 'timestamp'>): LogEntry {
    const fullEntry: LogEntry = {
      id: Math.random().toString(36).substring(2, 10),
      timestamp: new Date().toISOString(),
      ...entry
    };

    this.logs.push(fullEntry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // Print readable log to console
    const dirIcon = entry.direction === 'sent' ? '➔' : entry.direction === 'received' ? '⬅' : 'ℹ';
    console.log(`[${fullEntry.timestamp}] [${entry.serverName}] ${dirIcon} [${entry.type.toUpperCase()}]`);
    if (entry.type !== 'system') {
      console.log(JSON.stringify(entry.payload, null, 2));
    } else {
      console.log(entry.payload);
    }

    this.emit('new_log', fullEntry);
    return fullEntry;
  }

  public getLogs(): LogEntry[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.emit('logs_cleared');
  }
}
