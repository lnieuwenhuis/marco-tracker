const LOCAL_DATABASE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const INSECURE_REMOTE_SSL_MODES = new Set([
  "allow",
  "disable",
  "no-verify",
  "prefer",
]);
const REMOTE_SSL_MODES = new Set(["require", "verify-full"]);
const VERIFY_REMOTE_SSL_MODES = new Set(["verify-full"]);

export function isPgliteConnectionString(connectionString) {
  return connectionString === "memory:" || connectionString.startsWith("file:");
}

function isLocalDatabaseHost(hostname) {
  return LOCAL_DATABASE_HOSTS.has(hostname);
}

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
  const shouldVerifyRemoteCertificate =
    sslMode === undefined || VERIFY_REMOTE_SSL_MODES.has(sslMode);

  return { rejectUnauthorized: shouldVerifyRemoteCertificate };
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
