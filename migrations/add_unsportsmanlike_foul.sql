-- Migration: アンスポーツマンライクファウル（U）列を追加
-- 目的: JBA/FIBAの退場規則「アンスポ2回」「テクニカル1+アンスポ1」を判定できるようにする。
--       Uは個人ファウル合計（5で退場）にも算入される。
-- 既存行は 0。Supabase SQL Editor で一度だけ実行してください（デプロイ前に必須）。

ALTER TABLE player_stats
  ADD COLUMN IF NOT EXISTS fouls_unsportsmanlike INTEGER NOT NULL DEFAULT 0;
