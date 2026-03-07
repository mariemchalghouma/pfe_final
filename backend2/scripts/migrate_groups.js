import pool from '../src/config/database.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const initialGroups = [
    { nom: 'Dépôt', description: 'Sites principaux', couleur: '#fbbf24' },
    { nom: 'Client Interne', description: 'Clients groupe', couleur: '#f97316' },
    { nom: 'Client Externe', description: 'Clients tiers', couleur: '#ef4444' },
    { nom: 'Station', description: 'Stations service', couleur: '#a855f7' },
    { nom: 'Zone Industrielle', description: 'Zones logistiques', couleur: '#06b6d4' },
];

const migrate = async () => {
    try {
        console.log('🚀 Starting migration: Creating POI groups table...');

        // Create table
        await pool.query(`
            CREATE TABLE IF NOT EXISTS poi_groupes (
                id SERIAL PRIMARY KEY,
                nom VARCHAR(100) UNIQUE NOT NULL,
                description TEXT,
                couleur VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);
        console.log('✅ Table "poi_groupes" created or already exists.');

        // Populate initial groups
        for (const group of initialGroups) {
            await pool.query(
                'INSERT INTO poi_groupes (nom, description, couleur) VALUES ($1, $2, $3) ON CONFLICT (nom) DO NOTHING',
                [group.nom, group.description, group.couleur]
            );
        }
        console.log('✅ Initial groups populated.');

        console.log('✅ Migration successful!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
    } finally {
        await pool.end();
        process.exit();
    }
}

migrate();
