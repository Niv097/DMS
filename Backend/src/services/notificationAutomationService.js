import prisma from '../utils/prisma.js';
import logger from '../utils/logger.js';
import {
  notificationReminderEnabled,
  notificationReminderGraceMinutes,
  notificationReminderIntervalMinutes,
  notificationReminderRepeatHours
} from '../config/env.js';
import { createNotification } from './notificationService.js';
import { sendPendingWorkReminderEmail } from './emailService.js';

const ACTIVE_WORKFLOW_STATES = ['SUBMITTED', 'UNDER_REVIEW', 'RESUBMITTED', 'RETURNED_WITH_REMARK'];
const REMINDER_CATEGORY = 'REMINDER';
const REMINDER_ENTITY_TYPES = {
  WORKFLOW: 'PENDING_WORKFLOW_REMINDER',
  CIRCULAR: 'PENDING_CIRCULAR_REMINDER',
  DIGEST: 'UNREAD_NOTIFICATION_DIGEST'
};

const automationState = {
  enabled: notificationReminderEnabled,
  interval_minutes: notificationReminderIntervalMinutes,
  grace_minutes: notificationReminderGraceMinutes,
  repeat_hours: notificationReminderRepeatHours,
  next_run_at: null,
  last_run_started_at: null,
  last_run_finished_at: null,
  last_run_status: notificationReminderEnabled ? 'SCHEDULED' : 'DISABLED',
  last_run_summary: {
    workflow_reminders: 0,
    circular_reminders: 0,
    digest_reminders: 0,
    users_emailed: 0
  },
  is_running: false
};

let schedulerTimer = null;
let activeLogger = logger;

const getGraceCutoff = (referenceDate = new Date()) => new Date(referenceDate.getTime() - (notificationReminderGraceMinutes * 60 * 1000));
const getRepeatCutoff = (referenceDate = new Date()) => new Date(referenceDate.getTime() - (notificationReminderRepeatHours * 60 * 60 * 1000));
const getNextRunDate = (baseDate = new Date()) => {
  const nextRun = new Date(baseDate.getTime() + (notificationReminderIntervalMinutes * 60 * 1000));
  nextRun.setSeconds(0, 0);
  return nextRun;
};

const scheduleNextRun = () => {
  if (schedulerTimer) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }

  if (!notificationReminderEnabled) {
    automationState.next_run_at = null;
    automationState.last_run_status = 'DISABLED';
    return;
  }

  const nextRun = getNextRunDate();
  automationState.next_run_at = nextRun.toISOString();
  automationState.last_run_status = automationState.is_running ? 'RUNNING' : 'SCHEDULED';

  const delayMs = Math.max(1000, nextRun.getTime() - Date.now());
  schedulerTimer = setTimeout(() => {
    runNotificationReminderCycle('SCHEDULED').catch((error) => {
      activeLogger.error('Notification reminder cycle failed', {
        message: error.message,
        stack: error.stack
      });
    });
  }, delayMs);
};

const userReminderSelect = {
  id: true,
  name: true,
  email: true,
  tenant_id: true,
  branch_id: true,
  username: true,
  role: { select: { id: true, name: true } },
  tenant: {
    select: {
      id: true,
      tenant_name: true,
      tenant_code: true,
      brand_display_name: true,
      brand_short_code: true,
      brand_subtitle: true
    }
  },
  branch: { select: { id: true, branch_name: true, branch_code: true } }
};

const hasRecentReminder = async ({ userId, entityType, entityId, repeatCutoff }) => {
  const recent = await prisma.notification.findFirst({
    where: {
      user_id: userId,
      category: REMINDER_CATEGORY,
      entity_type: entityType,
      entity_id: entityId,
      created_at: { gte: repeatCutoff }
    },
    select: { id: true }
  });
  return Boolean(recent);
};

const addDigestItem = (bucketMap, userId, key, value) => {
  if (!bucketMap.has(userId)) {
    bucketMap.set(userId, {
      workflowItems: [],
      circularItems: [],
      unreadCount: 0
    });
  }
  const bucket = bucketMap.get(userId);
  if (key === 'unreadCount') {
    bucket.unreadCount = Math.max(bucket.unreadCount, Number(value || 0));
    return;
  }
  bucket[key].push(value);
};

const loadBranchRecipientUsers = async (tenantId, branchId) => prisma.user.findMany({
  where: {
    tenant_id: tenantId,
    is_active: true,
    OR: [
      { branch_id: branchId },
      { branch_accesses: { some: { branch_id: branchId } } }
    ]
  },
  select: userReminderSelect
});

