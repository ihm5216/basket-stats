-- ランニングスコア用テーブル
-- Supabase ダッシュボード > SQL Editor で実行してください

create table if not exists public.score_events (
  id uuid default gen_random_uuid() primary key,
  game_id uuid references public.games(id) on delete cascade not null,
  quarter integer not null default 1,
  team text not null check (team in ('us', 'opponent')),
  points integer not null,
  player_id uuid references public.players(id) on delete set null,
  our_score_after integer not null,
  opponent_score_after integer not null,
  created_at timestamptz default now()
);

alter table public.score_events enable row level security;

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
