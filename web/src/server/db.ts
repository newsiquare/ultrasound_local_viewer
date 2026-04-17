import { mkdir, readFile } from "node:fs/promises";
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
  const migrationPath = path.join(repoRoot, "web", "src", "server", "db", "migrations", "0001_phase1.sql");

  await mkdir(storageRoot, { recursive: true });
  await mkdir(videosRoot, { recursive: true });

  const migrationSql = await readFile(migrationPath, "utf-8");

  await runSqliteScript(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
${migrationSql}
`);
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
