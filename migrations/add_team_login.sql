-- Migration: チームID＋パスワードで「メンバー」もログイン・記録できるようにする
-- 目的: オーナー（決済者）以外の保護者が、個人のGoogle/メールを共有せずに
--       「チームID + チーム用パスワード」で記録係になれるようにする。
-- 仕組み: メンバーは Supabase の匿名ログインで auth.uid() を得る → team_members に登録 →
--         RLS を「オーナー OR メンバー」に広げて既存の書き込みをそのまま通す。
-- 事前に: Supabase Authentication → Anonymous sign-ins を ON にしておくこと。
-- Supabase SQL Editor で一度だけ実行してください。

-- ============================================
-- 1) チーム用ログイン資格情報（パスワードハッシュ）
--    ※ teams は public_read(SELECT true) のためハッシュを teams に置くと漏れる。別テーブルに分離。
-- ============================================
CREATE TABLE IF NOT EXISTS team_credentials (
  team_id       uuid PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
  login_code    text UNIQUE NOT NULL,          -- 人が打てる短いID（例: ABCD-2481）。オーナーがLINEで配る
  password_hash text NOT NULL,                 -- bcrypt。存在すればチームログイン有効
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_credentials ENABLE ROW LEVEL SECURITY;

-- オーナーのみ自チームの資格情報を参照・変更できる（login_code の表示用）。
-- パスワード照合はサーバのサービスロール（RLSバイパス）で行うため、メンバー/匿名は一切読めない。
DROP POLICY IF EXISTS "team_credentials_owner" ON team_credentials;
CREATE POLICY "team_credentials_owner" ON team_credentials FOR ALL
  USING (EXISTS (SELECT 1 FROM teams t WHERE t.id = team_credentials.team_id AND t.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM teams t WHERE t.id = team_credentials.team_id AND t.user_id = auth.uid()));

-- ============================================
-- 2) チームメンバー（匿名ユーザー含む）
-- ============================================
CREATE TABLE IF NOT EXISTS team_members (
  team_id    uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, user_id)
);

ALTER TABLE team_members ENABLE ROW LEVEL SECURITY;

-- 本人は自分のメンバー行を読める（参加チームの解決に使う）／オーナーは自チームのメンバーを読める（一覧UI）。
DROP POLICY IF EXISTS "team_members_read" ON team_members;
CREATE POLICY "team_members_read" ON team_members FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.user_id = auth.uid())
  );

-- オーナーはメンバーを解除（削除）できる。INSERT はサーバのサービスロール経由のみ（RLSに許可を作らない）。
DROP POLICY IF EXISTS "team_members_owner_delete" ON team_members;
CREATE POLICY "team_members_owner_delete" ON team_members FOR DELETE
  USING (EXISTS (SELECT 1 FROM teams t WHERE t.id = team_members.team_id AND t.user_id = auth.uid()));

-- ============================================
-- 3) 書き込みRLSを「オーナー OR メンバー」に拡張
--    （teams テーブルの UPDATE はオーナー専用のまま＝rename/category/資格情報を保護）
-- ============================================

-- players
DROP POLICY IF EXISTS "players_owner" ON players;
DROP POLICY IF EXISTS "players_rw" ON players;
CREATE POLICY "players_rw" ON players FOR ALL
  USING (EXISTS (
    SELECT 1 FROM teams t WHERE t.id = players.team_id AND (
      t.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
    )))
  WITH CHECK (EXISTS (
    SELECT 1 FROM teams t WHERE t.id = players.team_id AND (
      t.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
    )));

-- games
DROP POLICY IF EXISTS "games_owner" ON games;
DROP POLICY IF EXISTS "games_rw" ON games;
CREATE POLICY "games_rw" ON games FOR ALL
  USING (EXISTS (
    SELECT 1 FROM teams t WHERE t.id = games.team_id AND (
      t.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
    )))
  WITH CHECK (EXISTS (
    SELECT 1 FROM teams t WHERE t.id = games.team_id AND (
      t.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
    )));

-- player_stats（games 経由で team に到達）
DROP POLICY IF EXISTS "stats_owner" ON player_stats;
DROP POLICY IF EXISTS "stats_rw" ON player_stats;
CREATE POLICY "stats_rw" ON player_stats FOR ALL
  USING (EXISTS (
    SELECT 1 FROM games g JOIN teams t ON t.id = g.team_id
    WHERE g.id = player_stats.game_id AND (
      t.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
    )))
  WITH CHECK (EXISTS (
    SELECT 1 FROM games g JOIN teams t ON t.id = g.team_id
    WHERE g.id = player_stats.game_id AND (
      t.user_id = auth.uid()
      OR EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t.id AND m.user_id = auth.uid())
    )));

-- ============================================
-- 4) 無料枠ゲートを「チームのオーナー基準」で判定する関数
--    メンバーはオーナーの game_finish_counters / subscriptions を直接読めないため、
--    SECURITY DEFINER 関数越しに boolean だけ受け取る。
--    判定: オーナーが active サブスク OR free_access登録 OR 終了累計 < 3(FREE_GAMES_LIMIT)
-- ============================================
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

  -- free_access（email 一致）
  SELECT u.email INTO owner_mail FROM auth.users u WHERE u.id = owner_id;
  IF owner_mail IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM free_access f WHERE lower(f.email) = lower(owner_mail)
    ) INTO is_free;
    IF is_free THEN
      RETURN true;
    END IF;
  END IF;

  -- 無料枠（終了累計 < 3）
  SELECT COALESCE(c.finished_total, 0) INTO finished
  FROM game_finish_counters c WHERE c.user_id = owner_id;
  RETURN COALESCE(finished, 0) < 3;
EXCEPTION WHEN undefined_table THEN
  -- free_access / counters 未作成環境では従来どおり許可側に倒す
  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION team_can_play(uuid) FROM public;
GRANT EXECUTE ON FUNCTION team_can_play(uuid) TO anon, authenticated;
