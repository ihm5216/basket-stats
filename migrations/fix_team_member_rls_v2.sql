-- Fix v2: RLSの無限再帰（teams ⇄ team_members が相互参照）を解消する。
--
-- 問題: teams_member_read が team_members を参照し、team_members_read が teams を参照するため、
--       ポリシー評価が互いを呼び合って "infinite recursion detected in policy" になる。
--
-- 解決: メンバー/オーナー判定を SECURITY DEFINER 関数に切り出す。
--       SECURITY DEFINER はRLSをバイパスして実行されるため、関数内のサブクエリが
--       ポリシー評価を再帰的に呼び出さず、ループが断ち切られる。
--
-- Supabase SQL Editor で一度だけ実行してください。

-- ── 判定用ヘルパー（RLSをバイパス。auth.uid() は呼び出し元のまま）──
CREATE OR REPLACE FUNCTION is_owner_of(t_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM teams t WHERE t.id = t_id AND t.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION is_member_of(t_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM team_members m WHERE m.team_id = t_id AND m.user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION can_access_game(g_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM games g
    WHERE g.id = g_id AND (is_owner_of(g.team_id) OR is_member_of(g.team_id))
  );
$$;

REVOKE ALL ON FUNCTION is_owner_of(uuid), is_member_of(uuid), can_access_game(uuid) FROM public;
GRANT EXECUTE ON FUNCTION is_owner_of(uuid), is_member_of(uuid), can_access_game(uuid) TO anon, authenticated;

-- ── teams: メンバーは参加チームを読める（関数経由で再帰回避）──
DROP POLICY IF EXISTS "teams_member_read" ON teams;
CREATE POLICY "teams_member_read" ON teams FOR SELECT
  USING (is_member_of(teams.id));

-- ── team_members: 本人は自分の行 / オーナーは自チーム分（関数経由で再帰回避）──
DROP POLICY IF EXISTS "team_members_read" ON team_members;
CREATE POLICY "team_members_read" ON team_members FOR SELECT
  USING (auth.uid() = user_id OR is_owner_of(team_members.team_id));

DROP POLICY IF EXISTS "team_members_owner_delete" ON team_members;
CREATE POLICY "team_members_owner_delete" ON team_members FOR DELETE
  USING (is_owner_of(team_members.team_id));

-- ── team_credentials: オーナーのみ（関数経由）──
DROP POLICY IF EXISTS "team_credentials_owner" ON team_credentials;
CREATE POLICY "team_credentials_owner" ON team_credentials FOR ALL
  USING (is_owner_of(team_credentials.team_id))
  WITH CHECK (is_owner_of(team_credentials.team_id));

-- ── players: オーナー OR メンバー（関数経由）──
DROP POLICY IF EXISTS "players_owner" ON players;
DROP POLICY IF EXISTS "players_rw" ON players;
CREATE POLICY "players_rw" ON players FOR ALL
  USING (is_owner_of(players.team_id) OR is_member_of(players.team_id))
  WITH CHECK (is_owner_of(players.team_id) OR is_member_of(players.team_id));

-- ── games: オーナー OR メンバー（関数経由）──
DROP POLICY IF EXISTS "games_owner" ON games;
DROP POLICY IF EXISTS "games_rw" ON games;
CREATE POLICY "games_rw" ON games FOR ALL
  USING (is_owner_of(games.team_id) OR is_member_of(games.team_id))
  WITH CHECK (is_owner_of(games.team_id) OR is_member_of(games.team_id));

-- ── player_stats: game 経由（関数経由）──
DROP POLICY IF EXISTS "stats_owner" ON player_stats;
DROP POLICY IF EXISTS "stats_rw" ON player_stats;
CREATE POLICY "stats_rw" ON player_stats FOR ALL
  USING (can_access_game(player_stats.game_id))
  WITH CHECK (can_access_game(player_stats.game_id));
