import { NextRequest, NextResponse } from "next/server";

import { aiStatusBus, AiStreamEventType, AiStreamPayload } from "@/server/ai-status-bus";
import { readAiStatusSnapshot } from "@/server/ai-status";
import { asErrorResponse } from "@/server/route-error";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

function sseMessage(type: AiStreamEventType, id: number, payload: AiStreamPayload): string {
  return `event: ${type}\nid: ${id}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id: videoId } = await context.params;
    assertUuidV7(videoId);

    const encoder = new TextEncoder();
    const snapshot = await readAiStatusSnapshot(videoId);

    let eventId = Number.parseInt(req.headers.get("last-event-id") ?? "0", 10);
    if (!Number.isFinite(eventId) || eventId < 0) {
      eventId = 0;
    }

    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        let closed = false;

        const emit = (type: AiStreamEventType, payload: AiStreamPayload) => {
          if (closed) {
            return;
          }
          eventId += 1;
          controller.enqueue(encoder.encode(sseMessage(type, eventId, payload)));
        };

        emit("status", snapshot);

        const unsub = aiStatusBus.subscribe(videoId, (event) => {
          if (closed) {
            return;
          }
          controller.enqueue(encoder.encode(sseMessage(event.type, event.id, event.payload)));
        });

        const heartbeat = setInterval(() => {
          if (closed) {
            return;
          }
          controller.enqueue(encoder.encode(`: keepalive ${new Date().toISOString()}\n\n`));
        }, 20000);

        const onAbort = () => {
          if (closed) {
            return;
          }
          closed = true;
          clearInterval(heartbeat);
          unsub();
          controller.close();
        };

        req.signal.addEventListener("abort", onAbort, { once: true });
      }
    });

    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no"
      }
    });
  } catch (err) {
    return asErrorResponse(req, err);
  }
}
