import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: 'postgresql://postgres:password@localhost:5432/dms' });

async function check() {
  try {
    const ws = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = \'WorkflowStep\'');
    console.log('WorkflowStep:', ws.rows.map(r => r.column_name));

    const wi = await pool.query('SELECT column_name FROM information_schema.columns WHERE table_name = \'WorkflowInstance\'');
    console.log('WorkflowInstance:', wi.rows.map(r => r.column_name));
  } catch (err) {
    console.log("Error:", err.message);
  } finally {
    await pool.end();
  }
}

check();
