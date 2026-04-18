-- Phase 6: Category stroke style
-- Adds per-category stroke width and stroke color overrides.
-- stroke_color NULL means "follow category.color".

ALTER TABLE categories ADD COLUMN stroke_width REAL NOT NULL DEFAULT 2.0;
ALTER TABLE categories ADD COLUMN stroke_color TEXT;
