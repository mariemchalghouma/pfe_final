import pool from '../src/config/database.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const migrate = async () => {
    try {
        console.log('🚀 Starting migration: Renaming POI fields...');

        // table poi: nom -> code, adresse -> description
        console.log('Renaming columns in "poi" table...');
        await pool.query('ALTER TABLE poi RENAME COLUMN nom TO code;');
        await pool.query('ALTER TABLE poi RENAME COLUMN adresse TO description;');

        // table poi_historique: poi_nom -> poi_code
        console.log('Renaming columns in "poi_historique" table...');
        await pool.query('ALTER TABLE poi_historique RENAME COLUMN poi_nom TO poi_code;');

        console.log('✅ Migration successful!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        if (err.message.includes('does not exist')) {
            console.log('Note: Some columns might have already been renamed or do not exist.');
        }
    } finally {
        await pool.end();
        process.exit();
    }
}

migrate();
