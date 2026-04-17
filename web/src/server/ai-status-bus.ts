export type AiJobStatus = "IDLE" | "PROCESSING" | "DONE" | "FAILED" | "CANCELED";

export type AiStreamEventType =
  | "status"
  | "progress"
  | "done"
  | "failed"
  | "canceled"
  | "keepalive";

export interface AiStreamPayload {
  videoId: string;
  status?: AiJobStatus;
  progress?: number;
  updatedAt: string;
  errorMessage?: string | null;
}

export interface AiStreamEvent {
  id: number;
  type: AiStreamEventType;
  payload: AiStreamPayload;
}

type Listener = (event: AiStreamEvent) => void;

class AiStatusBus {
  private nextId = 1;
  private listenersByVideo = new Map<string, Set<Listener>>();

  subscribe(videoId: string, listener: Listener): () => void {
    const set = this.listenersByVideo.get(videoId) ?? new Set<Listener>();
    set.add(listener);
    this.listenersByVideo.set(videoId, set);

    return () => {
      const target = this.listenersByVideo.get(videoId);
      if (!target) {
        return;
      }
      target.delete(listener);
      if (target.size === 0) {
        this.listenersByVideo.delete(videoId);
      }
    };
  }

  publish(videoId: string, type: AiStreamEventType, payload: AiStreamPayload): AiStreamEvent {
    const event: AiStreamEvent = {
      id: this.nextId,
      type,
      payload
    };
    this.nextId += 1;

    const listeners = this.listenersByVideo.get(videoId);
    if (listeners) {
      for (const listener of listeners) {
        listener(event);
      }
    }

    return event;
  }
}

export const aiStatusBus = new AiStatusBus();
