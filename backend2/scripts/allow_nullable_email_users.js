import pool from "../src/config/database.js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const migrate = async () => {
  try {
    console.log("Starting migration: make users.email optional...");

    await pool.query(`
      ALTER TABLE users
      ALTER COLUMN email DROP NOT NULL;
    `);

    await pool.query(`
      UPDATE users
      SET email = NULL
      WHERE email IS NOT NULL AND BTRIM(email) = '';
    `);

    console.log("users.email is now nullable.");
    console.log("Migration completed successfully.");
  } catch (err) {
    console.error("Migration failed:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
};

migrate();
