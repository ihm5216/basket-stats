'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Team, Player, Game } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { exportToCSV, aggregateSeasonStats } from '@/lib/stats'

export default function TeamPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [team, setTeam] = useState<Team | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [tab, setTab] = useState<'games' | 'players' | 'stats'>('games')
  const [loading, setLoading] = useState(true)
  const [shareMsg, setShareMsg] = useState('')
  const [newPlayerName, setNewPlayerName] = useState('')
  const [newPlayerNumber, setNewPlayerNumber] = useState('')
  const [addingPlayer, setAddingPlayer] = useState(false)

  useEffect(() => { loadData() }, [id])

  async function loadData() {
    const supabase = createClient()
    const [{ data: teamData }, { data: playersData }, { data: gamesData }] = await Promise.all([
      supabase.from('teams').select('*').eq('id', id).single(),
      supabase.from('players').select('*').eq('team_id', id).order('number'),
      supabase.from('games').select('*').eq('team_id', id).order('game_date', { ascending: false }),
    ])

    if (!teamData) { router.push('/dashboard'); return }
    setTeam(teamData)
    setPlayers(playersData ?? [])
    setGames(gamesData ?? [])
    setLoading(false)
  }

  async function addPlayer(e: React.FormEvent) {
    e.preventDefault()
    if (!newPlayerName.trim()) return
    setAddingPlayer(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('players')
      .insert({ team_id: id, name: newPlayerName.trim(), number: newPlayerNumber.trim() })
      .select()
      .single()

    if (data) {
      setPlayers(prev => [...prev, data].sort((a, b) => Number(a.number) - Number(b.number)))
      setNewPlayerName('')
      setNewPlayerNumber('')
    }
    setAddingPlayer(false)
  }

  async function deletePlayer(playerId: string) {
    if (!confirm('選手を削除しますか？記録されたスタッツも削除されます。')) return
    const supabase = createClient()
    await supabase.from('players').delete().eq('id', playerId)
    setPlayers(prev => prev.filter(p => p.id !== playerId))
  }

  function copyShareLink() {
    const url = `${window.location.origin}/share/${team?.share_token}`
    navigator.clipboard.writeText(url)
    setShareMsg('コピーしました！')
    setTimeout(() => setShareMsg(''), 2000)
  }

  async function handleExportCSV() {
    if (!team) return
    const supabase = createClient()
    const { data: statsData } = await supabase
      .from('player_stats')
      .select('*, player:players(*)')
      .in('game_id', games.map(g => g.id))

    if (statsData) {
      const season = aggregateSeasonStats(statsData as Parameters<typeof aggregateSeasonStats>[0])
      exportToCSV(season, team.name)
    }
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>
  if (!team) return null

  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] sticky top-0 bg-[var(--background)] z-10">
        <Link href="/dashboard" className="flex items-center gap-2 text-white">
          <span>←</span>
          <span className="font-bold">🏀 {team.name}</span>
        </Link>
        <div className="flex gap-2">
          <button onClick={copyShareLink} className="btn-secondary text-sm py-2 px-3">
            {shareMsg || '🔗 共有'}
          </button>
          <button onClick={handleExportCSV} className="btn-secondary text-sm py-2 px-3">📥 CSV</button>
        </div>
      </nav>

      {/* タブ */}
      <div className="flex border-b border-[var(--card-border)] px-4">
        {(['games', 'players', 'stats'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${tab === t ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)] hover:text-white'}`}
          >
            {t === 'games' ? '試合' : t === 'players' ? '選手' : 'シーズン統計'}
          </button>
        ))}
      </div>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* 試合タブ */}
        {tab === 'games' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-white">試合一覧</h2>
              <Link href={`/games/new?team=${id}`} className="btn-primary text-sm py-2 px-4">+ 試合を追加</Link>
            </div>
            {games.length === 0 ? (
              <div className="card text-center py-12">
                <p className="text-[var(--muted)] mb-4">試合がまだありません</p>
                <Link href={`/games/new?team=${id}`} className="btn-primary">最初の試合を記録する</Link>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {games.map(game => (
                  <Link key={game.id} href={`/games/${game.id}`} className="card flex items-center justify-between hover:border-orange-500/50 transition-colors">
                    <div>
                      <div className="font-medium text-white">vs {game.opponent}</div>
                      <div className="text-sm text-[var(--muted)]">
                        {format(new Date(game.game_date), 'M月d日（E）', { locale: ja })}
                        {game.location ? ` · ${game.location}` : ''}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`text-lg font-bold ${game.our_score > game.opponent_score ? 'text-green-400' : game.our_score < game.opponent_score ? 'text-red-400' : 'text-white'}`}>
                        {game.our_score} - {game.opponent_score}
                      </div>
                      <div className="text-xs text-[var(--muted)]">{game.is_finished ? '終了' : '進行中'}</div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 選手タブ */}
        {tab === 'players' && (
          <div>
            <h2 className="font-semibold text-white mb-4">選手登録</h2>
            <form onSubmit={addPlayer} className="card flex gap-3 mb-4 flex-wrap">
              <input
                className="input-field w-20 flex-shrink-0"
                placeholder="#番号"
                value={newPlayerNumber}
                onChange={e => setNewPlayerNumber(e.target.value)}
                maxLength={3}
              />
              <input
                className="input-field flex-1 min-w-32"
                placeholder="選手名"
                value={newPlayerName}
                onChange={e => setNewPlayerName(e.target.value)}
                required
              />
              <button type="submit" disabled={addingPlayer} className="btn-primary py-2 px-4 text-sm whitespace-nowrap">
                追加
              </button>
            </form>

            {players.length === 0 ? (
              <div className="card text-center py-8 text-[var(--muted)]">選手を追加してください</div>
            ) : (
              <div className="flex flex-col gap-2">
                {players.map(player => (
                  <div key={player.id} className="card flex items-center justify-between py-3">
                    <div className="flex items-center gap-3">
                      <span className="text-orange-400 font-bold w-8 text-center">#{player.number || '—'}</span>
                      <span className="text-white font-medium">{player.name}</span>
                    </div>
                    <button onClick={() => deletePlayer(player.id)} className="text-[var(--muted)] hover:text-red-400 text-sm transition-colors">
                      削除
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* シーズン統計タブ */}
        {tab === 'stats' && (
          <SeasonStatsTab teamId={id} games={games} />
        )}
      </main>
    </div>
  )
}

function SeasonStatsTab({ teamId, games }: { teamId: string; games: Game[] }) {
  const [stats, setStats] = useState<ReturnType<typeof aggregateSeasonStats>>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      if (games.length === 0) { setLoading(false); return }
      const supabase = createClient()
      const { data } = await supabase
        .from('player_stats')
        .select('*, player:players(*)')
        .in('game_id', games.map(g => g.id))

      if (data) {
        setStats(aggregateSeasonStats(data as Parameters<typeof aggregateSeasonStats>[0]))
      }
      setLoading(false)
    }
    load()
  }, [games])

  if (loading) return <div className="text-[var(--muted)] text-center py-8">集計中...</div>
  if (stats.length === 0) return <div className="card text-center py-12 text-[var(--muted)]">試合データがありません</div>

  return (
    <div>
      <h2 className="font-semibold text-white mb-4">シーズン統計（全{games.length}試合）</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-[var(--muted)] border-b border-[var(--card-border)]">
              <th className="text-left py-2 pr-3">#</th>
              <th className="text-left py-2 pr-3">選手</th>
              <th className="text-right py-2 pr-3">試合</th>
              <th className="text-right py-2 pr-3">平均得点</th>
              <th className="text-right py-2 pr-3">FG%</th>
              <th className="text-right py-2 pr-3">3P%</th>
              <th className="text-right py-2 pr-3">FT%</th>
              <th className="text-right py-2 pr-3">平均REB</th>
              <th className="text-right py-2 pr-3">平均AST</th>
              <th className="text-right py-2 pr-3">STL</th>
              <th className="text-right py-2">BLK</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.player_id} className="border-b border-[var(--card-border)] hover:bg-white/5">
                <td className="py-3 pr-3 text-orange-400 font-medium">#{s.player_number}</td>
                <td className="py-3 pr-3 text-white font-medium">{s.player_name}</td>
                <td className="py-3 pr-3 text-right text-[var(--muted)]">{s.games_played}</td>
                <td className="py-3 pr-3 text-right font-bold text-white">{s.avg_points}</td>
                <td className="py-3 pr-3 text-right">{s.fg_pct}%</td>
                <td className="py-3 pr-3 text-right">{s.fg3_pct}%</td>
                <td className="py-3 pr-3 text-right">{s.ft_pct}%</td>
                <td className="py-3 pr-3 text-right">{s.avg_rebounds}</td>
                <td className="py-3 pr-3 text-right">{s.avg_assists}</td>
                <td className="py-3 pr-3 text-right">{s.total_steals}</td>
                <td className="py-3 text-right">{s.total_blocks}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
