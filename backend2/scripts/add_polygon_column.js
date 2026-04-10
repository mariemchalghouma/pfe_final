import pool from "../src/config/database.js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const migrate = async () => {
  try {
    console.log("🚀 Starting migration: Adding polygon column to poi...");

    await pool.query(`
      ALTER TABLE poi
      ADD COLUMN IF NOT EXISTS polygon jsonb
    `);

    console.log("✅ Migration successful!");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
};

migrate();
