import pool from "../src/config/database.js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const migrate = async () => {
  try {
    console.log('🚀 Starting migration: Updating "users" table...');

    // Add columns if they don't exist
    await pool.query(`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS first_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS last_name VARCHAR(255),
            ADD COLUMN IF NOT EXISTS phone VARCHAR(50),
            ADD COLUMN IF NOT EXISTS roles JSONB DEFAULT '[]',
            ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Actif';
        `);

    // Email should be optional.
    await pool.query(`
            ALTER TABLE users
            ALTER COLUMN email DROP NOT NULL;
        `);

    await pool.query(`
        UPDATE users
        SET email = NULL
        WHERE email IS NOT NULL AND BTRIM(email) = '';
      `);

    // Update existing users if they have a 'name' but no first/last name
    const result = await pool.query(
      "SELECT id, name FROM users WHERE first_name IS NULL",
    );
    for (const row of result.rows) {
      if (row.name) {
        const parts = row.name.split(" ");
        const firstName = parts[0] || "";
        const lastName = parts.slice(1).join(" ") || "";
        await pool.query(
          "UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3",
          [firstName, lastName, row.id],
        );
      }
    }

    console.log('✅ "users" table updated with new columns.');
    console.log("✅ Migration successful!");
  } catch (err) {
    console.error("❌ Migration failed:", err.message);
  } finally {
    await pool.end();
    process.exit();
  }
};

migrate();
