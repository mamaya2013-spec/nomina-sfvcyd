-- Migration: Many-to-many relationship for responsibles, subsecretaries and areas
-- Adds subsecretarias_ids and areas_ids array columns to public.responsables table

ALTER TABLE public.responsables ADD COLUMN IF NOT EXISTS subsecretarias_ids UUID[] DEFAULT '{}';
ALTER TABLE public.responsables ADD COLUMN IF NOT EXISTS areas_ids UUID[] DEFAULT '{}';

-- Migrate existing subsecretaria_id to subsecretarias_ids array
UPDATE public.responsables 
SET subsecretarias_ids = ARRAY[subsecretaria_id] 
WHERE subsecretaria_id IS NOT NULL AND (subsecretarias_ids IS NULL OR cardinality(subsecretarias_ids) = 0);

-- Migrate existing area_id to areas_ids array
UPDATE public.responsables 
SET areas_ids = ARRAY[area_id] 
WHERE area_id IS NOT NULL AND (areas_ids IS NULL OR cardinality(areas_ids) = 0);
