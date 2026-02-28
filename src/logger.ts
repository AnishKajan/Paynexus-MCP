import { config } from './config.js';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

class StructuredLogger {
    private level: LogLevel;

    constructor(level: LogLevel = 'info') {
        this.level = level;
    }

    private shouldLog(level: LogLevel): boolean {
        const levels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }

    private sanitize(data: any): any {
        if (typeof data !== 'object' || data === null) return data;

        const sanitized = { ...data };
        for (const key in sanitized) {
            if (typeof sanitized[key] === 'string' && sanitized[key].startsWith('pnx_')) {
                sanitized[key] = '***REDACTED***';
            } else if (typeof sanitized[key] === 'object') {
                sanitized[key] = this.sanitize(sanitized[key]);
            }
        }
        return sanitized;
    }

    private log(level: LogLevel, message: string, data?: any) {
        if (!this.shouldLog(level)) return;

        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            ...(data && { data: this.sanitize(data) }),
        };

        console[level](JSON.stringify(logEntry));
    }

    debug(message: string, data?: any) { this.log('debug', message, data); }
    info(message: string, data?: any) { this.log('info', message, data); }
    warn(message: string, data?: any) { this.log('warn', message, data); }
    error(message: string, data?: any) { this.log('error', message, data); }
}

export const logger = new StructuredLogger(config.LOG_LEVEL as LogLevel);
