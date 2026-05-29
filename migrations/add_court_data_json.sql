-- Migration: Add court_data_json column to games table
-- Stores player quarter participation, substitution records, and opponent foul data
-- for cross-device sync (e.g. LINE sharing)
-- Run this in Supabase SQL Editor

ALTER TABLE games ADD COLUMN IF NOT EXISTS court_data_json JSONB;
