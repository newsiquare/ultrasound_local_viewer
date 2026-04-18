-- Phase A: Annotation schema upgrade
-- Adds multi-type geometry support (BBOX / POLYGON / TEXT) per the annotation-system spec.

ALTER TABLE annotations ADD COLUMN annotation_type TEXT NOT NULL DEFAULT 'BBOX';
ALTER TABLE annotations ADD COLUMN geometry_json   TEXT;
ALTER TABLE annotations ADD COLUMN text_content    TEXT;
ALTER TABLE annotations ADD COLUMN is_visible      INTEGER NOT NULL DEFAULT 1;

-- Migrate existing bbox_json rows → geometry_json (BBOX format)
-- json_object is available in SQLite 3.38+ which ships with macOS Ventura+
UPDATE annotations
SET geometry_json = json_object(
  'type',   'bbox',
  'x',      CAST(json_extract(bbox_json, '$.x')      AS REAL),
  'y',      CAST(json_extract(bbox_json, '$.y')      AS REAL),
  'width',  CAST(json_extract(bbox_json, '$.width')  AS REAL),
  'height', CAST(json_extract(bbox_json, '$.height') AS REAL)
)
WHERE geometry_json IS NULL
  AND bbox_json IS NOT NULL
  AND bbox_json != '';
