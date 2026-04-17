import { executeMany, sqlNullableString, sqlString } from "@/server/db";
import { uuidv7 } from "@/server/uuidv7";

export type RiskSeverity = "P0" | "P1" | "P2";

interface UpsertRiskEventInput {
  riskCode: string;
  severity: RiskSeverity;
  triggerSource?: string | null;
  owner?: string | null;
  latestNote?: string | null;
  videoId?: string | null;
}

interface ResolveRiskEventInput {
  riskCode: string;
  triggerSource?: string | null;
  latestNote?: string | null;
  videoId?: string | null;
}

function scopeKeyOf(videoId?: string | null): string {
  return videoId?.trim() ? videoId : "__GLOBAL__";
}

export async function openRiskEvent(input: UpsertRiskEventInput): Promise<void> {
  const now = new Date().toISOString();
  const scopeKey = scopeKeyOf(input.videoId);
  const videoId = input.videoId?.trim() ? input.videoId : null;

  await executeMany([
    `UPDATE risk_events
     SET severity=${sqlString(input.severity)},
         status='OPEN',
         trigger_time=${sqlString(now)},
         resolved_time=NULL,
         trigger_source=${sqlNullableString(input.triggerSource)},
         owner=${sqlNullableString(input.owner)},
         latest_note=${sqlNullableString(input.latestNote)},
         video_id=${sqlNullableString(videoId)},
         updated_at=${sqlString(now)}
     WHERE risk_code=${sqlString(input.riskCode)}
       AND scope_key=${sqlString(scopeKey)};`,
    `INSERT INTO risk_events (
       id,
       risk_code,
       scope_key,
       severity,
       status,
       trigger_time,
       resolved_time,
       trigger_source,
       owner,
       latest_note,
       video_id,
       created_at,
       updated_at
     )
     SELECT
       ${sqlString(uuidv7())},
       ${sqlString(input.riskCode)},
       ${sqlString(scopeKey)},
       ${sqlString(input.severity)},
       'OPEN',
       ${sqlString(now)},
       NULL,
       ${sqlNullableString(input.triggerSource)},
       ${sqlNullableString(input.owner)},
       ${sqlNullableString(input.latestNote)},
       ${sqlNullableString(videoId)},
       ${sqlString(now)},
       ${sqlString(now)}
     WHERE NOT EXISTS (
       SELECT 1
       FROM risk_events
       WHERE risk_code=${sqlString(input.riskCode)}
         AND scope_key=${sqlString(scopeKey)}
     );`
  ]);
}

export async function resolveRiskEvent(input: ResolveRiskEventInput): Promise<void> {
  const now = new Date().toISOString();
  const scopeKey = scopeKeyOf(input.videoId);

  await executeMany([
    `UPDATE risk_events
     SET status='RESOLVED',
         resolved_time=${sqlString(now)},
         trigger_source=COALESCE(${sqlNullableString(input.triggerSource)}, trigger_source),
         latest_note=COALESCE(${sqlNullableString(input.latestNote)}, latest_note),
         updated_at=${sqlString(now)}
     WHERE risk_code=${sqlString(input.riskCode)}
       AND scope_key=${sqlString(scopeKey)};`
  ]);
}
