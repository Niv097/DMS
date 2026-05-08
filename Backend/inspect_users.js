import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/dms' });

async function check() {
  try {
    const res = await pool.query('SELECT name, email FROM "User"');
    console.log(res.rows);
  } catch (err) {
    console.log("Error:", err.message);
  } finally {
    await pool.end();
  }
}

check();
