import prisma from '../utils/prisma.js';
import auditService from '../services/auditService.js';
import pdfService from '../services/pdfService.js';
import logger from '../utils/logger.js';

class WorkflowService {
  /**
   * Recommend a Note (Move to next step)
   */
  async recommend(noteId, userId, isFinal = false, comment = '') {
    return await prisma.$transaction(async (tx) => {
      // 1. Get current workflow instance
      const instance = await tx.workflowInstance.findUnique({
        where: { noteId: parseInt(noteId) },
        include: { steps: { orderBy: { stepOrder: 'asc' } } }
      });

      if (!instance) throw new Error('Workflow instance not found');

      // 2. Find the current step's details
      const currentStep = instance.steps.find(s => s.stepOrder === instance.currentStep);
      
      if (!currentStep || currentStep.userId !== parseInt(userId)) {
        throw new Error('You are not the actor for the current workflow step');
      }

      // 3. Update current step
      await tx.workflowStep.update({
        where: { id: currentStep.id },
        data: { 
          status: isFinal ? 'APPROVED' : 'RECOMMENDED',
          actionDate: new Date()
        }
      });

      // 4. Determine next step
      const nextStepOrder = instance.currentStep + 1;
      const hasNextStep = instance.steps.some(s => s.stepOrder === nextStepOrder);

      if (hasNextStep && !isFinal) {
        // Move to next step
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { currentStep: nextStepOrder }
        });
        
        await tx.note.update({
          where: { id: parseInt(noteId) },
          data: { status: 'PENDING' } // Still pending for next actor
        });
      } else {
        // Final Approval
        await tx.workflowInstance.update({
          where: { id: instance.id },
          data: { status: 'COMPLETED' }
        });
        
        await tx.note.update({
          where: { id: parseInt(noteId) },
          data: { status: 'APPROVED' }
        });

        // Trigger PDF Generation (Section 8)
        try {
          await pdfService.generateApprovedPdf(noteId);
        } catch (err) {
          logger.error('Background PDF generation failed after approval', { error: err.message, noteId });
        }
      }

      // 5. Audit Log
      await auditService.log(parseInt(noteId), parseInt(userId), isFinal ? 'APPROVED' : 'RECOMMENDED', comment);

      return { success: true };
    });
  }

  /**
   * Return for Changes (Backward Routing to ANY stage)
   */
  async returnForChanges(noteId, userId, targetStepOrder = 0, comment = '') {
    return await prisma.$transaction(async (tx) => {
      const instance = await tx.workflowInstance.findUnique({
        where: { noteId: parseInt(noteId) },
        include: { steps: true }
      });

      if (!instance) throw new Error('Workflow instance not found');

      const currentStepOrder = instance.currentStep;

      // 1. Move the workflow current pointer back to the target step
      await tx.workflowInstance.update({
        where: { id: instance.id },
        data: { 
          currentStep: parseInt(targetStepOrder),
          status: parseInt(targetStepOrder) === 0 ? 'RETURNED' : 'IN_PROGRESS'
        }
      });

      // 2. Clear statuses of all intermediate steps between current and target
      await tx.workflowStep.updateMany({
        where: { 
          instanceId: instance.id,
          stepOrder: {
            gte: parseInt(targetStepOrder),
            lte: currentStepOrder
          }
        },
        data: { 
          status: 'PENDING',
          actionDate: null 
        }
      });

      // 3. Update the note status
      await tx.note.update({
        where: { id: parseInt(noteId) },
        data: { 
          status: parseInt(targetStepOrder) === 0 ? 'RETURNED' : 'IN_PROGRESS'
        }
      });

      // 4. Detailed Audit Log (Section 7 from prompt)
      await tx.auditLog.create({
        data: {
           noteId: parseInt(noteId),
           userId: parseInt(userId),
           action: 'SEND_BACK',
           fromStep: currentStepOrder,
           toStep: parseInt(targetStepOrder),
           comment: `Returned to stage ${targetStepOrder}: ${comment}`
        }
      });

      return { success: true };
    });
  }

  /**
   * Refer to another officer
   */
  async refer(noteId, userId, referToUserId, comment = '') {
     return await prisma.$transaction(async (tx) => {
        const instance = await tx.workflowInstance.findUnique({
          where: { noteId: parseInt(noteId) },
          include: { steps: true }
        });

        if (!instance) throw new Error('Workflow instance not found');

        // Insert a temporary step for the referred user
        const currentStepOrder = instance.currentStep;
        
        // Shift subsequent steps
        await tx.workflowStep.updateMany({
          where: { 
            instanceId: instance.id,
            stepOrder: { gte: currentStepOrder }
          },
          data: { stepOrder: { increment: 1 } }
        });

        // Insert new step
        await tx.workflowStep.create({
          data: {
            instanceId: instance.id,
            userId: parseInt(referToUserId),
            stepOrder: currentStepOrder,
            role: 'RECOMMENDER',
            status: 'PENDING'
          }
        });

        // Log referral
        await auditService.log(parseInt(noteId), parseInt(userId), 'REFERRED', `Referred to User ${referToUserId}: ${comment}`);

        return { success: true };
     });
  }
}

export default new WorkflowService();
