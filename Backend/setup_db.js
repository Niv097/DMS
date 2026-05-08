import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/dms' });

async function setup() {
  console.log("Starting DB Schema Migration (Manual)...");
  try {
    // 1. Ensure Note table has required fields
    await pool.query('ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS vertical TEXT');
    await pool.query('ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "originatingDepartment" TEXT');
    await pool.query('ALTER TABLE "Note" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP DEFAULT NOW()');
    console.log("- Note table updated.");

    // 2. Ensure User table has required fields
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS password TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS department TEXT');
    await pool.query('ALTER TABLE "User" ADD COLUMN IF NOT EXISTS role TEXT');
    console.log("- User table updated.");

    // 3. Ensure WorkflowInstance table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "WorkflowInstance" (
        "id" SERIAL PRIMARY KEY,
        "noteId" INTEGER UNIQUE,
        "currentStep" INTEGER DEFAULT 0,
        "status" TEXT
      );
    `);
    
    // 4. Ensure WorkflowStep table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "WorkflowStep" (
        "id" SERIAL PRIMARY KEY,
        "instanceId" INTEGER,
        "stepOrder" INTEGER,
        "userId" INTEGER,
        "role" TEXT,
        "status" TEXT DEFAULT 'PENDING',
        "actionDate" TIMESTAMP
      );
    `);

    // 5. Ensure AuditLog table matches requirements
    await pool.query('ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "performedBy" INTEGER');
    await pool.query('ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS role TEXT');
    
    console.log("DB Setup Successful!");
  } catch (err) {
    console.error("DB Setup Failed:", err.message);
  } finally {
    await pool.end();
  }
}

setup();
