#!/usr/bin/env node

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://127.0.0.1:3000";
const ADMIN_USER = process.env.ADMIN_USER ?? "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "change-me";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function fetchJsonWithStatus(path, expectedStatus, init = {}) {
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

  if (response.status !== expectedStatus) {
    const detail = typeof payload === "object" && payload !== null ? JSON.stringify(payload) : String(payload);
    throw new Error(
      `Expected ${expectedStatus} but got ${response.status} ${response.statusText} ${path} -> ${detail}`
    );
  }

  return payload;
}

function expectApiData(response, hint) {
  if (!response || typeof response !== "object" || response.ok !== true || !("data" in response)) {
    throw new Error(`Invalid API response shape: ${hint}`);
  }
  return response.data;
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

async function fetchRiskEvents({ riskCode, status, sinceHours }) {
  const query = new URLSearchParams();
  query.set("riskCode", riskCode);
  query.set("status", status);
  query.set("page", "1");
  query.set("pageSize", "200");
  if (sinceHours) {
    query.set("sinceHours", String(sinceHours));
  }

  return fetchJson(`/api/admin/file/risk-events?${query.toString()}`, {
    method: "GET",
    headers: {
      Authorization: adminAuthHeader()
    }
  });
}

async function fetchRiskEventsExpectStatus({ riskCode, status, sinceHours, expectedStatus }) {
  const query = new URLSearchParams();
  query.set("riskCode", riskCode);
  query.set("status", status);
  query.set("page", "1");
  query.set("pageSize", "200");
  if (sinceHours !== undefined) {
    query.set("sinceHours", String(sinceHours));
  }

  return fetchJsonWithStatus(`/api/admin/file/risk-events?${query.toString()}`, expectedStatus, {
    method: "GET",
    headers: {
      Authorization: adminAuthHeader()
    }
  });
}

function findRiskItem(responseData, { riskCode, status }) {
  const items = responseData?.items ?? [];
  if (!Array.isArray(items)) {
    return null;
  }
  return items.find((item) => item?.risk_code === riskCode && item?.status === status) ?? null;
}

async function main() {
  const mark = Date.now();
  const riskCode = `RISK_TIME_FILTER_SMOKE_${mark}`;

  console.log(`[RISK-TIME] base=${WEB_BASE_URL}`);
  console.log(`[RISK-TIME] riskCode=${riskCode}`);

  const createdResponse = await createRiskEvent({
    riskCode,
    severity: "P2",
    status: "OPEN",
    owner: "risk-time-smoke",
    latestNote: `open:${mark}`
  });
  const created = expectApiData(createdResponse, "POST /risk-events");
  if (!created.item || created.item.status !== "OPEN") {
    throw new Error("Failed to create OPEN risk event.");
  }

  const open24h = expectApiData(
    await fetchRiskEvents({ riskCode, status: "OPEN", sinceHours: 24 }),
    "GET /risk-events (OPEN,24h)"
  );
  if (!findRiskItem(open24h, { riskCode, status: "OPEN" })) {
    throw new Error("OPEN risk event not found with sinceHours=24.");
  }

  const open7d = expectApiData(
    await fetchRiskEvents({ riskCode, status: "OPEN", sinceHours: 168 }),
    "GET /risk-events (OPEN,7d)"
  );
  if (!findRiskItem(open7d, { riskCode, status: "OPEN" })) {
    throw new Error("OPEN risk event not found with sinceHours=168.");
  }

  await patchRiskEvent({
    riskCode,
    status: "RESOLVED",
    latestNote: `resolved:${mark}`
  });
  await sleep(120);

  const resolved24h = expectApiData(
    await fetchRiskEvents({ riskCode, status: "RESOLVED", sinceHours: 24 }),
    "GET /risk-events (RESOLVED,24h)"
  );
  const resolvedItem = findRiskItem(resolved24h, { riskCode, status: "RESOLVED" });
  if (!resolvedItem) {
    throw new Error("RESOLVED risk event not found with sinceHours=24.");
  }

  const badSince = await fetchRiskEventsExpectStatus({
    riskCode,
    status: "RESOLVED",
    sinceHours: 1,
    expectedStatus: 400
  });
  const badCode = badSince?.error?.code;
  if (badCode !== "BAD_REQUEST") {
    throw new Error("Expected BAD_REQUEST for sinceHours=1.");
  }

  console.log("[RISK-TIME] PASS");
  console.log(
    JSON.stringify(
      {
        riskCode,
        resolvedTime: resolvedItem.resolved_time,
        invalidSinceHoursErrorCode: badCode
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[RISK-TIME] FAIL", error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
