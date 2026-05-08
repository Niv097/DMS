import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
dotenv.config();

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding banking notes...');

  const aditi = await prisma.user.findUnique({ where: { email: 'aditi.sharma@bankdemo.com' } });
  const rahul = await prisma.user.findUnique({ where: { email: 'rahul.mehta@bankdemo.com' } });
  const arjun = await prisma.user.findUnique({ where: { email: 'arjun.patel@bankdemo.com' } });
  const vikram = await prisma.user.findUnique({ where: { email: 'vikram.desai@bankdemo.com' } });

  if (!aditi || !rahul || !arjun || !vikram) {
    console.error('Missing seed users. Please run database seed first.');
    return;
  }

  // 1. A Pending Note for Aditi
  const note1 = await prisma.note.create({
    data: {
      note_id: 'NT/NFIN/2026/0001',
      subject: 'Annual Maintenance Contract - Retail Division',
      note_type: 'Non-Financial',
      workflow_type: 'Normal',
      status: 'SUBMITTED',
      initiator_id: aditi.id,
      department_id: aditi.department_id,
      vertical_id: aditi.vertical_id,
      workflow_steps: {
        create: [
          { sequence: 1, role_type: 'RECOMMENDER', assigned_user_id: rahul.id, status: 'PENDING' },
          { sequence: 2, role_type: 'APPROVER', assigned_user_id: arjun.id, status: 'PENDING' },
          { sequence: 3, role_type: 'CONTROLLER', assigned_user_id: vikram.id, status: 'PENDING' },
        ]
      },
      audit_logs: {
        create: [
          { action: 'SUBMITTED', performed_by: aditi.name, role: 'INITIATOR', comment: 'Initial submission for AMC renewal' }
        ]
      }
    }
  });

  // 2. An Approved Note for Aditi
  const note2 = await prisma.note.create({
    data: {
      note_id: 'NT/NFIN/2026/0002',
      subject: 'Office Furniture Procurement',
      note_type: 'Non-Financial',
      workflow_type: 'Normal',
      status: 'APPROVED',
      initiator_id: aditi.id,
      department_id: aditi.department_id,
      vertical_id: aditi.vertical_id,
      workflow_steps: {
        create: [
          { sequence: 1, role_type: 'RECOMMENDER', assigned_user_id: rahul.id, status: 'COMPLETED', action_date: new Date() },
          { sequence: 2, role_type: 'APPROVER', assigned_user_id: arjun.id, status: 'COMPLETED', action_date: new Date() },
          { sequence: 3, role_type: 'CONTROLLER', assigned_user_id: vikram.id, status: 'COMPLETED', action_date: new Date() },
        ]
      },
      audit_logs: {
        create: [
          { action: 'SUBMITTED', performed_by: aditi.name, role: 'INITIATOR', comment: 'Submission for office desk sets' },
          { action: 'RECOMMEND', performed_by: rahul.name, role: 'RECOMMENDER', comment: 'Recommended. Needed for expanding team.' },
          { action: 'APPROVE', performed_by: arjun.name, role: 'APPROVER', comment: 'Approved as per budget.' },
          { action: 'FINAL_APPROVE', performed_by: vikram.name, role: 'CONTROLLER', comment: 'Final approval granted.' }
        ]
      }
    }
  });

  console.log('Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
