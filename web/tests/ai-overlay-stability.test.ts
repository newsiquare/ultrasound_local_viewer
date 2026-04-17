import assert from "node:assert/strict";
import test from "node:test";

import {
  AiOverlayDetection,
  createOverlayStore,
  resolveDetectionsForFrame
} from "../src/client/ai-overlay-stability";

function makeDetection(input: Partial<AiOverlayDetection> & { id: number; frameIndex: number }): AiOverlayDetection {
  const trackId = Object.prototype.hasOwnProperty.call(input, "trackId") ? (input.trackId ?? null) : 1;

  return {
    id: input.id,
    frameIndex: input.frameIndex,
    x: input.x ?? 100,
    y: input.y ?? 50,
    width: input.width ?? 120,
    height: input.height ?? 80,
    score: input.score ?? 0.9,
    trackId,
    categoryName: input.categoryName ?? "obj"
  };
}

test("returns exact detections on exact frame", () => {
  const store = createOverlayStore([
    makeDetection({ id: 1, frameIndex: 10, trackId: 1 })
  ]);

  const resolved = resolveDetectionsForFrame(store, 10);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].id, 1);
  assert.equal(resolved[0].frameIndex, 10);
});

test("interpolates detections between sparse track frames", () => {
  const store = createOverlayStore([
    makeDetection({ id: 1, frameIndex: 10, x: 0, y: 0, width: 100, height: 60, score: 0.8, trackId: 3 }),
    makeDetection({ id: 2, frameIndex: 13, x: 30, y: 15, width: 130, height: 75, score: 0.5, trackId: 3 })
  ]);

  const resolved = resolveDetectionsForFrame(store, 11);
  assert.equal(resolved.length, 1);
  assert.equal(resolved[0].trackId, 3);
  assert.equal(resolved[0].frameIndex, 11);

  assert.ok(Math.abs(resolved[0].x - 10) < 1e-6);
  assert.ok(Math.abs(resolved[0].y - 5) < 1e-6);
  assert.ok(Math.abs(resolved[0].width - 110) < 1e-6);
  assert.ok(Math.abs(resolved[0].height - 65) < 1e-6);
  assert.ok(Math.abs(resolved[0].score - 0.7) < 1e-6);
});

test("carry-forward keeps box for a short gap near latest frame", () => {
  const store = createOverlayStore([
    makeDetection({ id: 1, frameIndex: 20, trackId: 9 })
  ]);

  const frame21 = resolveDetectionsForFrame(store, 21);
  const frame22 = resolveDetectionsForFrame(store, 22);
  const frame23 = resolveDetectionsForFrame(store, 23);

  assert.equal(frame21.length, 1);
  assert.equal(frame22.length, 1);
  assert.equal(frame23.length, 0);
});

test("does not interpolate when gap is larger than threshold", () => {
  const store = createOverlayStore([
    makeDetection({ id: 1, frameIndex: 10, x: 0, trackId: 5 }),
    makeDetection({ id: 2, frameIndex: 25, x: 100, trackId: 5 })
  ]);

  const frame12 = resolveDetectionsForFrame(store, 12);
  const frame20 = resolveDetectionsForFrame(store, 20);

  // frame12 is still covered by short carry-forward from frame10.
  assert.equal(frame12.length, 1);
  // frame20 should not be interpolated across a too-large sparse gap.
  assert.equal(frame20.length, 0);
});

test("fallback works for legacy detections without track id", () => {
  const store = createOverlayStore([
    makeDetection({ id: 1, frameIndex: 30, trackId: null }),
    makeDetection({ id: 2, frameIndex: 30, trackId: null })
  ]);

  const frame31 = resolveDetectionsForFrame(store, 31);
  const frame32 = resolveDetectionsForFrame(store, 32);

  assert.equal(frame31.length, 2);
  assert.equal(frame32.length, 0);
});

test("coverage regression: sparse track still provides boxes on every playback frame", () => {
  const store = createOverlayStore([
    makeDetection({ id: 1, frameIndex: 100, x: 0, trackId: 1 }),
    makeDetection({ id: 2, frameIndex: 103, x: 30, trackId: 1 }),
    makeDetection({ id: 3, frameIndex: 106, x: 60, trackId: 1 })
  ]);

  for (let frame = 100; frame <= 106; frame += 1) {
    const resolved = resolveDetectionsForFrame(store, frame);
    assert.ok(
      resolved.length > 0,
      `expected frame ${frame} to have at least one raw/interpolated detection`
    );
  }
});
