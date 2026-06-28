import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import {
  getPostgresConnectionConfig,
  isPgliteConnectionString,
} from "../../../packages/db/src/postgres-config.js";

export { getPostgresConnectionConfig };

async function runMigrationsIfNeeded() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString || isPgliteConnectionString(connectionString)) {
    return;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const migrationsFolder = resolve(scriptDir, "../../../packages/db/drizzle");
  const pool = new Pool(getPostgresConnectionConfig(connectionString));

  try {
    console.info("Running database migrations before Next.js startup");
    await migrate(drizzle(pool), { migrationsFolder });
    console.info("Database migrations completed");
  } finally {
    await pool.end();
  }
}

function startNext() {
  const child = spawn("next", ["start"], {
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

function isMainModule() {
  return Boolean(
    process.argv[1] &&
      import.meta.url === pathToFileURL(resolve(process.argv[1])).href,
  );
}

if (isMainModule()) {
  runMigrationsIfNeeded()
    .then(startNext)
    .catch((error) => {
      console.error("Startup migrations failed", error);
      process.exit(1);
    });
}
