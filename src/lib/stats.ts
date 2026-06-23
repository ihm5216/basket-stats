import { PlayerStat, SeasonStats } from '@/types'

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
