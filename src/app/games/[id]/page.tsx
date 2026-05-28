'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Game, Player, PlayerStat } from '@/types'
import { calcPoints } from '@/lib/stats'

type StatKey = keyof Omit<PlayerStat, 'id' | 'game_id' | 'player_id'>
type PendingChange = { playerId: string; key: StatKey; delta: number; gid: number }
type OppPlayer = { key: string; number: string; name: string }
type OppFoulData = { fouls_plain: number; fouls_1ft: number; fouls_2ft: number; fouls_3ft: number; technical_fouls: number }
function emptyOppFoul(): OppFoulData { return { fouls_plain: 0, fouls_1ft: 0, fouls_2ft: 0, fouls_3ft: 0, technical_fouls: 0 } }
type ScoreEvent = {
  gid?: number
  quarter: number
  team: 'us' | 'opponent'
  points: number
  player_id?: string
  opp_player_name?: string
  our_score_after: number
  opponent_score_after: number
}

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
  { label: 'ファウル', key: 'fouls_plain', delta: 1, category: 'missed' },
  { label: 'テクニカルファウル', key: 'technical_fouls', delta: 1, category: 'missed' },
]

// スコアイベント連鎖の our_score_after / opponent_score_after を再計算（0始まり専用 — 新規セッション時のみ使用）
function recomputeScoreAfters(events: ScoreEvent[]): ScoreEvent[] {
  let ourScore = 0, oppScore = 0
  return events.map(ev => {
    if (ev.team === 'us') ourScore += ev.points
    else oppScore += ev.points
    return { ...ev, our_score_after: ourScore, opponent_score_after: oppScore }
  })
}

// イベントを1件削除し、それ以降のスコアをデルタ調整する（クロスセッション累計を壊さない）
function removeAndAdjust(events: ScoreEvent[], idx: number): ScoreEvent[] {
  const removed = events[idx]
  return events.filter((_, i) => i !== idx).map((e, newIdx) => {
    if (newIdx < idx) return e
    return removed.team === 'us'
      ? { ...e, our_score_after: e.our_score_after - removed.points }
      : { ...e, opponent_score_after: e.opponent_score_after - removed.points }
  })
}

function emptyStats(gameId: string, playerId: string): PlayerStat {
  return { id: '', game_id: gameId, player_id: playerId, fg2_made: 0, fg2_attempt: 0, fg3_made: 0, fg3_attempt: 0, ft_made: 0, ft_attempt: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, fouls_plain: 0, fouls_1ft: 0, fouls_2ft: 0, fouls_3ft: 0, technical_fouls: 0, minutes: 0, plus_minus: 0 }
}

function pct(made: number, attempt: number) {
  if (attempt === 0) return '—'
  return Math.round((made / attempt) * 100) + '%'
}

function getTotalFouls(stat: PlayerStat): number {
  return (stat.fouls_plain ?? 0) + (stat.fouls_1ft ?? 0) + (stat.fouls_2ft ?? 0) + (stat.fouls_3ft ?? 0) + (stat.technical_fouls ?? 0)
}

function getFoulNotation(stat: PlayerStat): string {
  const parts: string[] = []
  const plain = stat.fouls_plain ?? 0
  const ft1 = stat.fouls_1ft ?? 0
  const ft2 = stat.fouls_2ft ?? 0
  const ft3 = stat.fouls_3ft ?? 0
  const tech = stat.technical_fouls ?? 0

  for (let i = 0; i < plain; i++) parts.push('P')
  for (let i = 0; i < ft1; i++) parts.push('P1')
  for (let i = 0; i < ft2; i++) parts.push('P2')
  for (let i = 0; i < ft3; i++) parts.push('P3')
  for (let i = 0; i < tech; i++) parts.push('T')

  return parts.join(' ')
}

function getOppPlayerScore(scoreEvents: ScoreEvent[], playerName: string): number {
  return scoreEvents
    .filter(e => e.team === 'opponent' && e.opp_player_name === playerName)
    .reduce((sum, e) => sum + e.points, 0)
}

