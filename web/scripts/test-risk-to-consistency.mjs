#!/usr/bin/env node

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

function expectApiData(response, hint) {
  if (!response || typeof response !== "object" || response.ok !== true || !("data" in response)) {
    throw new Error(`Invalid API response shape: ${hint}`);
  }
  return response.data;
}

async function resolveVideoId(explicitVideoId) {
  if (explicitVideoId) {
    return explicitVideoId;
  }

  const list = await fetchJson("/api/videos?page=1&pageSize=20");
  const data = expectApiData(list, "GET /api/videos");
  const items = data?.items ?? [];
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("No videos found. Please upload at least one video first.");
  }
  return String(items[0].id);
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

async function fetchConsistency(videoId) {
  return fetchJson(`/api/admin/file/${videoId}/consistency`, {
    method: "GET",
    headers: {
      Authorization: adminAuthHeader()
    }
  });
}

function findRiskItem(responseData, { riskCode, status, videoId }) {
  const items = responseData?.items ?? [];
  if (!Array.isArray(items)) {
    return null;
  }

  return (
    items.find(
      (item) =>
        item?.risk_code === riskCode &&
        item?.status === status &&
        String(item?.video_id ?? "") === videoId
    ) ?? null
  );
}

async function main() {
  const { videoId: explicitVideoId } = parseArgs();
  const videoId = await resolveVideoId(explicitVideoId);
  const riskCode = `RISK_TO_CONSISTENCY_SMOKE_${Date.now()}`;

  console.log(`[RISK-CONSISTENCY] base=${WEB_BASE_URL}`);
  console.log(`[RISK-CONSISTENCY] videoId=${videoId}`);
  console.log(`[RISK-CONSISTENCY] riskCode=${riskCode}`);

  const createdResponse = await createRiskEvent({
    riskCode,
    severity: "P2",
    status: "OPEN",
    videoId,
    owner: "risk-consistency-smoke",
    latestNote: `open:${Date.now()}`
  });
  const created = expectApiData(createdResponse, "POST /risk-events");
  if (!created.item || created.item.status !== "OPEN") {
    throw new Error("Failed to create OPEN risk event.");
  }

  await sleep(120);

  const openRiskEvents = expectApiData(await fetchRiskEvents(riskCode, "OPEN"), "GET /risk-events");
  const opened = findRiskItem(openRiskEvents, {
    riskCode,
    status: "OPEN",
    videoId
  });
  if (!opened) {
    throw new Error("Expected OPEN risk event was not found.");
  }

  const consistencyResponse = expectApiData(await fetchConsistency(videoId), "GET /consistency");
  if (String(consistencyResponse.videoId) !== videoId) {
    throw new Error("Consistency response videoId mismatch.");
  }
  if (!Array.isArray(consistencyResponse.problems) || !Array.isArray(consistencyResponse.suggestedActions)) {
    throw new Error("Consistency response shape mismatch.");
  }

  await patchRiskEvent({
    riskCode,
    videoId,
    status: "RESOLVED",
    latestNote: `resolved:${Date.now()}`
  });

  console.log("[RISK-CONSISTENCY] PASS");
  console.log(
    JSON.stringify(
      {
        videoId,
        riskCode,
        consistencyStatus: consistencyResponse.consistencyStatus,
        problems: consistencyResponse.problems.length,
        suggestedActions: consistencyResponse.suggestedActions.length
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[RISK-CONSISTENCY] FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
