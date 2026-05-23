'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Game, Player, PlayerStat } from '@/types'
import { calcPoints } from '@/lib/stats'

type StatKey = keyof Omit<PlayerStat, 'id' | 'game_id' | 'player_id'>
type PendingChange = { playerId: string; key: StatKey; delta: number; gid: number }

const STAT_BUTTONS: { label: string; key: StatKey; delta: number; category: 'made' | 'missed' | 'neutral' }[] = [
  { label: '2P 成功', key: 'fg2_made', delta: 1, category: 'made' },
  { label: '2P 失敗', key: 'fg2_attempt', delta: 1, category: 'missed' },
  { label: '3P 成功', key: 'fg3_made', delta: 1, category: 'made' },
  { label: '3P 失敗', key: 'fg3_attempt', delta: 1, category: 'missed' },
  { label: 'FT 成功', key: 'ft_made', delta: 1, category: 'made' },
  { label: 'FT 失敗', key: 'ft_attempt', delta: 1, category: 'missed' },
  { label: 'リバウンド', key: 'rebounds', delta: 1, category: 'neutral' },
  { label: 'アシスト', key: 'assists', delta: 1, category: 'neutral' },
  { label: 'スティール', key: 'steals', delta: 1, category: 'neutral' },
  { label: 'ブロック', key: 'blocks', delta: 1, category: 'neutral' },
  { label: 'ターンオーバー', key: 'turnovers', delta: 1, category: 'missed' },
  { label: 'ファウル', key: 'fouls', delta: 1, category: 'missed' },
]

function emptyStats(gameId: string, playerId: string): PlayerStat {
  return { id: '', game_id: gameId, player_id: playerId, fg2_made: 0, fg2_attempt: 0, fg3_made: 0, fg3_attempt: 0, ft_made: 0, ft_attempt: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, minutes: 0, plus_minus: 0 }
}

function pct(made: number, attempt: number) {
  if (attempt === 0) return '—'
  return Math.round((made / attempt) * 100) + '%'
}

