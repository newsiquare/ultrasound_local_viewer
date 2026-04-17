import path from "node:path";
import { existsSync } from "node:fs";

export interface StoragePaths {
  repoRoot: string;
  storageRoot: string;
  videosRoot: string;
  dbPath: string;
}

function inferRepoRoot(): string {
  if (process.env.ULTRASOUND_REPO_ROOT) {
    return path.resolve(process.env.ULTRASOUND_REPO_ROOT);
  }

  const cwd = process.cwd();
  const cwdHasStorage = existsSync(path.join(cwd, "storage"));
  if (cwdHasStorage) {
    return cwd;
  }

  if (path.basename(cwd) === "web") {
    return path.resolve(cwd, "..");
  }

  const parent = path.resolve(cwd, "..");
  if (existsSync(path.join(parent, "storage"))) {
    return parent;
  }

  return cwd;
}

export function getStoragePaths(): StoragePaths {
  const repoRoot = inferRepoRoot();
  const storageRoot = path.join(repoRoot, "storage");
  const videosRoot = path.join(storageRoot, "videos");
  const dbPath = path.join(storageRoot, "app.db");
  return {
    repoRoot,
    storageRoot,
    videosRoot,
    dbPath
  };
}
