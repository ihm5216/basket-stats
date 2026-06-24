-- Migration: チーム種別（一般 / ミニバス）
-- 目的: ミニバス(U12)はタイムアウトが「各クォーター1回」、公式スコアシートのTO欄もクォーター別。
--       チーム単位で種別を持ち、タイムアウトのルール・表示を出し分ける。
-- 既存チームは全て 'general'（一般）として扱う。
-- Supabase SQL Editor で一度だけ実行してください。

ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT 'general'
  CHECK (category IN ('general', 'mini'));
