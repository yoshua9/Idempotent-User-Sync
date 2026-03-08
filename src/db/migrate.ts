import fs from "fs";
import path from "path";
import pool from "../config/db";

async function migrate(): Promise<void> {
  const migrationsDir = path.join(__dirname, "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, "utf-8");
    console.log(`Running migration: ${file}`);
    await pool.query(sql);
    console.log(`Migration completed: ${file}`);
  }

  await pool.end();
  console.log("All migrations executed successfully.");
}

migrate().catch((err) => {
  console.error("Error running migrations:", err);
  process.exit(1);
});
