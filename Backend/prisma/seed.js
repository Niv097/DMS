import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import fs from 'fs/promises';
import path from 'path';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const isProduction = String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';
  const enableDemo = ['1', 'true', 'yes', 'on'].includes(String(process.env.ENABLE_DEMO || '').trim().toLowerCase());

  if (isProduction || !enableDemo) {
    console.log('Demo seed is disabled for this environment. Seed stopped intentionally.');
    return;
  }

  console.log('Seeding demographic and user data for Step 2...');
  const supportsEnterpriseModels = Boolean(prisma.tenant && prisma.branch);
  const supportsExtendedUserFields = supportsEnterpriseModels;

  // 1. Create Roles
  const roles = [
    { name: 'INITIATOR' },
    { name: 'RECOMMENDER' },
    { name: 'APPROVER' },
    { name: 'CONTROLLER' },
    { name: 'ADMIN' },
    { name: 'SUPER_ADMIN' },
    { name: 'AUDITOR' },
  ];

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: {},
      create: role,
    });
  }
  console.log('- Roles updated.');

  // 2. Create Departments
  const departments = [
    'Retail Banking',
    'Corporate Banking',
    'Operations',
    'Risk Management',
    'Compliance',
    'IT Services',
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { name: dept },
      update: {},
      create: { name: dept },
    });
  }
  console.log('- Departments updated.');

  // 3. Create Verticals
  const verticals = [
    'Retail',
    'Corporate',
    'Digital Banking',
    'Risk',
    'Operations',
  ];

  for (const vert of verticals) {
    await prisma.vertical.upsert({
      where: { name: vert },
      update: {},
      create: { name: vert },
    });
  }
  console.log('- Verticals updated.');

  let defaultTenant = null;
  let defaultBranch = null;

  if (supportsEnterpriseModels) {
    await prisma.tenant.upsert({
      where: { tenant_code: 'DMS' },
      update: { tenant_name: 'Default Demo Bank' },
      create: { tenant_name: 'Default Demo Bank', tenant_code: 'DMS' }
    });
    defaultTenant = await prisma.tenant.findUnique({ where: { tenant_code: 'DMS' } });

    await prisma.branch.upsert({
      where: {
        tenant_id_branch_code: {
          tenant_id: defaultTenant.id,
          branch_code: 'HO'
        }
      },
      update: { branch_name: 'Head Office' },
      create: {
        branch_name: 'Head Office',
        branch_code: 'HO',
        tenant_id: defaultTenant.id
      }
    });
    defaultBranch = await prisma.branch.findFirst({
      where: { tenant_id: defaultTenant.id, branch_code: 'HO' }
    });
    console.log('- Tenant and branch defaults updated.');
  } else {
    console.log('- Tenant/branch models not available in current Prisma client. Seeding legacy-compatible data only.');
  }

  // Mapping Role IDs
  const roleMap = {};
  const allRoles = await prisma.role.findMany();
  allRoles.forEach(r => roleMap[r.name] = r.id);

  // Mapping Dept/Vertical IDs
  const retailDept = await prisma.department.findUnique({ where: { name: 'Retail Banking' } });
  const retailVert = await prisma.vertical.findUnique({ where: { name: 'Retail' } });

  // 4. Create Users (Password: Password@123)
  const passwordHash = await bcrypt.hash('Password@123', 10);

  const users = [
    {
      name: 'Aditi Sharma',
      email: 'aditi.sharma@bankdemo.com',
      password_hash: passwordHash,
      role_id: roleMap['INITIATOR'],
      department_id: retailDept.id,
      vertical_id: retailVert.id,
      ...(supportsExtendedUserFields ? {
        username: 'aditi.sharma',
        tenant_id: defaultTenant.id,
        branch_id: defaultBranch.id,
        user_id: `DMS-HO-USR-0001`,
        is_active: true,
        is_first_login: false
      } : {})
    },
    {
      name: 'Rahul Mehta',
      email: 'rahul.mehta@bankdemo.com',
      password_hash: passwordHash,
      role_id: roleMap['RECOMMENDER'],
      department_id: retailDept.id,
      vertical_id: retailVert.id,
      ...(supportsExtendedUserFields ? {
        username: 'rahul.mehta',
        tenant_id: defaultTenant.id,
        branch_id: defaultBranch.id,
        user_id: `DMS-HO-USR-0002`,
        is_active: true,
        is_first_login: false
      } : {})
    },
    {
      name: 'Arjun Patel',
      email: 'arjun.patel@bankdemo.com',
      password_hash: passwordHash,
      role_id: roleMap['APPROVER'],
      department_id: retailDept.id,
      vertical_id: retailVert.id,
      ...(supportsExtendedUserFields ? {
        username: 'arjun.patel',
        tenant_id: defaultTenant.id,
        branch_id: defaultBranch.id,
        user_id: `DMS-HO-USR-0003`,
        is_active: true,
        is_first_login: false
      } : {})
    },
    {
      name: 'Vikram Desai',
      email: 'vikram.desai@bankdemo.com',
      password_hash: passwordHash,
      role_id: roleMap['CONTROLLER'],
      department_id: retailDept.id,
      vertical_id: retailVert.id,
      ...(supportsExtendedUserFields ? {
        username: 'vikram.desai',
        tenant_id: defaultTenant.id,
        branch_id: defaultBranch.id,
        user_id: `DMS-HO-USR-0004`,
        is_active: true,
        is_first_login: false
      } : {})
    },
  ];

  for (const user of users) {
    await prisma.user.upsert({
      where: { email: user.email },
      update: supportsExtendedUserFields
        ? {
            password_hash: passwordHash,
            username: user.username,
            tenant_id: user.tenant_id,
            branch_id: user.branch_id,
            user_id: user.user_id,
            is_active: true,
            is_first_login: false
          }
        : {
            password_hash: passwordHash
          },
      create: user,
    });
  }
  console.log('- Users updated.');

  // 5. Extended demo dataset with realistic flow (generic data only)
  const uploadsDir = path.resolve('uploads');
  try {
    await fs.mkdir(uploadsDir, { recursive: true });
  } catch {}

  const nowYear = new Date().getFullYear();

  const deptMap = Object.fromEntries((await prisma.department.findMany()).map(d => [d.name, d.id]));
  const vertMap = Object.fromEntries((await prisma.vertical.findMany()).map(v => [v.name, v.id]));

  const extendedUsers = [
    { name: 'Aditi Sharma', email: 'aditi.sharma@bankdemo.com', role: 'INITIATOR', dept: 'Retail Banking', vert: 'Retail' },
    { name: 'Neha Rao', email: 'neha.rao@bankdemo.com', role: 'INITIATOR', dept: 'Operations', vert: 'Operations' },
    { name: 'Ishan Verma', email: 'ishan.verma@bankdemo.com', role: 'INITIATOR', dept: 'Corporate Banking', vert: 'Corporate' },
    { name: 'Rahul Mehta', email: 'rahul.mehta@bankdemo.com', role: 'RECOMMENDER', dept: 'Retail Banking', vert: 'Retail' },
    { name: 'Kavita Iyer', email: 'kavita.iyer@bankdemo.com', role: 'RECOMMENDER', dept: 'Retail Banking', vert: 'Retail' },
    { name: 'Kunal Joshi', email: 'kunal.joshi@bankdemo.com', role: 'RECOMMENDER', dept: 'Compliance', vert: 'Risk' },
    { name: 'Meera Nair', email: 'meera.nair@bankdemo.com', role: 'RECOMMENDER', dept: 'Operations', vert: 'Operations' },
    { name: 'Arjun Patel', email: 'arjun.patel@bankdemo.com', role: 'APPROVER', dept: 'Corporate Banking', vert: 'Corporate' },
    { name: 'Neha Kapoor', email: 'neha.kapoor@bankdemo.com', role: 'APPROVER', dept: 'Corporate Banking', vert: 'Corporate' },
    { name: 'Rohan Gupta', email: 'rohan.gupta@bankdemo.com', role: 'APPROVER', dept: 'Risk Management', vert: 'Risk' },
    { name: 'Vikram Desai', email: 'vikram.desai@bankdemo.com', role: 'CONTROLLER', dept: 'Retail Banking', vert: 'Retail' },
    { name: 'Priya Sen', email: 'priya.sen@bankdemo.com', role: 'CONTROLLER', dept: 'Operations', vert: 'Operations' },
    { name: 'Admin User', email: 'admin@bankdemo.com', role: 'ADMIN', dept: 'IT Services', vert: 'Digital Banking' },
    { name: 'Super Admin', email: 'super.admin@bankdemo.com', role: 'SUPER_ADMIN', dept: 'IT Services', vert: 'Digital Banking' },
    { name: 'Audit User', email: 'audit@bankdemo.com', role: 'AUDITOR', dept: 'Compliance', vert: 'Risk' },
  ];

  let seededUserIndex = 10;
  for (const u of extendedUsers) {
    const username = u.email.split('@')[0].toLowerCase();
    const userId = `DMS-HO-USR-${String(seededUserIndex).padStart(4, '0')}`;
    seededUserIndex += 1;
    await prisma.user.upsert({
      where: { email: u.email },
      update: supportsExtendedUserFields
        ? {
            password_hash: passwordHash,
            role_id: roleMap[u.role],
            department_id: deptMap[u.dept],
            vertical_id: vertMap[u.vert],
            tenant_id: defaultTenant.id,
            branch_id: defaultBranch.id,
            username,
            user_id: userId,
            is_active: true,
            is_first_login: false
          }
        : {
            password_hash: passwordHash,
            role_id: roleMap[u.role],
            department_id: deptMap[u.dept],
            vertical_id: vertMap[u.vert]
          },
      create: {
        name: u.name,
        email: u.email,
        password_hash: passwordHash,
        role_id: roleMap[u.role],
        department_id: deptMap[u.dept],
        vertical_id: vertMap[u.vert],
        ...(supportsExtendedUserFields ? {
          username,
          tenant_id: defaultTenant.id,
          branch_id: defaultBranch.id,
          user_id: userId,
          is_active: true,
          is_first_login: false
        } : {})
      }
    });
  }

  const userByEmail = async (email) => prisma.user.findUnique({ where: { email } });

  const ensurePdf = async ({ fileName, title, subtitle, watermark }) => {
    const filePath = path.join(uploadsDir, fileName);
    try {
      await fs.access(filePath);
      return filePath;
    } catch {}

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const addPage = () => {
      const page = pdfDoc.addPage([595, 842]);
      let y = 800;
      page.drawText(title, { x: 50, y, size: 16, font: bold, color: rgb(0.1, 0.2, 0.4) });
      y -= 20;
      page.drawText(subtitle, { x: 50, y, size: 11, font, color: rgb(0.2, 0.2, 0.2) });
      y -= 18;
      page.drawText('This is a generated demo document for workflow testing.', { x: 50, y, size: 10, font });
      y -= 18;
      page.drawText('No real or reference data is used in this PDF.', { x: 50, y, size: 10, font });
      y -= 22;
      page.drawText('Sections:', { x: 50, y, size: 10, font: bold });
      y -= 16;
      page.drawText('- Note Summary', { x: 60, y, size: 10, font });
      y -= 14;
      page.drawText('- Comments', { x: 60, y, size: 10, font });
      y -= 14;
      page.drawText('- Audit Log', { x: 60, y, size: 10, font });
      y -= 20;
      page.drawText('Sample content paragraph goes here to simulate a real note.', { x: 50, y, size: 10, font });

      if (watermark) {
        page.drawText(watermark, { x: 120, y: 420, size: 48, font: bold, color: rgb(0.85, 0.85, 0.85) });
      }
    };

    addPage();
    addPage();

    const bytes = await pdfDoc.save();
    await fs.writeFile(filePath, bytes);
    return filePath;
  };

  const createNoteWithWorkflow = async ({
    noteId,
    subject,
    noteType,
    workflowType,
    status,
    initiatorEmail,
    verticalName,
    departmentName,
    steps,
    comments,
    audits,
    mainPdf,
    annexures = []
  }) => {
    const existing = await prisma.note.findUnique({ where: { note_id: noteId } });
    if (existing) return;

    const initiator = await userByEmail(initiatorEmail);
    const note = await prisma.note.create({
      data: {
        note_id: noteId,
        document_group_key: noteId,
        subject,
        note_type: noteType,
        workflow_type: workflowType,
        initiator_id: initiator.id,
        vertical_id: vertMap[verticalName],
        department_id: deptMap[departmentName],
        status
      }
    });

    const mainPath = await ensurePdf(mainPdf);
    await prisma.attachment.create({
      data: {
        note_id: note.id,
        file_name: mainPdf.fileName,
        file_path: path.posix.join('uploads', mainPdf.fileName),
        file_type: 'main_note'
      }
    });

    for (const a of annexures) {
      await ensurePdf(a);
      await prisma.attachment.create({
        data: {
          note_id: note.id,
          file_name: a.fileName,
          file_path: path.posix.join('uploads', a.fileName),
          file_type: 'annexure'
        }
      });
    }

    await prisma.workflowStep.createMany({
      data: steps.map((s, idx) => ({
        note_id: note.id,
        sequence: idx + 1,
        role_type: s.role,
        assigned_user_id: s.userId,
        status: s.status,
        action_date: s.actionDate || null
      }))
    });

    for (const c of comments) {
      await prisma.comment.create({
        data: {
          note_id: note.id,
          user_id: c.userId,
          comment_text: c.text
        }
      });
    }

    for (const a of audits) {
      await prisma.auditLog.create({
        data: {
          note_id: note.id,
          action: a.action,
          performed_by: a.performedBy,
          role: a.role,
          remarks: a.remarks || null
        }
      });
    }
  };

  const initiatorA = await userByEmail('aditi.sharma@bankdemo.com');
  const initiatorB = await userByEmail('neha.rao@bankdemo.com');
  const initiatorC = await userByEmail('ishan.verma@bankdemo.com');
  const recommenderA = await userByEmail('rahul.mehta@bankdemo.com');
  const recommenderB = await userByEmail('kunal.joshi@bankdemo.com');
  const approverA = await userByEmail('arjun.patel@bankdemo.com');
  const approverB = await userByEmail('rohan.gupta@bankdemo.com');
  const controllerA = await userByEmail('vikram.desai@bankdemo.com');

  if (initiatorA && initiatorB && initiatorC && recommenderA && recommenderB && approverA && approverB && controllerA) {
    await createNoteWithWorkflow({
      noteId: `NT/NFIN/${nowYear}/SEED-001`,
      subject: 'Seed Note A - Awaiting Recommendation',
      noteType: 'Non-Financial',
      workflowType: 'Standard',
      status: 'SUBMITTED',
      initiatorEmail: initiatorA.email,
      verticalName: 'Retail',
      departmentName: 'Retail Banking',
      mainPdf: { fileName: 'seed-note-001.pdf', title: 'Seed Note A', subtitle: 'Awaiting recommendation', watermark: null },
      annexures: [{ fileName: 'seed-note-001-annex.pdf', title: 'Seed Annex A', subtitle: 'Annexure', watermark: null }],
      steps: [
        { role: 'RECOMMENDER', userId: recommenderA.id, status: 'PENDING' },
        { role: 'APPROVER', userId: approverA.id, status: 'PENDING' },
        { role: 'CONTROLLER', userId: controllerA.id, status: 'PENDING' }
      ],
      comments: [
        { userId: initiatorA.id, text: 'Please review and advise.' }
      ],
      audits: [
        { action: 'DRAFT CREATED', performedBy: initiatorA.name, role: 'INITIATOR', remarks: 'Seed draft created' },
        { action: 'SUBMITTED', performedBy: initiatorA.name, role: 'INITIATOR', remarks: 'Seed note submitted' }
      ]
    });

    await createNoteWithWorkflow({
      noteId: `NT/FIN/${nowYear}/SEED-002`,
      subject: 'Seed Note B - Recommended',
      noteType: 'Financial',
      workflowType: 'Standard',
      status: 'RECOMMENDED',
      initiatorEmail: initiatorB.email,
      verticalName: 'Operations',
      departmentName: 'Operations',
      mainPdf: { fileName: 'seed-note-002.pdf', title: 'Seed Note B', subtitle: 'Recommendation completed', watermark: null },
      steps: [
        { role: 'RECOMMENDER', userId: recommenderB.id, status: 'COMPLETED', actionDate: new Date() },
        { role: 'APPROVER', userId: approverA.id, status: 'PENDING' },
        { role: 'CONTROLLER', userId: controllerA.id, status: 'PENDING' }
      ],
      comments: [
        { userId: initiatorB.id, text: 'Initiated for recommendation.' },
        { userId: recommenderB.id, text: 'Reviewed and recommended.' }
      ],
      audits: [
        { action: 'DRAFT CREATED', performedBy: initiatorB.name, role: 'INITIATOR', remarks: 'Seed draft created' },
        { action: 'SUBMITTED', performedBy: initiatorB.name, role: 'INITIATOR', remarks: 'Seed note submitted' },
        { action: 'RECOMMENDED', performedBy: recommenderB.name, role: 'RECOMMENDER', remarks: 'Seed recommendation' }
      ]
    });

    await createNoteWithWorkflow({
      noteId: `NT/FIN/${nowYear}/SEED-003`,
      subject: 'Seed Note C - Approved',
      noteType: 'Financial',
      workflowType: 'Standard',
      status: 'APPROVED',
      initiatorEmail: initiatorC.email,
      verticalName: 'Corporate',
      departmentName: 'Corporate Banking',
      mainPdf: { fileName: 'seed-note-003.pdf', title: 'Seed Note C', subtitle: 'Approval completed', watermark: null },
      steps: [
        { role: 'RECOMMENDER', userId: recommenderA.id, status: 'COMPLETED', actionDate: new Date() },
        { role: 'APPROVER', userId: approverB.id, status: 'COMPLETED', actionDate: new Date() },
        { role: 'CONTROLLER', userId: controllerA.id, status: 'PENDING' }
      ],
      comments: [
        { userId: initiatorC.id, text: 'Please approve after review.' },
        { userId: approverB.id, text: 'Approved from my side.' }
      ],
      audits: [
        { action: 'DRAFT CREATED', performedBy: initiatorC.name, role: 'INITIATOR', remarks: 'Seed draft created' },
        { action: 'SUBMITTED', performedBy: initiatorC.name, role: 'INITIATOR', remarks: 'Seed note submitted' },
        { action: 'RECOMMENDED', performedBy: recommenderA.name, role: 'RECOMMENDER', remarks: 'Seed recommendation' },
        { action: 'APPROVED', performedBy: approverB.name, role: 'APPROVER', remarks: 'Seed approval' }
      ]
    });

    await createNoteWithWorkflow({
      noteId: `NT/NFIN/${nowYear}/SEED-004`,
      subject: 'Seed Note D - Final Approved',
      noteType: 'Non-Financial',
      workflowType: 'Standard',
      status: 'FINAL_APPROVED',
      initiatorEmail: initiatorA.email,
      verticalName: 'Retail',
      departmentName: 'Retail Banking',
      mainPdf: { fileName: 'seed-note-004.pdf', title: 'Seed Note D', subtitle: 'Final approval complete', watermark: 'APPROVED' },
      steps: [
        { role: 'RECOMMENDER', userId: recommenderA.id, status: 'COMPLETED', actionDate: new Date() },
        { role: 'APPROVER', userId: approverA.id, status: 'COMPLETED', actionDate: new Date() },
        { role: 'CONTROLLER', userId: controllerA.id, status: 'COMPLETED', actionDate: new Date() }
      ],
      comments: [
        { userId: initiatorA.id, text: 'Final review requested.' },
        { userId: recommenderA.id, text: 'Recommended.' },
        { userId: approverA.id, text: 'Approved.' },
        { userId: controllerA.id, text: 'Final approval granted.' }
      ],
      audits: [
        { action: 'DRAFT CREATED', performedBy: initiatorA.name, role: 'INITIATOR', remarks: 'Seed draft created' },
        { action: 'SUBMITTED', performedBy: initiatorA.name, role: 'INITIATOR', remarks: 'Seed note submitted' },
        { action: 'RECOMMENDED', performedBy: recommenderA.name, role: 'RECOMMENDER', remarks: 'Seed recommendation' },
        { action: 'APPROVED', performedBy: approverA.name, role: 'APPROVER', remarks: 'Seed approval' },
        { action: 'FINAL_APPROVE', performedBy: controllerA.name, role: 'CONTROLLER', remarks: 'Seed final approval' }
      ]
    });

    await createNoteWithWorkflow({
      noteId: `NT/FIN/${nowYear}/SEED-005`,
      subject: 'Seed Note E - Returned',
      noteType: 'Financial',
      workflowType: 'Standard',
      status: 'RETURNED',
      initiatorEmail: initiatorB.email,
      verticalName: 'Operations',
      departmentName: 'Operations',
      mainPdf: { fileName: 'seed-note-005.pdf', title: 'Seed Note E', subtitle: 'Returned for update', watermark: null },
      steps: [
        { role: 'RECOMMENDER', userId: recommenderB.id, status: 'REFERRED_BACK', actionDate: new Date() },
        { role: 'APPROVER', userId: approverA.id, status: 'PENDING' },
        { role: 'CONTROLLER', userId: controllerA.id, status: 'PENDING' }
      ],
      comments: [
        { userId: recommenderB.id, text: 'Returned for clarification.' }
      ],
      audits: [
        { action: 'SUBMITTED', performedBy: initiatorB.name, role: 'INITIATOR', remarks: 'Seed note submitted' },
        { action: 'SEND_BACK', performedBy: recommenderB.name, role: 'RECOMMENDER', remarks: 'Returned for revision' }
      ]
    });

    await createNoteWithWorkflow({
      noteId: `NT/FIN/${nowYear}/SEED-006`,
      subject: 'Seed Note F - Rejected',
      noteType: 'Financial',
      workflowType: 'Standard',
      status: 'REJECTED',
      initiatorEmail: initiatorC.email,
      verticalName: 'Corporate',
      departmentName: 'Corporate Banking',
      mainPdf: { fileName: 'seed-note-006.pdf', title: 'Seed Note F', subtitle: 'Rejected after review', watermark: null },
      steps: [
        { role: 'RECOMMENDER', userId: recommenderA.id, status: 'COMPLETED', actionDate: new Date() },
        { role: 'APPROVER', userId: approverB.id, status: 'REJECTED', actionDate: new Date() },
        { role: 'CONTROLLER', userId: controllerA.id, status: 'PENDING' }
      ],
      comments: [
        { userId: approverB.id, text: 'Rejected due to policy mismatch.' }
      ],
      audits: [
        { action: 'SUBMITTED', performedBy: initiatorC.name, role: 'INITIATOR', remarks: 'Seed note submitted' },
        { action: 'RECOMMENDED', performedBy: recommenderA.name, role: 'RECOMMENDER', remarks: 'Seed recommendation' },
        { action: 'REJECTED', performedBy: approverB.name, role: 'APPROVER', remarks: 'Seed rejection' }
      ]
    });
  }

  console.log('Step 2: Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
