export function isPgliteConnectionString(connectionString: string): boolean;

export function getSslConfig(
  connectionString: string,
): false | { rejectUnauthorized: boolean };

export function getPostgresConnectionConfig(connectionString: string): {
  connectionString: string;
  ssl: false | { rejectUnauthorized: boolean };
};
