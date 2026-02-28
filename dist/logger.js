import { config } from './config.js';
class StructuredLogger {
    level;
    constructor(level = 'info') {
        this.level = level;
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.level);
    }
    sanitize(data) {
        if (typeof data !== 'object' || data === null)
            return data;
        const sanitized = { ...data };
        for (const key in sanitized) {
            if (typeof sanitized[key] === 'string' && sanitized[key].startsWith('pnx_')) {
                sanitized[key] = '***REDACTED***';
            }
            else if (typeof sanitized[key] === 'object') {
                sanitized[key] = this.sanitize(sanitized[key]);
            }
        }
        return sanitized;
    }
    log(level, message, data) {
        if (!this.shouldLog(level))
            return;
        const logEntry = {
            timestamp: new Date().toISOString(),
            level: level.toUpperCase(),
            message,
            ...(data && { data: this.sanitize(data) }),
        };
        console[level](JSON.stringify(logEntry));
    }
    debug(message, data) { this.log('debug', message, data); }
    info(message, data) { this.log('info', message, data); }
    warn(message, data) { this.log('warn', message, data); }
    error(message, data) { this.log('error', message, data); }
}
export const logger = new StructuredLogger(config.LOG_LEVEL);
