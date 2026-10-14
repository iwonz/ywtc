type LogLevel = 'info' | 'warn' | 'error';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export function redact(value: unknown, secrets: string[]): string {
  let message = value instanceof Error ? value.message : String(value);
  for (const secret of secrets) {
    if (secret) {
      message = message.split(secret).join('[REDACTED]');
    }
  }
  return message;
}

export function createLogger(secrets: string[] = []): Logger {
  const write = (level: LogLevel, message: string): void => {
    const safe = redact(message, secrets);
    const target = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    const time = new Date().toISOString().slice(11, 19);
    const symbol = level === 'error' ? '✗' : level === 'warn' ? '⚠' : '◆';
    const color = process.stderr.isTTY && !process.env.NO_COLOR
      ? level === 'error' ? 31 : level === 'warn' ? 33 : 36
      : undefined;
    const marker = color ? `\u001B[${color}m${symbol}\u001B[0m` : symbol;
    target(`  ${time} ${marker} ${safe}`);
  };

  return {
    info: (message) => write('info', message),
    warn: (message) => write('warn', message),
    error: (message) => write('error', message),
  };
}
