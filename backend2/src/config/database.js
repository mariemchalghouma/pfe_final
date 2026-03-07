import pkg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

const { Pool } = pkg;
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ Unexpected error on idle client', err);
});

export default pool;
