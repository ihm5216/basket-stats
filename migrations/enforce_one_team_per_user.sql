-- Migration: 1アカウントにつき1チームまで（新規作成を制限）。
--
-- 目的: 1つの有料アカウントで複数チームを使い放題にする課金の抜け道を塞ぐ。
--       「チーム数に応じた課金」ではなく「1アカウント=1チーム」の方針。
--
-- 挙動: 新規の team INSERT 時、その user_id が既に1つでもチームを持っていれば拒否。
--       ※ BEFORE INSERT なので既存データは対象外（既に複数持っている人はそのまま維持され、
--         3つ目以降の新規作成のみブロック）。
--       ※ 新規サインアップ時の自動チーム作成（handle_new_user）は、その時点で保有0のため通る。
--
-- Supabase SQL Editor で一度だけ実行してください。

CREATE OR REPLACE FUNCTION enforce_one_team_per_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER          -- RLSをバイパスして、その人の全チームを確実に数える
SET search_path = public
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM teams WHERE user_id = NEW.user_id) THEN
    RAISE EXCEPTION '1アカウントにつき1チームまでです（別のチームは別アカウントでご登録ください）'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_one_team_per_user ON teams;
CREATE TRIGGER trg_one_team_per_user
  BEFORE INSERT ON teams
  FOR EACH ROW EXECUTE FUNCTION enforce_one_team_per_user();