// ─── ランニングスコア表示 ──────────────────────────────────────────────────────
function RunningScoreView({ events, teamName, opponentName, players }: {
  events: ScoreEvent[]
  teamName: string
  opponentName: string
  players: Player[]
}) {
  if (events.length === 0) {
    return (
      <div className="text-center py-12 text-[var(--muted)] text-sm">
        スコアが記録されると表示されます
      </div>
    )
  }

  const quarters = [1, 2, 3, 4]

  return (
    <div className="px-2 py-3 space-y-5">
      {quarters.map(q => {
        const qEvents = events.filter(e => e.quarter === q)
        if (qEvents.length === 0) return null
        const lastEvent = qEvents[qEvents.length - 1]

        return (
          <div key={q}>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xs font-bold text-orange-400 bg-orange-500/10 border border-orange-500/30 px-2 py-0.5 rounded-full">Q{q}</span>
              <span className="text-xs text-[var(--muted)]">終了: {lastEvent.our_score_after} - {lastEvent.opponent_score_after}</span>
            </div>
            <div className="card p-0 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--card-border)] bg-white/5">
                    <th className="text-center py-1.5 px-2 text-[var(--muted)] w-8">#</th>
                    <th className="text-center py-1.5 px-1 text-orange-400 w-1/3">{teamName}</th>
                    <th className="text-center py-1.5 px-1 text-[var(--muted)] w-8">-</th>
                    <th className="text-center py-1.5 px-1 text-blue-400 w-1/3">{opponentName}</th>
                    <th className="text-left py-1.5 px-2 text-[var(--muted)]">選手</th>
                  </tr>
                </thead>
                <tbody>
                  {qEvents.map((ev, i) => {
                    const scorer = ev.player_id ? players.find(p => p.id === ev.player_id) : null
                    return (
                      <tr key={i} className={`border-b border-[var(--card-border)]/40 ${ev.team === 'us' ? 'bg-orange-500/5' : 'bg-blue-500/5'}`}>
                        <td className="text-center py-1.5 px-2 text-[var(--muted)]">{i + 1}</td>
                        <td className={`text-center py-1.5 px-1 font-bold ${ev.team === 'us' ? 'text-orange-400 text-sm' : 'text-white/50'}`}>
                          {ev.our_score_after}
                          {ev.team === 'us' && <span className="text-[9px] ml-0.5 font-normal">(+{ev.points})</span>}
                        </td>
                        <td className="text-center py-1.5 px-1 text-[var(--muted)]">-</td>
                        <td className={`text-center py-1.5 px-1 font-bold ${ev.team === 'opponent' ? 'text-blue-400 text-sm' : 'text-white/50'}`}>
                          {ev.opponent_score_after}
                          {ev.team === 'opponent' && <span className="text-[9px] ml-0.5 font-normal">(+{ev.points})</span>}
                        </td>
                        <td className="text-left py-1.5 px-2 text-[var(--muted)]">
                          {scorer ? `#${scorer.number} ${scorer.name}` : ev.opp_player_name ?? ''}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ─── スコアシート ─────────────────────────────────────────────────────────────
type ScoresheetOverrides = {
  quarterScores: Record<number, { us?: number; opp?: number }>
  homePlayers: Record<string, { pts?: number; fouls?: number }>
  oppPlayers: Record<string, { fouls?: number; fouls_plain?: number; fouls_1ft?: number; fouls_2ft?: number; fouls_3ft?: number; technical_fouls?: number }>
}
type RunMarkData = { type: '2P' | '3P' | 'FT'; num: string; quarter?: number }

function ScoresheetView({ game, players, statsMap, scoreEvents, oppPlayerList, gameId,
  qConfirmPending, onConfirmAdvance, onFoulEdit, onPtsEdit
}: {
  game: Game
  players: Player[]
  statsMap: Map<string, PlayerStat>
  scoreEvents: ScoreEvent[]
  oppPlayerList: OppPlayer[]
  gameId: string
  qConfirmPending?: number | null
  onConfirmAdvance?: () => void
  onFoulEdit?: (playerId: string, newFouls: number) => void
  onPtsEdit?: (playerId: string, newPts: number) => void
}) {
  const storageKey = `scoresheet_ov_${gameId}`
  const [editMode, setEditMode] = useState(false)
  const [ov, setOv] = useState<ScoresheetOverrides>(() => {
    try { const s = localStorage.getItem(storageKey); return s ? JSON.parse(s) : { quarterScores: {}, homePlayers: {}, oppPlayers: {} } }
    catch { return { quarterScores: {}, homePlayers: {}, oppPlayers: {} } }
  })

  // 各Qのスターター (court_q${q}_${gameId} から読み込み)
  const qStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 4; q++) {
      const s = localStorage.getItem(`court_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  // 相手チームの各Qのスターター
  const qOppStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 4; q++) {
      const s = localStorage.getItem(`court_opp_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  // 途中出場判定関数（相手チーム用）
  const isOppSubstitute = (key: string): boolean => {
    const q1Starters = qOppStarters.get(1) ?? new Set<string>()
    if (q1Starters.has(key)) return false
    for (let q = 2; q <= 4; q++) {
      if (qOppStarters.get(q)?.has(key)) return true
    }
    return false
  }

  function saveOv(next: ScoresheetOverrides) { setOv(next); localStorage.setItem(storageKey, JSON.stringify(next)) }

  // 手動修正がコールバックで外部スタッツに反映される場合の処理
  function commitFoulEdit(playerId: string, val: string) {
    const n = parseInt(val); if (isNaN(n) || n < 0 || n > 5) return
    const stat = statsMap.get(playerId)
    const autoFouls = stat ? getTotalFouls(stat) : 0
    const display = ov.homePlayers[playerId]?.fouls ?? autoFouls
    if (n === display) return
    saveOv({...ov, homePlayers: {...ov.homePlayers, [playerId]: {...ov.homePlayers[playerId], fouls: n}}})
    onFoulEdit?.(playerId, n)
  }

  function commitPtsEdit(playerId: string, val: string) {
    const n = parseInt(val); if (isNaN(n) || n < 0) return
    const autoPts = statsMap.get(playerId) ? calcPoints(statsMap.get(playerId)!) : 0
    const display = ov.homePlayers[playerId]?.pts ?? autoPts
    if (n === display) return
    saveOv({...ov, homePlayers: {...ov.homePlayers, [playerId]: {...ov.homePlayers[playerId], pts: n}}})
    onPtsEdit?.(playerId, n)
  }

  // Q毎の得点を自動計算
  const autoQS = [1,2,3,4].map(q => ({
    us:  scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0),
    opp: scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0),
  }))
  function qScore(q: number) {
    const a = autoQS[q-1]; const o = ov.quarterScores[q] ?? {}
    return { us: o.us ?? a.us, opp: o.opp ?? a.opp }
  }
  const totUs  = [1,2,3,4].reduce((s,q) => s + qScore(q).us,  0)
  const totOpp = [1,2,3,4].reduce((s,q) => s + qScore(q).opp, 0)

  // JBA ランニングスコア用マーク構築
  // A列・B列それぞれ「累計N点目をどう得点したか」を記録
  const { aMarks, bMarks, aQEnds, bQEnds, maxScore } = useMemo(() => {
    const aMarks = new Map<number, RunMarkData>()
    const bMarks = new Map<number, RunMarkData>()
    const aQEnds = new Map<number, number>() // Q番号→累計得点
    const bQEnds = new Map<number, number>()
    let aCur = 0, bCur = 0
    const aLastByQ = new Map<number, number>()
    const bLastByQ = new Map<number, number>()

    for (const ev of scoreEvents) {
      const type: '2P'|'3P'|'FT' = ev.points === 1 ? 'FT' : ev.points === 2 ? '2P' : '3P'
      if (ev.team === 'us') {
        const scorer = ev.player_id ? players.find(p => p.id === ev.player_id) : null
        const num = scorer?.number ?? ''
        aCur += ev.points
        aMarks.set(aCur, { type, num, quarter: ev.quarter })
        aLastByQ.set(ev.quarter, aCur)
      } else {
        const m = ev.opp_player_name?.match(/#(\d+)/); const num = m ? m[1] : ''
        bCur += ev.points
        bMarks.set(bCur, { type, num, quarter: ev.quarter })
        bLastByQ.set(ev.quarter, bCur)
      }
    }
    aLastByQ.forEach((score, q) => aQEnds.set(q, score))
    bLastByQ.forEach((score, q) => bQEnds.set(q, score))

    let aMax = 0, bMax = 0
    aMarks.forEach((_, k) => { if (k > aMax) aMax = k })
    bMarks.forEach((_, k) => { if (k > bMax) bMax = k })
    return { aMarks, bMarks, aQEnds, bQEnds, maxScore: Math.max(aMax, bMax) }
  }, [scoreEvents, players])

  // Q終了スコア（A/B 列別）
  const aQEndScores = new Set(aQEnds.values())
  const bQEndScores = new Set(bQEnds.values())

  function Cell({ val, onCommit }: { val: number; onCommit: (v: string) => void }) {
    if (!editMode) return <span className="font-bold tabular-nums">{val}</span>
    return <input type="number" defaultValue={val} onBlur={e => onCommit(e.target.value)}
      className="w-10 text-center bg-yellow-500/20 border border-yellow-500/40 rounded text-sm font-bold py-0.5 focus:outline-none focus:border-yellow-400" />
  }

  function FoulDots({ count }: { count: number }) {
    return (
      <div className="flex gap-0.5 justify-center">
        {[1,2,3,4,5].map(i => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center text-[7px] font-bold flex-shrink-0
            ${i <= count ? 'bg-red-500 border-red-500 text-white' : 'border-[var(--muted)]'}`}>
            {i <= count ? '×' : ''}
          </span>
        ))}
      </div>
    )
  }

  // ランニングスコアのセルレンダリング
  function RunCell({ mark, isQEnd, isGameEnd, color }: {
    mark: RunMarkData | undefined; isQEnd: boolean; isGameEnd: boolean; color: 'orange' | 'blue'
  }) {
    const borderClass = isGameEnd
      ? 'border-b-4 border-double border-orange-500'
      : isQEnd ? `border-b-2 ${color === 'orange' ? 'border-orange-400/70' : 'border-blue-400/70'}`
      : ''
    const colorClass = color === 'orange' ? 'text-orange-300' : 'text-blue-300'

    if (!mark) return <td className={`py-0.5 px-1 text-center text-[10px] min-w-[56px] ${borderClass}`} />
    return (
      <td className={`py-0.5 px-1 text-center text-[10px] min-w-[56px] ${colorClass} font-medium ${borderClass}`}>
        {mark.type === 'FT' && (
          <span>● <span className="text-[8px]">{mark.num && `#${mark.num}`}</span></span>
        )}
        {mark.type === '2P' && (
          <span className="text-[8px]">{mark.num ? `#${mark.num}` : '—'}</span>
        )}
        {mark.type === '3P' && (
          <span className="inline-flex items-center gap-0.5">
            <span className="border border-current rounded-sm px-0.5 text-[8px] leading-tight">{mark.num ? `#${mark.num}` : '—'}</span>
          </span>
        )}
      </td>
    )
  }

  return (
    <div className="px-3 py-3 space-y-4 pb-8">
      {/* Q終了 確認バナー */}
      {qConfirmPending && onConfirmAdvance && (
        <div className="bg-orange-500/15 border border-orange-500/60 rounded-xl p-4">
          <div className="text-sm font-bold text-orange-400 mb-1">Q{qConfirmPending - 1} 終了 — スコアを確認してください</div>
          <div className="text-xs text-[var(--muted)] mb-3">下の内容を確認・修正したあとに「確定して Q{qConfirmPending} へ」を押してください。</div>
          <button
            onClick={onConfirmAdvance}
            className="w-full btn-primary py-3 text-base font-bold"
          >
            ✓ 確定して Q{qConfirmPending} へ進む
          </button>
        </div>
      )}

      {/* 操作バー */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-[var(--muted)]">Q終了後に自動反映 · 手動修正可</div>
        <button
          onClick={() => setEditMode(e => !e)}
          className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
            editMode ? 'bg-yellow-500/20 border-yellow-500 text-yellow-400 font-bold' : 'bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)]'
          }`}
        >
          {editMode ? '✓ 手動修正中' : '✎ 手動修正'}
        </button>
      </div>

      {/* ─ クォータースコア ─ */}
      <div className="card p-0 overflow-hidden">
        <div className="px-3 py-2 text-[10px] text-[var(--muted)] font-bold uppercase tracking-wide border-b border-[var(--card-border)]">
          クォータースコア
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] text-[var(--muted)] border-b border-[var(--card-border)]">
                <th className="text-left py-2 px-3 w-20">チーム</th>
                {[1,2,3,4].map(q => <th key={q} className="text-center py-2 px-3">Q{q}</th>)}
                <th className="text-center py-2 px-3 text-white">合計</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-[var(--card-border)]">
                <td className="py-2.5 px-3 text-orange-400 font-bold text-xs">自チーム</td>
                {[1,2,3,4].map(q => (
                  <td key={q} className="text-center py-2 px-3">
                    <Cell val={qScore(q).us} onCommit={v => {
                      const n = parseInt(v); if (isNaN(n)) return
                      saveOv({...ov, quarterScores: {...ov.quarterScores, [q]: {...ov.quarterScores[q], us: n}}})
                    }} />
                  </td>
                ))}
                <td className="text-center py-2 px-3 text-orange-400 font-bold text-base">{totUs}</td>
              </tr>
              <tr>
                <td className="py-2.5 px-3 text-blue-400 font-bold text-xs truncate max-w-[80px]">{game.opponent}</td>
                {[1,2,3,4].map(q => (
                  <td key={q} className="text-center py-2 px-3">
                    <Cell val={qScore(q).opp} onCommit={v => {
                      const n = parseInt(v); if (isNaN(n)) return
                      saveOv({...ov, quarterScores: {...ov.quarterScores, [q]: {...ov.quarterScores[q], opp: n}}})
                    }} />
                  </td>
                ))}
                <td className="text-center py-2 px-3 text-blue-400 font-bold text-base">{totOpp}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ─ 自チーム選手 (出場時間 + ファウル) ─ */}
      {players.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-orange-400 font-bold uppercase tracking-wide border-b border-[var(--card-border)]">
            自チーム — 選手スタッツ
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[340px]">
              <thead>
                <tr className="text-[10px] text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="text-left py-2 px-2 w-8">#</th>
                  <th className="text-left py-2 pr-1">名前</th>
                  <th className="text-center py-2 px-1" title="出場クォーター">出場</th>
                  <th className="text-center py-2 px-1 text-orange-400">得点</th>
                  <th className="text-center py-2 px-1">2P</th>
                  <th className="text-center py-2 px-1">3P</th>
                  <th className="text-center py-2 px-1">FT</th>
                  <th className="text-center py-2 px-1">反則</th>
                </tr>
              </thead>
              <tbody>
                {players.map(p => {
                  const stat = statsMap.get(p.id)
                  const autoPts = stat ? calcPoints(stat) : 0
                  const autoFouls = stat ? getTotalFouls(stat) : 0
                  const pts = ov.homePlayers[p.id]?.pts ?? autoPts
                  const fouls = ov.homePlayers[p.id]?.fouls ?? autoFouls
                  // 出場クォーター表示
                  const appearedQs = [1,2,3,4].filter(q => qStarters.get(q)?.has(p.id))
                  return (
                    <tr key={p.id} className="border-b border-[var(--card-border)]/50">
                      <td className="py-2 px-2 text-orange-400 font-bold whitespace-nowrap">{p.number || '—'}</td>
                      <td className="py-2 pr-1 text-white truncate max-w-[65px]">{p.name}</td>
                      <td className="py-2 px-1 text-center">
                        <div className="flex gap-0.5 justify-center">
                          {[1,2,3,4].map(q => (
                            <span key={q} className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                              appearedQs.includes(q) ? 'bg-orange-500/30 text-orange-400 border border-orange-500/50' : 'text-[var(--muted)]/30'
                            }`}>
                              {q}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-1 text-center">
                        {editMode ? (
                          <input type="number" defaultValue={pts} onBlur={e => commitPtsEdit(p.id, e.target.value)}
                            className="w-10 text-center bg-yellow-500/20 border border-yellow-500/40 rounded py-0.5 text-orange-400 font-bold focus:outline-none" />
                        ) : <span className="text-orange-400 font-bold">{pts}</span>}
                      </td>
                      <td className="py-2 px-1 text-center text-[var(--muted)]">{stat?.fg2_made ?? 0}/{stat?.fg2_attempt ?? 0}</td>
                      <td className="py-2 px-1 text-center text-[var(--muted)]">{stat?.fg3_made ?? 0}/{stat?.fg3_attempt ?? 0}</td>
                      <td className="py-2 px-1 text-center text-[var(--muted)]">{stat?.ft_made ?? 0}/{stat?.ft_attempt ?? 0}</td>
                      <td className="py-2 px-1 text-center">
                        {editMode ? (
                          <input type="number" defaultValue={fouls} min={0} max={5} onBlur={e => commitFoulEdit(p.id, e.target.value)}
                            className="w-10 text-center bg-yellow-500/20 border border-yellow-500/40 rounded py-0.5 focus:outline-none" />
                        ) : <FoulDots count={fouls} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─ 相手チーム選手 ─ */}
      {oppPlayerList.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-3 py-2 text-[10px] text-blue-400 font-bold uppercase tracking-wide border-b border-[var(--card-border)]">
            {game.opponent} — 選手
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[260px]">
              <thead>
                <tr className="text-[10px] text-[var(--muted)] border-b border-[var(--card-border)]">
                  <th className="text-left py-2 px-3">#</th>
                  <th className="text-left py-2 pr-2">名前</th>
                  <th className="text-center py-2 px-1" title="出場クォーター">出場</th>
                  <th className="text-center py-2 px-2">反則</th>
                </tr>
              </thead>
              <tbody>
                {oppPlayerList.map(p => {
                  const fouls = ov.oppPlayers[p.key]?.fouls ?? 0
                  const score = getOppPlayerScore(scoreEvents, `#${p.number} ${p.name}`)
                  const appearedQs = [1,2,3,4].filter(q => {
                    const s = localStorage.getItem(`court_opp_q${q}_${gameId}`)
                    if (!s) return false
                    try { return (JSON.parse(s) as string[]).includes(p.key) } catch { return false }
                  })
                  return (
                    <tr key={p.key} className="border-b border-[var(--card-border)]/50">
                      <td className="py-2 px-3 text-blue-400 font-bold">{p.number || '—'}</td>
                      <td className="py-2 pr-2 text-white truncate max-w-[100px] flex items-center gap-1">
                        {isOppSubstitute(p.key) && <span className="text-red-500 text-[11px] font-bold">＼</span>}
                        <span>{p.name}</span>
                        {score > 0 && <span className="text-[var(--muted)] text-[9px]">{score}pts</span>}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <div className="flex gap-0.5 justify-center">
                          {[1,2,3,4].map(q => (
                            <span key={q} className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                              appearedQs.includes(q) ? 'bg-blue-500/30 text-blue-400 border border-blue-500/50' : 'text-[var(--muted)]/30'
                            }`}>
                              {q}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-2 px-2 text-center">
                        {editMode ? (
                          <input type="number" defaultValue={fouls} min={0} max={5} onBlur={e => {
                            const n = parseInt(e.target.value); if (isNaN(n)) return
                            saveOv({...ov, oppPlayers: {...ov.oppPlayers, [p.key]: {...ov.oppPlayers[p.key], fouls: n}}})
                          }} className="w-10 text-center bg-yellow-500/20 border border-yellow-500/40 rounded py-0.5 focus:outline-none" />
                        ) : <FoulDots count={fouls} />}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─ JBA ランニングスコア ─ */}
      <div className="card p-0 overflow-hidden">
        <div className="px-3 py-2 border-b border-[var(--card-border)] flex items-center justify-between">
          <span className="text-[10px] text-[var(--muted)] font-bold uppercase tracking-wide">
            ランニングスコア RUNNING SCORE
          </span>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-orange-400 font-bold">自チーム</span>
            <span className="text-blue-400 font-bold">{game.opponent}</span>
          </div>
        </div>

        {scoreEvents.length === 0 ? (
          <div className="text-center py-8 text-[var(--muted)] text-sm">スコアが記録されると表示されます</div>
        ) : (
          <>
            {/* 凡例 */}
            <div className="px-3 py-1.5 border-b border-[var(--card-border)] flex gap-4 text-[9px] text-[var(--muted)]">
              <span><span className="text-white font-bold">/</span> = 2P</span>
              <span><span className="border border-current rounded-sm px-0.5 text-white font-bold text-[8px]">/</span> = 3P</span>
              <span><span className="text-white font-bold">●</span> = FT</span>
              <span><span className="border-b-2 border-orange-400/70 px-2" /> = Q終了</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-[var(--muted)] border-b border-[var(--card-border)] bg-white/5">
                    <th className="text-center py-1 px-2 w-8">得点</th>
                    <th className="text-center py-1 px-1 text-orange-400 min-w-[60px]">自チーム</th>
                    <th className="text-center py-1 px-1 text-blue-400 min-w-[60px]">{game.opponent}</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: maxScore }, (_, i) => {
                    const score = i + 1
                    const aMark = aMarks.get(score)
                    const bMark = bMarks.get(score)
                    const aEnd = aQEndScores.has(score)
                    const bEnd = bQEndScores.has(score)
                    const isQEnd = aEnd || bEnd
                    // 試合終了 = 最終スコアの行
                    const isGameEnd = score === maxScore

                    return (
                      <tr key={score} className={`${isQEnd ? '' : 'border-b border-[var(--card-border)]/20'} ${isGameEnd ? 'bg-white/5' : ''}`}>
                        <td className={`text-center py-0.5 px-2 text-[9px] tabular-nums
                          ${isGameEnd ? 'text-white font-bold border-b-4 border-double border-orange-500/60' : 'text-[var(--muted)]'}
                          ${aEnd || bEnd ? 'border-b-2 border-white/10' : ''}`}>
                          {score}
                        </td>
                        <RunCell mark={aMark} isQEnd={aEnd} isGameEnd={isGameEnd && !!aMark} color="orange" />
                        <RunCell mark={bMark} isQEnd={bEnd} isGameEnd={isGameEnd && !!bMark} color="blue" />
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Q毎合計フッター */}
            <div className="border-t border-[var(--card-border)] px-3 py-2 flex flex-wrap gap-3">
              {[1,2,3,4].filter(q => autoQS[q-1].us > 0 || autoQS[q-1].opp > 0).map(q => (
                <div key={q} className="text-[10px]">
                  <span className="text-[var(--muted)] font-bold">Q{q}</span>
                  {' '}<span className="text-orange-400 font-bold">{qScore(q).us}</span>
                  <span className="text-[var(--muted)] mx-1">-</span>
                  <span className="text-blue-400 font-bold">{qScore(q).opp}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ─── JBA 公式スコアシート (紙ベース) ────────────────────────────────────────
function JBASheet({ game, players, statsMap, scoreEvents, oppPlayerList, gameId, qConfirmPending, onConfirmAdvance, oppFoulsMap }: {
  game: Game; players: Player[]; statsMap: Map<string, PlayerStat>
  scoreEvents: ScoreEvent[]; oppPlayerList: OppPlayer[]; gameId: string
  qConfirmPending?: number | null; onConfirmAdvance?: () => void
  oppFoulsMap?: Record<string, OppFoulData>
}) {
  const qScores = useMemo(() => [1,2,3,4].map(q => ({
    us:  scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0),
    opp: scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0),
  })), [scoreEvents])
  const totalUs  = qScores.reduce((s,q) => s+q.us, 0)
  const totalOpp = qScores.reduce((s,q) => s+q.opp, 0)

  const qHomeStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 4; q++) {
      const s = localStorage.getItem(`court_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const qOppStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 4; q++) {
      const s = localStorage.getItem(`court_opp_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const qHomeSubs = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 4; q++) {
      const s = localStorage.getItem(`sub_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const qOppSubs = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 4; q++) {
      const s = localStorage.getItem(`sub_opp_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const { aMarks, bMarks, aQEndScores, bQEndScores } = useMemo(() => {
    const aMarks = new Map<number, RunMarkData>()
    const bMarks = new Map<number, RunMarkData>()
    const aLastByQ = new Map<number, number>()
    const bLastByQ = new Map<number, number>()
    let aC = 0, bC = 0
    for (const ev of scoreEvents) {
      const type: '2P'|'3P'|'FT' = ev.points === 1 ? 'FT' : ev.points === 2 ? '2P' : '3P'
      if (ev.team === 'us') {
        const num = players.find(p => p.id === ev.player_id)?.number ?? ''
        aC += ev.points
        aMarks.set(aC, { type, num, quarter: ev.quarter })
        aLastByQ.set(ev.quarter, aC)
      } else {
        const m = ev.opp_player_name?.match(/#(\d+)/); const num = m ? m[1] : ''
        bC += ev.points
        bMarks.set(bC, { type, num, quarter: ev.quarter })
        bLastByQ.set(ev.quarter, bC)
      }
    }
    const aQEndScores = new Set<number>(); aLastByQ.forEach(v => aQEndScores.add(v))
    const bQEndScores = new Set<number>(); bLastByQ.forEach(v => bQEndScores.add(v))
    return { aMarks, bMarks, aQEndScores, bQEndScores }
  }, [scoreEvents, players])

  const B = '1px solid #aaa'
  const TB = '2px solid #111'

  // ランニングスコアのセル (flatMap で使うためインライン)
  function markContent(mark: RunMarkData | undefined): React.ReactNode {
    if (!mark) return null
    if (mark.type === 'FT') return `●${mark.num}`
    if (mark.type === '2P') return mark.num || '—'
    return <span style={{border:'1px solid #333', borderRadius:'50%', padding:'0 2px', fontSize:7, lineHeight:1}}>{mark.num || '—'}</span>
  }

  // チーム別プレイヤーテーブル
  function TeamSection({ teamLabel, playerList, starters, subs, getStats, isHome }: {
    teamLabel: string
    playerList: { id: string; number: string; name: string }[]
    starters: Map<number, Set<string>>
    subs: Map<number, Set<string>>
    getStats: (id: string) => PlayerStat | undefined
    isHome: boolean
  }) {
    return (
      <div style={{border:'2px solid #333', marginBottom:6}}>
        {/* ヘッダー */}
        <div style={{
          borderBottom:'1px solid #555', padding:'2px 5px',
          display:'flex', justifyContent:'space-between', alignItems:'center',
          background:'#f5f5f0'
        }}>
          <span style={{fontWeight:'bold', fontSize:10}}>{teamLabel}</span>
          <div style={{display:'flex', gap:2, alignItems:'center'}}>
            <span style={{fontSize:6, color:'#666'}}>タイムアウト</span>
            {[1,2,3,4,5].map(i => (
              <span key={i} style={{
                width:11, height:11, border:'1px solid #444', borderRadius:'50%',
                display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:6
              }}>{i}</span>
            ))}
            <span style={{
              width:22, height:11, border:'1px solid #444',
              display:'inline-flex', alignItems:'center', justifyContent:'center', fontSize:6
            }}>OT</span>
          </div>
        </div>

        {/* 選手テーブル */}
        <table style={{borderCollapse:'collapse', width:'100%', tableLayout:'fixed', fontSize:7}}>
          <colgroup>
            <col style={{width:13}} />{/* No */}
            <col />{/* 氏名 */}
            <col style={{width:18}} />{/* 背番号 */}
            <col style={{width:12}} /><col style={{width:12}} /><col style={{width:12}} /><col style={{width:12}} />{/* 出場Q */}
            <col style={{width:11}} /><col style={{width:11}} /><col style={{width:11}} /><col style={{width:11}} /><col style={{width:11}} />{/* ファウル */}
          </colgroup>
          <thead>
            <tr style={{height:13, background:'#ede', fontSize:6}}>
              <th style={{border:B, textAlign:'center'}}></th>
              <th style={{border:B, textAlign:'left', paddingLeft:2}}>選手氏名</th>
              <th style={{border:B, textAlign:'center'}}>No.</th>
              {['①','②','③','④'].map(s => <th key={s} style={{border:B, textAlign:'center'}}>{s}</th>)}
              {['1','2','3','4','5'].map(s => <th key={s} style={{border:B, textAlign:'center'}}>{s}</th>)}
            </tr>
          </thead>
          <tbody>
            {Array.from({length:15}, (_, i) => {
              const p = playerList[i]
              if (!p) return (
                <tr key={i} style={{height:14}}>
                  <td style={{border:B, textAlign:'center', color:'#bbb', fontSize:6}}>{i+1}</td>
                  <td style={{border:B}} /><td style={{border:B}} />
                  {Array.from({length:9}).map((_,j) => <td key={j} style={{border:B}} />)}
                </tr>
              )
              const stat = getStats(p.id)
              const fouls = stat ? getTotalFouls(stat) : 0
              const foulNotation = stat ? getFoulNotation(stat) : ''
              const foulParts = foulNotation.split(' ').filter(x => x)
              return (
                <tr key={p.id} style={{height:14}}>
                  <td style={{border:B, textAlign:'center', fontSize:6, color:'#888'}}>{i+1}</td>
                  <td style={{border:B, paddingLeft:2, fontSize:8, overflow:'hidden', whiteSpace:'nowrap'}}>
                    {p.name}
                  </td>
                  <td style={{border:B, textAlign:'center', fontWeight:'bold', fontSize:9}}>{p.number}</td>
                  {[1,2,3,4].map(q => {
                    const isStarter = starters.get(q)?.has(p.id)
                    const isSub = subs.get(q)?.has(p.id)
                    return (
                      <td key={q} style={{border:B, textAlign:'center', fontSize:11, color:'#c00', fontStyle:'italic'}}>
                        {isStarter ? '/' : isSub ? '╲' : ''}
                      </td>
                    )
                  })}
                  {[1,2,3,4,5].map(f => (
                    <td key={f} style={{border:B, textAlign:'center', fontSize:6, color:'#c00', fontWeight:'bold', lineHeight:'11px', verticalAlign:'top', paddingTop:'1px'}}>
                      {foulParts[f-1] ?? ''}
                    </td>
                  ))}
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Qスコア */}
        <div style={{
          borderTop:'1px solid #555', padding:'2px 6px',
          display:'flex', justifyContent:'space-between', fontSize:8, background:'#f9f9f5'
        }}>
          {[1,2,3,4].map(q => (
            <div key={q} style={{textAlign:'center'}}>
              <div style={{fontSize:6, color:'#888'}}>Q{q}</div>
              <div style={{fontWeight:'bold'}}>
                <span style={isHome ? {color:'#c00'} : {}}>{qScores[q-1].us}</span>
                <span style={{color:'#aaa', margin:'0 1px'}}>-</span>
                <span style={!isHome ? {color:'#00c'} : {}}>{qScores[q-1].opp}</span>
              </div>
            </div>
          ))}
          <div style={{textAlign:'center', borderLeft:'1px solid #ddd', paddingLeft:8}}>
            <div style={{fontSize:6, color:'#888'}}>合計</div>
            <div style={{fontWeight:'bold', fontSize:11}}>
              <span style={{color:'#c00'}}>{totalUs}</span>
              <span style={{color:'#aaa', margin:'0 2px'}}>-</span>
              <span style={{color:'#00c'}}>{totalOpp}</span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background:'white', color:'black', padding:'8px 6px',
      fontFamily:'Arial, Helvetica, sans-serif', fontSize:8,
      maxWidth:'100%', overflowX:'auto'
    }}>
      {/* Q終了確認バナー */}
      {qConfirmPending && onConfirmAdvance && (
        <div style={{
          background:'#fff3cd', border:'2px solid #f90', borderRadius:8,
          padding:'8px 12px', marginBottom:8
        }}>
          <div style={{fontWeight:'bold', fontSize:13, color:'#c60', marginBottom:3}}>
            Q{qConfirmPending - 1} 終了 — スコアを確認してください
          </div>
          <div style={{fontSize:10, color:'#666', marginBottom:8}}>
            下のスコアシートを確認・修正したあとに「確定」を押してください
          </div>
          <button
            onClick={onConfirmAdvance}
            style={{
              width:'100%', padding:'10px', background:'#f60', color:'white',
              border:'none', borderRadius:6, fontWeight:'bold', fontSize:14, cursor:'pointer'
            }}
          >
            ✓ 確定して Q{qConfirmPending} へ進む
          </button>
        </div>
      )}

      {/* シートヘッダー */}
      <div style={{
        display:'flex', justifyContent:'space-between', alignItems:'center',
        borderBottom:'2px solid #333', paddingBottom:4, marginBottom:5
      }}>
        <div style={{fontSize:9, fontWeight:'bold', color:'#444'}}>JBA OFFICIAL SCORESHEET</div>
        <div style={{fontSize:10, fontWeight:'bold'}}>
          {game.game_date ? new Date(game.game_date).toLocaleDateString('ja-JP',{month:'numeric',day:'numeric'}) : ''}
          {game.location ? `　${game.location}` : ''}
        </div>
        <div style={{fontSize:13, fontWeight:'bold'}}>
          <span style={{color:'#c00'}}>{totalUs}</span>
          <span style={{color:'#888', margin:'0 3px'}}>-</span>
          <span style={{color:'#00c'}}>{totalOpp}</span>
        </div>
      </div>

      <div style={{display:'flex', gap:6, alignItems:'flex-start'}}>
        {/* 左: チームセクション */}
        <div style={{flex:'0 0 auto', minWidth:240, maxWidth:290}}>
          <TeamSection
            teamLabel="自チーム（A）"
            playerList={players.map(p => ({id:p.id, number:p.number??'', name:p.name}))}
            starters={qHomeStarters}
            subs={qHomeSubs}
            getStats={id => statsMap.get(id)}
            isHome={true}
          />
          <TeamSection
            teamLabel={`${game.opponent}（B）`}
            playerList={oppPlayerList.map(p => ({id:p.key, number:p.number, name:p.name}))}
            starters={qOppStarters}
            subs={qOppSubs}
            getStats={pid => {
              // oppFoulsMap prop優先、なければ localStorage の scoresheet_ov から取得
              const foulEntry = oppFoulsMap?.[pid]
              if (foulEntry !== undefined) {
                const total = foulEntry.fouls_plain + foulEntry.fouls_1ft + foulEntry.fouls_2ft + foulEntry.fouls_3ft + foulEntry.technical_fouls
                if (!total) return undefined
                return { ...emptyStats(gameId, pid), ...foulEntry }
              }
              // localStorage フォールバック（FinishedGameView など prop なしの場合）
              try {
                const s = localStorage.getItem(`scoresheet_ov_${gameId}`)
                if (!s) return undefined
                const raw = JSON.parse(s).oppPlayers?.[pid]
                if (!raw) return undefined
                const stat = emptyStats(gameId, pid)
                stat.fouls_plain = raw.fouls_plain ?? raw.fouls ?? 0
                stat.fouls_1ft = raw.fouls_1ft ?? 0
                stat.fouls_2ft = raw.fouls_2ft ?? 0
                stat.fouls_3ft = raw.fouls_3ft ?? 0
                stat.technical_fouls = raw.technical_fouls ?? 0
                if (!getTotalFouls(stat)) return undefined
                return stat
              } catch { return undefined }
            }}
            isHome={false}
          />
        </div>

        {/* 右: ランニングスコア */}
        <div style={{flex:'1 1 auto'}}>
          <div style={{textAlign:'center', fontWeight:'bold', fontSize:8, marginBottom:3, letterSpacing:1}}>
            ランニングスコア　RUNNING SCORE
          </div>
          <table style={{borderCollapse:'collapse', margin:'0 auto', fontSize:7}}>
            <thead>
              <tr style={{background:'#ede', fontSize:6}}>
                {[0,1,2].flatMap(g => [
                  <th key={`ha${g}`} style={{border:B, width:30, textAlign:'center', padding:'1px'}}>A</th>,
                  <th key={`hb${g}`} style={{border:B, width:30, textAlign:'center', padding:'1px', borderRight:g<2?'2px solid #888':B}}>B</th>,
                ])}
              </tr>
            </thead>
            <tbody>
              {Array.from({length:40}, (_, i) => {
                const ns = [i+1, i+41, i+81]
                return (
                  <tr key={i}>
                    {ns.flatMap((n, gi) => {
                      const aEnd = aQEndScores.has(n)
                      const bEnd = bQEndScores.has(n)
                      const bbA = aEnd ? TB : B
                      const bbB = bEnd ? TB : B
                      const aM = aMarks.get(n)
                      const bM = bMarks.get(n)
                      const qClr = (q?: number) => (q === 1 || q === 3) ? '#c00' : '#222'
                      const aColor = qClr(aM?.quarter)
                      const bColor = qClr(bM?.quarter)
                      return [
                        <td key={`a${n}`} style={{border:B, borderBottom:bbA, width:30, height:13, position:'relative', textAlign:'center', verticalAlign:'middle', fontSize:8, lineHeight:'13px', color:aColor}}>
                          <span style={{position:'absolute', top:0, left:1, fontSize:5, color:'#bbb', lineHeight:'1', userSelect:'none'}}>{n}</span>
                          {markContent(aM)}
                        </td>,
                        <td key={`b${n}`} style={{border:B, borderBottom:bbB, borderRight:gi<2?'2px solid #888':B, width:30, height:13, textAlign:'center', verticalAlign:'middle', fontSize:8, lineHeight:'13px', color:bColor}}>
                          {markContent(bM)}
                        </td>,
                      ]
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── 試合終了後スタッツ一覧 ──────────────────────────────────────────────────
function FinishedGameView({ game, players, statsMap, scoreEvents, oppPlayerList }: {
  game: Game
  players: Player[]
  statsMap: Map<string, PlayerStat>
  scoreEvents: ScoreEvent[]
  oppPlayerList: OppPlayer[]
}) {
  const [tab, setTab] = useState<'stats' | 'running' | 'scoresheet'>('stats')
  // 試合に登録された選手のうち、スタッツが存在する選手のみ表示
  const rows = players
    .filter(p => statsMap.has(p.id))
    .map(p => ({
      player: p,
      stat: statsMap.get(p.id)!,
    }))

  // 個人スタッツの合計得点を正とする
  const totalPoints = rows.reduce((sum, { stat }) => sum + calcPoints(stat), 0)
  const won = totalPoints > game.opponent_score
  const lost = totalPoints < game.opponent_score

  function buildShareText() {
    const result = won ? '勝利🎉' : lost ? '敗北' : '引き分け'
    const qRows = [1,2,3,4].map(q => {
      const us  = scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0)
      const opp = scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0)
      return us > 0 || opp > 0 ? `  Q${q}: 自${us} - 相${opp}` : null
    }).filter(Boolean)

    const lines = [
      `🏀 vs ${game.opponent}  ${result}`,
      `${totalPoints} - ${game.opponent_score}`,
      ...(qRows.length ? ['', '【クォータースコア】', ...qRows] : []),
      '',
      '【選手スタッツ】',
      ...rows.filter(({ stat }) => calcPoints(stat) > 0 || stat.rebounds > 0 || stat.assists > 0).map(({ player, stat }) => {
        const pts = calcPoints(stat)
        const parts = [`${pts}pts`]
        if (stat.fg2_made > 0) parts.push(`2P${stat.fg2_made}/${stat.fg2_attempt}`)
        if (stat.fg3_made > 0) parts.push(`3P${stat.fg3_made}/${stat.fg3_attempt}`)
        if (stat.ft_made > 0) parts.push(`FT${stat.ft_made}/${stat.ft_attempt}`)
        if (stat.rebounds > 0) parts.push(`R${stat.rebounds}`)
        if (stat.assists > 0) parts.push(`A${stat.assists}`)
        if (stat.steals > 0) parts.push(`S${stat.steals}`)
        return `#${player.number || '—'} ${player.name}: ${parts.join(' ')}`
      }),
    ]
    return lines.join('\n')
  }

  async function shareResult() {
    const text = buildShareText()
    const encoded = encodeURIComponent(text)
    window.open(`https://line.me/R/msg/text/?${encoded}`, '_blank')
  }

  function printScoresheet() {
    window.print()
  }

  return (
    <div className="min-h-screen flex flex-col">
      {/* ヘッダー */}
      <div className="border-b border-[var(--card-border)] px-4 py-4">
        <div className="flex items-center justify-between">
          <Link href={`/teams/${game.team_id}`} className="text-[var(--muted)] text-sm print:hidden">← 戻る</Link>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={printScoresheet}
              className="flex items-center gap-1.5 bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] text-sm font-bold px-3 py-1.5 rounded-lg active:opacity-80"
            >
              🖨 印刷
            </button>
            <button
              onClick={shareResult}
              className="flex items-center gap-1.5 bg-[#06C755] text-white text-sm font-bold px-3 py-1.5 rounded-lg active:opacity-80"
            >
              <svg width="16" height="16" viewBox="0 0 40 40" fill="currentColor"><path d="M20 2C10.06 2 2 9.16 2 17.9c0 5.6 3.54 10.52 8.86 13.36-.39 1.46-1.42 5.3-1.63 6.12-.26 1.02.37 1.01.78.74.32-.21 5.1-3.47 7.17-4.88.9.13 1.83.2 2.77.2 9.94 0 18-7.16 18-15.9S29.94 2 20 2z"/></svg>
              LINE共有
            </button>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--muted)] mb-0.5">vs {game.opponent}</div>
            <div className={`text-3xl font-bold ${won ? 'text-green-400' : lost ? 'text-red-400' : 'text-white'}`}>
              {totalPoints} <span className="text-[var(--muted)] text-xl">-</span> {game.opponent_score}
            </div>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-bold ${won ? 'bg-green-500/20 text-green-400' : lost ? 'bg-red-500/20 text-red-400' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
            {won ? '勝利' : lost ? '敗北' : '引き分け'}
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="flex border-b border-[var(--card-border)] px-4">
        <button
          onClick={() => setTab('stats')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'stats' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
        >
          選手スタッツ
        </button>
        <button
          onClick={() => setTab('running')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'running' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
        >
          ランニング
        </button>
        <button
          onClick={() => setTab('scoresheet')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${tab === 'scoresheet' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
        >
          スコアシート
        </button>
      </div>

      {/* コンテンツ */}
      <div className="flex-1 px-2 py-4">
        {tab === 'stats' && (
          <>
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
                      <td className="py-3 pl-2 pr-3 text-orange-400 font-bold text-xs whitespace-nowrap">{player.number || '—'}</td>
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
                      <td className="py-3 pr-2 text-right text-[var(--muted)]">{getTotalFouls(stat)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-orange-500/40 bg-white/5 font-bold">
                    <td className="py-3 pl-2 pr-3 text-[var(--muted)] text-xs">—</td>
                    <td className="py-3 pr-3 text-white text-sm">合計</td>
                    <td className="py-3 pr-3 text-right text-orange-400 text-base">{totalPoints}</td>
                    <td colSpan={9} />
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'running' && (
          <RunningScoreView
            events={scoreEvents}
            teamName="自チーム"
            opponentName={game.opponent}
            players={players}
          />
        )}

        {tab === 'scoresheet' && (
          <JBASheet
            game={game}
            players={players}
            statsMap={statsMap}
            scoreEvents={scoreEvents}
            oppPlayerList={oppPlayerList}
            gameId={game.id}
          />
        )}
      </div>
    </div>
  )
}

// ─── スターター選択画面 ─────────────────────────────────────────────────────────
function CourtSetup({ players, oppPlayers, currentQuarter, onConfirm, initialIds, initialOppKeys }: {
  players: Player[]
  oppPlayers: OppPlayer[]
  currentQuarter: number
  onConfirm: (homeIds: string[], oppKeys: string[]) => void
  initialIds: string[]
  initialOppKeys: string[]
}) {
  const [selected, setSelected] = useState<string[]>(initialIds.slice(0, 5))
  const [selectedOpp, setSelectedOpp] = useState<string[]>(initialOppKeys.slice(0, 5))
  const [confirmError, setConfirmError] = useState('')

  function toggleHome(id: string) {
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev)
    setConfirmError('')
  }
  function toggleOpp(key: string) {
    setSelectedOpp(prev => prev.includes(key) ? prev.filter(x => x !== key) : prev.length < 5 ? [...prev, key] : prev)
  }

  function handleConfirm() {
    if (selected.length < 5) {
      setConfirmError(`自チームのスターターを5人選んでください（現在${selected.length}人）`)
      return
    }
    setConfirmError('')
    onConfirm(selected, selectedOpp)
  }

  function PlayerRow({ id, number, name, isSelected, isDisabled, onToggle, color }: {
    id: string; number: string; name: string
    isSelected: boolean; isDisabled: boolean
    onToggle: () => void; color: 'orange' | 'blue'
  }) {
    return (
      <button
        onClick={onToggle}
        disabled={isDisabled}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full ${
          isSelected
            ? color === 'orange' ? 'bg-orange-500/20 border-orange-500' : 'bg-blue-500/20 border-blue-500'
            : isDisabled ? 'bg-[var(--card)] border-[var(--card-border)] opacity-40'
            : 'bg-[var(--card)] border-[var(--card-border)]'
        }`}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
          isSelected
            ? color === 'orange' ? 'border-orange-400 text-orange-400' : 'border-blue-400 text-blue-400'
            : 'border-[var(--muted)] text-[var(--muted)]'
        }`}>{isSelected ? '✓' : ' '}</span>
        <span className={`font-bold w-10 ${color === 'orange' ? 'text-orange-400' : 'text-blue-400'}`}>#{number || '—'}</span>
        <span className={`font-medium ${isSelected ? 'text-white' : 'text-[var(--muted)]'}`}>{name}</span>
        {isSelected && <span className={`ml-auto text-xs font-medium ${color === 'orange' ? 'text-orange-400' : 'text-blue-400'}`}>コート</span>}
      </button>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 bg-[var(--background)] border-b border-[var(--card-border)] px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-white text-lg">Q{currentQuarter} スターター</div>
          <div className="text-xs text-[var(--muted)]">自チーム {selected.length}/5　相手 {selectedOpp.length}/5</div>
          {confirmError && (
            <div className="text-red-400 text-xs mt-1 font-medium">{confirmError}</div>
          )}
        </div>
        <button
          onClick={handleConfirm}
          className="btn-primary text-sm py-2 px-5"
        >
          決定
        </button>
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* 自チーム */}
        <div>
          <div className="text-xs font-bold text-orange-400 mb-2 uppercase tracking-wide">自チーム（{selected.length}/5）</div>
          <div className="flex flex-col gap-2">
            {players.map(p => (
              <PlayerRow key={p.id} id={p.id} number={p.number ?? ''} name={p.name}
                isSelected={selected.includes(p.id)}
                isDisabled={!selected.includes(p.id) && selected.length >= 5}
                onToggle={() => toggleHome(p.id)} color="orange" />
            ))}
            {players.length === 0 && <p className="text-center py-4 text-[var(--muted)] text-sm">選手を登録してください</p>}
          </div>
        </div>

        {/* 相手チーム */}
        {oppPlayers.length > 0 && (
          <div>
            <div className="text-xs font-bold text-blue-400 mb-2 uppercase tracking-wide">相手チーム（{selectedOpp.length}/5）</div>
            <div className="flex flex-col gap-2">
              {oppPlayers.map(p => (
                <PlayerRow key={p.key} id={p.key} number={p.number} name={p.name}
                  isSelected={selectedOpp.includes(p.key)}
                  isDisabled={!selectedOpp.includes(p.key) && selectedOpp.length >= 5}
                  onToggle={() => toggleOpp(p.key)} color="blue" />
              ))}
            </div>
          </div>
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
  const [scoreEvents, setScoreEvents] = useState<ScoreEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [halfTimeReset, setHalfTimeReset] = useState(false)
  const [teamFouls, setTeamFouls] = useState(0)
  const [currentQuarter, setCurrentQuarter] = useState(1)
  const [onCourtIds, setOnCourtIds] = useState<string[]>([])
  const [oppCourtKeys, setOppCourtKeys] = useState<string[]>([])
  const [oppPlayerList, setOppPlayerList] = useState<OppPlayer[]>([])
  const [selectedOppPlayer, setSelectedOppPlayer] = useState<OppPlayer | null>(null)
  const [courtSetupMode, setCourtSetupMode] = useState(false)
  const [recordingTab, setRecordingTab] = useState<'record' | 'running' | 'scoresheet'>('record')
  const [opponentPlayerKeys, setOpponentPlayerKeys] = useState<Set<string>>(new Set())
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveStatsRef = useRef<() => Promise<void>>(async () => {})
  const gidRef = useRef(0)
  const skipUndoStackRef = useRef(false)
  const gameRef = useRef<Game | null>(null)
  const scoreEventsRef = useRef<ScoreEvent[]>([])
  const [undoStack, setUndoStack] = useState<PendingChange[][]>([])
  const [subInPlayer, setSubInPlayer] = useState<Player | null>(null)
  const [subInOppPlayer, setSubInOppPlayer] = useState<OppPlayer | null>(null)
  const [showQScore, setShowQScore] = useState<number | null>(null)
  const [qConfirmPending, setQConfirmPending] = useState<number | null>(null) // Q終了後の確認待ち
  const [homeTimeouts, setHomeTimeouts] = useState(0)
  const [oppTimeouts, setOppTimeouts] = useState(0)
  const [foulDialog, setFoulDialog] = useState<{ isOpen: boolean; playerId?: string }>({ isOpen: false })
  const [foulOppDialog, setFoulOppDialog] = useState<{ isOpen: boolean; playerKey?: string; playerName?: string }>({ isOpen: false })
  const [oppTeamFouls, setOppTeamFouls] = useState(0)
  const [oppFoulsMap, setOppFoulsMap] = useState<Record<string, OppFoulData>>({})

  // Q毎の得点（Q ボタンポップアップ用）
  const qScores = useMemo(() => [1,2,3,4].map(q => ({
    us:  scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0),
    opp: scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0),
  })), [scoreEvents])

  // pending を statsMap に反映した実効値マップ（scoresheet との整合性確保）
  const effectiveStatsMap = useMemo(() => {
    if (pending.length === 0) return statsMap
    const map = new Map(statsMap)
    for (const change of pending) {
      const base = map.get(change.playerId) ?? emptyStats(id, change.playerId)
      const updated = { ...base } as unknown as Record<string, number | string>
      updated[change.key] = Math.max(0, ((updated[change.key] as number) ?? 0) + change.delta)
      map.set(change.playerId, updated as unknown as PlayerStat)
    }
    return map
  }, [statsMap, pending, id])

  useEffect(() => { loadData() }, [id])

  // gameRef / scoreEventsRef を常に最新に同期（saveStats のクロージャずれ対策）
  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { scoreEventsRef.current = scoreEvents }, [scoreEvents])

  useEffect(() => {
    if (pending.length > 0) localStorage.setItem(`pending_${id}`, JSON.stringify(pending))
  }, [pending, id])

  useEffect(() => {
    localStorage.setItem(`score_events_${id}`, JSON.stringify(scoreEvents))
  }, [scoreEvents, id])

  useEffect(() => {
    localStorage.setItem(`undo_stack_${id}`, JSON.stringify(undoStack))
  }, [undoStack, id])

  // pending が変わったら1.5秒後に自動保存
  // ※ length が 0 になった場合も必ずタイマーをキャンセルしてから return する
  useEffect(() => {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = null
    if (pending.length === 0) return
    autoSaveTimer.current = setTimeout(() => { saveStatsRef.current() }, 1500)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [pending.length])

  async function loadData() {
    const supabase = createClient()
    const { data: gameData } = await supabase.from('games').select('*').eq('id', id).single()
    if (!gameData) { router.push('/dashboard'); return }
    // DBに負のスコアが保存されていた場合は0にクランプ
    setGame({ ...gameData, our_score: Math.max(0, gameData.our_score), opponent_score: Math.max(0, gameData.opponent_score) })
    setCurrentQuarter(gameData.quarter ?? 1)

    // この試合専用メンバーがあればそれを優先（新フロー）、なければ全選手
    const savedHomeIds = localStorage.getItem(`game_${id}_home_players`)
    // localStorageになければSupabaseのhome_player_idsから復元（クロスデバイス対応）
    const homeIds: string[] | null = savedHomeIds
      ? JSON.parse(savedHomeIds)
      : (gameData.home_player_ids as string[] | null) ?? null
    if (homeIds && !savedHomeIds) {
      localStorage.setItem(`game_${id}_home_players`, JSON.stringify(homeIds))
    }
    const [{ data: playersData }, { data: statsData }] = await Promise.all([
      homeIds
        ? supabase.from('players').select('*').in('id', homeIds).order('number')
        : supabase.from('players').select('*').eq('team_id', gameData.team_id).order('number'),
      supabase.from('player_stats').select('*').eq('game_id', id),
    ])

    const map = new Map<string, PlayerStat>()
    statsData?.forEach(s => map.set(s.player_id, s))
    setStatsMap(map)
    setPlayers(playersData ?? [])

    const savedPending = localStorage.getItem(`pending_${id}`)
    if (savedPending) setPending(JSON.parse(savedPending))

    // 個人スタッツ合計を正解スコアとして算出（delta ベースなので常に正確）
    const totalFromStats = statsData
      ? statsData.reduce((s, stat) => s + stat.fg2_made * 2 + stat.fg3_made * 3 + stat.ft_made, 0)
      : 0
    // DB スコアと個人スタッツ合計の大きい方を「正解」とする
    const correctOurScore = Math.max(Math.max(0, gameData.our_score), totalFromStats)

    const savedEvents = localStorage.getItem(`score_events_${id}`)
    if (savedEvents) {
      try {
        const raw: ScoreEvent[] = JSON.parse(savedEvents)
        // localStorage の our_score_after がずれていたら全イベントを補正
        const lastEvt = raw[raw.length - 1]
        let events = raw
        if (lastEvt && lastEvt.our_score_after !== correctOurScore) {
          const delta = correctOurScore - lastEvt.our_score_after
          events = raw.map(e => ({ ...e, our_score_after: e.our_score_after + delta }))
        }
        setScoreEvents(events)
        if (events.length > 0 && !gameData.is_finished) {
          const last = events[events.length - 1]
          setGame(prev => prev ? { ...prev, our_score: correctOurScore, opponent_score: last.opponent_score_after } : prev)
        } else if (!gameData.is_finished) {
          // scoreEvents があるが空の場合、最新スコアに同期
          setGame(prev => prev ? { ...prev, our_score: correctOurScore } : prev)
        }
      } catch { /* ignore */ }
    } else if (gameData.score_events_json) {
      // localStorage になければ Supabase の永続化データから復元（クロスデバイス対応）
      try {
        const events = gameData.score_events_json as ScoreEvent[]
        if (Array.isArray(events) && events.length > 0) {
          setScoreEvents(events)
          const last = events[events.length - 1]
          setGame(prev => prev ? {
            ...prev,
            our_score: Math.max(correctOurScore, last.our_score_after),
            opponent_score: last.opponent_score_after,
          } : prev)
        }
      } catch { /* ignore */ }
    }

    // game state を最新スコアで同期（scoreEvents 読み込み後）
    // 常に correctOurScore に設定（DB 同期 + stats 合計の最大値）
    if (!gameData.is_finished && gameData.our_score !== correctOurScore) {
      setGame(prev => prev ? { ...prev, our_score: correctOurScore } : prev)
    }

    // undoStack を復元
    const savedUndo = localStorage.getItem(`undo_stack_${id}`)
    if (savedUndo) {
      try { setUndoStack(JSON.parse(savedUndo)) } catch { /* ignore */ }
    }

    // 相手チーム選手を読み込む（localStorage優先、なければSupabaseから復元）
    const savedOpp = localStorage.getItem(`game_${id}_opponent_players`)
    if (savedOpp) {
      try {
        const oppList = JSON.parse(savedOpp) as { number: string; name: string }[]
        setOpponentPlayerKeys(new Set(oppList.map(p => `${p.number}_${p.name}`)))
        setOppPlayerList(oppList.map(p => ({ key: `opp_${p.number}_${p.name}`, number: p.number, name: p.name })))
      } catch { /* ignore */ }
    } else if (gameData.opponent_players) {
      // localStorageになければSupabaseから復元（クロスデバイス対応）
      try {
        const oppList = gameData.opponent_players as { number: string; name: string }[]
        if (Array.isArray(oppList) && oppList.length > 0) {
          setOpponentPlayerKeys(new Set(oppList.map(p => `${p.number}_${p.name}`)))
          setOppPlayerList(oppList.map(p => ({ key: `opp_${p.number}_${p.name}`, number: p.number, name: p.name })))
          // 次回のためにlocalStorageにもキャッシュ
          localStorage.setItem(`game_${id}_opponent_players`, JSON.stringify(oppList))
        }
      } catch { /* ignore */ }
    }

    if (!gameData.is_finished) {
      const savedCourt = localStorage.getItem(`court_${id}`)
      const savedOppCourt = localStorage.getItem(`court_opp_${id}`)
      if (savedCourt) {
        setOnCourtIds(JSON.parse(savedCourt))
        if (savedOppCourt) setOppCourtKeys(JSON.parse(savedOppCourt))
      } else {
        setCourtSetupMode(true)
      }
    }

    // 相手ファウルマップを復元
    try {
      const ovRaw = localStorage.getItem(`scoresheet_ov_${id}`)
      const ov = ovRaw ? JSON.parse(ovRaw) : null
      if (ov?.oppPlayers) {
        const fm: Record<string, OppFoulData> = {}
        for (const [k, v] of Object.entries(ov.oppPlayers as Record<string, { fouls?: number; fouls_plain?: number; fouls_1ft?: number; fouls_2ft?: number; fouls_3ft?: number; technical_fouls?: number }>)) {
          const entry: OppFoulData = {
            fouls_plain: v.fouls_plain ?? v.fouls ?? 0, // 旧データとの後方互換
            fouls_1ft: v.fouls_1ft ?? 0,
            fouls_2ft: v.fouls_2ft ?? 0,
            fouls_3ft: v.fouls_3ft ?? 0,
            technical_fouls: v.technical_fouls ?? 0,
          }
          const total = entry.fouls_plain + entry.fouls_1ft + entry.fouls_2ft + entry.fouls_3ft + entry.technical_fouls
          if (total > 0) fm[k] = entry
        }
        if (Object.keys(fm).length > 0) setOppFoulsMap(fm)
      }
    } catch { /* ignore */ }

    setLoading(false)
  }

  function getEffectiveStat(playerId: string): PlayerStat {
    const base = statsMap.get(playerId) ?? emptyStats(id, playerId)
    const applied = { ...base } as unknown as Record<string, number | string>
    for (const change of pending) {
      if (change.playerId === playerId) {
        applied[change.key] = Math.max(0, ((applied[change.key] as number) ?? 0) + change.delta)
      }
    }
    return applied as unknown as PlayerStat
  }

  function recordFoulWithFT(playerId: string, ftCount: number) {
    const foulKey: StatKey = ftCount === 0 ? 'fouls_plain' : ftCount === 1 ? 'fouls_1ft' : ftCount === 2 ? 'fouls_2ft' : 'fouls_3ft'
    const gid = ++gidRef.current
    setPending(prev => [...prev, { playerId, key: foulKey, delta: 1, gid }])
    setTeamFouls(prev => prev + 1)
    setFoulDialog({ isOpen: false })
    setSelectedPlayer(null)
  }

  function handleStatTap(btn: typeof STAT_BUTTONS[0]) {
    if (!selectedPlayer) return

    // テクニカルファウルは直接記録（FTなし）
    if (btn.key === 'technical_fouls') {
      const gid = ++gidRef.current
      setPending(prev => [...prev, { playerId: selectedPlayer.id, key: 'technical_fouls', delta: 1, gid }])
      setTeamFouls(prev => prev + 1)
      setSelectedPlayer(null)
      return
    }

    // 通常のファウルボタンはダイアログを開く
    if (['fouls_plain', 'fouls_1ft', 'fouls_2ft', 'fouls_3ft'].includes(btn.key)) {
      setFoulDialog({ isOpen: true, playerId: selectedPlayer.id })
      return
    }

    const gid = ++gidRef.current
    const newPending: PendingChange[] = [{ playerId: selectedPlayer.id, key: btn.key, delta: btn.delta, gid }]
    if (btn.key === 'fg2_made') newPending.push({ playerId: selectedPlayer.id, key: 'fg2_attempt', delta: 1, gid })
    if (btn.key === 'fg3_made') newPending.push({ playerId: selectedPlayer.id, key: 'fg3_attempt', delta: 1, gid })
    if (btn.key === 'ft_made') newPending.push({ playerId: selectedPlayer.id, key: 'ft_attempt', delta: 1, gid })

    if (btn.key === 'fg2_made' || btn.key === 'fg3_made' || btn.key === 'ft_made') {
      const pts = btn.key === 'fg2_made' ? 2 : btn.key === 'fg3_made' ? 3 : 1
      setGame(prev => prev ? { ...prev, our_score: prev.our_score + pts } : prev)
      setScoreEvents(prev => {
        const last = prev[prev.length - 1]
        const ourBefore = gameRef.current?.our_score ?? 0
        const oppCurrent = last ? last.opponent_score_after : (gameRef.current?.opponent_score ?? 0)
        return [...prev, {
          gid, quarter: currentQuarter, team: 'us', points: pts,
          player_id: selectedPlayer.id,
          our_score_after: ourBefore + pts,
          opponent_score_after: oppCurrent,
        }]
      })
    }
    setPending(prev => [...prev, ...newPending])
    setSelectedPlayer(null) // スタッツ記録後に自動デセレクト
  }

  function undoLast() {
    // 相手チームが最後に得点していた場合は相手スコアを先に戻す（時系列undo）
    const lastScoreEvent = scoreEvents[scoreEvents.length - 1]
    const lastEvtGid = lastScoreEvent?.gid ?? -1
    const lastPendingGid = pending.length > 0 ? pending[pending.length - 1].gid : -1
    const lastUndoGid = undoStack.length > 0 ? (undoStack[undoStack.length - 1][0]?.gid ?? -1) : -1
    const mostRecentHomeGid = Math.max(lastPendingGid, lastUndoGid)

    if (lastScoreEvent?.team === 'opponent' && lastEvtGid > mostRecentHomeGid) {
      setGame(g => g ? { ...g, opponent_score: Math.max(0, g.opponent_score - lastScoreEvent.points) } : g)
      setScoreEvents(prev => prev.slice(0, -1))
      return
    }

    const applyScoreReversal = (group: PendingChange[]) => {
      const scoreDelta = group.find(c => c.key === 'fg2_made') ? -2
                       : group.find(c => c.key === 'fg3_made') ? -3
                       : group.find(c => c.key === 'ft_made') ? -1
                       : 0
      if (scoreDelta !== 0) {
        setGame(g => g ? { ...g, our_score: Math.max(0, g.our_score + scoreDelta) } : g)
        setScoreEvents(prev => {
          const idx = [...prev].map((e, i) => ({ e, i })).reverse().find(x => x.e.team === 'us')?.i
          if (idx === undefined) return prev
          return removeAndAdjust(prev, idx)
        })
      }
      if (group.find(c => ['fouls_plain', 'fouls_1ft', 'fouls_2ft', 'fouls_3ft', 'technical_fouls'].includes(c.key))) setTeamFouls(t => Math.max(0, t - 1))
    }

    if (pending.length > 0) {
      // pending にある未保存の操作を取り消し
      const lastGid = pending[pending.length - 1].gid
      const removed = pending.filter(c => c.gid === lastGid)
      applyScoreReversal(removed)
      setPending(prev => prev.filter(c => c.gid !== lastGid))
      setUndoStack(prev => prev.filter(g => g[0]?.gid !== lastGid))
    } else if (undoStack.length > 0) {
      // 保存済みの操作を逆デルタで pending に積んで自動保存させる
      const lastGroup = undoStack[undoStack.length - 1]
      setUndoStack(prev => prev.slice(0, -1))
      applyScoreReversal(lastGroup)
      const undoGid = ++gidRef.current
      const reversals: PendingChange[] = lastGroup.map(c => ({ ...c, delta: -c.delta, gid: undoGid }))
      skipUndoStackRef.current = true
      setPending(reversals)
    }
  }

  function halftimeReset() {
    setTeamFouls(0)
    setOppTeamFouls(0)
    setHalfTimeReset(true)
    setTimeout(() => setHalfTimeReset(false), 2000)
  }

  function recordOppFoulWithFT(playerKey: string, ftCount: number) {
    // ftCount: 0=フリースローなし(P), 1=1本(P1), 2=2本(P2), 3=3本(P3), -1=テクニカル(T)
    const field: keyof OppFoulData = ftCount < 0 ? 'technical_fouls'
      : ftCount === 0 ? 'fouls_plain'
      : ftCount === 1 ? 'fouls_1ft'
      : ftCount === 2 ? 'fouls_2ft'
      : 'fouls_3ft'
    setOppTeamFouls(prev => prev + 1)
    setOppFoulsMap(prev => {
      const current = prev[playerKey] ?? emptyOppFoul()
      const updated: OppFoulData = { ...current, [field]: current[field] + 1 }
      const next = { ...prev, [playerKey]: updated }
      // localStorageにも永続化
      try {
        const storageKey = `scoresheet_ov_${id}`
        const s = localStorage.getItem(storageKey)
        const ov = s ? JSON.parse(s) : { quarterScores: {}, homePlayers: {}, oppPlayers: {} }
        ov.oppPlayers[playerKey] = { ...(ov.oppPlayers[playerKey] ?? {}), ...updated }
        localStorage.setItem(storageKey, JSON.stringify(ov))
      } catch { /* ignore */ }
      return next
    })
    setFoulOppDialog({ isOpen: false })
    setSelectedOppPlayer(null)
  }

  function confirmCourt(selectedIds: string[], oppKeys: string[]) {
    setOnCourtIds(selectedIds)
    setOppCourtKeys(oppKeys)
    localStorage.setItem(`court_${id}`, JSON.stringify(selectedIds))
    localStorage.setItem(`court_opp_${id}`, JSON.stringify(oppKeys))
    // Q別スターターを保存（スコアシートの出場時間表示に使用）
    localStorage.setItem(`court_q${currentQuarter}_${id}`, JSON.stringify(selectedIds))
    localStorage.setItem(`court_opp_q${currentQuarter}_${id}`, JSON.stringify(oppKeys))
    setCourtSetupMode(false)
    setSelectedPlayer(null)
    setSelectedOppPlayer(null)
  }

  function substituteHome(courtPlayerId: string) {
    if (!subInPlayer) return
    const newIds = onCourtIds.map(cid => cid === courtPlayerId ? subInPlayer.id : cid)
    setOnCourtIds(newIds)
    localStorage.setItem(`court_${id}`, JSON.stringify(newIds))
    // 途中出場をQごとに記録（スコアシートの╲表示用）
    const subKey = `sub_q${currentQuarter}_${id}`
    try {
      const existing = JSON.parse(localStorage.getItem(subKey) ?? '[]') as string[]
      if (!existing.includes(subInPlayer.id)) {
        localStorage.setItem(subKey, JSON.stringify([...existing, subInPlayer.id]))
      }
    } catch { /* ignore */ }
    setSubInPlayer(null)
    setSelectedPlayer(null)
  }

  function substituteOpp(courtPlayerKey: string) {
    if (!subInOppPlayer) return
    const newKeys = oppCourtKeys.map(k => k === courtPlayerKey ? subInOppPlayer.key : k)
    setOppCourtKeys(newKeys)
    localStorage.setItem(`court_opp_${id}`, JSON.stringify(newKeys))
    // 相手途中出場をQごとに記録
    const subKey = `sub_opp_q${currentQuarter}_${id}`
    try {
      const existing = JSON.parse(localStorage.getItem(subKey) ?? '[]') as string[]
      if (!existing.includes(subInOppPlayer.key)) {
        localStorage.setItem(subKey, JSON.stringify([...existing, subInOppPlayer.key]))
      }
    } catch { /* ignore */ }
    setSubInOppPlayer(null)
    setSelectedOppPlayer(null)
  }

  // ─── スコアシート手動修正 → スタッツ反映 ───────────────────────────────────
  function handleScoresheetFoulEdit(playerId: string, newFouls: number) {
    const stat = statsMap.get(playerId)
    const currentFouls = stat ? getTotalFouls(stat) : 0
    const delta = newFouls - currentFouls
    if (delta === 0) return
    const gid = ++gidRef.current
    setPending(prev => [...prev, { playerId, key: 'fouls', delta, gid }])
    setTeamFouls(t => Math.max(0, t + delta))
  }

  function handleScoresheetPtsEdit(playerId: string, newPts: number) {
    const stat = statsMap.get(playerId)
    const currentPts = stat ? calcPoints(stat) : 0
    const delta = newPts - currentPts
    if (delta === 0) return
    const gid = ++gidRef.current
    const changes: PendingChange[] = []
    if (delta > 0) {
      const twos = Math.floor(delta / 2)
      const ft = delta % 2
      if (twos > 0) {
        changes.push({ playerId, key: 'fg2_made', delta: twos, gid })
        changes.push({ playerId, key: 'fg2_attempt', delta: twos, gid })
      }
      if (ft > 0) {
        changes.push({ playerId, key: 'ft_made', delta: ft, gid })
        changes.push({ playerId, key: 'ft_attempt', delta: ft, gid })
      }
    } else {
      let rem = -delta
      const fg3 = stat?.fg3_made ?? 0, fg2 = stat?.fg2_made ?? 0, ftMade = stat?.ft_made ?? 0
      const r3 = Math.min(Math.floor(rem / 3), fg3)
      if (r3 > 0) { changes.push({ playerId, key: 'fg3_made', delta: -r3, gid }); changes.push({ playerId, key: 'fg3_attempt', delta: -r3, gid }); rem -= r3 * 3 }
      const r2 = Math.min(Math.floor(rem / 2), fg2)
      if (r2 > 0) { changes.push({ playerId, key: 'fg2_made', delta: -r2, gid }); changes.push({ playerId, key: 'fg2_attempt', delta: -r2, gid }); rem -= r2 * 2 }
      const rft = Math.min(rem, ftMade)
      if (rft > 0) { changes.push({ playerId, key: 'ft_made', delta: -rft, gid }); changes.push({ playerId, key: 'ft_attempt', delta: -rft, gid }) }
    }
    if (changes.length > 0) {
      setPending(prev => [...prev, ...changes])
      setGame(prev => prev ? { ...prev, our_score: prev.our_score + delta } : prev)
      // scoreEvents の最後のエントリも更新して表示を合わせる
      setScoreEvents(prev => {
        if (prev.length === 0) return prev
        const last = { ...prev[prev.length - 1], our_score_after: prev[prev.length - 1].our_score_after + delta }
        return [...prev.slice(0, -1), last]
      })
    }
  }

  function handleScoresheetQScoreEdit(q: number, team: 'us' | 'opp', newVal: number) {
    if (team === 'opp') {
      setGame(prev => prev ? { ...prev, opponent_score: newVal } : prev)
    }
    // us side: handled via handleScoresheetPtsEdit per player (or direct game score edit)
  }

  function updateOpponentScore(delta: number, playerName?: string) {
    if (delta > 0) {
      const gid = ++gidRef.current
      setScoreEvents(prev => {
        const last = prev[prev.length - 1]
        const ourCurrent = gameRef.current?.our_score ?? 0
        const oppBefore = last ? last.opponent_score_after : (gameRef.current?.opponent_score ?? 0)
        return [...prev, {
          gid, quarter: currentQuarter, team: 'opponent', points: delta,
          opp_player_name: playerName,
          our_score_after: ourCurrent,
          opponent_score_after: oppBefore + delta,
        }]
      })
    } else if (delta < 0) {
      setScoreEvents(prev => {
        const idx = [...prev].map((e, i) => ({ e, i })).reverse().find(x => x.e.team === 'opponent')?.i
        if (idx === undefined) return prev
        return removeAndAdjust(prev, idx)
      })
    }
    setGame(prev => prev ? { ...prev, opponent_score: Math.max(0, prev.opponent_score + delta) } : prev)
    setSelectedOppPlayer(null)
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
          for (const c of changes) updates[c.key] = Math.max(0, (existingR[c.key] ?? 0) + c.delta)
          await supabase.from('player_stats').update(updates).eq('id', existing.id)
        } else {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id: _omit, ...insertBase } = emptyStats(id, playerId)
          const newStat = insertBase as unknown as Record<string, number | string>
          for (const c of changes) newStat[c.key] = Math.max(0, ((newStat[c.key] as number) ?? 0) + c.delta)
          await supabase.from('player_stats').insert(newStat)
        }
      }

      // 取り消し用に保存（逆操作の reversal 時はスキップ）
      if (!skipUndoStackRef.current) {
        const byGid = new Map<number, PendingChange[]>()
        for (const c of pending) {
          if (!byGid.has(c.gid)) byGid.set(c.gid, [])
          byGid.get(c.gid)!.push(c)
        }
        if (byGid.size > 0) {
          const newEntries = [...byGid.values()]
          const newStack = [...undoStack, ...newEntries].slice(-30)
          setUndoStack(newStack)
          localStorage.setItem(`undo_stack_${id}`, JSON.stringify(newStack))
        }
      }
      skipUndoStackRef.current = false

      localStorage.removeItem(`pending_${id}`)
    }

    if (gameRef.current) {
      // score_events_json も同時に保存してクロスデバイス同期
      const currentEvents = scoreEventsRef.current
      await supabase.from('games')
        .update({
          our_score: Math.max(0, gameRef.current.our_score),
          opponent_score: Math.max(0, gameRef.current.opponent_score),
          ...(currentEvents.length > 0 ? { score_events_json: currentEvents } : {}),
        })
        .eq('id', id)
    }

    await loadData()
    setPending([])
    setSaving(false)
  }, [pending, statsMap, id])

  // saveStatsRef を常に最新に同期（タイマーのクロージャずれ対策）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { saveStatsRef.current = saveStats }, [saveStats])

  async function advanceQuarter() {
    if (currentQuarter >= 4) return
    await saveStats()
    setTeamFouls(0)
    setHomeTimeouts(0) // Qリセット
    setOppTimeouts(0)
    setRecordingTab('scoresheet')
    setUndoStack([])
    localStorage.removeItem(`undo_stack_${id}`)
    setQConfirmPending(currentQuarter + 1) // スコアシート確認待ちに
  }

  async function confirmQuarterAdvance() {
    if (!qConfirmPending) return
    const next = qConfirmPending
    setCurrentQuarter(next)
    setQConfirmPending(null)
    const supabase = createClient()
    await supabase.from('games').update({ quarter: next }).eq('id', id)
    setCourtSetupMode(true)
    setSelectedPlayer(null)
  }

  async function finishGame() {
    if (!confirm('試合を終了しますか？')) return
    await saveStats()
    const supabase = createClient()

    // 相手選手・スコアイベントを games テーブルに永続化（クロスデバイス対応）
    const oppPlayersData = oppPlayerList.map(p => ({ number: p.number, name: p.name }))
    await supabase.from('games').update({
      is_finished: true,
      quarter: currentQuarter,
      ...(scoreEvents.length > 0 ? { score_events_json: scoreEvents } : {}),
      ...(oppPlayersData.length > 0 ? { opponent_players: oppPlayersData } : {}),
    }).eq('id', id)

    // score_events テーブルにも個別行として保存（opp_player_name 含む）
    if (scoreEvents.length > 0) {
      try {
        await supabase.from('score_events').insert(
          scoreEvents.map(e => ({
            game_id: id,
            quarter: e.quarter,
            team: e.team,
            points: e.points,
            player_id: e.player_id ?? null,
            opp_player_name: e.opp_player_name ?? null,
            our_score_after: e.our_score_after,
            opponent_score_after: e.opponent_score_after,
          }))
        )
      } catch { /* テーブルが存在しない場合は無視 */ }
    }

    setGame(prev => prev ? { ...prev, is_finished: true } : prev)
    localStorage.removeItem(`court_${id}`)
    setUndoStack([])
    localStorage.removeItem(`undo_stack_${id}`)
    localStorage.removeItem(`score_events_${id}`)
    localStorage.removeItem(`pending_${id}`)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>
  )
  if (!game) return null

  if (game.is_finished) {
    return <FinishedGameView game={game} players={players} statsMap={statsMap} scoreEvents={scoreEvents} oppPlayerList={oppPlayerList} />
  }

  if (courtSetupMode) {
    return (
      <CourtSetup
        players={players}
        oppPlayers={oppPlayerList}
        currentQuarter={currentQuarter}
        onConfirm={confirmCourt}
        initialIds={onCourtIds}
        initialOppKeys={oppCourtKeys}
      />
    )
  }

  const selectedStat = selectedPlayer ? getEffectiveStat(selectedPlayer.id) : null
  const onCourtPlayers = onCourtIds.map(cid => players.find(p => p.id === cid)).filter((p): p is Player => !!p)
  const oppOnCourt = oppCourtKeys.map(k => oppPlayerList.find(p => p.key === k)).filter((p): p is OppPlayer => !!p)
  const homeBench = players.filter(p => !onCourtIds.includes(p.id))
  const oppBench = oppPlayerList.filter(p => !oppCourtKeys.includes(p.key))

  return (
    <div className="min-h-screen flex flex-col">
      {/* ─── ヘッダー ─── */}
      <div className="sticky top-0 bg-[var(--background)] z-10 border-b border-[var(--card-border)]">
        {/* 行1: 戻る / スコア / 保存 */}
        <div className="flex items-center justify-between px-4 pt-2 pb-1">
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
              disabled={q > currentQuarter}
              onClick={() => q <= currentQuarter ? setShowQScore(showQScore === q ? null : q) : undefined}
              className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${
                q === currentQuarter
                  ? 'bg-orange-500 text-white active:opacity-80'
                  : q < currentQuarter
                  ? `border transition-colors ${showQScore === q ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-[var(--card)] text-[var(--muted)] border-[var(--card-border)]'}`
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

        {/* Q スコアポップアップ */}
        {showQScore !== null && showQScore <= currentQuarter && (() => {
          let cumUs = 0, cumOpp = 0
          return (
            <div className="mx-4 mb-2 bg-[var(--card)] border border-orange-500/30 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--card-border)]">
                <span className="text-xs font-bold text-white">Q{showQScore} までのスコア</span>
                <button onClick={() => setShowQScore(null)} className="text-[var(--muted)] text-xs px-1">✕</button>
              </div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[9px] text-[var(--muted)] border-b border-[var(--card-border)]">
                    <th className="py-1 px-3 text-left">Q</th>
                    <th className="py-1 px-2 text-center text-orange-400">自チーム</th>
                    <th className="py-1 px-2 text-center text-blue-400">{game.opponent}</th>
                    <th className="py-1 px-3 text-center text-[var(--muted)]">累計</th>
                  </tr>
                </thead>
                <tbody>
                  {[1,2,3,4].filter(q => q <= showQScore).map(q => {
                    const qs = qScores[q-1]
                    cumUs += qs.us; cumOpp += qs.opp
                    const isLast = q === showQScore
                    return (
                      <tr key={q} className={`border-b border-[var(--card-border)]/40 ${isLast ? 'bg-orange-500/10 font-bold' : ''}`}>
                        <td className="py-1.5 px-3 text-[var(--muted)]">Q{q}</td>
                        <td className="py-1.5 px-2 text-center text-orange-400">{qs.us}</td>
                        <td className="py-1.5 px-2 text-center text-blue-400">{qs.opp}</td>
                        <td className="py-1.5 px-3 text-center text-white font-bold tabular-nums">{cumUs} - {cumOpp}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 行3: 相手スコア / チームファウル / HTリセット */}
        <div className="flex items-center justify-between px-4 pb-1">
          <div className="flex items-center gap-1.5">
            <button onClick={() => updateOpponentScore(-1)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">-</button>
            <span className="text-xs text-[var(--muted)] w-14 text-center">相手 {game.opponent_score}</span>
            <button onClick={() => updateOpponentScore(1)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">+</button>
          </div>
          <div className="flex gap-1.5">
            <div className={`text-xs px-2 py-1 rounded-full ${teamFouls >= 5 ? 'bg-red-500/20 text-red-400' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
              自F: {teamFouls}
            </div>
            <div className={`text-xs px-2 py-1 rounded-full ${oppTeamFouls >= 5 ? 'bg-blue-500/20 text-blue-400' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
              相F: {oppTeamFouls}
            </div>
            <button
              onClick={halftimeReset}
              className="text-xs px-2 py-1 rounded-full bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]"
            >
              {halfTimeReset ? '✓ リセット' : 'HT'}
            </button>
          </div>
        </div>

        {/* 行4: タイムアウト */}
        <div className="flex items-center gap-3 px-4 pb-2">
          <span className="text-[10px] text-[var(--muted)]">TO:</span>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-orange-400 font-bold">自</span>
            <button onClick={() => setHomeTimeouts(t => Math.max(0, t - 1))} className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--card-border)] text-white text-xs flex items-center justify-center leading-none">-</button>
            <span className="w-5 text-center text-white text-xs font-bold tabular-nums">{homeTimeouts}</span>
            <button onClick={() => setHomeTimeouts(t => t + 1)} className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--card-border)] text-white text-xs flex items-center justify-center leading-none">+</button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-blue-400 font-bold">相</span>
            <button onClick={() => setOppTimeouts(t => Math.max(0, t - 1))} className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--card-border)] text-white text-xs flex items-center justify-center leading-none">-</button>
            <span className="w-5 text-center text-white text-xs font-bold tabular-nums">{oppTimeouts}</span>
            <button onClick={() => setOppTimeouts(t => t + 1)} className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--card-border)] text-white text-xs flex items-center justify-center leading-none">+</button>
          </div>
        </div>

        {/* 行4: 記録 / ランニングスコア / スコアシート タブ */}
        <div className="flex border-t border-[var(--card-border)]">
          <button
            onClick={() => setRecordingTab('record')}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${recordingTab === 'record' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
          >
            スタッツ記録
          </button>
          <button
            onClick={() => setRecordingTab('running')}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${recordingTab === 'running' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
          >
            ランニング
          </button>
          <button
            onClick={() => setRecordingTab('scoresheet')}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${recordingTab === 'scoresheet' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
          >
            スコアシート
          </button>
        </div>
      </div>

      {/* ─── メインエリア ─── */}
      {recordingTab === 'running' ? (
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <RunningScoreView
            events={scoreEvents}
            teamName="自チーム"
            opponentName={game.opponent}
            players={players}
          />
        </div>
      ) : recordingTab === 'scoresheet' ? (
        <div className="flex-1 overflow-y-auto pb-[env(safe-area-inset-bottom)]">
          <JBASheet
            game={game}
            players={players}
            statsMap={effectiveStatsMap}
            scoreEvents={scoreEvents}
            oppPlayerList={oppPlayerList}
            gameId={id}
            qConfirmPending={qConfirmPending}
            onConfirmAdvance={confirmQuarterAdvance}
            oppFoulsMap={oppFoulsMap}
          />
        </div>
      ) : (
        <div className="flex flex-col flex-1 px-3 py-3 gap-3 max-w-2xl mx-auto w-full pb-[calc(0.75rem+env(safe-area-inset-bottom))]">

          {/* 交代モード表示 */}
          {(subInPlayer || subInOppPlayer) && (
            <div className="bg-orange-500/10 border border-orange-500/40 rounded-xl px-3 py-2 flex items-center justify-between">
              <span className="text-xs text-orange-300 flex-1 mr-2">
                {subInPlayer
                  ? `↕ 交代: #${subInPlayer.number} ${subInPlayer.name} → コートの選手をタップ`
                  : `↕ 交代: #${subInOppPlayer!.number} ${subInOppPlayer!.name} → 相手コートをタップ`}
              </span>
              <button onClick={() => { setSubInPlayer(null); setSubInOppPlayer(null) }} className="text-[var(--muted)] text-sm px-1">✕</button>
            </div>
          )}

          {/* 2列: 自チーム（左）/ 相手チーム（右） */}
          <div className="grid grid-cols-2 gap-2">
            {/* 自チームコート */}
            <div>
              <div className="text-[9px] text-orange-400 mb-1.5 uppercase tracking-wide">
                {subInPlayer ? '自チーム（交代先）' : '自チーム'}
              </div>
              <div className="flex flex-col gap-1.5">
                {onCourtPlayers.map(player => {
                  const pts = calcPoints(getEffectiveStat(player.id))
                  const isSelected = selectedPlayer?.id === player.id
                  return (
                    <button
                      key={player.id}
                      onClick={() => {
                        if (subInPlayer) { substituteHome(player.id); return }
                        setSelectedPlayer(isSelected ? null : player)
                        setSelectedOppPlayer(null)
                        setSubInOppPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2.5 rounded-xl border transition-all active:scale-95 ${
                        isSelected ? 'bg-orange-500 border-orange-500'
                        : subInPlayer ? 'bg-orange-500/10 border-orange-400 border-dashed'
                        : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className="text-[10px] text-orange-300 font-bold flex-shrink-0 w-8">#{player.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1 text-left">{player.name}</span>
                      <span className="text-[10px] text-[var(--muted)] flex-shrink-0 ml-1">{subInPlayer ? '↕' : `${pts}p`}</span>
                    </button>
                  )
                })}
                {onCourtPlayers.length === 0 && <p className="text-[10px] text-[var(--muted)] py-2 text-center">—</p>}
              </div>
            </div>

            {/* 相手チームコート */}
            <div>
              <div className="text-[9px] text-blue-400 mb-1.5 uppercase tracking-wide">
                {subInOppPlayer ? '相手（交代先）' : '相手チーム'}
              </div>
              <div className="flex flex-col gap-1.5">
                {oppOnCourt.map(player => {
                  const isSelected = selectedOppPlayer?.key === player.key
                  const oppScore = getOppPlayerScore(scoreEvents, `#${player.number} ${player.name}`)
                  return (
                    <button
                      key={player.key}
                      onClick={() => {
                        if (subInOppPlayer) { substituteOpp(player.key); return }
                        setSelectedOppPlayer(isSelected ? null : player)
                        setSelectedPlayer(null)
                        setSubInPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2.5 rounded-xl border transition-all active:scale-95 ${
                        isSelected ? 'bg-blue-500 border-blue-500'
                        : subInOppPlayer ? 'bg-blue-500/10 border-blue-400 border-dashed'
                        : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className="text-[10px] text-blue-300 font-bold flex-shrink-0 w-8">#{player.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1 text-left">{player.name}</span>
                      <span className="text-[10px] text-[var(--muted)] flex-shrink-0 ml-1">
                        {subInOppPlayer ? '↕' : oppScore > 0 ? `${oppScore}p` : ''}
                      </span>
                    </button>
                  )
                })}
                {oppOnCourt.length === 0 && <p className="text-[10px] text-[var(--muted)] py-2 text-center">—</p>}
              </div>
            </div>
          </div>

          {/* 選択中選手スタッツ */}
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

          {/* 相手選手選択中 */}
          {selectedOppPlayer && (
            <div className="bg-[var(--card)] border border-blue-500/40 rounded-xl px-3 py-2">
              <div className="text-sm font-bold text-blue-300">#{selectedOppPlayer.number} {selectedOppPlayer.name}</div>
            </div>
          )}

          {/* スタッツ入力 / 相手得点ボタン */}
          {selectedPlayer ? (
            <div className="grid grid-cols-3 gap-2">
              {STAT_BUTTONS.map(btn => (
                <button key={btn.key + btn.label} onClick={() => handleStatTap(btn)} className={`stat-btn ${btn.category}`}>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          ) : selectedOppPlayer ? (
            <div className="space-y-2">
              <div className="flex gap-3">
                {([1, 2, 3] as const).map(pts => (
                  <button
                    key={pts}
                    onClick={() => updateOpponentScore(pts, `#${selectedOppPlayer.number} ${selectedOppPlayer.name}`)}
                    className="flex-1 py-4 rounded-xl bg-blue-500/20 border border-blue-500/50 text-blue-300 font-bold text-2xl active:scale-95 transition-all"
                  >
                    +{pts}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setFoulOppDialog({ isOpen: true, playerKey: selectedOppPlayer.key, playerName: `#${selectedOppPlayer.number} ${selectedOppPlayer.name}` })}
                className="w-full py-3 rounded-xl bg-red-500/20 border border-red-500/50 text-red-300 font-bold text-sm active:scale-95 transition-all"
              >
                ファウル
              </button>
            </div>
          ) : !subInPlayer && !subInOppPlayer ? (
            <div className="card text-center py-4 text-sm text-[var(--muted)]">
              上のコートから選手をタップしてください
            </div>
          ) : null}

          {/* ベンチ（自チーム左 / 相手右） */}
          {(homeBench.length > 0 || oppBench.length > 0 || oppPlayerList.length > 0) && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="text-[10px] text-orange-400 mb-1.5 uppercase tracking-wide">自チームベンチ</div>
                <div className="flex flex-col gap-1.5">
                  {homeBench.length > 0 ? homeBench.map(p => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSubInPlayer(subInPlayer?.id === p.id ? null : p)
                        setSubInOppPlayer(null)
                        setSelectedPlayer(null)
                        setSelectedOppPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg border text-left transition-all active:scale-95 ${
                        subInPlayer?.id === p.id ? 'bg-orange-500/20 border-orange-500' : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className="text-[10px] text-orange-300 font-bold flex-shrink-0 w-8">#{p.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1">{p.name}</span>
                      {subInPlayer?.id === p.id && <span className="ml-auto text-[9px] text-orange-400 flex-shrink-0">IN</span>}
                    </button>
                  )) : <p className="text-[10px] text-[var(--muted)] py-1">なし</p>}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-blue-400 mb-1.5 uppercase tracking-wide">相手ベンチ</div>
                <div className="flex flex-col gap-1.5">
                  {oppBench.length > 0 ? oppBench.map(p => (
                    <button
                      key={p.key}
                      onClick={() => {
                        setSubInOppPlayer(subInOppPlayer?.key === p.key ? null : p)
                        setSubInPlayer(null)
                        setSelectedPlayer(null)
                        setSelectedOppPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg border text-left transition-all active:scale-95 ${
                        subInOppPlayer?.key === p.key ? 'bg-blue-500/20 border-blue-500' : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className="text-[10px] text-blue-300 font-bold flex-shrink-0 w-8">#{p.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1">{p.name}</span>
                      {subInOppPlayer?.key === p.key && <span className="ml-auto text-[9px] text-blue-400 flex-shrink-0">IN</span>}
                    </button>
                  )) : <p className="text-[10px] text-[var(--muted)] py-1">なし</p>}
                </div>
              </div>
            </div>
          )}

          {/* 操作ボタン */}
          {(() => {
            const lastEvt = scoreEvents[scoreEvents.length - 1]
            const lastEvtGid = lastEvt?.gid ?? -1
            const lastPGid = pending.length > 0 ? pending[pending.length - 1].gid : -1
            const lastUGid = undoStack.length > 0 ? (undoStack[undoStack.length - 1][0]?.gid ?? -1) : -1
            const canUndoOpp = lastEvt?.team === 'opponent' && lastEvtGid > Math.max(lastPGid, lastUGid)
            const canUndo = pending.length > 0 || undoStack.length > 0 || canUndoOpp
            const undoCount = new Set(pending.map(c => c.gid)).size + undoStack.length + (canUndoOpp ? 1 : 0)
            return (
          <div className="flex gap-2 pt-1">
            <button
              onClick={undoLast}
              disabled={!canUndo}
              className={`btn-secondary flex-1 text-sm py-2.5 ${!canUndo ? 'opacity-30' : ''}`}
            >
              ↩ 取り消し{canUndo ? ` (${undoCount})` : ''}
            </button>
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
            )
          })()}

          {game.is_finished && (
            <div className="bg-green-500/10 border border-green-500/30 text-green-400 rounded-lg p-3 text-center text-sm">
              試合終了 · 最終スコア {game.our_score} - {game.opponent_score}
            </div>
          )}
        </div>
      )}

      {/* 相手ファウル+FTダイアログ */}
      {foulOppDialog.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setFoulOppDialog({ isOpen: false })}
        >
          <div
            className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-1 text-center">相手ファウル</h2>
            <p className="text-sm text-blue-300 text-center mb-1">{foulOppDialog.playerName}</p>
            <p className="text-xs text-[var(--muted)] text-center mb-4">自チームのフリースロー数を選択</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 0)} className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースローなし (P)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 1)} className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースロー1本 (P1)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 2)} className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースロー2本 (P2)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 3)} className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースロー3本 (P3)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, -1)} className="col-span-2 bg-yellow-600/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-300 rounded-lg py-3 font-semibold transition-all active:scale-95">テクニカルファウル (T)</button>
            </div>
            <button onClick={() => setFoulOppDialog({ isOpen: false })} className="w-full mt-4 bg-red-600/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-lg py-2 font-semibold transition-all">キャンセル</button>
          </div>
        </div>
      )}

      {/* ファウル+FTダイアログ */}
      {foulDialog.isOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setFoulDialog({ isOpen: false })}
        >
          <div
            className="bg-[var(--card)] border border-[var(--card-border)] rounded-lg p-6 w-80 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4 text-center">ファウル時のフリースロー数を選択</h2>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 0)}
                className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースローなし
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 1)}
                className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースロー1本
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 2)}
                className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースロー2本
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 3)}
                className="bg-blue-600/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースロー3本
              </button>
            </div>
            <button
              onClick={() => setFoulDialog({ isOpen: false })}
              className="w-full mt-4 bg-red-600/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-lg py-2 font-semibold transition-all"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
