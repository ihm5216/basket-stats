import { OppStatData, PlayerStat, SeasonStats } from '@/types'

export function calcPoints(stat: PlayerStat): number {
  return stat.fg2_made * 2 + stat.fg3_made * 3 + stat.ft_made
}

export function calcPct(made: number, attempt: number): number {
  if (attempt === 0) return 0
  return Math.round((made / attempt) * 1000) / 10
}

export function aggregateSeasonStats(
  stats: (PlayerStat & { player: { id: string; name: string; number: string } })[]
): SeasonStats[] {
  const map = new Map<string, SeasonStats>()

  for (const s of stats) {
    const existing = map.get(s.player_id)
    const pts = calcPoints(s)

    if (!existing) {
      map.set(s.player_id, {
        player_id: s.player_id,
        player_name: s.player.name,
        player_number: s.player.number,
        games_played: 1,
        total_points: pts,
        avg_points: pts,
        fg2_made: s.fg2_made,
        fg2_attempt: s.fg2_attempt,
        fg2_pct: calcPct(s.fg2_made, s.fg2_attempt),
        fg3_made: s.fg3_made,
        fg3_attempt: s.fg3_attempt,
        fg3_pct: calcPct(s.fg3_made, s.fg3_attempt),
        ft_made: s.ft_made,
        ft_attempt: s.ft_attempt,
        ft_pct: calcPct(s.ft_made, s.ft_attempt),
        fg_pct: calcPct(s.fg2_made + s.fg3_made, s.fg2_attempt + s.fg3_attempt),
        total_rebounds: s.rebounds,
        avg_rebounds: s.rebounds,
        total_assists: s.assists,
        avg_assists: s.assists,
        total_steals: s.steals,
        total_blocks: s.blocks,
        total_turnovers: s.turnovers,
        total_fouls: s.fouls,
        total_minutes: s.minutes,
        avg_minutes: s.minutes,
      })
    } else {
      existing.games_played += 1
      existing.total_points += pts
      existing.fg2_made += s.fg2_made
      existing.fg2_attempt += s.fg2_attempt
      existing.fg3_made += s.fg3_made
      existing.fg3_attempt += s.fg3_attempt
      existing.ft_made += s.ft_made
      existing.ft_attempt += s.ft_attempt
      existing.total_rebounds += s.rebounds
      existing.total_assists += s.assists
      existing.total_steals += s.steals
      existing.total_blocks += s.blocks
      existing.total_turnovers += s.turnovers
      existing.total_fouls += s.fouls
      existing.total_minutes += s.minutes

      const g = existing.games_played
      existing.avg_points = Math.round((existing.total_points / g) * 10) / 10
      existing.avg_rebounds = Math.round((existing.total_rebounds / g) * 10) / 10
      existing.avg_assists = Math.round((existing.total_assists / g) * 10) / 10
      existing.avg_minutes = Math.round((existing.total_minutes / g) * 10) / 10
      existing.fg2_pct = calcPct(existing.fg2_made, existing.fg2_attempt)
      existing.fg3_pct = calcPct(existing.fg3_made, existing.fg3_attempt)
      existing.ft_pct = calcPct(existing.ft_made, existing.ft_attempt)
      existing.fg_pct = calcPct(existing.fg2_made + existing.fg3_made, existing.fg2_attempt + existing.fg3_attempt)
    }
  }

  return Array.from(map.values()).sort((a, b) => b.avg_points - a.avg_points)
}

export function exportToCSV(seasonStats: SeasonStats[], teamName: string): void {
  const headers = [
    '#', '選手名', '試合', '平均得点', 'FG%', '2P%', '3P%', 'FT%',
    '平均REB', '平均AST', 'STL', 'BLK', 'TO', 'ファウル', '平均出場分'
  ]

  const rows = seasonStats.map(s => [
    s.player_number,
    s.player_name,
    s.games_played,
    s.avg_points,
    s.fg_pct,
    s.fg2_pct,
    s.fg3_pct,
    s.ft_pct,
    s.avg_rebounds,
    s.avg_assists,
    s.total_steals,
    s.total_blocks,
    s.total_turnovers,
    s.total_fouls,
    s.avg_minutes,
  ])

  // 選手名などにカンマ・引用符・改行が含まれても列がズレないようエスケープ
  const esc = (v: string | number): string => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(esc).join(',')).join('\n')
  const bom = '﻿'
  const blob = new Blob([bom + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${teamName}_シーズンスタッツ.csv`
  link.click()
  URL.revokeObjectURL(url)
}

// ─── 相手チームのスタッツ ─────────────────────────────────────────────────────
// 相手選手は players テーブルに無いため、スタッツは games.court_data_json の
// scoresheetOv.oppPlayers に「相手選手キー → OppStatData」として持つ。
// 記録は任意で、押していない項目は 0 のまま集計される。

export const OPP_BOX_KEYS = [
  'fg2_made', 'fg2_attempt', 'fg3_made', 'fg3_attempt', 'ft_made', 'ft_attempt',
  'rebounds', 'assists', 'steals', 'blocks', 'turnovers',
] as const
export type OppBoxKey = typeof OPP_BOX_KEYS[number]

export const OPP_FOUL_KEYS = [
  'fouls_plain', 'fouls_1ft', 'fouls_2ft', 'fouls_3ft', 'technical_fouls', 'fouls_unsportsmanlike',
] as const
export type OppFoulKey = typeof OPP_FOUL_KEYS[number]

export function emptyOppStat(): OppStatData {
  return {
    fg2_made: 0, fg2_attempt: 0, fg3_made: 0, fg3_attempt: 0, ft_made: 0, ft_attempt: 0,
    rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0,
    fouls_plain: 0, fouls_1ft: 0, fouls_2ft: 0, fouls_3ft: 0, technical_fouls: 0, fouls_unsportsmanlike: 0,
  }
}

/** 保存済みの部分データ（ファウルだけの旧試合など）を欠損なしの OppStatData に整える */
export function normalizeOppStat(v?: (Partial<OppStatData> & { fouls?: number }) | null): OppStatData {
  const out = emptyOppStat()
  if (!v) return out
  for (const k of [...OPP_BOX_KEYS, ...OPP_FOUL_KEYS]) {
    const n = v[k]
    if (typeof n === 'number' && Number.isFinite(n)) out[k] = Math.max(0, n)
  }
  if (v.fouls_plain === undefined && typeof v.fouls === 'number') out.fouls_plain = Math.max(0, v.fouls) // 旧データ互換
  return out
}

export function oppTotalFouls(s: OppStatData): number {
  return OPP_FOUL_KEYS.reduce((n, k) => n + (s[k] ?? 0), 0)
}

/** 何か1つでも記録されているか（全部0の選手は集計表に出さない） */
export function hasOppStatRecord(s: OppStatData): boolean {
  return OPP_BOX_KEYS.some(k => (s[k] ?? 0) > 0) || oppTotalFouls(s) > 0
}

/** games.court_data_json から相手スタッツの生データを取り出す（未記録なら null） */
export function readOppStatsJson(courtDataJson: unknown): Record<string, Partial<OppStatData> & { fouls?: number }> | null {
  const cd = courtDataJson as { scoresheetOv?: { oppPlayers?: Record<string, Partial<OppStatData> & { fouls?: number }> } } | null
  return cd?.scoresheetOv?.oppPlayers ?? null
}