// ─── 試合終了後スタッツ一覧 ──────────────────────────────────────────────────
function FinishedGameView({ game, players, statsMap }: {
  game: Game
  players: Player[]
  statsMap: Map<string, PlayerStat>
}) {
  const rows = players.map(p => ({
    player: p,
    stat: statsMap.get(p.id) ?? emptyStats(game.id, p.id),
  }))

  const won = game.our_score > game.opponent_score
  const lost = game.our_score < game.opponent_score

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー */}
      <div className="border-b border-[var(--card-border)] px-4 py-4">
        <Link href={`/teams/${game.team_id}`} className="text-[var(--muted)] text-sm">← 戻る</Link>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--muted)] mb-0.5">vs {game.opponent}</div>
            <div className={`text-3xl font-bold ${won ? 'text-green-400' : lost ? 'text-red-400' : 'text-white'}`}>
              {game.our_score} <span className="text-[var(--muted)] text-xl">-</span> {game.opponent_score}
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${won ? 'bg-green-500/20 text-green-400' : lost ? 'bg-red-500/20 text-red-400' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
            {won ? '勝利' : lost ? '敗北' : '引き分け'}
          </div>
        </div>
      </div>

      {/* スタッツ表 */}
      <div className="flex-1 px-2 py-4">
        <div className="text-xs text-[var(--muted)] mb-3 px-2 uppercase tracking-wide">選手スタッツ</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[580px]">
            <thead>
              <tr className="text-[10px] text-[var(--muted)] border-b border-[var(--card-border)] uppercase">
                <th className="text-left py-2 pl-2 pr-3 w-8">#</th>
                <th className="text-left py-2 pr-3">名前</th>
                <th className="text-right py-2 pr-3 text-orange-400">得点</th>
                <th className="text-right py-2 pr-3">2P</th>
                <th className="text-right py-2 pr-3">3P</th>
                <th className="text-right py-2 pr-3">FT</th>
                <th className="text-right py-2 pr-3">REB</th>
                <th className="text-right py-2 pr-3">AST</th>
                <th className="text-right py-2 pr-3">STL</th>
                <th className="text-right py-2 pr-3">BLK</th>
                <th className="text-right py-2 pr-3">TO</th>
                <th className="text-right py-2 pr-2">反</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ player, stat }) => (
                <tr key={player.id} className="border-b border-[var(--card-border)] hover:bg-white/5">
                  <td className="py-3 pl-2 pr-3 text-orange-400 font-bold text-xs">{player.number || '—'}</td>
                  <td className="py-3 pr-3 text-white font-medium whitespace-nowrap">{player.name}</td>
                  <td className="py-3 pr-3 text-right font-bold text-orange-400">{calcPoints(stat)}</td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)] text-xs whitespace-nowrap">
                    {stat.fg2_made}/{stat.fg2_attempt}
                    <span className="text-[9px] ml-0.5">({pct(stat.fg2_made, stat.fg2_attempt)})</span>
                  </td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)] text-xs whitespace-nowrap">
                    {stat.fg3_made}/{stat.fg3_attempt}
                    <span className="text-[9px] ml-0.5">({pct(stat.fg3_made, stat.fg3_attempt)})</span>
                  </td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)] text-xs whitespace-nowrap">
                    {stat.ft_made}/{stat.ft_attempt}
                    <span className="text-[9px] ml-0.5">({pct(stat.ft_made, stat.ft_attempt)})</span>
                  </td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)]">{stat.rebounds}</td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)]">{stat.assists}</td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)]">{stat.steals}</td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)]">{stat.blocks}</td>
                  <td className="py-3 pr-3 text-right text-[var(--muted)]">{stat.turnovers}</td>
                  <td className="py-3 pr-2 text-right text-[var(--muted)]">{stat.fouls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── スターター選択画面 ─────────────────────────────────────────────────────────
function CourtSetup({ players, currentQuarter, onConfirm, initialIds }: {
  players: Player[]
  currentQuarter: number
  onConfirm: (ids: string[]) => void
  initialIds: string[]
}) {
  const [selected, setSelected] = useState<string[]>(initialIds.slice(0, 5))

  function toggle(id: string) {
    setSelected(prev =>
      prev.includes(id)
        ? prev.filter(x => x !== id)
        : prev.length < 5 ? [...prev, id] : prev
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-white text-lg">Q{currentQuarter} スターター</div>
          <div className="text-xs text-[var(--muted)]">コートに出る選手を選択（{selected.length}/5）</div>
        </div>
        <button
          onClick={() => onConfirm(selected)}
          disabled={selected.length === 0}
          className="btn-primary text-sm py-2 px-5"
        >
          決定
        </button>
      </div>

      <div className="px-4 py-4 flex flex-col gap-2">
        {players.map(player => {
          const isSelected = selected.includes(player.id)
          const isDisabled = !isSelected && selected.length >= 5
          return (
            <button
              key={player.id}
              onClick={() => toggle(player.id)}
              disabled={isDisabled}
              className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                isSelected
                  ? 'bg-orange-500/20 border-orange-500'
                  : isDisabled
                  ? 'bg-[var(--card)] border-[var(--card-border)] opacity-40'
                  : 'bg-[var(--card)] border-[var(--card-border)] hover:border-orange-500/50'
              }`}
            >
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border-2 ${isSelected ? 'border-orange-400 text-orange-400' : 'border-[var(--muted)] text-[var(--muted)]'}`}>
                {isSelected ? '✓' : ' '}
              </span>
              <span className="text-orange-400 font-bold w-10">#{player.number || '—'}</span>
              <span className={`font-medium ${isSelected ? 'text-white' : 'text-[var(--muted)]'}`}>{player.name}</span>
              {isSelected && <span className="ml-auto text-xs text-orange-400 font-medium">コート</span>}
            </button>
          )
        })}
        {players.length === 0 && (
          <p className="text-center py-10 text-[var(--muted)] text-sm">先に選手を登録してください</p>
        )}
      </div>
    </div>
  )
}

