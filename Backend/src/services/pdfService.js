import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import fs from 'fs/promises';
import path from 'path';
import logger from '../utils/logger.js';
import prisma from '../utils/prisma.js';

class PdfService {
  async generateApprovedPdf(noteId) {
    try {
      const noteData = await prisma.note.findUnique({
        where: { id: parseInt(noteId) },
        include: { 
          creator: true,
          comments: { include: { user: true }, orderBy: { createdAt: 'asc' } },
          auditLogs: { include: { user: true }, orderBy: { timestamp: 'desc' } }
        }
      });

      if (!noteData) throw new Error('Note not found');

      const pdfDoc = await PDFDocument.create();
      const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

      // --- PAGE 1: NOTE, COMMENT & AUDIT SUMMARY ---
      const page1 = pdfDoc.addPage([600, 800]);
      page1.drawText('FINAL APPROVED NOTE SUMMARY', { x: 50, y: 750, size: 22, font: helveticaBold, color: rgb(0.1, 0.2, 0.5) });
      
      // Note Details
      page1.drawText(`Note ID: ${noteData.noteId}`, { x: 50, y: 710, size: 14, font: helveticaBold });
      page1.drawText(`Subject: ${noteData.subject}`, { x: 50, y: 690, size: 12 });
      page1.drawText(`Vertical: ${noteData.vertical}`, { x: 50, y: 675, size: 11 });
      page1.drawText(`Dept: ${noteData.originatingDepartment}`, { x: 50, y: 660, size: 11 });
      page1.drawText(`Initiator: ${noteData.creator.name}`, { x: 50, y: 645, size: 11 });

      // Comment Log
      let y = 610;
      page1.drawText('COMMENT LOG', { x: 50, y, size: 14, font: helveticaBold });
      y -= 25;
      noteData.comments.slice(0, 10).forEach(c => {
        page1.drawText(`${c.user.name}: ${c.comment.substring(0, 60)}...`, { x: 50, y, size: 10 });
        y -= 15;
      });

      // Audit Log
      y -= 20;
      page1.drawText('AUDIT LOG (Movement Trail)', { x: 50, y, size: 14, font: helveticaBold });
      y -= 25;
      noteData.auditLogs.slice(0, 10).forEach(log => {
        page1.drawText(`${new Date(log.timestamp).toLocaleDateString()} - ${log.action} by ${log.user.name} (${log.role})`, { x: 50, y, size: 9 });
        y -= 15;
      });

      // --- FINAL APPROVER WATERMARK ---
      const finalApprover = noteData.auditLogs.find(l => l.action === 'APPROVED');
      const applyWatermark = (page) => {
        const text = `APPROVED - ${finalApprover ? finalApprover.user.name : 'CONTROLLER'}`;
        const dateText = new Date().toLocaleDateString();
        page.drawText(text, {
          x: 400, y: 50, size: 12, font: helveticaBold, color: rgb(0.5, 0, 0),
        });
        page.drawText(`Date: ${dateText}`, {
          x: 400, y: 35, size: 10, font: helveticaFont, color: rgb(0.5, 0, 0),
        });
      };

      // In a real implementation, we would append the original note PDF here.
      // For this demo, we'll just watermark the summary page as proof of concept.
      applyWatermark(page1);

      const pdfBytes = await pdfDoc.save();
      const outputPath = path.join('uploads', `final_${noteData.id}.pdf`);
      
      await fs.mkdir('uploads', { recursive: true });
      await fs.writeFile(outputPath, pdfBytes);
      
      return outputPath;
    } catch (err) {
      logger.error('Failed PDF generation', { error: err.message, noteId });
      throw err;
    }
  }
}

export default new PdfService();
