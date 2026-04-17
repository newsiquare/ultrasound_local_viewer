#!/usr/bin/env node

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";
const RISK_CODE = "SSE_UNSTABLE_OR_BUFFERED";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let videoId = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--video-id" || arg === "--videoId") {
      videoId = args[i + 1] ?? null;
      i += 1;
    }
  }

  return { videoId };
}

function adminAuthHeader() {
  const token = Buffer.from(`${ADMIN_USER}:${ADMIN_PASSWORD}`, "utf-8").toString("base64");
  return `Basic ${token}`;
}

async function fetchJson(path, init = {}) {
  const response = await fetch(`${WEB_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {})
    },
    cache: "no-store"
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }

  if (!response.ok) {
    const detail = typeof payload === "object" && payload !== null ? JSON.stringify(payload) : String(payload);
    throw new Error(`${response.status} ${response.statusText} ${path} -> ${detail}`);
  }

  return payload;
}

async function resolveVideoId(explicitVideoId) {
  if (explicitVideoId) {
    return explicitVideoId;
  }

  const list = await fetchJson("/api/videos?page=1&pageSize=20");
  const items = list?.data?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No videos found. Please upload at least one video first.");
  }

  return String(items[0].id);
}

function findRiskItem(data, { status, videoId }) {
  const items = data?.data?.items ?? [];
  if (!Array.isArray(items)) {
    return null;
  }

  return (
    items.find(
      (item) =>
        item?.risk_code === RISK_CODE &&
        item?.status === status &&
        String(item?.video_id ?? "") === videoId &&
        item?.trigger_source === "SSE_HEALTH"
    ) ?? null
  );
}

async function postHealth(videoId, state, reason) {
  return fetchJson(`/api/videos/${videoId}/ai-status/health`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ state, reason })
  });
}

async function fetchRiskEvents(status) {
  return fetchJson(
    `/api/admin/file/risk-events?status=${encodeURIComponent(status)}&riskCode=${encodeURIComponent(RISK_CODE)}&page=1&pageSize=200`,
    {
      method: "GET",
      headers: {
        Authorization: adminAuthHeader()
      }
    }
  );
}

async function main() {
  const { videoId: explicitVideoId } = parseArgs();
  const videoId = await resolveVideoId(explicitVideoId);
  const mark = `sse-health-smoke-${Date.now()}`;

  console.log(`[SSE-HEALTH] base=${WEB_BASE_URL}`);
  console.log(`[SSE-HEALTH] videoId=${videoId}`);

  await postHealth(videoId, "DEGRADED", `${mark}:degraded`);
  await sleep(150);

  const openEvents = await fetchRiskEvents("OPEN");
  const opened = findRiskItem(openEvents, { status: "OPEN", videoId });
  if (!opened) {
    throw new Error("Expected OPEN SSE_HEALTH risk event was not found.");
  }

  await postHealth(videoId, "HEALTHY", `${mark}:healthy`);
  await sleep(150);

  const resolvedEvents = await fetchRiskEvents("RESOLVED");
  const resolved = findRiskItem(resolvedEvents, { status: "RESOLVED", videoId });
  if (!resolved) {
    throw new Error("Expected RESOLVED SSE_HEALTH risk event was not found.");
  }

  console.log("[SSE-HEALTH] PASS");
  console.log(
    JSON.stringify(
      {
        videoId,
        openTriggerTime: opened.trigger_time,
        resolvedTime: resolved.resolved_time,
        triggerSource: resolved.trigger_source
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[SSE-HEALTH] FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
