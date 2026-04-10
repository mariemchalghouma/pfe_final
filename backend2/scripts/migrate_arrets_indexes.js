import pool from "../src/config/database.js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const migrate = async () => {
  try {
    console.log("🚀 Starting migration: creating indexes for arrets query...");

    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_voyage_tracking_stops_beginstoptime
            ON voyage_tracking_stops (beginstoptime);
        `);

    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_voyage_tracking_stops_camion_norm
            ON voyage_tracking_stops ((REPLACE(UPPER(TRIM(camion)), ' ', '')));
        `);

    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_local_histo_gps_all_camion_norm_timestamp
            ON local_histo_gps_all ((REPLACE(UPPER(TRIM(camion)), ' ', '')), gps_timestamp);
        `);

    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_voyage_chauffeur_plamoti_voydtd
            ON voyage_chauffeur ("PLAMOTI", "VOYDTD");
        `);

    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_poi_code
            ON poi (code);
        `);

    await pool.query(`
            CREATE INDEX IF NOT EXISTS idx_magasin_aziza_code_client
            ON magasin_aziza (code_client);
        `);

    console.log("✅ Arrets indexes created or already existed.");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    process.exit();
  }
};

migrate();
