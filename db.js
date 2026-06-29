const fs = require("fs");
const path = require("path");
const mysql = require("mysql2");
const { Pool } = require("pg");
const session = require("express-session");

const dbClient = (process.env.DB_CLIENT || "").toLowerCase();
const usePostgres = dbClient === "postgres" || dbClient === "postgresql" || Boolean(process.env.DATABASE_URL);

const toPostgresSql = (sql) => {
  let index = 0;
  let converted = sql
    .replace(/imageUrl/g, '"imageUrl"')
    .replace(/id\s+IN\s+\(\?\)/i, "id = ANY(?::int[])");

  if (/^\s*INSERT\s+INTO\s+photos\b/i.test(converted) && !/\bRETURNING\b/i.test(converted)) {
    converted += " RETURNING id";
  }

  return converted.replace(/\?/g, () => `$${++index}`);
};

const normalizePostgresResult = (result) => {
  if (result.command === "SELECT") {
    return [result.rows, result.fields];
  }

  return [{
    affectedRows: result.rowCount,
    insertId: result.rows && result.rows[0] ? result.rows[0].id : undefined
  }, result.fields];
};

const createPostgresAdapter = () => {
  const connectionString = process.env.DATABASE_URL;
  const host = process.env.PGHOST || process.env.DB_HOST;
  const pgConfig = connectionString
    ? { connectionString }
    : {
        host,
        port: Number(process.env.PGPORT || process.env.DB_PORT || 5432),
        user: process.env.PGUSER || process.env.DB_USER,
        password: process.env.PGPASSWORD || process.env.DB_PASSWORD,
        database: process.env.PGDATABASE || process.env.DB_NAME || "mypic"
      };

  const sslDisabled = process.env.PGSSLMODE === "disable" || /^(localhost|127\.0\.0\.1)$/.test(host || "");
  if (!sslDisabled && process.env.NODE_ENV === "production") {
    pgConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(pgConfig);
  const query = async (client, sql, params = []) => {
    const result = await client.query(toPostgresSql(sql), params);
    return normalizePostgresResult(result);
  };

  const promiseAdapter = {
    query: (sql, params) => query(pool, sql, params),
    getConnection: async () => {
      const client = await pool.connect();
      return {
        beginTransaction: () => client.query("BEGIN"),
        query: (sql, params) => query(client, sql, params),
        commit: () => client.query("COMMIT"),
        rollback: () => client.query("ROLLBACK"),
        release: () => client.release()
      };
    }
  };

  const PgSessionStore = require("connect-pg-simple")(session);
  const sessionStore = new PgSessionStore({
    pool,
    createTableIfMissing: true
  });

  const initializeDatabase = async () => {
    const schema = fs.readFileSync(path.join(__dirname, "schema.postgres.sql"), "utf8");
    const statements = schema
      .split(/;\s*(?:\r?\n|$)/)
      .map((statement) => statement.trim())
      .filter(Boolean);

    for (const statement of statements) {
      await pool.query(statement);
    }
  };

  return {
    db: { promise: () => promiseAdapter },
    sessionStore,
    initializeDatabase
  };
};

const createMySqlAdapter = () => {
  const pool = mysql.createPool({
    host: process.env.DB_HOST || "127.0.0.1",
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "0000",
    database: process.env.DB_NAME || "mypic",
    port: Number(process.env.DB_PORT || 3307)
  });

  const MySQLStore = require("express-mysql-session")(session);
  const sessionStore = new MySQLStore({}, pool.promise());

  return {
    db: pool,
    sessionStore,
    initializeDatabase: async () => {}
  };
};

module.exports = usePostgres ? createPostgresAdapter() : createMySqlAdapter();
