import pg from 'pg';
const { Client } = pg;

async function testConnection() {
  const client = new Client({
    connectionString: "postgresql://postgres:password@localhost:5432/dms?schema=public"
  });

  try {
    await client.connect();
    console.log('Successfully connected to the database!');
    const res = await client.query('SELECT NOW()');
    console.log('Current time from DB:', res.rows[0].now);
    await client.end();
  } catch (err) {
    console.error('Connection error:', err.message);
  }
}

testConnection();
