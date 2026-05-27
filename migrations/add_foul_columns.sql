-- Migration: Add foul type columns to player_stats table
-- This migration adds support for recording different types of fouls with associated free throws
-- Run this in Supabase SQL Editor

ALTER TABLE player_stats
ADD COLUMN fouls_plain INTEGER NOT NULL DEFAULT 0,
ADD COLUMN fouls_1ft INTEGER NOT NULL DEFAULT 0,
ADD COLUMN fouls_2ft INTEGER NOT NULL DEFAULT 0,
ADD COLUMN fouls_3ft INTEGER NOT NULL DEFAULT 0,
ADD COLUMN technical_fouls INTEGER NOT NULL DEFAULT 0;
