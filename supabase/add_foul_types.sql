-- Add new foul type columns to player_stats table
-- Run this in Supabase SQL Editor

ALTER TABLE public.player_stats
ADD COLUMN IF NOT EXISTS fouls_plain integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fouls_1ft integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fouls_2ft integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS fouls_3ft integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS technical_fouls integer DEFAULT 0;