// ─── メイン ゲームページ ───────────────────────────────────────────────────────
export default function GamePage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [game, setGame] = useState<Game | null>(null)
  const [players, setPlayers] = useState<Player[]>([])
  const [statsMap, setStatsMap] = useState<Map<string, PlayerStat>>(new Map())
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null)
  const [pending, setPending] = useState<PendingChange[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [halfTimeReset, setHalfTimeReset] = useState(false)
  const [teamFouls, setTeamFouls] = useState(0)
  const [currentQuarter, setCurrentQuarter] = useState(1)
  const [onCourtIds, setOnCourtIds] = useState<string[]>([])
  const [courtSetupMode, setCourtSetupMode] = useState(false)
  const gidRef = useRef(0)

  useEffect(() => { loadData() }, [id])

  useEffect(() => {
    if (pending.length > 0) localStorage.setItem(`pending_${id}`, JSON.stringify(pending))
  }, [pending, id])

  async function loadData() {
    const supabase = createClient()
    const { data: gameData } = await supabase.from('games').select('*').eq('id', id).single()
    if (!gameData) { router.push('/dashboard'); return }
    setGame(gameData)
    setCurrentQuarter(gameData.quarter ?? 1)

    const [{ data: playersData }, { data: statsData }] = await Promise.all([
      supabase.from('players').select('*').eq('team_id', gameData.team_id).order('number'),
      supabase.from('player_stats').select('*').eq('game_id', id),
    ])

    const map = new Map<string, PlayerStat>()
    statsData?.forEach(s => map.set(s.player_id, s))
    setStatsMap(map)
    setPlayers(playersData ?? [])

    const savedPending = localStorage.getItem(`pending_${id}`)
    if (savedPending) setPending(JSON.parse(savedPending))

    if (!gameData.is_finished) {
      const savedCourt = localStorage.getItem(`court_${id}`)
      if (savedCourt) {
        setOnCourtIds(JSON.parse(savedCourt))
      } else {
        setCourtSetupMode(true)
      }
    }

    setLoading(false)
  }

  function getEffectiveStat(playerId: string): PlayerStat {
    const base = statsMap.get(playerId) ?? emptyStats(id, playerId)
    const applied = { ...base } as unknown as Record<string, number | string>
    for (const change of pending) {
      if (change.playerId === playerId) {
        applied[change.key] = ((applied[change.key] as number) ?? 0) + change.delta
      }
    }
    return applied as unknown as PlayerStat
  }

  function handleStatTap(btn: typeof STAT_BUTTONS[0]) {
    if (!selectedPlayer) return
    const gid = ++gidRef.current
    const newPending: PendingChange[] = [{ playerId: selectedPlayer.id, key: btn.key, delta: btn.delta, gid }]
    if (btn.key === 'fg2_made') newPending.push({ playerId: selectedPlayer.id, key: 'fg2_attempt', delta: 1, gid })
    if (btn.key === 'fg3_made') newPending.push({ playerId: selectedPlayer.id, key: 'fg3_attempt', delta: 1, gid })
    if (btn.key === 'ft_made') newPending.push({ playerId: selectedPlayer.id, key: 'ft_attempt', delta: 1, gid })

    if (btn.key === 'fg2_made' || btn.key === 'fg3_made' || btn.key === 'ft_made') {
      const pts = btn.key === 'fg2_made' ? 2 : btn.key === 'fg3_made' ? 3 : 1
      setGame(prev => prev ? { ...prev, our_score: prev.our_score + pts } : prev)
    }
    if (btn.key === 'fouls') setTeamFouls(prev => prev + 1)
    setPending(prev => [...prev, ...newPending])
  }

  function undoLast() {
    if (pending.length === 0) return
    const lastGid = pending[pending.length - 1].gid
    const removed = pending.filter(c => c.gid === lastGid)
    const scoreDelta = removed.find(c => c.key === 'fg2_made') ? -2
                     : removed.find(c => c.key === 'fg3_made') ? -3
                     : removed.find(c => c.key === 'ft_made') ? -1
                     : 0
    if (scoreDelta !== 0) setGame(g => g ? { ...g, our_score: g.our_score + scoreDelta } : g)
    if (removed.find(c => c.key === 'fouls')) setTeamFouls(t => Math.max(0, t - 1))
    setPending(prev => prev.filter(c => c.gid !== lastGid))
  }

  function halftimeReset() {
    setTeamFouls(0)
    setHalfTimeReset(true)
    setTimeout(() => setHalfTimeReset(false), 2000)
  }

  function confirmCourt(selectedIds: string[]) {
    setOnCourtIds(selectedIds)
    localStorage.setItem(`court_${id}`, JSON.stringify(selectedIds))
    setCourtSetupMode(false)
    setSelectedPlayer(null)
  }

  const saveStats = useCallback(async () => {
    setSaving(true)
    const supabase = createClient()

    if (pending.length > 0) {
      const grouped = new Map<string, PendingChange[]>()
      for (const c of pending) {
        if (!grouped.has(c.playerId)) grouped.set(c.playerId, [])
        grouped.get(c.playerId)!.push(c)
      }

      for (const [playerId, changes] of grouped.entries()) {
        const existing = statsMap.get(playerId)
        if (existing?.id) {
          const existingR = existing as unknown as Record<string, number>
          const updates: Record<string, number> = {}
          for (const c of changes) updates[c.key] = (existingR[c.key] ?? 0) + c.delta
          await supabase.from('player_stats').update(updates).eq('id', existing.id)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _omit, ...insertBase } = emptyStats(id, playerId)
          const newStat = insertBase as unknown as Record<string, number | string>
          for (const c of changes) newStat[c.key] = ((newStat[c.key] as number) ?? 0) + c.delta
          await supabase.from('player_stats').insert(newStat)
        }
      }

      localStorage.removeItem(`pending_${id}`)
    }

    if (game) {
      await supabase.from('games')
        .update({ our_score: game.our_score, opponent_score: game.opponent_score })
        .eq('id', id)
    }

    await loadData()
    setPending([])
    setSaving(false)
  }, [pending, statsMap, game, id])

  async function advanceQuarter() {
    if (currentQuarter >= 4) return
    await saveStats()
    const next = currentQuarter + 1
    setCurrentQuarter(next)
    setTeamFouls(0)
    const supabase = createClient()
    await supabase.from('games').update({ quarter: next }).eq('id', id)
    setCourtSetupMode(true)
    setSelectedPlayer(null)
  }

  async function finishGame() {
    if (!confirm('試合を終了しますか？')) return
    await saveStats()
    const supabase = createClient()
    await supabase.from('games').update({ is_finished: true, quarter: currentQuarter }).eq('id', id)
    setGame(prev => prev ? { ...prev, is_finished: true } : prev)
    localStorage.removeItem(`court_${id}`)
  }

  function updateOpponentScore(delta: number) {
    setGame(prev => prev ? { ...prev, opponent_score: Math.max(0, prev.opponent_score + delta) } : prev)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>
  )
  if (!game) return null

  if (game.is_finished) {
    return <FinishedGameView game={game} players={players} statsMap={statsMap} />
  }

  if (courtSetupMode) {
    return (
      <CourtSetup
        players={players}
        currentQuarter={currentQuarter}
        onConfirm={confirmCourt}
        initialIds={onCourtIds}
      />
    )
  }

  const selectedStat = selectedPlayer ? getEffectiveStat(selectedPlayer.id) : null
  const onCourtPlayers = onCourtIds
    .map(cid => players.find(p => p.id === cid))
    .filter((p): p is Player => !!p)

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── ヘッダー ─── */}
      <div className="sticky top-0 bg-[var(--background)] z-10 border-b border-[var(--card-border)]">
        {/* 行1: 戻る / スコア / 保存 */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <Link href={`/teams/${game.team_id}`} className="text-[var(--muted)] text-sm">← 戻る</Link>
          <div className="text-center">
            <div className="text-xs text-[var(--muted)]">vs {game.opponent}</div>
            <div className="font-bold text-white text-xl leading-tight">{game.our_score} - {game.opponent_score}</div>
          </div>
          {pending.length > 0 ? (
            <button onClick={saveStats} disabled={saving} className="btn-primary text-xs py-1.5 px-3">
              {saving ? '保存中' : `保存 (${pending.length})`}
            </button>
          ) : <div className="w-16" />}
        </div>

        {/* 行2: クォータータブ + メンバー変更 */}
        <div className="flex items-center gap-1.5 px-4 pb-1">
          {([1, 2, 3, 4] as const).map(q => (
            <button
              key={q}
              disabled={game.is_finished || q > currentQuarter}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                q === currentQuarter
                  ? 'bg-orange-500 text-white'
                  : q < currentQuarter
                  ? 'bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]'
                  : 'opacity-30 bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]'
              }`}
            >
              Q{q}
            </button>
          ))}
          <div className="flex-1" />
          {!game.is_finished && (
            <button
              onClick={() => setCourtSetupMode(true)}
              className="text-[10px] text-[var(--muted)] border border-[var(--card-border)] px-2 py-1 rounded-full"
            >
              メンバー変更
            </button>
          )}
        </div>

        {/* 行3: 相手スコア / チームファウル / HTリセット */}
        <div className="flex items-center justify-between px-4 pb-2">
          <div className="flex items-center gap-1.5">
            <button onClick={() => updateOpponentScore(-1)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">-</button>
            <span className="text-xs text-[var(--muted)] w-14 text-center">相手 {game.opponent_score}</span>
            <button onClick={() => updateOpponentScore(1)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">+</button>
          </div>
          <div className="flex gap-1.5">
            <div className={`text-xs px-2 py-1 rounded-full ${teamFouls >= 5 ? 'bg-red-500/20 text-red-400' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
              ファウル: {teamFouls}
            </div>
            <button
              onClick={halftimeReset}
              className="text-xs px-2 py-1 rounded-full bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]"
            >
              {halfTimeReset ? '✓ リセット' : 'HT リセット'}
            </button>
          </div>
        </div>
      </div>

      {/* ─── メインエリア ─── */}
      <div className="flex flex-col flex-1 px-3 py-3 gap-2.5 max-w-2xl mx-auto w-full">

        {/* コート: 5人グリッド（3上 + 2下中央） */}
        <div>
          <div className="text-[10px] text-[var(--muted)] mb-1.5 uppercase tracking-wide">コート（タップで選択）</div>
          {/* 上3人 */}
          <div className="grid grid-cols-3 gap-2 mb-2">
            {onCourtPlayers.slice(0, 3).map(player => {
              const pts = calcPoints(getEffectiveStat(player.id))
              const isSelected = selectedPlayer?.id === player.id
              return (
                <button
                  key={player.id}
                  onClick={() => setSelectedPlayer(isSelected ? null : player)}
                  className={`flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all active:scale-95 ${
                    isSelected ? 'bg-orange-500 border-orange-500' : 'bg-[var(--card)] border-[var(--card-border)]'
                  }`}
                >
                  <span className="text-[10px] text-orange-300 font-medium">#{player.number || '—'}</span>
                  <span className="text-xs font-semibold text-white leading-tight text-center mt-0.5 line-clamp-1 w-full">{player.name}</span>
                  <span className="text-[10px] text-[var(--muted)] mt-0.5">{pts}pts</span>
                </button>
              )
            })}
          </div>
          {/* 下2人（中央寄せ） */}
          {onCourtPlayers.length > 3 && (
            <div className="flex justify-center gap-2">
              {onCourtPlayers.slice(3, 5).map(player => {
                const pts = calcPoints(getEffectiveStat(player.id))
                const isSelected = selectedPlayer?.id === player.id
                return (
                  <button
                    key={player.id}
                    onClick={() => setSelectedPlayer(isSelected ? null : player)}
                    style={{ width: 'calc(33.33% - 4px)' }}
                    className={`flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all active:scale-95 ${
                      isSelected ? 'bg-orange-500 border-orange-500' : 'bg-[var(--card)] border-[var(--card-border)]'
                    }`}
                  >
                    <span className="text-[10px] text-orange-300 font-medium">#{player.number || '—'}</span>
                    <span className="text-xs font-semibold text-white leading-tight text-center mt-0.5 line-clamp-1 w-full">{player.name}</span>
                    <span className="text-[10px] text-[var(--muted)] mt-0.5">{pts}pts</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* 選択中選手のスタッツ（コンパクト1行） */}
        {selectedPlayer && selectedStat && (
          <div className="bg-[var(--card)] border border-orange-500/40 rounded-xl px-3 py-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-white">#{selectedPlayer.number} {selectedPlayer.name}</span>
              <span className="text-orange-400 font-bold">{calcPoints(selectedStat)}pts</span>
            </div>
            <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-[var(--muted)] mt-1">
              <span>2P {selectedStat.fg2_made}/{selectedStat.fg2_attempt}</span>
              <span>3P {selectedStat.fg3_made}/{selectedStat.fg3_attempt}</span>
              <span>FT {selectedStat.ft_made}/{selectedStat.ft_attempt}</span>
              <span>REB {selectedStat.rebounds}</span>
              <span>AST {selectedStat.assists}</span>
              <span>STL {selectedStat.steals}</span>
              <span>BLK {selectedStat.blocks}</span>
              <span>TO {selectedStat.turnovers}</span>
            </div>
          </div>
        )}

        {/* スタッツ入力ボタン */}
        {selectedPlayer ? (
          <div className="grid grid-cols-3 gap-2">
            {STAT_BUTTONS.map(btn => (
              <button
                key={btn.key + btn.label}
                onClick={() => handleStatTap(btn)}
                className={`stat-btn ${btn.category}`}
              >
                <span>{btn.label}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="card text-center py-5 text-sm text-[var(--muted)]">
            上のコートから選手をタップしてください
          </div>
        )}

        {/* 操作ボタン */}
        <div className="flex gap-2 pt-1">
          {pending.length > 0 && (
            <button onClick={undoLast} className="btn-secondary flex-1 text-sm py-2.5">↩ 取り消し</button>
          )}
          {!game.is_finished && currentQuarter < 4 && (
            <button onClick={advanceQuarter} className="btn-secondary flex-1 text-sm py-2.5">
              Q{currentQuarter + 1}へ →
            </button>
          )}
          {!game.is_finished && (
            <button
              onClick={finishGame}
              className={`btn-secondary text-sm py-2.5 text-red-400 border-red-400/30 ${currentQuarter >= 4 && pending.length === 0 ? 'flex-1' : 'px-4'}`}
            >
              試合終了
            </button>
          )}
        </div>

        {game.is_finished && (
          <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-center text-sm">
            試合終了 · 最終スコア {game.our_score} - {game.opponent_score}
          </div>
        )}
      </div>
    </div>
  )
}
