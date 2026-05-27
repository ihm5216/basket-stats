export type Player = {
  id: string
  team_id: string
  name: string
  number: string
  position: string | null
  created_at: string
}

export type Team = {
  id: string
  user_id: string
  name: string
  share_token: string
  created_at: string
}

export type Game = {
  id: string
  team_id: string
  opponent: string
  game_date: string
  location: string | null
  home_or_away: 'home' | 'away'
  our_score: number
  opponent_score: number
  quarter: number
  is_finished: boolean
  created_at: string
  // クロスデバイス同期用（Supabase永続化）
  score_events_json?: unknown
  opponent_players?: unknown
}

export type PlayerStat = {
  id: string
  game_id: string
  player_id: string
  fg2_made: number
  fg2_attempt: number
  fg3_made: number
  fg3_attempt: number
  ft_made: number
  ft_attempt: number
  rebounds: number
  assists: number
  steals: number
  blocks: number
  turnovers: number
  fouls: number
  fouls_plain?: number
  fouls_1ft?: number
  fouls_2ft?: number
  fouls_3ft?: number
  technical_fouls?: number
  minutes: number
  plus_minus: number
}

export type PlayerStatWithPlayer = PlayerStat & {
  player: Player
}

export type SeasonStats = {
  player_id: string
  player_name: string
  player_number: string
  games_played: number
  total_points: number
  avg_points: number
  fg2_made: number
  fg2_attempt: number
  fg2_pct: number
  fg3_made: number
  fg3_attempt: number
  fg3_pct: number
  ft_made: number
  ft_attempt: number
  ft_pct: number
  fg_pct: number
  total_rebounds: number
  avg_rebounds: number
  total_assists: number
  avg_assists: number
  total_steals: number
  total_blocks: number
  total_turnovers: number
  total_fouls: number
  total_minutes: number
  avg_minutes: number
}

export type Subscription = {
  id: string
  user_id: string
  stripe_customer_id: string
  stripe_subscription_id: string
  status: 'active' | 'canceled' | 'past_due' | 'trialing'
  current_period_end: string
}
