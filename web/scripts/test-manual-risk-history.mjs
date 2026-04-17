#!/usr/bin/env node

import crypto from "node:crypto";

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";

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

function randomHex(length) {
  const raw = crypto.randomBytes(Math.ceil(length / 2)).toString("hex");
  return raw.slice(0, length);
}

function generateUuidV7() {
  const timestampHex = Date.now().toString(16).padStart(12, "0").slice(-12);
  const versionTail = randomHex(3);
  const variantNibble = (8 + (crypto.randomBytes(1)[0] & 0x3)).toString(16);
  const variantTail = randomHex(3);
  const node = randomHex(12);
  return `${timestampHex.slice(0, 8)}-${timestampHex.slice(8, 12)}-7${versionTail}-${variantNibble}${variantTail}-${node}`;
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

async function createRiskEvent(input) {
  return fetchJson("/api/admin/file/risk-events", {
    method: "POST",
    headers: {
      Authorization: adminAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

async function patchRiskEvent(input) {
  return fetchJson("/api/admin/file/risk-events", {
    method: "PATCH",
    headers: {
      Authorization: adminAuthHeader(),
      "Content-Type": "application/json"
    },
    body: JSON.stringify(input)
  });
}

async function fetchRiskEvents(riskCode, status) {
  return fetchJson(
    `/api/admin/file/risk-events?riskCode=${encodeURIComponent(riskCode)}&status=${encodeURIComponent(status)}&page=1&pageSize=200`,
    {
      method: "GET",
      headers: {
        Authorization: adminAuthHeader()
      }
    }
  );
}

async function fetchCleanupHistory() {
  return fetchJson("/api/admin/file/cleanup-history?page=1&pageSize=200", {
    method: "GET",
    headers: {
      Authorization: adminAuthHeader()
    }
  });
}

async function fetchVideoHistory(videoId) {
  return fetchJson(`/api/admin/file/${videoId}/history?page=1&pageSize=200`, {
    method: "GET",
    headers: {
      Authorization: adminAuthHeader()
    }
  });
}

function expectApiData(response, hint) {
  if (!response || typeof response !== "object" || response.ok !== true || !("data" in response)) {
    throw new Error(`Invalid API response shape: ${hint}`);
  }
  return response.data;
}

function findResolvedRiskItem(responseData, riskCode) {
  const items = responseData?.items ?? [];
  if (!Array.isArray(items)) {
    return null;
  }

  return (
    items.find(
      (item) =>
        item?.risk_code === riskCode &&
        item?.status === "RESOLVED" &&
        item?.trigger_source === "MANUAL"
    ) ?? null
  );
}

function listManualHistoryItems(responseData, riskCode) {
  const items = responseData?.items ?? [];
  if (!Array.isArray(items)) {
    return [];
  }

  return items.filter((item) => {
    if (item?.event_type !== "RISK_EVENT_MANUAL") {
      return false;
    }
    const payload = item?.payload;
    return payload && typeof payload === "object" && payload.riskCode === riskCode;
  });
}

async function main() {
  const { videoId: explicitVideoId } = parseArgs();
  const videoId = explicitVideoId ?? generateUuidV7();
  const mark = Date.now();
  const riskCode = `MANUAL_RISK_SMOKE_${mark}`;
  const owner = "manual-risk-smoke";

  console.log(`[MANUAL-RISK] base=${WEB_BASE_URL}`);
  console.log(`[MANUAL-RISK] videoId=${videoId}`);
  console.log(`[MANUAL-RISK] riskCode=${riskCode}`);

  const createdResponse = await createRiskEvent({
    riskCode,
    severity: "P2",
    status: "OPEN",
    videoId,
    owner,
    latestNote: `create:${mark}`
  });
  const created = expectApiData(createdResponse, "POST /risk-events");
  if (!created.item || created.item.risk_code !== riskCode || created.item.status !== "OPEN") {
    throw new Error("Manual risk event creation verification failed.");
  }

  const patchedResponse = await patchRiskEvent({
    riskCode,
    videoId,
    status: "RESOLVED",
    latestNote: `resolved:${mark}`
  });
  const patched = expectApiData(patchedResponse, "PATCH /risk-events");
  if (!patched.item || patched.item.risk_code !== riskCode || patched.item.status !== "RESOLVED") {
    throw new Error("Manual risk event patch verification failed.");
  }

  await sleep(120);

  const resolvedEvents = expectApiData(await fetchRiskEvents(riskCode, "RESOLVED"), "GET /risk-events");
  const resolvedItem = findResolvedRiskItem(resolvedEvents, riskCode);
  if (!resolvedItem) {
    throw new Error("Expected RESOLVED MANUAL risk event was not found.");
  }

  const cleanupHistory = expectApiData(await fetchCleanupHistory(), "GET /cleanup-history");
  const cleanupMatches = listManualHistoryItems(cleanupHistory, riskCode);
  if (cleanupMatches.length < 2) {
    throw new Error("Expected manual risk entries were not found in cleanup-history.");
  }

  const videoHistory = expectApiData(await fetchVideoHistory(videoId), "GET /videoId/history");
  const videoMatches = listManualHistoryItems(videoHistory, riskCode);
  if (videoMatches.length < 2) {
    throw new Error("Expected manual risk entries were not found in video history.");
  }

  console.log("[MANUAL-RISK] PASS");
  console.log(
    JSON.stringify(
      {
        videoId,
        riskCode,
        resolvedTime: resolvedItem.resolved_time,
        cleanupHistoryMatches: cleanupMatches.length,
        videoHistoryMatches: videoMatches.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[MANUAL-RISK] FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
