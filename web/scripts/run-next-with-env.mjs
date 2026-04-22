import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");

function parseEnvFile(filePath) {
  if (!existsSync(filePath)) {
    return {};
  }

  const result = {};
  const content = readFileSync(filePath, "utf8");

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

const fileEnv = {
  ...parseEnvFile(path.join(webRoot, ".env")),
  ...parseEnvFile(path.join(webRoot, ".env.local"))
};

const rawArgs = process.argv.slice(2);
const printPortOnly = rawArgs.includes("--print-port");
const args = rawArgs.filter((arg) => arg !== "--print-port");
const mode = args[0] ?? "dev";
const nextArgs = args.slice(1);
const port = process.env.PORT || fileEnv.PORT || "3000";

if (printPortOnly) {
  process.stdout.write(`${port}\n`);
  process.exit(0);
}

const nextBin = path.join(webRoot, "node_modules", "next", "dist", "bin", "next");
const child = spawn(process.execPath, [nextBin, mode, "-p", port, ...nextArgs], {
  cwd: webRoot,
  stdio: "inherit",
  env: {
    ...fileEnv,
    ...process.env,
    PORT: port
  }
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
