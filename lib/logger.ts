/**
 * Structured logging utility for production observability
 * 
 * Features:
 * - JSON-formatted logs for log aggregation systems
 * - Log levels (debug, info, warn, error)
 * - Request correlation ID support
 * - Environment-aware (pretty print in dev, JSON in prod)
 * - Performance timing helpers
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  requestId?: string;
  userId?: string;
  projectId?: string;
  sandboxId?: string;
  operation?: string;
  duration?: number;
  [key: string]: unknown;
}

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: LogContext;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

function getMinLogLevel(): LogLevel {
  const envLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel;
  if (envLevel && LOG_LEVELS[envLevel] !== undefined) {
    return envLevel;
  }
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

function shouldLog(level: LogLevel): boolean {
  const minLevel = getMinLogLevel();
  return LOG_LEVELS[level] >= LOG_LEVELS[minLevel];
}

function formatError(error: unknown): LogEntry['error'] | undefined {
  if (!error) return undefined;
  
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: process.env.NODE_ENV !== 'production' ? error.stack : undefined,
    };
  }
  
  return {
    name: 'UnknownError',
    message: String(error),
  };
}

function formatLog(level: LogLevel, message: string, context?: LogContext, error?: unknown): string {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context: context && Object.keys(context).length > 0 ? context : undefined,
    error: formatError(error),
  };

  // In development, pretty print for readability
  if (process.env.NODE_ENV !== 'production') {
    const prefix = {
      debug: '🔍',
      info: 'ℹ️ ',
      warn: '⚠️ ',
      error: '❌',
    }[level];
    
    let output = `${prefix} [${entry.timestamp}] ${message}`;
    if (entry.context) {
      output += ` ${JSON.stringify(entry.context)}`;
    }
    if (entry.error) {
      output += `\n   Error: ${entry.error.message}`;
      if (entry.error.stack) {
        output += `\n   ${entry.error.stack}`;
      }
    }
    return output;
  }

  // In production, output JSON for log aggregation
  return JSON.stringify(entry);
}

function log(level: LogLevel, message: string, context?: LogContext, error?: unknown): void {
  if (!shouldLog(level)) return;

  const formatted = formatLog(level, message, context, error);
  
  switch (level) {
    case 'debug':
    case 'info':
      console.log(formatted);
      break;
    case 'warn':
      console.warn(formatted);
      break;
    case 'error':
      console.error(formatted);
      break;
  }
}

/**
 * Logger instance with bound context
 */
export class Logger {
  private context: LogContext;

  constructor(context: LogContext = {}) {
    this.context = context;
  }

  /**
   * Create a child logger with additional context
   */
  child(additionalContext: LogContext): Logger {
    return new Logger({ ...this.context, ...additionalContext });
  }

  /**
   * Log at debug level
   */
  debug(message: string, context?: LogContext): void {
    log('debug', message, { ...this.context, ...context });
  }

  /**
   * Log at info level
   */
  info(message: string, context?: LogContext): void {
    log('info', message, { ...this.context, ...context });
  }

  /**
   * Log at warn level
   */
  warn(message: string, context?: LogContext, error?: unknown): void {
    log('warn', message, { ...this.context, ...context }, error);
  }

  /**
   * Log at error level
   */
  error(message: string, context?: LogContext, error?: unknown): void {
    log('error', message, { ...this.context, ...context }, error);
  }

  /**
   * Time an async operation and log its duration
   */
  async time<T>(
    operation: string,
    fn: () => Promise<T>,
    context?: LogContext
  ): Promise<T> {
    const start = performance.now();
    try {
      const result = await fn();
      const duration = Math.round(performance.now() - start);
      this.info(`${operation} completed`, { ...context, operation, duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${operation} failed`, { ...context, operation, duration }, error);
      throw error;
    }
  }

  /**
   * Time a sync operation and log its duration
   */
  timeSync<T>(
    operation: string,
    fn: () => T,
    context?: LogContext
  ): T {
    const start = performance.now();
    try {
      const result = fn();
      const duration = Math.round(performance.now() - start);
      this.info(`${operation} completed`, { ...context, operation, duration });
      return result;
    } catch (error) {
      const duration = Math.round(performance.now() - start);
      this.error(`${operation} failed`, { ...context, operation, duration }, error);
      throw error;
    }
  }
}

// Default logger instance
export const logger = new Logger();

// Convenience exports for quick logging without creating an instance
export const debug = (message: string, context?: LogContext) => log('debug', message, context);
export const info = (message: string, context?: LogContext) => log('info', message, context);
export const warn = (message: string, context?: LogContext, error?: unknown) => log('warn', message, context, error);
export const error = (message: string, context?: LogContext, err?: unknown) => log('error', message, context, err);

/**
 * Create a request-scoped logger from a request ID
 */
export function createRequestLogger(requestId: string): Logger {
  return new Logger({ requestId });
}
