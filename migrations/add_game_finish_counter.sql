-- Migration: 試合終了の「累計回数」カウンター
-- 目的: 無料枠の判定を「現在の終了済み試合数」ではなく「累計の終了回数」で行い、
--       終了済み試合を削除して無料枠をリセットする抜け道を塞ぐ。
-- 仕組み: games が「未終了→終了」に変わった瞬間にDBトリガーで +1（削除では減らない）。
-- Supabase SQL Editor で一度だけ実行してください。

-- 1) 累計カウンターテーブル
CREATE TABLE IF NOT EXISTS game_finish_counters (
  user_id        uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  finished_total integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE game_finish_counters ENABLE ROW LEVEL SECURITY;

-- 本人は自分のカウンターを「読む」だけ。書き込みはトリガー（SECURITY DEFINER）専用。
DROP POLICY IF EXISTS "read own finish counter" ON game_finish_counters;
CREATE POLICY "read own finish counter" ON game_finish_counters
  FOR SELECT USING (auth.uid() = user_id);

-- 2) 既存ユーザーのbackfill（現在の終了済み試合数を初期値にする＝今までの利用分を引き継ぐ）
INSERT INTO game_finish_counters (user_id, finished_total)
SELECT t.user_id, count(*)
FROM games g
JOIN teams t ON t.id = g.team_id
WHERE g.is_finished = true
GROUP BY t.user_id
ON CONFLICT (user_id) DO UPDATE SET finished_total = EXCLUDED.finished_total;

-- 3) 試合が「未終了→終了」になった/終了状態で新規作成された時に +1（減算は一切しない）
CREATE OR REPLACE FUNCTION bump_finish_counter()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid;
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.is_finished = true)
     OR (TG_OP = 'UPDATE' AND NEW.is_finished = true AND COALESCE(OLD.is_finished, false) = false) THEN
    SELECT user_id INTO uid FROM teams WHERE id = NEW.team_id;
    IF uid IS NOT NULL THEN
      INSERT INTO game_finish_counters (user_id, finished_total, updated_at)
      VALUES (uid, 1, now())
      ON CONFLICT (user_id) DO UPDATE
        SET finished_total = game_finish_counters.finished_total + 1,
            updated_at = now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_bump_finish_counter ON games;
CREATE TRIGGER trg_bump_finish_counter
  AFTER INSERT OR UPDATE OF is_finished ON games
  FOR EACH ROW EXECUTE FUNCTION bump_finish_counter();
