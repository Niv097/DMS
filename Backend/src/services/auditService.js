import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';

class AuditService {
  async log(noteId, userId, action, role, comment = null) {
    try {
      await prisma.auditLog.create({
        data: {
          note_id: Number.parseInt(noteId, 10),
          performed_by: String(userId),
          action,
          role,
          remarks: comment
        }
      });
      
      logger.info(`Audit Log: ${action} on Note ${noteId} by User ${userId} (${role})`);
    } catch (err) {
      logger.error('Failed to create audit log', { error: err.message, noteId, userId, action });
    }
  }
}

export default new AuditService();
