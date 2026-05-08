import { PrismaClient } from '@prisma/client';
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding sample banking notes with connect logic...');

  // 1. Note: Approved Hardware Procurement
  await prisma.note.create({
    data: {
      noteId: 'NT/FIN/2026/0001',
      subject: 'Hardware Procurement - CC Office',
      noteType: 'Financial',
      workflowType: 'Normal',
      status: 'APPROVED',
      createdBy: 1,
      workflow: {
        create: {
          templateId: 1,
          currentStep: 3,
          status: 'COMPLETED',
          steps: {
            create: [
              { userId: 2, stepOrder: 1, role: 'RECOMMENDER', status: 'RECOMMENDED' },
              { userId: 3, stepOrder: 2, role: 'RECOMMENDER', status: 'RECOMMENDED' },
              { userId: 4, stepOrder: 3, role: 'APPROVER', status: 'APPROVED' }
            ]
          }
        }
      },
      auditLogs: {
        create: [
          { userId: 1, action: 'NOTE CREATED', comment: 'Initial submission' },
          { userId: 2, action: 'RECOMMENDED', comment: 'Approved on my side' },
          { userId: 4, action: 'APPROVED', comment: 'Final approval issued' }
        ]
      },
      attachments: {
        create: [
          { fileName: 'quotation.pdf', fileType: 'application/pdf', filePath: '/uploads/mock.pdf' }
        ]
      }
    }
  });

  // 2. Note: Pending AMC
  await prisma.note.create({
    data: {
      noteId: 'NT/GEN/2026/0002',
      subject: 'AMC Renewal - IT Systems',
      noteType: 'Non-Financial',
      workflowType: 'Normal',
      status: 'PENDING',
      createdBy: 1,
      workflow: {
        create: {
          templateId: 1,
          currentStep: 1,
          status: 'ACTIVE',
          steps: {
            create: [
              { userId: 2, stepOrder: 1, role: 'RECOMMENDER', status: 'PENDING' },
              { userId: 4, stepOrder: 2, role: 'APPROVER', status: 'PENDING' }
            ]
          }
        }
      }
    }
  });

  console.log('Success! 2 Notes created.');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