const loadDepartmentRecipientUsers = async (tenantId, targetDepartmentMasterId) => {
  const departmentMaster = await prisma.fmsDepartment.findUnique({
    where: { id: targetDepartmentMasterId },
    select: { id: true, tenant_id: true, legacy_department_id: true, name: true }
  }).catch(() => null);

  if (!departmentMaster?.legacy_department_id) {
    return [];
  }

  return prisma.user.findMany({
    where: {
      tenant_id: tenantId,
      department_id: departmentMaster.legacy_department_id,
      is_active: true
    },
    select: userReminderSelect
  });
};

const resolveDistributionUsers = async (recipient) => {
  if (recipient.target_user) {
    return [recipient.target_user];
  }
  if (recipient.target_branch_id) {
    return loadBranchRecipientUsers(recipient.distribution.tenant_id, recipient.target_branch_id);
  }
  if (recipient.target_department_master_id) {
    return loadDepartmentRecipientUsers(recipient.distribution.tenant_id, recipient.target_department_master_id);
  }
  return [];
};

const buildWorkflowReminderMessage = (note) => (
  `${note.note_id} (${note.subject}) is still waiting in your ${note.queue_code || 'incoming'} queue.`
);

const buildCircularReminderMessage = (recipient) => (
  `${recipient.distribution.title || recipient.distribution.document?.title || 'Controlled circular'} is still waiting for your ${String(recipient.distribution.instruction_type || 'INFORMATION').toLowerCase()} action.`
);

const listWorkflowReminderCandidates = async (graceCutoff) => prisma.note.findMany({
  where: {
    is_latest_version: true,
    current_owner_user_id: { not: null },
    workflow_state: { in: ACTIVE_WORKFLOW_STATES },
    last_moved_at: { lte: graceCutoff },
    current_owner: { is: { is_active: true } }
  },
  select: {
    id: true,
    note_id: true,
    subject: true,
    workflow_state: true,
    queue_code: true,
    last_moved_at: true,
    tenant_id: true,
    branch_id: true,
    current_owner: { select: userReminderSelect },
    tenant: {
      select: {
        id: true,
        tenant_name: true,
        tenant_code: true,
        brand_display_name: true,
        brand_short_code: true,
        brand_subtitle: true
      }
    }
  }
});

const listDistributionReminderCandidates = async (graceCutoff) => {
  if (!prisma.fmsDistributionRecipient) return [];
  return prisma.fmsDistributionRecipient.findMany({
    where: {
      created_at: { lte: graceCutoff },
      distribution: { status: 'ACTIVE' },
      OR: [
        { status: 'PENDING' },
        {
          status: 'ACKNOWLEDGED',
          distribution: { instruction_type: 'ACTION' }
        }
      ]
    },
    include: {
      target_user: { select: userReminderSelect },
      distribution: {
        select: {
          id: true,
          tenant_id: true,
          title: true,
          instruction_type: true,
          access_level: true,
          due_at: true,
          tenant: {
            select: {
              id: true,
              tenant_name: true,
              tenant_code: true,
              brand_display_name: true,
              brand_short_code: true,
              brand_subtitle: true
            }
          },
          document: {
            select: {
              id: true,
              title: true,
              document_reference: true
            }
          }
        }
      }
    }
  }).catch(() => []);
};

const listUnreadNotificationCounts = async (graceCutoff) => {
  const rows = await prisma.notification.findMany({
    where: {
      is_read: false,
      category: { not: REMINDER_CATEGORY },
      created_at: { lte: graceCutoff }
    },
    select: { user_id: true }
  });

  const counts = new Map();
  for (const row of rows) {
    counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1);
  }
  return counts;
};

