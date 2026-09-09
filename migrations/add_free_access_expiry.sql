-- Migration: free_access に有効期限（expires_at）を追加
--
-- 目的: 「1年間だけ無料」のような期限つき招待を、手動削除に頼らず自動で失効させる。
--
-- 設計:
--   expires_at IS NULL  → 無期限（従来どおり。オーナー本人などはこちら）
--   expires_at > now()  → 有効
--   expires_at <= now() → 失効（行は残るが無料判定に効かなくなる）
--
-- 判定は2経路あるので両方を直す必要がある:
--   ①オーナー本人 … hasFreeAccess() が free_access を SELECT（RLSポリシーで絞る）
--   ②チームメンバー … team_can_play() が SECURITY DEFINER で直接読む（RLSを迂回するので個別対応）
--
-- アプリ側のTypeScriptは変更不要（失効行はRLSで見えなくなり、hasFreeAccess が false を返す）。
--
-- Supabase SQL Editor で一度だけ実行してください。

-- ── 1) 列の追加（既存行は NULL＝無期限のまま） ──
ALTER TABLE free_access ADD COLUMN IF NOT EXISTS expires_at timestamptz;

COMMENT ON COLUMN free_access.expires_at IS 'NULL＝無期限。日時を入れるとその時刻に自動失効する。';

-- ── 2) RLSポリシーを「未失効の自分の行だけ見える」に更新 ──
DROP POLICY IF EXISTS "Users can check own free access" ON free_access;
CREATE POLICY "Users can check own free access"
  ON free_access FOR SELECT
  USING (
    lower(email) = lower(auth.jwt() ->> 'email')
    AND (expires_at IS NULL OR expires_at > now())
  );

-- ── 3) team_can_play も同じ条件で判定するように更新 ──
--     （free_access の EXISTS に期限チェックを追加。他のロジックは既存のまま）
CREATE OR REPLACE FUNCTION team_can_play(t_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  owner_id  uuid;
  owner_mail text;
  is_active boolean := false;
  is_free   boolean := false;
  finished  integer := 0;
BEGIN
  SELECT t.user_id INTO owner_id FROM teams t WHERE t.id = t_id;
  IF owner_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT (s.status = 'active') INTO is_active
  FROM subscriptions s WHERE s.user_id = owner_id;
  IF is_active THEN
    RETURN true;
  END IF;

  -- free_access（email 一致 かつ 未失効）
  SELECT u.email INTO owner_mail FROM auth.users u WHERE u.id = owner_id;
  IF owner_mail IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM free_access f
      WHERE lower(f.email) = lower(owner_mail)
        AND (f.expires_at IS NULL OR f.expires_at > now())
    ) INTO is_free;
    IF is_free THEN
      RETURN true;
    END IF;
  END IF;

  -- 無料枠（終了累計 < 3）
  SELECT COALESCE(c.finished_total, 0) INTO finished
  FROM game_finish_counters c WHERE c.user_id = owner_id;
  RETURN COALESCE(finished, 0) < 3;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  -- free_access / counters / expires_at が未作成の環境では従来どおり許可側に倒す
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION team_can_play(uuid) FROM public;
GRANT EXECUTE ON FUNCTION team_can_play(uuid) TO anon, authenticated;

-- ── 4) 東希望が丘（ヒアリングのお礼）を1年間無料で登録 ──
--     メールは auth.users から自動で引くので、手で貼り付ける必要はない。
INSERT INTO free_access (email, note, expires_at)
SELECT lower(u.email),
       '東希望が丘（ヒアリングのお礼・1年間）',
       now() + interval '1 year'
FROM auth.users u
WHERE u.id = '1c0ec217-04ba-48c4-91c8-51c585b03aa8'
  AND u.email IS NOT NULL
ON CONFLICT (email) DO UPDATE
  SET expires_at = EXCLUDED.expires_at,
      note       = EXCLUDED.note;

-- ── 5) 確認（実行結果に1行出れば成功。有効期限が1年後になっているか見る） ──
SELECT note,
       expires_at,
       (expires_at IS NULL OR expires_at > now()) AS 現在有効
FROM free_access
ORDER BY created_at;
