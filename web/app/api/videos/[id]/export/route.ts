import { NextRequest, NextResponse } from "next/server";

import { HttpError } from "@/server/errors";
import { asErrorResponse } from "@/server/route-error";
import { readTimeline } from "@/server/video-files";
import { getCategoriesByVideoId, getVideoById, listAnnotations } from "@/server/video-repository";
import { assertUuidV7 } from "@/server/validators";

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

type ExportFormat = "coco" | "coco-manual" | "yolo";

// Fetch ALL annotations (unpaginated) for a given video + optional source filter.
async function fetchAllAnnotations(
  videoId: string,
  source: "MANUAL" | "AI" | null
) {
  const allItems: Awaited<ReturnType<typeof listAnnotations>>["items"] = [];
  let cursor: number = 0;
  let hasMore = true;

  do {
    const page = await listAnnotations(videoId, {
      source: source ?? undefined,
      cursor,
      limit: 500
    });
    allItems.push(...page.items);
    if (page.nextCursor === null) {
      hasMore = false;
    } else {
      cursor = page.nextCursor;
    }
  } while (hasMore);

  return allItems;
}

export async function GET(req: NextRequest, context: RouteContext): Promise<NextResponse> {
  try {
    const { id } = await context.params;
    assertUuidV7(id);

    const video = await getVideoById(id);
    if (!video) {
      throw new HttpError(404, "NOT_FOUND", "Video not found.", { videoId: id });
    }

    const { searchParams } = new URL(req.url);
    const rawFormat = searchParams.get("format") ?? "coco";
    if (rawFormat !== "coco" && rawFormat !== "coco-manual" && rawFormat !== "yolo") {
      throw new HttpError(400, "BAD_REQUEST", "Invalid format. Use coco, coco-manual, or yolo.");
    }
    const format = rawFormat as ExportFormat;

    const isManualOnly = format === "coco-manual" || format === "yolo";
    const sourceFilter: "MANUAL" | null = isManualOnly ? "MANUAL" : null;

    const [categories, annotations, timeline] = await Promise.all([
      getCategoriesByVideoId(id),
      fetchAllAnnotations(id, sourceFilter),
      readTimeline(id)
    ]);

    const videoWidth = video.video_width ?? 640;
    const videoHeight = video.video_height ?? 360;

    // Build UUID → integer ID maps
    const categoryIndexMap = new Map<string, number>();
    const categorySourceMap = new Map<string, string>();
    categories.forEach((cat, i) => {
      categoryIndexMap.set(cat.id, i + 1);
      categorySourceMap.set(cat.id, cat.source);
    });

    // Build frame UUID → {displayIndex, ptsUs} map from timeline
    const frameInfoMap = new Map<string, { displayIndex: number; ptsUs: number }>();
    for (const frame of timeline.frames) {
      frameInfoMap.set(frame.frameId, {
        displayIndex: frame.displayIndex,
        ptsUs: frame.ptsUs
      });
    }

    if (format === "coco" || format === "coco-manual") {
      // Collect unique frame IDs that have annotations, sorted by displayIndex
      const uniqueFrameIds = [...new Set(annotations.map(a => a.frame_id))];
      uniqueFrameIds.sort((a, b) => {
        const ia = frameInfoMap.get(a)?.displayIndex ?? 0;
        const ib = frameInfoMap.get(b)?.displayIndex ?? 0;
        return ia - ib;
      });

      // Assign 1-based integer IDs to each frame
      const frameIdToImageId = new Map<string, number>();
      uniqueFrameIds.forEach((frameId, i) => frameIdToImageId.set(frameId, i + 1));

      const cocoImages = uniqueFrameIds.map((frameId, i) => {
        const info = frameInfoMap.get(frameId);
        const displayIndex = info?.displayIndex ?? 0;
        const ptsUs = info?.ptsUs ?? 0;
        const paddedIndex = String(displayIndex).padStart(6, "0");
        return {
          id: i + 1,
          file_name: `f_${paddedIndex}.jpg`,
          width: videoWidth,
          height: videoHeight,
          frame_index: displayIndex,
          pts_us: ptsUs
        };
      });

      const cocoAnnotations: Array<{
        id: number;
        image_id: number;
        category_id: number;
        bbox: [number, number, number, number];
        area: number;
        iscrowd: 0;
        annotation_type: string;
        segmentation: number[][];
        source: string;
      }> = [];

      let annId = 1;
      for (const ann of annotations) {
        const imageId = frameIdToImageId.get(ann.frame_id);
        const catIntId = categoryIndexMap.get(ann.category_id);
        if (imageId === undefined || catIntId === undefined) continue;

        // Parse geometry_json which always contains the full shape data.
        // geometry_json format:
        //   BBOX:    { type:"bbox", x, y, width, height }
        //   POLYGON: { type:"polygon", points:[{x,y},...] }
        let geomParsed: Record<string, unknown> = {};
        try {
          if (ann.geometry_json) geomParsed = JSON.parse(ann.geometry_json) as Record<string, unknown>;
        } catch { /* ignore */ }

        let bbox: [number, number, number, number] = [0, 0, 0, 0];
        const annType = ann.annotation_type.toUpperCase();

        if (annType === "BBOX") {
          const bx = Number(geomParsed.x ?? 0);
          const by = Number(geomParsed.y ?? 0);
          const bw = Number(geomParsed.width ?? 0);
          const bh = Number(geomParsed.height ?? 0);
          bbox = [bx, by, bw, bh];
        } else if (annType === "POLYGON") {
          // Compute bounding box from polygon points
          const pts = geomParsed.points as Array<{ x: number; y: number }> | undefined;
          if (pts && pts.length > 0) {
            const xs = pts.map(p => p.x);
            const ys = pts.map(p => p.y);
            const minX = Math.min(...xs);
            const minY = Math.min(...ys);
            const maxX = Math.max(...xs);
            const maxY = Math.max(...ys);
            bbox = [minX, minY, maxX - minX, maxY - minY];
          }
        }

        const [bx, by, bw, bh] = bbox;
        const area = bw * bh;

        const segmentation: number[][] = [];
        if (annType === "POLYGON") {
          const pts = geomParsed.points as Array<{ x: number; y: number }> | undefined;
          if (pts && pts.length > 0) {
            segmentation.push(pts.flatMap(p => [p.x, p.y]));
          }
        }

        cocoAnnotations.push({
          id: annId++,
          image_id: imageId,
          category_id: catIntId,
          bbox,
          area,
          iscrowd: 0,
          annotation_type: ann.annotation_type,
          segmentation,
          source: categorySourceMap.get(ann.category_id) ?? "MANUAL"
        });
      }

      const cocoCategories = categories.map((cat, i) => ({
        id: i + 1,
        name: cat.name,
        supercategory: "object"
      }));

      const cocoJson = {
        info: {
          description: `Export from video ${video.filename}`,
          video_id: id,
          format,
          exported_at: new Date().toISOString()
        },
        images: cocoImages,
        annotations: cocoAnnotations,
        categories: cocoCategories
      };

      const safeName = video.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const suffix = format === "coco-manual" ? "coco-manual" : "coco";
      const filename = `${safeName}-${suffix}.json`;

      return new NextResponse(JSON.stringify(cocoJson, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`
        }
      });
    }

    // YOLO format — bbox only, MANUAL source, normalized coordinates
    const categoryNames = categories.map(cat => cat.name);

    // Build per-frame YOLO lines
    const frameLines = new Map<string, string[]>();

    for (const ann of annotations) {
      if (ann.annotation_type.toUpperCase() !== "BBOX") continue;
      const catIntId = categoryIndexMap.get(ann.category_id);
      if (catIntId === undefined) continue;

      let geomParsed: Record<string, unknown> = {};
      try {
        if (ann.geometry_json) geomParsed = JSON.parse(ann.geometry_json) as Record<string, unknown>;
      } catch {
        continue;
      }

      const bx = Number(geomParsed.x ?? 0);
      const by = Number(geomParsed.y ?? 0);
      const bw = Number(geomParsed.width ?? 0);
      const bh = Number(geomParsed.height ?? 0);
      if (bw <= 0 || bh <= 0) continue;

      const [bx2, by2, bw2, bh2] = [bx, by, bw, bh];
      // YOLO uses 0-based class index
      const classIdx = catIntId - 1;
      const xCenter = ((bx2 + bw2 / 2) / videoWidth).toFixed(6);
      const yCenter = ((by2 + bh2 / 2) / videoHeight).toFixed(6);
      const wNorm = (bw2 / videoWidth).toFixed(6);
      const hNorm = (bh2 / videoHeight).toFixed(6);

      if (!frameLines.has(ann.frame_id)) {
        frameLines.set(ann.frame_id, []);
      }
      frameLines.get(ann.frame_id)!.push(`${classIdx} ${xCenter} ${yCenter} ${wNorm} ${hNorm}`);
    }

    // Sort frames by displayIndex
    const sortedFrames = [...frameLines.entries()].sort((a, b) => {
      const ia = frameInfoMap.get(a[0])?.displayIndex ?? 0;
      const ib = frameInfoMap.get(b[0])?.displayIndex ?? 0;
      return ia - ib;
    });

    // Build YOLO text output
    const lines: string[] = [
      `# YOLO export from video: ${video.filename}`,
      `# Exported at: ${new Date().toISOString()}`,
      `# Video dimensions: ${videoWidth}x${videoHeight}`,
      `# Format: <class_id> <x_center> <y_center> <width> <height> (normalized 0-1)`,
      `#`,
      `# Categories (class_id: name):`,
      ...categoryNames.map((name, i) => `#   ${i}: ${name}`),
      ``
    ];

    for (const [frameId, annLines] of sortedFrames) {
      const info = frameInfoMap.get(frameId);
      const displayIndex = info?.displayIndex ?? 0;
      const paddedIndex = String(displayIndex).padStart(6, "0");
      lines.push(`# --- f_${paddedIndex}.jpg (frame_id: ${frameId}) ---`);
      lines.push(...annLines);
      lines.push(``);
    }

    const safeName = video.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filename = `${safeName}-yolo.txt`;

    return new NextResponse(lines.join("\n"), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (e) {
    return asErrorResponse(req, e);
  }
}
