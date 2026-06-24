import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

function isPgliteConnectionString(connectionString) {
  return connectionString === "memory:" || connectionString.startsWith("file:");
}

function isLocalDatabaseHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

const INSECURE_REMOTE_SSL_MODES = new Set([
  "allow",
  "disable",
  "no-verify",
  "prefer",
]);
const REMOTE_SSL_MODES = new Set(["require", "verify-ca", "verify-full"]);

function validateRemoteSslMode(url) {
  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  if (!sslMode || isLocalDatabaseHost(url.hostname.toLowerCase())) {
    return;
  }

  if (INSECURE_REMOTE_SSL_MODES.has(sslMode)) {
    throw new Error(
      `Remote PostgreSQL DATABASE_URL cannot use insecure sslmode=${sslMode}.`,
    );
  }

  if (!REMOTE_SSL_MODES.has(sslMode)) {
    throw new Error(
      `Remote PostgreSQL DATABASE_URL has unsupported sslmode=${sslMode}.`,
    );
  }
}

export function getSslConfig(connectionString) {
  const url = new URL(connectionString);

  if (isLocalDatabaseHost(url.hostname.toLowerCase())) {
    return false;
  }

  validateRemoteSslMode(url);

  const sslMode = url.searchParams.get("sslmode")?.toLowerCase();

  return { rejectUnauthorized: sslMode !== "require" };
}

export function getPostgresConnectionConfig(connectionString) {
  const url = new URL(connectionString);
  const ssl = getSslConfig(connectionString);

  url.searchParams.delete("sslmode");

  return {
    connectionString: url.toString(),
    ssl,
  };
}

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
