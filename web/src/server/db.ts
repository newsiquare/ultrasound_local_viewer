import { mkdir, readFile, readdir } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

import { getStoragePaths } from "@/server/paths";

let initPromise: Promise<void> | null = null;

interface SqliteResult {
  stdout: string;
  stderr: string;
}

function runSqliteScript(script: string): Promise<SqliteResult> {
  const { dbPath } = getStoragePaths();

  return new Promise((resolve, reject) => {
    const child = spawn("sqlite3", [dbPath], {
      stdio: ["pipe", "pipe", "pipe"]
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`sqlite3 exited with code ${code}: ${stderr}`));
    });

    child.stdin.write(script);
    child.stdin.end();
  });
}

async function initDatabase(): Promise<void> {
  const { storageRoot, videosRoot, repoRoot } = getStoragePaths();
  const migrationsDir = path.join(repoRoot, "web", "src", "server", "db", "migrations");

  await mkdir(storageRoot, { recursive: true });
  await mkdir(videosRoot, { recursive: true });

  const migrationFiles = (await readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  await runSqliteScript(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);
`);

  const rows = await runSqliteScript(`
.mode json
.headers on
SELECT name FROM _migrations;
`);
  const applied = new Set<string>();
  const text = rows.stdout.trim();
  if (text) {
    const parsed = JSON.parse(text) as Array<{ name: string }>;
    for (const item of parsed) {
      if (item?.name) {
        applied.add(item.name);
      }
    }
  }

  for (const fileName of migrationFiles) {
    if (applied.has(fileName)) {
      continue;
    }

    const migrationSql = await readFile(path.join(migrationsDir, fileName), "utf-8");
    const now = new Date().toISOString();

    await runSqliteScript(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
BEGIN;
${migrationSql}
INSERT INTO _migrations (name, applied_at) VALUES (${sqlString(fileName)}, ${sqlString(now)});
COMMIT;
`);
  }
}

export async function ensureDatabase(): Promise<void> {
  if (!initPromise) {
    initPromise = initDatabase();
  }
  await initPromise;
}

export async function execute(sql: string): Promise<void> {
  await ensureDatabase();
  await runSqliteScript(`
PRAGMA foreign_keys = ON;
${sql}
`);
}

export async function executeMany(sqlStatements: string[]): Promise<void> {
  await ensureDatabase();
  await runSqliteScript(`
PRAGMA foreign_keys = ON;
BEGIN;
${sqlStatements.join("\n")}
COMMIT;
`);
}

export async function queryRows<T>(sql: string): Promise<T[]> {
  await ensureDatabase();
  const result = await runSqliteScript(`
.mode json
.headers on
PRAGMA foreign_keys = ON;
${sql}
`);

  const text = result.stdout.trim();
  if (!text) {
    return [];
  }

  return JSON.parse(text) as T[];
}

export function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function sqlNullableString(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  return sqlString(value);
}

export function sqlNullableNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "NULL";
  }
  return String(value);
}

export function sqlBoolean(value: boolean): string {
  return value ? "1" : "0";
}
