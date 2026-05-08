import fs from 'fs';
import path from 'path';
import winston from 'winston';

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

export const securityAuditLogPath = path.join(logsDir, 'security-audit.log');

const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({
      filename: securityAuditLogPath,
      options: { flags: 'a' }
    })
  ]
});

export const writeSecurityAudit = (event, details = {}) => {
  securityLogger.info({
    event,
    ...details
  });
};
