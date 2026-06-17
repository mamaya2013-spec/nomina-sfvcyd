-- Migration: Add solicitado_por column to movimientos table
ALTER TABLE public.movimientos ADD COLUMN IF NOT EXISTS solicitado_por TEXT;
