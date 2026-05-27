-- ============================================================
-- スコアイベント・相手選手データをSupabaseに永続化するマイグレーション
-- Supabase Dashboard > SQL Editor で実行してください
-- ============================================================

-- score_events テーブルの作成（まだない場合）
create table if not exists public.score_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  quarter integer not null default 1,
  team text not null check (team in ('us', 'opponent')),
  points integer not null,
  player_id uuid references public.players(id) on delete set null,
  opp_player_name text,
  our_score_after integer not null,
  opponent_score_after integer not null,
  created_at timestamptz default now()
);

-- opp_player_name カラム追加（既にテーブルがある場合）
alter table public.score_events add column if not exists opp_player_name text;

-- RLS
alter table public.score_events enable row level security;

-- 既存ポリシーを削除して再作成
drop policy if exists "Users can manage their own score events" on public.score_events;
create policy "Users can manage their own score events"
  on public.score_events for all
  using (
    exists (
      select 1 from public.games g
      join public.teams t on g.team_id = t.id
      where g.id = score_events.game_id
      and t.user_id = auth.uid()
    )
  );

-- 公開読み取りポリシー
drop policy if exists "score_events_public_read" on public.score_events;
create policy "score_events_public_read" on public.score_events for select using (true);

-- games テーブルに永続化カラムを追加
alter table public.games add column if not exists score_events_json jsonb;
alter table public.games add column if not exists opponent_players jsonb;
