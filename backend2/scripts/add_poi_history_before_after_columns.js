import pool from "../src/config/database.js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const migrate = async () => {
  try {
    console.log(
      "Starting migration: add old_data/new_data to poi_historique...",
    );

    await pool.query(`
      ALTER TABLE poi_historique
      ADD COLUMN IF NOT EXISTS old_data jsonb,
      ADD COLUMN IF NOT EXISTS new_data jsonb;
    `);

    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
};

migrate();
