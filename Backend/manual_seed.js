import pkg from 'pg';
import bcrypt from 'bcrypt';
const { Pool } = pkg;

const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/dms' });

async function seed() {
  console.log("Starting Manual Data Seeding...");
  try {
    const password = await bcrypt.hash('password123', 10);
    const users = [
      ['Aditi Sharma', 'aditi@bank.com', 'Initiator', password, 'Retail Banking'],
      ['Rahul Mehta', 'rahul@bank.com', 'Recommender', password, 'Corporate Banking'],
      ['Kavita Iyer', 'kavita@bank.com', 'Recommender', password, 'Operations'],
      ['Arjun Patel', 'arjun@bank.com', 'Approver', password, 'Risk Management'],
      ['Neha Kapoor', 'neha@bank.com', 'Approver', password, 'Compliance'],
      ['Vikram Desai', 'vikram@bank.com', 'Controller', password, 'Operations']
    ];

    for (const [name, email, role, pwd, dept] of users) {
      await pool.query(
        'INSERT INTO "User" (name, email, role, password, department, "createdAt") VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, department = EXCLUDED.department',
        [name, email, role, pwd, dept]
      );
    }
    
    console.log("Manual Seeding Successful!");
  } catch (err) {
    console.error("Seeding Failed:", err.message);
  } finally {
    await pool.end();
  }
}

seed();
