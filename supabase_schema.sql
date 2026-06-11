-- ============================================
-- BasketStats データベーススキーマ
-- Supabase の SQL Editor にこれをそのまま貼り付けて実行してください
-- ============================================

-- チームテーブル
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  share_token TEXT NOT NULL UNIQUE DEFAULT gen_random_uuid()::text,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 選手テーブル
CREATE TABLE players (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  number TEXT NOT NULL DEFAULT '',
  position TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 試合テーブル
CREATE TABLE games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  opponent TEXT NOT NULL,
  game_date DATE NOT NULL,
  location TEXT,
  home_or_away TEXT NOT NULL DEFAULT 'home' CHECK (home_or_away IN ('home', 'away')),
  our_score INTEGER NOT NULL DEFAULT 0,
  opponent_score INTEGER NOT NULL DEFAULT 0,
  quarter INTEGER NOT NULL DEFAULT 1,
  is_finished BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 選手スタッツテーブル
CREATE TABLE player_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  player_id UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  fg2_made INTEGER NOT NULL DEFAULT 0,
  fg2_attempt INTEGER NOT NULL DEFAULT 0,
  fg3_made INTEGER NOT NULL DEFAULT 0,
  fg3_attempt INTEGER NOT NULL DEFAULT 0,
  ft_made INTEGER NOT NULL DEFAULT 0,
  ft_attempt INTEGER NOT NULL DEFAULT 0,
  rebounds INTEGER NOT NULL DEFAULT 0,
  assists INTEGER NOT NULL DEFAULT 0,
  steals INTEGER NOT NULL DEFAULT 0,
  blocks INTEGER NOT NULL DEFAULT 0,
  turnovers INTEGER NOT NULL DEFAULT 0,
  fouls INTEGER NOT NULL DEFAULT 0,
  fouls_plain INTEGER NOT NULL DEFAULT 0,
  fouls_1ft INTEGER NOT NULL DEFAULT 0,
  fouls_2ft INTEGER NOT NULL DEFAULT 0,
  fouls_3ft INTEGER NOT NULL DEFAULT 0,
  technical_fouls INTEGER NOT NULL DEFAULT 0,
  minutes INTEGER NOT NULL DEFAULT 0,
  plus_minus INTEGER NOT NULL DEFAULT 0,
  UNIQUE (game_id, player_id)
);

-- サブスクリプションテーブル
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('active', 'canceled', 'past_due', 'trialing')),
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- Row Level Security (RLS) ポリシー設定
-- ============================================

ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE players ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- チーム: 自分のチームのみ読み書き可能
CREATE POLICY "teams_owner" ON teams FOR ALL USING (auth.uid() = user_id);

-- 選手: チームオーナーのみ読み書き可能
CREATE POLICY "players_owner" ON players FOR ALL
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = players.team_id AND teams.user_id = auth.uid()));

-- 試合: チームオーナーのみ読み書き可能
CREATE POLICY "games_owner" ON games FOR ALL
  USING (EXISTS (SELECT 1 FROM teams WHERE teams.id = games.team_id AND teams.user_id = auth.uid()));

-- スタッツ: チームオーナーのみ読み書き可能
CREATE POLICY "stats_owner" ON player_stats FOR ALL
  USING (EXISTS (
    SELECT 1 FROM games
    JOIN teams ON teams.id = games.team_id
    WHERE games.id = player_stats.game_id AND teams.user_id = auth.uid()
  ));

-- 共有リンク用: share_token があれば誰でも読める
CREATE POLICY "teams_public_read" ON teams FOR SELECT USING (true);
CREATE POLICY "players_public_read" ON players FOR SELECT USING (true);
CREATE POLICY "games_public_read" ON games FOR SELECT USING (true);
CREATE POLICY "stats_public_read" ON player_stats FOR SELECT USING (true);

-- サブスクリプション: 自分のみ
CREATE POLICY "subscriptions_owner" ON subscriptions FOR ALL USING (auth.uid() = user_id);

-- 新規ユーザー登録時に自動でチームを作成するトリガー
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- team_name が指定されている場合はチームを作成
  IF NEW.raw_user_meta_data->>'team_name' IS NOT NULL AND NEW.raw_user_meta_data->>'team_name' != '' THEN
    INSERT INTO teams (user_id, name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'team_name');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
