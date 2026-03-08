import { Client } from "pg";
import path from "path";
import fs from "fs";

const BASE_URL = process.env.DATABASE_URL || "postgres://user:pass@localhost:5432/dbname";
const TEST_DB = "dbname_test";

async function setup(): Promise<void> {
  const client = new Client({ connectionString: BASE_URL });
  await client.connect();

  const result = await client.query("SELECT 1 FROM pg_database WHERE datname = $1", [TEST_DB]);
  if (result.rowCount === 0) {
    await client.query(`CREATE DATABASE ${TEST_DB}`);
    console.log(`Created test database: ${TEST_DB}`);
  }
  await client.end();

  // Run migrations on a test database
  const testUrl = BASE_URL.replace(/\/[^/]+$/, `/${TEST_DB}`);
  const testClient = new Client({ connectionString: testUrl });
  await testClient.connect();

  const migrationsDir = path.join(__dirname, "..", "src", "db", "migrations");
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    await testClient.query(sql);
  }
  await testClient.end();
}

setup()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Test setup failed:", err);
    process.exit(1);
  });