export const runNotificationReminderCycle = async (trigger = 'MANUAL') => {
  if (automationState.is_running) {
    return automationState.last_run_summary;
  }

  automationState.is_running = true;
  automationState.last_run_started_at = new Date().toISOString();
  automationState.last_run_finished_at = null;
  automationState.last_run_status = 'RUNNING';
  automationState.last_run_summary = {
    workflow_reminders: 0,
    circular_reminders: 0,
    digest_reminders: 0,
    users_emailed: 0,
    trigger
  };

  const referenceDate = new Date();
  const graceCutoff = getGraceCutoff(referenceDate);
  const repeatCutoff = getRepeatCutoff(referenceDate);
  const emailDigestMap = new Map();

  try {
    const workflowItems = await listWorkflowReminderCandidates(graceCutoff);
    for (const note of workflowItems) {
      const user = note.current_owner;
      if (!user?.id) continue;
      const alreadySent = await hasRecentReminder({
        userId: user.id,
        entityType: REMINDER_ENTITY_TYPES.WORKFLOW,
        entityId: note.id,
        repeatCutoff
      });
      if (alreadySent) continue;

      await createNotification({
        userId: user.id,
        tenantId: note.tenant_id ?? null,
        branchId: user.branch_id ?? note.branch_id ?? null,
        title: 'Pending workflow still awaiting your action',
        message: buildWorkflowReminderMessage(note),
        category: REMINDER_CATEGORY,
        entityType: REMINDER_ENTITY_TYPES.WORKFLOW,
        entityId: note.id
      }).catch(() => {});

      addDigestItem(emailDigestMap, user.id, 'workflowItems', {
        note_id: note.note_id,
        subject: note.subject,
        workflow_state: note.workflow_state,
        workflow_state_label: String(note.workflow_state || '').replaceAll('_', ' '),
        queue_code: note.queue_code,
        queue_label: String(note.queue_code || '').replaceAll('_', ' ')
      });
      automationState.last_run_summary.workflow_reminders += 1;
    }

    const circularRecipients = await listDistributionReminderCandidates(graceCutoff);
    for (const recipient of circularRecipients) {
      const recipientUsers = await resolveDistributionUsers(recipient);
      for (const user of recipientUsers) {
        const alreadySent = await hasRecentReminder({
          userId: user.id,
          entityType: REMINDER_ENTITY_TYPES.CIRCULAR,
          entityId: recipient.id,
          repeatCutoff
        });
        if (alreadySent) continue;

        await createNotification({
          userId: user.id,
          tenantId: recipient.distribution.tenant_id ?? null,
          branchId: user.branch_id ?? null,
          title: 'Pending circular action still open',
          message: buildCircularReminderMessage(recipient),
          category: REMINDER_CATEGORY,
          entityType: REMINDER_ENTITY_TYPES.CIRCULAR,
          entityId: recipient.id
        }).catch(() => {});

        addDigestItem(emailDigestMap, user.id, 'circularItems', {
          title: recipient.distribution.title || recipient.distribution.document?.title || 'Controlled circular',
          instruction_type: recipient.distribution.instruction_type,
          instruction_type_label: String(recipient.distribution.instruction_type || '').replaceAll('_', ' '),
          access_level: recipient.distribution.access_level,
          access_level_label: String(recipient.distribution.access_level || '').replaceAll('_', ' '),
          reference: recipient.distribution.document?.document_reference || '-'
        });
        automationState.last_run_summary.circular_reminders += 1;
      }
    }

    const unreadCounts = await listUnreadNotificationCounts(graceCutoff);
    for (const [userId, unreadCount] of unreadCounts.entries()) {
      const alreadySent = await hasRecentReminder({
        userId,
        entityType: REMINDER_ENTITY_TYPES.DIGEST,
        entityId: userId,
        repeatCutoff
      });
      if (alreadySent) continue;

      await createNotification({
        userId,
        title: 'Unread banking alerts still pending review',
        message: `You still have ${unreadCount} unread alert(s) waiting in the DMS alerts tray.`,
        category: REMINDER_CATEGORY,
        entityType: REMINDER_ENTITY_TYPES.DIGEST,
        entityId: userId
      }).catch(() => {});

      addDigestItem(emailDigestMap, userId, 'unreadCount', unreadCount);
      automationState.last_run_summary.digest_reminders += 1;
    }

    for (const [userId, bucket] of emailDigestMap.entries()) {
      if (bucket.workflowItems.length === 0 && bucket.circularItems.length === 0 && bucket.unreadCount === 0) continue;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: userReminderSelect
      }).catch(() => null);
      if (!user?.email) continue;

      await sendPendingWorkReminderEmail({
        user,
        tenant: user.tenant || null,
        workflowItems: bucket.workflowItems,
        circularItems: bucket.circularItems,
        unreadCount: bucket.unreadCount,
        repeatWindowHours: notificationReminderRepeatHours
      }).catch((error) => {
        activeLogger.warn('Pending work reminder email failed', {
          user_id: user.id,
          message: error.message
        });
      });
      automationState.last_run_summary.users_emailed += 1;
    }

    automationState.last_run_status = 'COMPLETED';
    return automationState.last_run_summary;
  } catch (error) {
    automationState.last_run_status = 'FAILED';
    throw error;
  } finally {
    automationState.is_running = false;
    automationState.last_run_finished_at = new Date().toISOString();
    scheduleNextRun();
  }
};

export const startNotificationReminderAutomation = (customLogger = logger) => {
  activeLogger = customLogger;
  scheduleNextRun();
};

