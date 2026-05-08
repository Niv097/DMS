import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/dms' });

async function check() {
  try {
    const res = await pool.query('SELECT * FROM "Note" LIMIT 1');
    console.log(Object.keys(res.rows[0]));
  } catch (err) {
    console.log("No Note table found or error:", err.message);
  } finally {
    await pool.end();
  }
}

check();
