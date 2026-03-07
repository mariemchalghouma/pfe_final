import pool from '../src/config/database.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const migrate = async () => {
    try {
        console.log('🚀 Starting migration: Removing "bg" and "border" from "poi_groupes"...');

        await pool.query(`
            ALTER TABLE poi_groupes 
            DROP COLUMN IF EXISTS bg,
            DROP COLUMN IF EXISTS border;
        `);

        console.log('✅ Columns "bg" and "border" dropped from "poi_groupes".');
        console.log('✅ Migration successful!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
        process.exit();
    }
}

migrate();
