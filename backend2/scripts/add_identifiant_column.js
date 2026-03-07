import pool from '../src/config/database.js';

async function migrate() {
    try {
        console.log('Starting migration...');

        // Add identifiant column
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS identifiant VARCHAR(255) UNIQUE;
        `);
        console.log('✅ Column identifiant added or already exists.');

        // Update name column to handle cases where it might be derived from first/last name
        // (Just a safety check based on userController logic)

        console.log('Migration completed successfully.');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
