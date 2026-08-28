'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { hasFreeAccess, getFinishedGamesCount, FREE_GAMES_LIMIT } from '@/lib/freeAccess'
import { Game, OppStatData, Player, PlayerStat, TeamCategory } from '@/types'
import { calcPoints, emptyOppStat, hasOppStatRecord, normalizeOppStat, oppTotalFouls, readOppStatsJson, type OppBoxKey } from '@/lib/stats'
import JBAOfficialSheet from './JBAOfficialSheet'

type StatKey = keyof Omit<PlayerStat, 'id' | 'game_id' | 'player_id'>
type PendingChange = { playerId: string; key: StatKey; delta: number; gid: number }
type OppPlayer = { key: string; number: string; name: string }
type OppFoulData = { fouls_plain: number; fouls_1ft: number; fouls_2ft: number; fouls_3ft: number; technical_fouls: number; fouls_unsportsmanlike: number }
// 相手選手のスタッツ（OppStatData）は自チームと同じ項目を持つが、押した分だけ記録される。
// 何も押さなければ全て0のまま＝「得点だけ記録する」運用でもそのまま成立する。
// 型と集計ヘルパーは共有リンク画面でも使うため @/types と @/lib/stats に置いてある。
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
type AddEventRequest = {
  quarter: number
  team: 'us' | 'opponent'
  points: number
  player_id?: string
  opp_player_name?: string
}
type TimeoutRecord = { quarter: number; minute: number }

/**
 * そのクォーターで取れるタイムアウトの「集計範囲」と上限を返す（JBA）。
 * - 一般: 前半(Q1-2)2回 / 後半(Q3-4)3回 / 各OT1回
 * - ミニバス: 各クォーター1回（持ち越し不可） / 各OT1回
 */
function timeoutScope(category: TeamCategory, q: number): { label: string; quarters: number[]; limit: number } {
  if (q >= 5) return { label: `OT${q - 4}`, quarters: [q], limit: 1 } // OTは両カテゴリとも各1回
  if (category === 'mini') return { label: `Q${q}`, quarters: [q], limit: 1 } // ミニ: 各Q1回
  if (q <= 2) return { label: '前半', quarters: [1, 2], limit: 2 }
  return { label: '後半', quarters: [3, 4], limit: 3 }
}

/**
 * クォーター/OTの時間（秒）。
 * - 一般: 10分 / OT5分
 * - ミニバス: 6分 / OT3分
 */
function quarterSeconds(category: TeamCategory, q: number): number {
  if (category === 'mini') return q >= 5 ? 180 : 360
  return q >= 5 ? 300 : 600
}
// ファウル発生イベント（スコアシートのQ別チームファウル・前後半区切り線用）
type FoulEvent = { quarter: number; team: 'us' | 'opponent'; key: string; foulType: keyof OppFoulData }

// 成功=緑、失敗=赤、その他=黒(neutral)。成功・失敗をそれぞれまとめて配置。
// テクニカルファウルは「ファウル」ボタンのダイアログ内に統合してすっきりさせる。
const STAT_BUTTONS: { label: string; key: StatKey; delta: number; category: 'made' | 'missed' | 'neutral' }[] = [
  { label: '2P 成功', key: 'fg2_made', delta: 1, category: 'made' },
  { label: '3P 成功', key: 'fg3_made', delta: 1, category: 'made' },
  { label: 'FT 成功', key: 'ft_made', delta: 1, category: 'made' },
  { label: '2P 失敗', key: 'fg2_attempt', delta: 1, category: 'missed' },
  { label: '3P 失敗', key: 'fg3_attempt', delta: 1, category: 'missed' },
  { label: 'FT 失敗', key: 'ft_attempt', delta: 1, category: 'missed' },
  { label: 'リバウンド', key: 'rebounds', delta: 1, category: 'neutral' },
  { label: 'アシスト', key: 'assists', delta: 1, category: 'neutral' },
  { label: 'スティール', key: 'steals', delta: 1, category: 'neutral' },
  { label: 'ブロック', key: 'blocks', delta: 1, category: 'neutral' },
  { label: 'ターンオーバー', key: 'turnovers', delta: 1, category: 'neutral' },
  { label: 'ファウル', key: 'fouls_plain', delta: 1, category: 'neutral' },
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
  return { id: '', game_id: gameId, player_id: playerId, fg2_made: 0, fg2_attempt: 0, fg3_made: 0, fg3_attempt: 0, ft_made: 0, ft_attempt: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0, fouls: 0, fouls_plain: 0, fouls_1ft: 0, fouls_2ft: 0, fouls_3ft: 0, technical_fouls: 0, fouls_unsportsmanlike: 0, minutes: 0, plus_minus: 0 }
}

// player_stats の数値項目（重複行の合算・修復に使用）
const STAT_NUMERIC_KEYS = ['fg2_made','fg2_attempt','fg3_made','fg3_attempt','ft_made','ft_attempt','rebounds','assists','steals','blocks','turnovers','fouls','fouls_plain','fouls_1ft','fouls_2ft','fouls_3ft','technical_fouls','fouls_unsportsmanlike','minutes','plus_minus'] as const

function pct(made: number, attempt: number) {
  if (attempt === 0) return '—'
  return Math.round((made / attempt) * 100) + '%'
}

function getTotalFouls(stat: PlayerStat): number {
  return (stat.fouls_plain ?? 0) + (stat.fouls_1ft ?? 0) + (stat.fouls_2ft ?? 0) + (stat.fouls_3ft ?? 0) + (stat.technical_fouls ?? 0) + (stat.fouls_unsportsmanlike ?? 0)
}

/**
 * 退場（失格含む）判定（JBA/FIBA）。
 * - 個人ファウル合計が5
 * - テクニカル2回
 * - （将来）アンスポ2回 / テクニカル1+アンスポ1
 * ※ unsportsmanlike 列はまだ無いので ?? 0 で安全に評価（追加後に自動で効く）。
 */
function isDisqualified(stat: PlayerStat): boolean {
  const tech = stat.technical_fouls ?? 0
  const unsp = (stat as { fouls_unsportsmanlike?: number }).fouls_unsportsmanlike ?? 0
  return getTotalFouls(stat) >= 5 || tech >= 2 || unsp >= 2 || (tech >= 1 && unsp >= 1)
}

function getFoulNotation(stat: PlayerStat): string {
  const parts: string[] = []
  const plain = stat.fouls_plain ?? 0
  const ft1 = stat.fouls_1ft ?? 0
  const ft2 = stat.fouls_2ft ?? 0
  const ft3 = stat.fouls_3ft ?? 0
  const tech = stat.technical_fouls ?? 0
  const unsp = stat.fouls_unsportsmanlike ?? 0

  for (let i = 0; i < plain; i++) parts.push('P')
  for (let i = 0; i < ft1; i++) parts.push('P1')
  for (let i = 0; i < ft2; i++) parts.push('P2')
  for (let i = 0; i < ft3; i++) parts.push('P3')
  for (let i = 0; i < tech; i++) parts.push('T')
  for (let i = 0; i < unsp; i++) parts.push('U')

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
                    <th className="text-center py-1.5 px-1 text-brand-400 w-1/3">{opponentName}</th>
                    <th className="text-left py-1.5 px-2 text-[var(--muted)]">選手</th>
                  </tr>
                </thead>
                <tbody>
                  {qEvents.map((ev, i) => {
                    const scorer = ev.player_id ? players.find(p => p.id === ev.player_id) : null
                    return (
                      <tr key={i} className={`border-b border-[var(--card-border)]/40 ${ev.team === 'us' ? 'bg-orange-500/5' : 'bg-brand-500/5'}`}>
                        <td className="text-center py-1.5 px-2 text-[var(--muted)]">{i + 1}</td>
                        <td className={`text-center py-1.5 px-1 font-bold ${ev.team === 'us' ? 'text-orange-400 text-sm' : 'text-white/50'}`}>
                          {ev.our_score_after}
                          {ev.team === 'us' && <span className="text-[9px] ml-0.5 font-normal">(+{ev.points})</span>}
                        </td>
                        <td className="text-center py-1.5 px-1 text-[var(--muted)]">-</td>
                        <td className={`text-center py-1.5 px-1 font-bold ${ev.team === 'opponent' ? 'text-brand-400 text-sm' : 'text-white/50'}`}>
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
  oppPlayers: Record<string, { fouls?: number; fouls_plain?: number; fouls_1ft?: number; fouls_2ft?: number; fouls_3ft?: number; technical_fouls?: number; fouls_unsportsmanlike?: number }>
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
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
      const s = localStorage.getItem(`court_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  // 相手チームの各Qのスターター
  const qOppStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
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
      : isQEnd ? `border-b-2 ${color === 'orange' ? 'border-orange-400/70' : 'border-brand-400/70'}`
      : ''
    const colorClass = color === 'orange' ? 'text-orange-300' : 'text-brand-300'

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
                <td className="py-2.5 px-3 text-brand-400 font-bold text-xs truncate max-w-[80px]">{game.opponent}</td>
                {[1,2,3,4].map(q => (
                  <td key={q} className="text-center py-2 px-3">
                    <Cell val={qScore(q).opp} onCommit={v => {
                      const n = parseInt(v); if (isNaN(n)) return
                      saveOv({...ov, quarterScores: {...ov.quarterScores, [q]: {...ov.quarterScores[q], opp: n}}})
                    }} />
                  </td>
                ))}
                <td className="text-center py-2 px-3 text-brand-400 font-bold text-base">{totOpp}</td>
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
          <div className="px-3 py-2 text-[10px] text-brand-400 font-bold uppercase tracking-wide border-b border-[var(--card-border)]">
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
                      <td className="py-2 px-3 text-brand-400 font-bold">{p.number || '—'}</td>
                      <td className="py-2 pr-2 text-white truncate max-w-[100px] flex items-center gap-1">
                        {isOppSubstitute(p.key) && <span className="text-red-500 text-[11px] font-bold">＼</span>}
                        <span>{p.name}</span>
                        {score > 0 && <span className="text-[var(--muted)] text-[9px]">{score}pts</span>}
                      </td>
                      <td className="py-2 px-1 text-center">
                        <div className="flex gap-0.5 justify-center">
                          {[1,2,3,4].map(q => (
                            <span key={q} className={`text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center ${
                              appearedQs.includes(q) ? 'bg-brand-500/30 text-brand-400 border border-brand-500/50' : 'text-[var(--muted)]/30'
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
            <span className="text-brand-400 font-bold">{game.opponent}</span>
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
                    <th className="text-center py-1 px-1 text-brand-400 min-w-[60px]">{game.opponent}</th>
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
                  <span className="text-brand-400 font-bold">{qScore(q).opp}</span>
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
// ファウル種別 → スコアシート表記
function foulLabel(t: keyof OppFoulData): string {
  return t === 'technical_fouls' ? 'T' : t === 'fouls_unsportsmanlike' ? 'U' : t === 'fouls_1ft' ? 'P1' : t === 'fouls_2ft' ? 'P2' : t === 'fouls_3ft' ? 'P3' : 'P'
}

function JBASheet({ game, players, statsMap, scoreEvents, oppPlayerList, gameId, qConfirmPending, onConfirmAdvance, oppStatsMap, onDeleteEvent, onAddEvent, onChangeEventPlayer, onFoulEdit, onRenamePlayer, onRenameOppPlayer, homeTimeoutRecords, oppTimeoutRecords, foulEvents, currentQuarter, category = 'general' }: {
  game: Game; players: Player[]; statsMap: Map<string, PlayerStat>
  scoreEvents: ScoreEvent[]; oppPlayerList: OppPlayer[]; gameId: string
  qConfirmPending?: number | null; onConfirmAdvance?: () => void
  oppStatsMap?: Record<string, OppFoulData>
  onDeleteEvent?: (idx: number, ev: ScoreEvent) => void
  onAddEvent?: (req: AddEventRequest) => void
  onChangeEventPlayer?: (idx: number, ev: ScoreEvent, newId: string) => void
  onFoulEdit?: (playerId: string, isHome: boolean, delta: 1|-1, foulType: keyof OppFoulData) => void
  onRenamePlayer?: (playerId: string, newName: string, newNumber: string) => void
  onRenameOppPlayer?: (oppKey: string, newName: string, newNumber: string) => void
  homeTimeoutRecords?: TimeoutRecord[]
  oppTimeoutRecords?: TimeoutRecord[]
  foulEvents?: FoulEvent[]
  currentQuarter?: number
  category?: TeamCategory
}) {
  // 進行中のQ（終了済みQのチームファウルやTO未使用マスの「消し込み」判定に使う）
  const curQ = game.is_finished ? 99 : (currentQuarter ?? game.quarter ?? 1)
  const [deleteConfirm, setDeleteConfirm] = useState<{idx: number; ev: ScoreEvent; num: string; type: string} | null>(null)
  const [changeSel, setChangeSel] = useState('')  // 選手変更ダイアログの選択値
  const [renameTarget, setRenameTarget] = useState<{playerId: string; name: string; number: string; isHome: boolean} | null>(null)  // 選手名・背番号の修正
  const [addDialog, setAddDialog] = useState(false)
  const [addTeam, setAddTeam] = useState<'us'|'opponent'>('us')
  const [addPlayerIdx, setAddPlayerIdx] = useState(0)
  const [addOppKey, setAddOppKey] = useState('')  // 相手選手のkey（''は指定なし、'__direct__'は番号直接入力）
  const [addOppNum, setAddOppNum] = useState('')  // 相手選手リスト未登録時の背番号直接入力
  const [addPoints, setAddPoints] = useState<1|2|3>(2)
  const [addQuarter, setAddQuarter] = useState(1)
  const [foulDeleteConfirm, setFoulDeleteConfirm] = useState<{playerId: string; isHome: boolean; foulType: keyof OppFoulData; notation: string; playerNum: string} | null>(null)
  const [foulAddModal, setFoulAddModal] = useState<{playerId: string; isHome: boolean; playerNum: string} | null>(null)
  const maxQInSheet = useMemo(() => Math.max(4, ...scoreEvents.map(e => e.quarter)), [scoreEvents])
  const qScores = useMemo(() => Array.from({length: maxQInSheet}, (_, i) => i + 1).map(q => ({
    us:  scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0),
    opp: scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0),
  })), [scoreEvents, maxQInSheet])
  const totalUs  = qScores.reduce((s,q) => s+q.us, 0)
  const totalOpp = qScores.reduce((s,q) => s+q.opp, 0)

  const qHomeStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
      const s = localStorage.getItem(`court_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const qOppStarters = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
      const s = localStorage.getItem(`court_opp_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const qHomeSubs = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
      const s = localStorage.getItem(`sub_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  const qOppSubs = useMemo(() => {
    const map = new Map<number, Set<string>>()
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
      const s = localStorage.getItem(`sub_opp_q${q}_${gameId}`)
      if (s) try { map.set(q, new Set(JSON.parse(s))) } catch { /* ignore */ }
    }
    return map
  }, [gameId])

  // そのQに出場したか（スターター or 途中出場）。出場データが無いQは判定不能として null
  function playedInQuarter(team: 'us'|'opponent', id: string, q: number): boolean | null {
    const starters = (team === 'us' ? qHomeStarters : qOppStarters).get(q)
    const subs = (team === 'us' ? qHomeSubs : qOppSubs).get(q)
    if (!starters && !subs) return null
    return (starters?.has(id) ?? false) || (subs?.has(id) ?? false)
  }

  const { aMarks, bMarks, aQEndScores, bQEndScores, aEventIdxMap, bEventIdxMap } = useMemo(() => {
    const aMarks = new Map<number, RunMarkData>()
    const bMarks = new Map<number, RunMarkData>()
    const aEventIdxMap = new Map<number, number>() // cumScore → scoreEvents index
    const bEventIdxMap = new Map<number, number>()
    const aLastByQ = new Map<number, number>()
    const bLastByQ = new Map<number, number>()
    let aC = 0, bC = 0
    for (let i = 0; i < scoreEvents.length; i++) {
      const ev = scoreEvents[i]
      const type: '2P'|'3P'|'FT' = ev.points === 1 ? 'FT' : ev.points === 2 ? '2P' : '3P'
      if (ev.team === 'us') {
        const num = players.find(p => p.id === ev.player_id)?.number ?? ''
        aC += ev.points
        aMarks.set(aC, { type, num, quarter: ev.quarter })
        aEventIdxMap.set(aC, i)
        aLastByQ.set(ev.quarter, aC)
      } else {
        const m = ev.opp_player_name?.match(/#(\d+)/); const num = m ? m[1] : ''
        bC += ev.points
        bMarks.set(bC, { type, num, quarter: ev.quarter })
        bEventIdxMap.set(bC, i)
        bLastByQ.set(ev.quarter, bC)
      }
    }
    const aQEndScores = new Set<number>(); aLastByQ.forEach(v => aQEndScores.add(v))
    const bQEndScores = new Set<number>(); bLastByQ.forEach(v => bQEndScores.add(v))
    return { aMarks, bMarks, aQEndScores, bQEndScores, aEventIdxMap, bEventIdxMap }
  }, [scoreEvents, players])

  const B = '1px solid #aaa'
  const TB = '2px solid #111'

  function foulKeyFromPart(part: string): keyof OppFoulData {
    if (part === 'T') return 'technical_fouls'
    if (part === 'U') return 'fouls_unsportsmanlike'
    if (part === 'P3') return 'fouls_3ft'
    if (part === 'P2') return 'fouls_2ft'
    if (part === 'P1') return 'fouls_1ft'
    return 'fouls_plain'
  }

  // ランニングスコアのセル (flatMap で使うためインライン)
  function markContent(mark: RunMarkData | undefined): React.ReactNode {
    if (!mark) return null
    if (mark.type === 'FT') return `●${mark.num}`
    if (mark.type === '2P') return mark.num || '—'
    return <span style={{border:'1px solid #333', borderRadius:'50%', padding:'0 2px', fontSize:7, lineHeight:1}}>{mark.num || '—'}</span>
  }

  // 二重線（未使用マスの消し込み）マーク
  function doubleLine(width: number) {
    return (
      <span style={{display:'inline-block', width, verticalAlign:'middle'}}>
        <span style={{display:'block', borderTop:'1px solid #555', marginBottom:2}} />
        <span style={{display:'block', borderTop:'1px solid #555'}} />
      </span>
    )
  }

  // チーム別プレイヤーテーブル
  function TeamSection({ teamLabel, playerList, starters, subs, getStats, isHome, timeoutRecs, sideEvents }: {
    teamLabel: string
    playerList: { id: string; number: string; name: string }[]
    starters: Map<number, Set<string>>
    subs: Map<number, Set<string>>
    getStats: (id: string) => PlayerStat | undefined
    isHome: boolean
    timeoutRecs?: TimeoutRecord[]
    sideEvents?: FoulEvent[]
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
        </div>

        {/* タイムアウト（JBA: 前半2・後半3・各OT1。残り分を記入、消化済みで未使用は二重線） */}
        <div style={{borderBottom:'1px solid #aaa', padding:'2px 5px', display:'flex', gap:3, alignItems:'center', background:'#fafaf6'}}>
          <span style={{fontSize:7, color:'#444', fontWeight:'bold', marginRight:1}}>タイムアウト</span>
          {(() => {
            const recs = timeoutRecs ?? []
            const first = recs.filter(r => r.quarter <= 2).sort((a, b) => a.quarter - b.quarter)
            const second = recs.filter(r => r.quarter === 3 || r.quarter === 4).sort((a, b) => a.quarter - b.quarter)
            const ots = recs.filter(r => r.quarter >= 5).sort((a, b) => a.quarter - b.quarter)
            const firstDone = curQ > 2          // 後半以降は前半マス確定
            const secondDone = curQ > 4 || curQ === 99  // OT/試合終了で後半マス確定
            const box = (rec: TimeoutRecord | undefined, crossed: boolean, key: string) => (
              <span key={key} style={{
                width:24, minHeight:14, border: rec ? '1.5px solid #c00' : '1px solid #999', borderRadius:3,
                display:'inline-flex', alignItems:'center', justifyContent:'center', padding:'1px 0',
                background: rec ? '#fff0f0' : '#fff'
              }}>
                {rec
                  ? <span style={{fontSize:9, fontWeight:'bold', color:'#c00', lineHeight:1.2}}>残{rec.minute}</span>
                  : crossed ? doubleLine(12) : <span style={{fontSize:9, lineHeight:1.2, color:'transparent'}}>0</span>}
              </span>
            )
            const otBoxes = ots.length > 0 && (
              <>
                <span style={{fontSize:6, color:'#888', fontWeight:'bold', marginLeft:2}}>OT</span>
                {ots.map((r, i) => box(r, false, 'o' + i))}
              </>
            )
            // ミニバス: 各クォーター1回（Q別マス）
            if (category === 'mini') {
              return (
                <>
                  {[1, 2, 3, 4].map(q => (
                    <span key={'mq' + q} style={{display:'inline-flex', flexDirection:'column', alignItems:'center'}}>
                      <span style={{fontSize:6, color:'#888', lineHeight:1.1}}>Q{q}</span>
                      {box(recs.find(r => r.quarter === q), curQ > q, 'mq' + q)}
                    </span>
                  ))}
                  {otBoxes}
                </>
              )
            }
            // 一般: 前半2マス・後半3マス
            return (
              <>
                <span style={{fontSize:6, color:'#888', fontWeight:'bold'}}>前</span>
                {[0, 1].map(i => box(first[i], firstDone, 'f' + i))}
                <span style={{fontSize:6, color:'#888', fontWeight:'bold', marginLeft:2}}>後</span>
                {[0, 1, 2].map(i => box(second[i], secondDone, 's' + i))}
                {otBoxes}
              </>
            )
          })()}
        </div>

        {/* チームファウル（Q別・×で消し込み、終了Qの未使用マスは二重線）
            ※ファウルイベント未記録の旧試合では誤表示になるため非表示 */}
        {sideEvents && sideEvents.length > 0 && (
          <div style={{borderBottom:'1px solid #aaa', padding:'2px 5px', display:'flex', gap:4, alignItems:'center', background:'#fafaf6', flexWrap:'wrap'}}>
            <span style={{fontSize:7, color:'#444', fontWeight:'bold'}}>チームファウル</span>
            {[1,2,3,4].map(q => {
              // OT中のファウルは第4Qの欄に加算（FIBA準拠）
              const cnt = sideEvents.filter(e => q === 4 ? e.quarter >= 4 : e.quarter === q).length
              const ended = curQ > q
              return (
                <span key={q} style={{display:'inline-flex', alignItems:'center', gap:1}}>
                  <span style={{fontSize:6, color:'#888', marginRight:1}}>Q{q}</span>
                  {[1,2,3,4].map(n => (
                    <span key={n} style={{
                      width:11, height:13, border:'1px solid #999', display:'inline-flex',
                      alignItems:'center', justifyContent:'center',
                      background: n <= cnt ? '#fff0f0' : '#fff'
                    }}>
                      {n <= cnt
                        ? <span style={{fontSize:10, fontWeight:'bold', color:'#c00', lineHeight:1}}>×</span>
                        : ended
                          ? doubleLine(7)
                          : <span style={{fontSize:7, color:'#bbb'}}>{n}</span>}
                    </span>
                  ))}
                </span>
              )
            })}
          </div>
        )}

        {/* 選手テーブル */}
        <table style={{borderCollapse:'collapse', width:'100%', tableLayout:'fixed', fontSize:7}}>
          <colgroup>
            <col style={{width:13}} />{/* No */}
            <col />{/* 氏名 */}
            <col style={{width:18}} />{/* 背番号 */}
            <col style={{width:12}} /><col style={{width:12}} /><col style={{width:12}} /><col style={{width:12}} />{/* Q1-4 */}
            {maxQInSheet > 4 && Array.from({length: maxQInSheet-4}, (_,i) =>
              <col key={i} style={{width:12}} />)}{/* OT列 */}
            <col style={{width:11}} /><col style={{width:11}} /><col style={{width:11}} /><col style={{width:11}} /><col style={{width:11}} />{/* ファウル */}
          </colgroup>
          <thead>
            <tr style={{height:13, background:'#ede', fontSize:6}}>
              <th style={{border:B, textAlign:'center'}}></th>
              <th style={{border:B, textAlign:'left', paddingLeft:2}}>選手氏名</th>
              <th style={{border:B, textAlign:'center'}}>No.</th>
              {['①','②','③','④'].map(s => <th key={s} style={{border:B, textAlign:'center'}}>{s}</th>)}
              {maxQInSheet > 4 && Array.from({length: maxQInSheet-4}, (_,i) =>
                <th key={`ot${i+1}`} style={{border:B, textAlign:'center', color:'#c00'}}>OT{i+1}</th>)}
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
                  {Array.from({length: 4 + Math.max(0, maxQInSheet-4) + 5}).map((_,j) => <td key={j} style={{border:B}} />)}
                </tr>
              )
              const stat = getStats(p.id)
              const fouls = stat ? getTotalFouls(stat) : 0
              const foulNotation = stat ? getFoulNotation(stat) : ''
              // ファウルイベント（時系列）がスタッツと整合する場合はそちらを優先表示し、
              // 前半（Q1-2）と後半（Q3-4/OT）の区切り太線を引けるようにする
              const pEvents = (sideEvents ?? []).filter(e => e.key === p.id)
              const useChrono = pEvents.length > 0 && pEvents.length === fouls
              const foulParts = useChrono
                ? pEvents.map(e => foulLabel(e.foulType))
                : foulNotation.split(' ').filter(x => x)
              // 前半に犯したファウル数（太線の位置）。後半に入るまでは線を引かない
              const halfCount = useChrono && curQ >= 3 ? pEvents.filter(e => e.quarter <= 2).length : -1
              return (
                <tr key={p.id} style={{height:14}}>
                  <td style={{border:B, textAlign:'center', fontSize:6, color:'#888'}}>{i+1}</td>
                  {(() => {
                    const canRename = isHome ? !!onRenamePlayer : !!onRenameOppPlayer
                    const openEdit = canRename ? () => setRenameTarget({ playerId: p.id, name: p.name, number: p.number, isHome }) : undefined
                    return (
                    <>
                      <td
                        onClick={openEdit}
                        style={{border:B, paddingLeft:2, fontSize:8, overflow:'hidden', whiteSpace:'nowrap', cursor: canRename ? 'pointer' : 'default', background: canRename ? 'rgba(238,122,47,0.05)' : undefined}}
                      >
                        {p.name}{canRename && <span style={{color:'#ee7a2f', fontSize:7, marginLeft:1}}>✎</span>}
                      </td>
                      <td
                        onClick={openEdit}
                        style={{border:B, textAlign:'center', fontWeight:'bold', fontSize:9, cursor: canRename ? 'pointer' : 'default', background: canRename ? 'rgba(238,122,47,0.05)' : undefined}}
                      >
                        {p.number}
                      </td>
                    </>
                    )
                  })()}
                  {Array.from({length: maxQInSheet}, (_, qi) => {
                    const q = qi + 1
                    const isStarter = starters.get(q)?.has(p.id)
                    const isSub = subs.get(q)?.has(p.id)
                    const isOT = q > 4
                    return (
                      <td key={q} style={{border:B, textAlign:'center', fontSize:11, color: isOT ? '#c00' : (q===1||q===3)?'#c00':'#111', fontStyle:'italic', background: isOT ? '#fff8f0' : undefined}}>
                        {isStarter ? '/' : isSub ? '╲' : ''}
                      </td>
                    )
                  })}
                  {[1,2,3,4,5].map(f => {
                    const part = foulParts[f-1]
                    const isEmpty = !part && f === fouls + 1 && onFoulEdit
                    // 前半/後半の区切り太線（前半のファウルの右端に引く。前半0個なら1マス目の左端）
                    const halfRight = halfCount > 0 && f === halfCount
                    const halfLeft = halfCount === 0 && fouls > 0 && f === 1
                    // 試合終了後、未使用マスは横線で消し込み（公式ルール）。タップでの追加は引き続き可能
                    const unusedLine = game.is_finished && !part
                    return (
                      <td key={f}
                        onClick={onFoulEdit ? (
                          part
                            ? () => setFoulDeleteConfirm({ playerId: p.id, isHome, foulType: foulKeyFromPart(part), notation: part, playerNum: p.number })
                            : isEmpty
                              ? () => setFoulAddModal({ playerId: p.id, isHome, playerNum: p.number })
                              : undefined
                        ) : undefined}
                        style={{border:B, borderRight: halfRight ? '2px solid #111' : B, borderLeft: halfLeft ? '2px solid #111' : undefined, textAlign:'center', fontSize:6, color:'#c00', fontWeight:'bold', lineHeight:'11px', verticalAlign:'top', paddingTop:'1px', cursor: onFoulEdit && (part || isEmpty) ? 'pointer' : 'default', background: part && onFoulEdit ? 'rgba(220,38,38,0.07)' : isEmpty && !game.is_finished ? 'rgba(0,180,0,0.05)' : undefined}}
                      >
                        {part ?? (
                          unusedLine
                            ? <span style={{display:'inline-block', width:'70%', borderTop:'1px solid #444', verticalAlign:'middle'}} />
                            : isEmpty ? <span style={{color:'#aaa', fontSize:9, fontWeight:'normal'}}>＋</span> : ''
                        )}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>

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
          {'　'}チームA: 自チーム　チームB: {game.opponent}
        </div>
        <div style={{fontSize:13, fontWeight:'bold'}}>
          <span style={{color:'#c00'}}>{totalUs}</span>
          <span style={{color:'#888', margin:'0 3px'}}>-</span>
          <span style={{color:'#00c'}}>{totalOpp}</span>
        </div>
      </div>

      <div style={{display:'flex', gap:6, alignItems:'flex-start'}}>
        {/* 左: チームセクション（A上・B下の縦積み） */}
        <div style={{flex:'0 0 auto', minWidth:240, maxWidth:300}}>
          <TeamSection
            teamLabel="チームA: 自チーム"
            playerList={players.map(p => ({id:p.id, number:p.number??'', name:p.name}))}
            starters={qHomeStarters}
            subs={qHomeSubs}
            getStats={id => statsMap.get(id)}
            isHome={true}
            timeoutRecs={homeTimeoutRecords}
            sideEvents={foulEvents?.filter(e => e.team === 'us')}
          />
          {/* Qスコア & チームファウル（両チーム間に1回のみ） */}
          <div style={{border:'1px solid #888', margin:'3px 0', background:'#f8f8f4'}}>
            <div style={{background:'#e8e8e0', fontSize:6, fontWeight:'bold', padding:'1px 4px', borderBottom:'1px solid #aaa'}}>
              クォータースコア / QUARTER SCORE
            </div>
            <div style={{display:'flex', padding:'2px 4px', gap:4, flexWrap:'wrap'}}>
              {qScores.map((qs, i) => {
                const q = i + 1
                return (
                  <div key={q} style={{flex:1, minWidth:28, textAlign:'center', borderRight: q<maxQInSheet ? '1px solid #ddd' : 'none', paddingRight:3}}>
                    <div style={{fontSize:5, color:'#888', fontWeight:'bold'}}>{q <= 4 ? `Q${q}` : `OT${q-4}`}</div>
                    <div style={{fontSize:8, fontWeight:'bold'}}>
                      <span style={{color: q%2===1 ? '#c00' : '#111'}}>{qs.us}</span>
                      <span style={{color:'#aaa', margin:'0 1px'}}>-</span>
                      <span style={{color:'#00c'}}>{qs.opp}</span>
                    </div>
                  </div>
                )
              })}
              <div style={{textAlign:'center', borderLeft:'2px solid #aaa', paddingLeft:6}}>
                <div style={{fontSize:5, color:'#888', fontWeight:'bold'}}>合計</div>
                <div style={{fontSize:10, fontWeight:'bold'}}>
                  <span style={{color:'#c00'}}>{totalUs}</span>
                  <span style={{color:'#aaa', margin:'0 1px'}}>-</span>
                  <span style={{color:'#00c'}}>{totalOpp}</span>
                </div>
              </div>
            </div>
          </div>

          <TeamSection
            teamLabel={`チームB: ${game.opponent}`}
            playerList={oppPlayerList.map(p => ({id:p.key, number:p.number, name:p.name}))}
            starters={qOppStarters}
            subs={qOppSubs}
            getStats={pid => {
              // oppStatsMap prop優先、なければ localStorage の scoresheet_ov から取得
              const foulEntry = oppStatsMap?.[pid]
              if (foulEntry !== undefined) {
                const total = foulEntry.fouls_plain + foulEntry.fouls_1ft + foulEntry.fouls_2ft + foulEntry.fouls_3ft + foulEntry.technical_fouls + foulEntry.fouls_unsportsmanlike
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
            timeoutRecs={oppTimeoutRecords}
            sideEvents={foulEvents?.filter(e => e.team === 'opponent')}
          />
        </div>

        {/* 右: ランニングスコア */}
        <div style={{flex:'1 1 auto'}}>
          <div style={{display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginBottom:3}}>
            <div style={{textAlign:'center', fontWeight:'bold', fontSize:8, letterSpacing:1}}>
              ランニングスコア　RUNNING SCORE
            </div>
            {onAddEvent && (
              <button
                onClick={() => {
                  // 直近の記録があるQ（なければ現在のQ）を初期選択にする
                  const lastQ = scoreEvents.length ? scoreEvents[scoreEvents.length - 1].quarter : (game.quarter ?? 1)
                  setAddDialog(true); setAddTeam('us'); setAddPlayerIdx(0); setAddOppKey(''); setAddOppNum(''); setAddPoints(2); setAddQuarter(Math.min(Math.max(lastQ, 1), 4))
                }}
                style={{fontSize:9, padding:'1px 5px', background:'#1a5a2e', color:'#6ee7a0', border:'1px solid #2d8a50', borderRadius:3, cursor:'pointer', lineHeight:1.4}}
              >＋ 手動追加</button>
            )}
            {onDeleteEvent && (
              <span style={{fontSize:7, color:'#888'}}>（記録タップで削除）</span>
            )}
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
                      const aIdx = aEventIdxMap.get(n)
                      const bIdx = bEventIdxMap.get(n)
                      return [
                        <td key={`a${n}`}
                          onClick={aM && onDeleteEvent && aIdx !== undefined ? () => { setChangeSel(''); setDeleteConfirm({idx: aIdx, ev: scoreEvents[aIdx], num: aM.num, type: aM.type}) } : undefined}
                          style={{border:B, borderBottom:bbA, width:30, height:13, position:'relative', textAlign:'center', verticalAlign:'middle', fontSize:8, lineHeight:'13px', color:aColor, cursor: aM && onDeleteEvent ? 'pointer' : 'default', background: aM && onDeleteEvent ? 'rgba(220,38,38,0.04)' : undefined}}
                        >
                          <span style={{position:'absolute', top:0, left:1, fontSize:5, color:'#bbb', lineHeight:'1', userSelect:'none'}}>{n}</span>
                          {markContent(aM)}
                        </td>,
                        <td key={`b${n}`}
                          onClick={bM && onDeleteEvent && bIdx !== undefined ? () => { setChangeSel(''); setDeleteConfirm({idx: bIdx, ev: scoreEvents[bIdx], num: bM.num, type: bM.type}) } : undefined}
                          style={{border:B, borderBottom:bbB, borderRight:gi<2?'2px solid #888':B, width:30, height:13, textAlign:'center', verticalAlign:'middle', fontSize:8, lineHeight:'13px', color:bColor, cursor: bM && onDeleteEvent ? 'pointer' : 'default', background: bM && onDeleteEvent ? 'rgba(220,38,38,0.04)' : undefined}}
                        >
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

      {/* スコア修正ダイアログ（選手の変更・削除） */}
      {deleteConfirm && (() => {
        const isUs = deleteConfirm.ev.team === 'us'
        // 選手変更の候補（現在の得点者は除外）
        const currentId = isUs
          ? deleteConfirm.ev.player_id
          : oppPlayerList.find(p => deleteConfirm.ev.opp_player_name === `#${p.number} ${p.name}`)?.key
        const evQuarter = deleteConfirm.ev.quarter
        const candidates = (isUs
          ? players.map(p => ({ id: p.id, label: `#${p.number || '—'} ${p.name}` }))
          : oppPlayerList.map(p => ({ id: p.key, label: `#${p.number} ${p.name}` }))
        ).filter(c => c.id !== currentId)
          .map(c => ({ ...c, notPlayed: playedInQuarter(isUs ? 'us' : 'opponent', c.id, evQuarter) === false }))
        const selNotPlayed = changeSel ? (candidates.find(c => c.id === changeSel)?.notPlayed ?? false) : false
        return (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200}} onClick={() => setDeleteConfirm(null)}>
          <div style={{background:'#fff', borderRadius:10, padding:20, maxWidth:320, width:'92%', textAlign:'center'}} onClick={e => e.stopPropagation()}>
            <div style={{fontWeight:'bold', fontSize:14, marginBottom:8}}>この記録を修正</div>
            <div style={{fontSize:12, color:'#555', marginBottom:4}}>
              Q{deleteConfirm.ev.quarter}　{isUs ? 'チームA' : 'チームB'}
              {deleteConfirm.num ? `　#${deleteConfirm.num}` : ''}
            </div>
            <div style={{fontSize:16, fontWeight:'bold', marginBottom:12, color: isUs ? '#c00' : '#00c'}}>
              {deleteConfirm.type}（{deleteConfirm.ev.points}点）
            </div>

            {/* 選手の付け替え */}
            {onChangeEventPlayer && candidates.length > 0 && (
              <div style={{border:'1px solid #ddd', borderRadius:8, padding:10, marginBottom:12, textAlign:'left'}}>
                <div style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:6}}>
                  得点した選手が違う場合（スタッツも付け替えます）
                </div>
                <select
                  value={changeSel}
                  onChange={e => setChangeSel(e.target.value)}
                  style={{width:'100%', padding:'8px', borderRadius:6, border:'1px solid #ccc', fontSize:14, marginBottom:8, background:'#fff'}}
                >
                  <option value="">正しい選手を選択...</option>
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.label}{c.notPlayed ? `（Q${evQuarter}未出場）` : ''}</option>)}
                </select>
                {selNotPlayed && (
                  <div style={{background:'#fdeeda', border:'1px solid #ee7a2f', borderRadius:6, padding:'8px 10px', fontSize:11, color:'#c85a14', marginBottom:8}}>
                    <b>⚠ この選手はQ{evQuarter}に出場していません。</b><br/>
                    選び間違いがないか確認してください。出場記録の漏れであれば、このまま変更できます。
                  </div>
                )}
                <button
                  disabled={!changeSel}
                  onClick={() => { onChangeEventPlayer(deleteConfirm.idx, deleteConfirm.ev, changeSel); setDeleteConfirm(null) }}
                  style={{width:'100%', padding:'9px', border:'none', borderRadius:6, background: !changeSel ? '#cbd5e1' : selNotPlayed ? '#c85a14' : '#ee7a2f', color:'white', fontWeight:'bold', cursor: changeSel ? 'pointer' : 'default', fontSize:13}}
                >{selNotPlayed ? '未出場ですがこの選手に変更する' : 'この選手に変更する'}</button>
              </div>
            )}

            <div style={{fontSize:10, color:'#888', marginBottom:10}}>削除した場合はスタッツも同時に取り消されます</div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={() => setDeleteConfirm(null)} style={{flex:1, padding:'8px', border:'1px solid #ccc', borderRadius:6, background:'#f5f5f5', cursor:'pointer'}}>キャンセル</button>
              <button onClick={() => { onDeleteEvent?.(deleteConfirm.idx, deleteConfirm.ev); setDeleteConfirm(null) }} style={{flex:1, padding:'8px', border:'none', borderRadius:6, background:'#dc2626', color:'white', fontWeight:'bold', cursor:'pointer'}}>削除</button>
            </div>
          </div>
        </div>
        )
      })()}

      {/* 手動追加ダイアログ */}
      {addDialog && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200}} onClick={() => setAddDialog(false)}>
          <div style={{background:'#fff', borderRadius:10, padding:20, maxWidth:340, width:'92%'}} onClick={e => e.stopPropagation()}>
            <div style={{fontWeight:'bold', fontSize:15, marginBottom:14, textAlign:'center'}}>スコアを手動追加</div>

            <div style={{marginBottom:10}}>
              <div style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:4}}>チーム</div>
              <div style={{display:'flex', gap:6}}>
                {(['us','opponent'] as const).map(t => (
                  <button key={t} onClick={() => setAddTeam(t)} style={{flex:1, padding:'6px', borderRadius:6, border:'2px solid', borderColor: addTeam===t ? '#c00' : '#ccc', background: addTeam===t ? '#fee' : '#f5f5f5', fontWeight: addTeam===t ? 'bold' : 'normal', cursor:'pointer', fontSize:12}}>
                    {t === 'us' ? 'チームA（自チーム）' : `チームB（${game.opponent}）`}
                  </button>
                ))}
              </div>
            </div>

            {addTeam === 'us' && players.length > 0 && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:4}}>選手</div>
                <select value={addPlayerIdx} onChange={e => setAddPlayerIdx(Number(e.target.value))} style={{width:'100%', padding:'6px', borderRadius:6, border:'1px solid #ccc', fontSize:13}}>
                  {players.map((p, i) => <option key={p.id} value={i}>#{p.number} {p.name}</option>)}
                </select>
              </div>
            )}

            {addTeam === 'opponent' && (
              <div style={{marginBottom:10}}>
                <div style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:4}}>選手</div>
                {oppPlayerList.length > 0 && (
                  <select value={addOppKey} onChange={e => setAddOppKey(e.target.value)} style={{width:'100%', padding:'6px', borderRadius:6, border:'1px solid #ccc', fontSize:13, background:'#fff', marginBottom:6}}>
                    <option value="">指定しない（番号なし）</option>
                    {oppPlayerList.map(p => <option key={p.key} value={p.key}>#{p.number} {p.name}</option>)}
                    <option value="__direct__">リストにない番号を直接入力…</option>
                  </select>
                )}
                {(oppPlayerList.length === 0 || addOppKey === '__direct__') && (
                  <input
                    type="text"
                    inputMode="numeric"
                    value={addOppNum}
                    onChange={e => setAddOppNum(e.target.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/\D/g, '').slice(0, 3))}
                    placeholder="背番号を入力（空欄なら番号なし）"
                    style={{width:'100%', padding:'6px', borderRadius:6, border:'1px solid #ccc', fontSize:13, background:'#fff', boxSizing:'border-box'}}
                  />
                )}
              </div>
            )}

            <div style={{marginBottom:10}}>
              <div style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:4}}>クォーター</div>
              <div style={{display:'flex', gap:4}}>
                {[1,2,3,4].map(q => (
                  <button key={q} onClick={() => setAddQuarter(q)} style={{flex:1, padding:'6px', borderRadius:6, border:'2px solid', borderColor: addQuarter===q ? '#1a5a2e' : '#ccc', background: addQuarter===q ? '#e6f4ea' : '#f5f5f5', fontWeight: addQuarter===q ? 'bold' : 'normal', cursor:'pointer', fontSize:12}}>Q{q}</button>
                ))}
              </div>
            </div>

            <div style={{marginBottom:16}}>
              <div style={{fontSize:11, fontWeight:'bold', color:'#555', marginBottom:4}}>種別（得点）</div>
              <div style={{display:'flex', gap:6}}>
                {([2,3,1] as const).filter(pts => category !== 'mini' || pts !== 3).map(pts => (
                  <button key={pts} onClick={() => setAddPoints(pts)} style={{flex:1, padding:'6px', borderRadius:6, border:'2px solid', borderColor: addPoints===pts ? '#ee7a2f' : '#ccc', background: addPoints===pts ? '#fdeeda' : '#f5f5f5', fontWeight: addPoints===pts ? 'bold' : 'normal', cursor:'pointer', fontSize:12}}>
                    {pts === 1 ? 'FT（1点）' : pts === 2 ? '2P（2点）' : '3P（3点）'}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const addPlayer = addTeam === 'us' ? players[addPlayerIdx] : undefined
              const addOpp = addTeam === 'opponent' && addOppKey && addOppKey !== '__direct__' ? oppPlayerList.find(p => p.key === addOppKey) : undefined
              const addOppDirectNum = addTeam === 'opponent' && (oppPlayerList.length === 0 || addOppKey === '__direct__') ? addOppNum.trim() : ''
              const notPlayed = addPlayer ? playedInQuarter('us', addPlayer.id, addQuarter) === false
                : addOpp ? playedInQuarter('opponent', addOpp.key, addQuarter) === false
                : false
              const warnLabel = addPlayer ? `#${addPlayer.number} ${addPlayer.name}` : addOpp ? `#${addOpp.number} ${addOpp.name}` : ''
              return (
                <>
                  {notPlayed && (
                    <div style={{background:'#fdeeda', border:'1px solid #ee7a2f', borderRadius:6, padding:'8px 10px', fontSize:12, color:'#c85a14', marginBottom:12}}>
                      <b>⚠ {warnLabel} はQ{addQuarter}に出場していません。</b><br/>
                      選手・クォーターの選び間違いがないか確認してください。出場記録の漏れであれば、このまま追加できます。
                    </div>
                  )}
                  <div style={{display:'flex', gap:8}}>
                    <button onClick={() => setAddDialog(false)} style={{flex:1, padding:'10px', border:'1px solid #ccc', borderRadius:6, background:'#f5f5f5', cursor:'pointer', fontSize:13}}>キャンセル</button>
                    <button
                      onClick={() => {
                        const playerId = addTeam === 'us' && players[addPlayerIdx] ? players[addPlayerIdx].id : undefined
                        const oppName = addOpp ? `#${addOpp.number} ${addOpp.name}` : addOppDirectNum ? `#${addOppDirectNum}` : undefined
                        onAddEvent?.({ quarter: addQuarter, team: addTeam, points: addPoints, player_id: playerId, opp_player_name: oppName })
                        setAddDialog(false)
                      }}
                      style={{flex:2, padding:'10px', border:'none', borderRadius:6, background: notPlayed ? '#c85a14' : '#ee7a2f', color:'white', fontWeight:'bold', cursor:'pointer', fontSize:13}}
                    >{notPlayed ? '未出場ですが追加する' : '追加してスタッツに反映'}</button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* ファウル削除確認ダイアログ */}
      {foulDeleteConfirm && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:201}} onClick={() => setFoulDeleteConfirm(null)}>
          <div style={{background:'#fff', borderRadius:10, padding:20, maxWidth:300, width:'90%', textAlign:'center'}} onClick={e => e.stopPropagation()}>
            <div style={{fontWeight:'bold', fontSize:14, marginBottom:8}}>このファウルを削除しますか？</div>
            <div style={{fontSize:13, marginBottom:6}}>
              {foulDeleteConfirm.isHome ? 'チームA' : 'チームB'}　#{foulDeleteConfirm.playerNum}
            </div>
            <div style={{fontSize:20, fontWeight:'bold', color:'#c00', marginBottom:16}}>
              {foulDeleteConfirm.notation}
            </div>
            <div style={{display:'flex', gap:8}}>
              <button onClick={() => setFoulDeleteConfirm(null)} style={{flex:1, padding:'8px', border:'1px solid #ccc', borderRadius:6, background:'#f5f5f5', cursor:'pointer'}}>キャンセル</button>
              <button onClick={() => { onFoulEdit?.(foulDeleteConfirm.playerId, foulDeleteConfirm.isHome, -1, foulDeleteConfirm.foulType); setFoulDeleteConfirm(null) }} style={{flex:1, padding:'8px', border:'none', borderRadius:6, background:'#dc2626', color:'white', fontWeight:'bold', cursor:'pointer'}}>削除</button>
            </div>
          </div>
        </div>
      )}

      {/* ファウル追加ダイアログ */}
      {foulAddModal && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:201}} onClick={() => setFoulAddModal(null)}>
          <div style={{background:'#fff', borderRadius:10, padding:20, maxWidth:320, width:'92%', textAlign:'center'}} onClick={e => e.stopPropagation()}>
            <div style={{fontWeight:'bold', fontSize:14, marginBottom:8}}>ファウルを追加</div>
            <div style={{fontSize:13, color:'#555', marginBottom:14}}>
              {foulAddModal.isHome ? 'チームA' : 'チームB'}　#{foulAddModal.playerNum}
            </div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:6, marginBottom:16}}>
              {([['P','fouls_plain'],['P1','fouls_1ft'],['P2','fouls_2ft'],['P3','fouls_3ft'],['T','technical_fouls'],['U','fouls_unsportsmanlike']] as [string, keyof OppFoulData][]).map(([label, key]) => (
                <button key={key}
                  onClick={() => { onFoulEdit?.(foulAddModal.playerId, foulAddModal.isHome, 1, key); setFoulAddModal(null) }}
                  style={{padding:'10px 2px', borderRadius:6, border:'2px solid #c00', background:'#fff1f0', color:'#c00', fontWeight:'bold', fontSize:13, cursor:'pointer'}}
                >{label}</button>
              ))}
            </div>
            <button onClick={() => setFoulAddModal(null)} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:6, background:'#f5f5f5', cursor:'pointer'}}>キャンセル</button>
          </div>
        </div>
      )}

      {/* 選手名の修正ダイアログ */}
      {renameTarget && (
        <div style={{position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:202, padding:16}} onClick={() => setRenameTarget(null)}>
          <div style={{background:'#fff', borderRadius:10, padding:20, maxWidth:340, width:'100%'}} onClick={e => e.stopPropagation()}>
            <div style={{fontWeight:'bold', fontSize:15, marginBottom:4, textAlign:'center'}}>{renameTarget.isHome ? '選手を修正' : '相手選手を修正'}</div>
            <div style={{fontSize:11, color:'#888', marginBottom:14, textAlign:'center'}}>{renameTarget.isHome ? '名前・背番号はチーム名簿にも反映されます' : 'この試合の相手選手の名前・背番号を変更します'}</div>
            <div style={{display:'flex', gap:8, marginBottom:16}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10, color:'#888', marginBottom:3}}>選手名</div>
                <input
                  autoFocus
                  value={renameTarget.name}
                  onChange={e => setRenameTarget({ ...renameTarget, name: e.target.value })}
                  style={{width:'100%', padding:'10px', borderRadius:8, border:'1px solid #ccc', fontSize:16, boxSizing:'border-box', color:'#111'}}
                />
              </div>
              <div style={{width:'80px'}}>
                <div style={{fontSize:10, color:'#888', marginBottom:3}}>背番号</div>
                <input
                  value={renameTarget.number}
                  onChange={e => setRenameTarget({ ...renameTarget, number: e.target.value.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[^0-9]/g, '') })}
                  inputMode="numeric"
                  maxLength={3}
                  style={{width:'100%', padding:'10px', borderRadius:8, border:'1px solid #ccc', fontSize:16, boxSizing:'border-box', textAlign:'center', fontWeight:'bold', color:'#ea580c'}}
                />
              </div>
            </div>
            {/* 背番号重複の警告（同じ番号だとランニングスコアで記録が混ざる） */}
            {(() => {
              const num = renameTarget.number.trim()
              if (!num) return null
              const dup = renameTarget.isHome
                ? players.some(p => p.id !== renameTarget.playerId && (p.number ?? '') === num)
                : oppPlayerList.some(p => p.key !== renameTarget.playerId && p.number === num)
              return dup ? (
                <div style={{background:'#fff1f0', border:'1px solid #f5a3a3', borderRadius:8, padding:'8px 10px', marginBottom:14, fontSize:11, color:'#c00'}}>
                  ⚠️ 背番号 #{num} は他の選手と重複しています。同じ番号があるとランニングスコアで記録が混ざるため、番号は重複しないようにしてください。
                </div>
              ) : null
            })()}
            <div style={{display:'flex', gap:8}}>
              <button onClick={() => setRenameTarget(null)} style={{flex:1, padding:'10px', border:'1px solid #ccc', borderRadius:6, background:'#f5f5f5', cursor:'pointer', fontSize:14}}>キャンセル</button>
              <button
                onClick={() => {
                  const n = renameTarget.name.trim()
                  if (n) { if (renameTarget.isHome) onRenamePlayer?.(renameTarget.playerId, n, renameTarget.number); else onRenameOppPlayer?.(renameTarget.playerId, n, renameTarget.number) }
                  setRenameTarget(null)
                }}
                style={{flex:2, padding:'10px', border:'none', borderRadius:6, background:'#ee7a2f', color:'white', fontWeight:'bold', cursor:'pointer', fontSize:14}}
              >保存する</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 試合終了後スタッツ一覧 ──────────────────────────────────────────────────
function FinishedGameView({ game, players, statsMap, scoreEvents, oppPlayerList, onDeleteEvent, onAddEvent, onChangeEventPlayer, onFoulEdit, onRenamePlayer, onRenameOppPlayer }: {
  game: Game
  players: Player[]
  statsMap: Map<string, PlayerStat>
  scoreEvents: ScoreEvent[]
  oppPlayerList: OppPlayer[]
  onDeleteEvent?: (idx: number, ev: ScoreEvent) => void
  onAddEvent?: (req: AddEventRequest) => void
  onChangeEventPlayer?: (idx: number, ev: ScoreEvent, newId: string) => void
  onFoulEdit?: (playerId: string, isHome: boolean, delta: 1|-1, foulType: keyof OppFoulData) => void
  onRenamePlayer?: (playerId: string, newName: string, newNumber: string) => void
  onRenameOppPlayer?: (oppKey: string, newName: string, newNumber: string) => void
}) {
  const [tab, setTab] = useState<'stats' | 'scoresheet'>('stats')
  // 「共有」ボタンのクリップボードコピー完了表示
  const [shareCopied, setShareCopied] = useState(false)
  // LINE共有用の共有トークン＋チーム種別（一般/ミニバス）を取得
  const [shareToken, setShareToken] = useState('')
  const [category, setCategory] = useState<TeamCategory>('general')
  useEffect(() => {
    const supabase = createClient()
    supabase.from('teams').select('share_token, category').eq('id', game.team_id).maybeSingle()
      .then(({ data }) => {
        if (data?.share_token) setShareToken(data.share_token)
        if (data?.category === 'mini' || data?.category === 'general') setCategory(data.category)
      })
  }, [game.team_id])
  // court_data_json からタイムアウト記録を復元
  const homeTimeoutRecords: TimeoutRecord[] = (() => {
    try { const cd = game.court_data_json as { homeTimeouts?: TimeoutRecord[] }; return cd?.homeTimeouts ?? [] } catch { return [] }
  })()
  const oppTimeoutRecords: TimeoutRecord[] = (() => {
    try { const cd = game.court_data_json as { oppTimeouts?: TimeoutRecord[] }; return cd?.oppTimeouts ?? [] } catch { return [] }
  })()
  // ファウルイベント（court_data_json優先・localStorageフォールバック）
  const finishedFoulEvents: FoulEvent[] = (() => {
    try {
      const cd = game.court_data_json as { foulEvents?: FoulEvent[] }
      if (cd?.foulEvents?.length) return cd.foulEvents
    } catch { /* ignore */ }
    try {
      const fe = localStorage.getItem(`foul_events_${game.id}`)
      if (fe) return JSON.parse(fe)
    } catch { /* ignore */ }
    return []
  })()
  // 試合に登録された選手のうち、スタッツが存在する選手のみ表示
  const rows = players
    .filter(p => statsMap.has(p.id))
    .map(p => ({
      player: p,
      stat: statsMap.get(p.id)!,
    }))

  // 相手チームのスタッツ（court_data_json優先・localStorageフォールバック）。
  // 記録していない項目は0のまま。何も付けていない試合ではこの表自体を出さない。
  const oppRows = (() => {
    let raw: Record<string, Partial<OppStatData> & { fouls?: number }> | null = null
    try { raw = readOppStatsJson(game.court_data_json) } catch { /* ignore */ }
    if (!raw) {
      try {
        const s = localStorage.getItem(`scoresheet_ov_${game.id}`)
        if (s) raw = JSON.parse(s).oppPlayers ?? null
      } catch { /* ignore */ }
    }
    return oppPlayerList
      .map(p => ({
        player: p,
        stat: normalizeOppStat(raw?.[p.key]),
        pts: getOppPlayerScore(scoreEvents, `#${p.number} ${p.name}`),
      }))
      .filter(r => r.pts > 0 || hasOppStatRecord(r.stat))
  })()
  const oppTotalPoints = oppRows.reduce((s, r) => s + r.pts, 0)

  // 個人スタッツの合計得点
  const totalPoints = rows.reduce((sum, { stat }) => sum + calcPoints(stat), 0)
  // scoreEventsの合計（より正確なランニングスコアの合計）
  const eventsOurTotal = scoreEvents.filter(e => e.team === 'us').reduce((s, e) => s + e.points, 0)
  // 両方の最大値を表示スコアとして使用（スコアシートと一致させる）
  const displayScore = Math.max(totalPoints, eventsOurTotal, game.our_score)
  const won = displayScore > game.opponent_score
  const lost = displayScore < game.opponent_score

  // level: 'full'=全選手の内訳つき / 'noDetail'=選手は得点のみ / 'summary'=選手行なし
  // LINEの共有URLは長すぎると400エラーになるため、URL共有時は段階的に短縮する
  function buildShareText(level: 'full' | 'noDetail' | 'summary' = 'full') {
    const result = displayScore > game.opponent_score ? '勝利🎉' : displayScore < game.opponent_score ? '敗北' : '引き分け'
    // OT（延長）も含めて全ピリオドのスコアを出す
    const maxQ = Math.max(4, ...scoreEvents.map(e => e.quarter))
    const qRows = Array.from({ length: maxQ }, (_, i) => i + 1).map(q => {
      const us  = scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0)
      const opp = scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0)
      const label = q <= 4 ? `Q${q}` : `OT${q - 4}`
      return us > 0 || opp > 0 ? `  ${label}: 自${us} - 相${opp}` : null
    }).filter(Boolean)

    // 出場した選手（スタッツ記録がある選手）は全員記載する
    const playerLines = rows.flatMap(({ player, stat }) => {
      const pts = calcPoints(stat)
      // シュート内訳（試投があった種別のみ）
      const shoot: string[] = []
      if (stat.fg2_attempt > 0) shoot.push(`2P ${stat.fg2_made}/${stat.fg2_attempt}`)
      if (stat.fg3_attempt > 0) shoot.push(`3P ${stat.fg3_made}/${stat.fg3_attempt}`)
      if (stat.ft_attempt > 0) shoot.push(`FT ${stat.ft_made}/${stat.ft_attempt}`)
      // その他スタッツ（0より大きいものを日本語で）
      const other: string[] = []
      if (stat.rebounds > 0) other.push(`リバウンド${stat.rebounds}`)
      if (stat.assists > 0) other.push(`アシスト${stat.assists}`)
      if (stat.steals > 0) other.push(`スティール${stat.steals}`)
      if (stat.blocks > 0) other.push(`ブロック${stat.blocks}`)
      if (stat.turnovers > 0) other.push(`ターンオーバー${stat.turnovers}`)
      const fouls = (stat.fouls_plain ?? 0) + (stat.fouls_1ft ?? 0) + (stat.fouls_2ft ?? 0) + (stat.fouls_3ft ?? 0) + (stat.technical_fouls ?? 0)
      if (fouls > 0) other.push(`ファウル${fouls}`)

      const head = `#${player.number || '—'} ${player.name}　${pts}得点`
      const detail = [shoot.join(' '), other.join(' ')].filter(Boolean).join(' / ')
      return level === 'full' && detail ? [head, `　${detail}`] : [head]
    })

    const lines = [
      `🏀 vs ${game.opponent}  ${result}`,
      `${displayScore} - ${game.opponent_score}`,
      ...(qRows.length ? ['', '【クォータースコア】', ...qRows] : []),
      ...(level !== 'summary' ? ['', '【選手スタッツ】', ...playerLines] : []),
      ...(shareToken ? [
        '',
        '📋 スコアシート・詳しいスタッツはこちら👇',
        `${window.location.origin}/share/${shareToken}/${game.id}`,
      ] : []),
    ]
    return lines.join('\n')
  }

  // スマホ判定（iPadのデスクトップ表示モードはMacintosh UA＋タッチで見分ける）
  function isMobileDevice(): boolean {
    if (typeof navigator === 'undefined') return false
    return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      || (navigator.userAgent.includes('Macintosh') && typeof document !== 'undefined' && 'ontouchend' in document)
  }

  // テキストをコピーして完了表示（クリップボード非対応時はexecCommandフォールバック）
  async function copyShareText() {
    const text = buildShareText()
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      try {
        const ta = document.createElement('textarea')
        ta.value = text
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      } catch { return }
    }
    setShareCopied(true)
    setTimeout(() => setShareCopied(false), 3000)
  }

  async function shareResult() {
    // スマホ: LINEアプリへ直行（line.me/R/share。旧 R/msg/text は約4,000文字超で
    // HTTP 400。R/share は8,000文字超でも通ることをcurlで確認済み・2026-08-28）。
    // 念のため上限を設け、超えたら選手の内訳→選手行の順で段階的に短縮する。
    if (isMobileDevice()) {
      const LINE_URL_MAX = 6000
      for (const t of [buildShareText(), buildShareText('noDetail')]) {
        const url = `https://line.me/R/share?text=${encodeURIComponent(t)}`
        if (url.length <= LINE_URL_MAX) {
          window.open(url, '_blank')
          return
        }
      }
      // summary は必ず短いのでそのまま開く（詳細は共有リンク先で見られる）
      window.open(`https://line.me/R/share?text=${encodeURIComponent(buildShareText('summary'))}`, '_blank')
      return
    }
    // PC: line.me はLINEアプリに繋がらずホームページへ飛んでしまうため、
    // テキストを自動コピーして「LINEに貼り付けてください」の案内を出す
    await copyShareText()
  }

  // 「共有」ボタン: OSの共有シート（メール・メッセージ・メモ等）。
  // 非対応ブラウザではテキストをコピーして「コピー済」を表示する。
  async function shareOther() {
    if (typeof navigator !== 'undefined' && navigator.share) {
      try { await navigator.share({ text: buildShareText() }) } catch { /* ユーザーキャンセル等 */ }
      return
    }
    await copyShareText()
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
              onClick={shareOther}
              className="flex items-center gap-1.5 bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] text-sm font-bold px-3 py-1.5 rounded-lg active:opacity-80"
            >
              ↗ 共有
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
        {/* コピー完了の案内（PCのLINE共有・共有シート非対応ブラウザで表示） */}
        {shareCopied && (
          <div className="mt-2 bg-green-500/10 border border-green-500/40 rounded-lg px-3 py-2 text-sm text-green-300 print:hidden">
            ✓ スタッツをコピーしました。LINEなど送りたいアプリに貼り付けてください
          </div>
        )}
        <div className="mt-3 flex items-center justify-between">
          <div>
            <div className="text-xs text-[var(--muted)] mb-0.5">vs {game.opponent}</div>
            <div className={`text-3xl font-bold ${won ? 'text-green-400' : lost ? 'text-red-400' : 'text-white'}`}>
              {displayScore} <span className="text-[var(--muted)] text-xl">-</span> {game.opponent_score}
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
                    <th className="text-right py-2 pr-2">F</th>
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

            {/* 相手チームのスタッツ。記録した項目だけが並ぶ（付けていなければ0） */}
            {oppRows.length > 0 && (
              <>
                <div className="text-xs text-[var(--muted)] mb-3 mt-8 px-2 uppercase tracking-wide">{game.opponent} 選手スタッツ</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[580px]">
                    <thead>
                      <tr className="text-[10px] text-[var(--muted)] border-b border-[var(--card-border)] uppercase">
                        <th className="text-left py-2 pl-2 pr-3 w-8">#</th>
                        <th className="text-left py-2 pr-3">名前</th>
                        <th className="text-right py-2 pr-3 text-brand-400">得点</th>
                        <th className="text-right py-2 pr-3">2P</th>
                        <th className="text-right py-2 pr-3">3P</th>
                        <th className="text-right py-2 pr-3">FT</th>
                        <th className="text-right py-2 pr-3">REB</th>
                        <th className="text-right py-2 pr-3">AST</th>
                        <th className="text-right py-2 pr-3">STL</th>
                        <th className="text-right py-2 pr-3">BLK</th>
                        <th className="text-right py-2 pr-3">TO</th>
                        <th className="text-right py-2 pr-2">F</th>
                      </tr>
                    </thead>
                    <tbody>
                      {oppRows.map(({ player, stat, pts }) => (
                        <tr key={player.key} className="border-b border-[var(--card-border)] hover:bg-white/5">
                          <td className="py-3 pl-2 pr-3 text-brand-300 font-bold text-xs whitespace-nowrap">{player.number || '—'}</td>
                          <td className="py-3 pr-3 text-white font-medium whitespace-nowrap">{player.name}</td>
                          <td className="py-3 pr-3 text-right font-bold text-brand-300">{pts}</td>
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
                          <td className="py-3 pr-2 text-right text-[var(--muted)]">{oppTotalFouls(stat)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-brand-500/40 bg-white/5 font-bold">
                        <td className="py-3 pl-2 pr-3 text-[var(--muted)] text-xs">—</td>
                        <td className="py-3 pr-3 text-white text-sm">合計</td>
                        <td className="py-3 pr-3 text-right text-brand-300 text-base">{oppTotalPoints}</td>
                        <td colSpan={9} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {tab === 'scoresheet' && (
          <JBASheet
            game={game}
            players={players}
            statsMap={statsMap}
            scoreEvents={scoreEvents}
            oppPlayerList={oppPlayerList}
            gameId={game.id}
            onDeleteEvent={onDeleteEvent}
            onAddEvent={onAddEvent}
            onChangeEventPlayer={onChangeEventPlayer}
            onFoulEdit={onFoulEdit}
            onRenamePlayer={onRenamePlayer}
            onRenameOppPlayer={onRenameOppPlayer}
            homeTimeoutRecords={homeTimeoutRecords}
            oppTimeoutRecords={oppTimeoutRecords}
            foulEvents={finishedFoulEvents}
            category={category}
          />
        )}
      </div>

      {/* 印刷専用: JBA公式スコアシート（画面上は非表示） */}
      <JBAOfficialSheet
        game={game}
        players={players}
        statsMap={statsMap}
        scoreEvents={scoreEvents}
        oppPlayerList={oppPlayerList}
        gameId={game.id}
        homeTimeoutRecords={homeTimeoutRecords}
        oppTimeoutRecords={oppTimeoutRecords}
      />
    </div>
  )
}

// ─── スターター選択画面 ─────────────────────────────────────────────────────────
function CourtSetup({ players, oppPlayers, currentQuarter, onConfirm, initialIds, initialOppKeys, disqualifiedIds = [], disqualifiedOppKeys = [] }: {
  players: Player[]
  oppPlayers: OppPlayer[]
  currentQuarter: number
  onConfirm: (homeIds: string[], oppKeys: string[]) => void
  initialIds: string[]
  initialOppKeys: string[]
  disqualifiedIds?: string[]      // 退場済みの選手ID（コートに出せない）
  disqualifiedOppKeys?: string[]  // 退場済みの相手選手キー（コートに出せない）
}) {
  const dq = new Set(disqualifiedIds)
  const oppDq = new Set(disqualifiedOppKeys)
  const [selected, setSelected] = useState<string[]>(() => {
    const initial = initialIds.filter(id => !dq.has(id)).slice(0, 5)
    if (initial.length > 0) return initial
    // 出場可能な選手がちょうど5人なら自動で全員選択（登録5人チームの手間を省く）
    const available = players.filter(p => !dq.has(p.id))
    return available.length === 5 ? available.map(p => p.id) : initial
  })
  const [selectedOpp, setSelectedOpp] = useState<string[]>(initialOppKeys.filter(k => !oppDq.has(k)).slice(0, 5))
  const [confirmError, setConfirmError] = useState('')

  function toggleHome(id: string) {
    if (dq.has(id)) return  // 退場選手は選べない
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : prev.length < 5 ? [...prev, id] : prev)
    setConfirmError('')
  }
  function toggleOpp(key: string) {
    if (oppDq.has(key)) return  // 退場した相手選手は選べない
    setSelectedOpp(prev => prev.includes(key) ? prev.filter(x => x !== key) : prev.length < 5 ? [...prev, key] : prev)
  }

  function handleConfirm() {
    if (selected.length < 5) {
      setConfirmError(`自チームのスターターを5人選んでください（現在${selected.length}人）`)
      return
    }
    // 同じ背番号の選手が選ばれていないかチェック
    const selectedPlayers = players.filter(p => selected.includes(p.id))
    const numbers = selectedPlayers.map(p => p.number).filter(n => n)
    const dupNums = numbers.filter((n, i) => numbers.indexOf(n) !== i)
    if (dupNums.length > 0) {
      const dupNames = selectedPlayers.filter(p => dupNums.includes(p.number)).map(p => `#${p.number} ${p.name}`).join('、')
      setConfirmError(`背番号が重複しています：${dupNames}。選手登録を確認してください。`)
      return
    }
    // 相手チームのスターターも選ぶよう促す（相手を登録している場合）
    // 相手選手が5人未満しか登録されていない場合は登録人数ぶんでOK（退場選手は除外）
    const oppAvailable = oppPlayers.filter(p => !oppDq.has(p.key)).length
    const oppNeeded = Math.min(5, oppAvailable)
    if (oppPlayers.length > 0 && selectedOpp.length < oppNeeded) {
      setConfirmError(`相手チームのスターターを${oppNeeded}人選んでください（現在${selectedOpp.length}人）`)
      return
    }
    setConfirmError('')
    onConfirm(selected, selectedOpp)
  }

  function PlayerRow({ id, number, name, isSelected, isDisabled, onToggle, color, badge }: {
    id: string; number: string; name: string
    isSelected: boolean; isDisabled: boolean
    onToggle: () => void; color: 'orange' | 'blue'; badge?: string
  }) {
    return (
      <button
        onClick={onToggle}
        disabled={isDisabled}
        className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left w-full ${
          isSelected
            ? color === 'orange' ? 'bg-orange-500/20 border-orange-500' : 'bg-brand-500/20 border-brand-500'
            : isDisabled ? 'bg-[var(--card)] border-[var(--card-border)] opacity-40'
            : 'bg-[var(--card)] border-[var(--card-border)]'
        }`}
      >
        <span className={`w-7 h-7 rounded-full flex items-center justify-center text-sm font-bold border-2 ${
          isSelected
            ? color === 'orange' ? 'border-orange-400 text-orange-400' : 'border-brand-400 text-brand-400'
            : 'border-[var(--muted)] text-[var(--muted)]'
        }`}>{isSelected ? '✓' : ' '}</span>
        <span className={`font-bold w-10 ${color === 'orange' ? 'text-orange-400' : 'text-brand-400'}`}>#{number || '—'}</span>
        <span className={`font-medium ${isSelected ? 'text-white' : 'text-[var(--muted)]'}`}>{name}</span>
        {badge
          ? <span className="ml-auto text-xs font-bold text-red-400">{badge}</span>
          : isSelected && <span className={`ml-auto text-xs font-medium ${color === 'orange' ? 'text-orange-400' : 'text-brand-400'}`}>コート</span>}
      </button>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <div className="sticky top-0 z-10 bg-[var(--background)] border-b border-[var(--card-border)]">
        <div className="px-4 py-3 flex items-center justify-between">
          <div>
            <div className="font-bold text-white text-lg">{currentQuarter <= 4 ? `Q${currentQuarter}` : `OT${currentQuarter - 4}`} スターター</div>
            <div className="text-xs text-[var(--muted)]">
              自チーム <span className={selected.length === 5 ? 'text-green-400 font-bold' : 'text-orange-400 font-bold'}>{selected.length}/5</span>
              {oppPlayers.length > 0 && (() => {
                const oppNeeded = Math.min(5, oppPlayers.filter(p => !oppDq.has(p.key)).length)
                return <>　相手 <span className={selectedOpp.length >= oppNeeded ? 'text-green-400 font-bold' : 'text-brand-400 font-bold'}>{selectedOpp.length}/{oppNeeded}</span></>
              })()}
            </div>
          </div>
          <button
            onClick={handleConfirm}
            className={`text-sm py-2 px-5 rounded-lg font-bold ${selected.length === 5 ? 'btn-primary' : 'bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)]'}`}
          >
            決定
          </button>
        </div>
        {/* 5人未満は試合を開始できない旨を常時表示 */}
        {selected.length !== 5 && (
          <div className="bg-red-500/15 border-t border-red-500/40 px-4 py-2 text-red-300 text-sm font-bold text-center">
            ⚠️ スターターは5人ちょうど選んでください（あと{Math.max(0, 5 - selected.length)}人）
          </div>
        )}
        {confirmError && selected.length === 5 && (
          <div className="bg-red-500/15 border-t border-red-500/40 px-4 py-2 text-red-300 text-sm font-bold text-center">
            {confirmError}
          </div>
        )}
      </div>

      <div className="px-4 py-4 space-y-5">
        {/* 自チーム */}
        <div>
          <div className="text-xs font-bold text-orange-400 mb-2 uppercase tracking-wide">自チーム（{selected.length}/5）</div>
          <div className="flex flex-col gap-2">
            {players.map(p => (
              <PlayerRow key={p.id} id={p.id} number={p.number ?? ''} name={p.name}
                isSelected={selected.includes(p.id)}
                isDisabled={dq.has(p.id) || (!selected.includes(p.id) && selected.length >= 5)}
                badge={dq.has(p.id) ? '退場' : undefined}
                onToggle={() => toggleHome(p.id)} color="orange" />
            ))}
            {players.length === 0 && <p className="text-center py-4 text-[var(--muted)] text-sm">選手を登録してください</p>}
          </div>
        </div>

        {/* 相手チーム */}
        {oppPlayers.length > 0 && (
          <div>
            <div className="text-xs font-bold text-brand-400 mb-2 uppercase tracking-wide">相手チーム（{selectedOpp.length}/5）</div>
            <div className="flex flex-col gap-2">
              {oppPlayers.map(p => (
                <PlayerRow key={p.key} id={p.key} number={p.number} name={p.name}
                  isSelected={selectedOpp.includes(p.key)}
                  isDisabled={oppDq.has(p.key) || (!selectedOpp.includes(p.key) && selectedOpp.length >= 5)}
                  badge={oppDq.has(p.key) ? '退場' : undefined}
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
  const [category, setCategory] = useState<TeamCategory>('general')  // チーム種別（一般/ミニバス）
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
  const [recordingTab, setRecordingTab] = useState<'record' | 'scoresheet'>('record')
  const [opponentPlayerKeys, setOpponentPlayerKeys] = useState<Set<string>>(new Set())
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scoreEventsSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveStatsRef = useRef<() => Promise<void>>(async () => {})
  const savingLockRef = useRef(false)   // 保存処理の直列化ロック（重複INSERT防止）
  const saveAgainRef = useRef(false)    // 保存中に来た変更を保存後に再実行するフラグ
  const gidRef = useRef(0)
  const skipUndoStackRef = useRef(false)
  const gameRef = useRef<Game | null>(null)
  const scoreEventsRef = useRef<ScoreEvent[]>([])
  const [undoStack, setUndoStack] = useState<PendingChange[][]>([])
  const undoRestoredRef = useRef(false) // loadDataでの復元完了までlocalStorage書き込みを抑止
  const [subInPlayer, setSubInPlayer] = useState<Player | null>(null)
  const [subInOppPlayer, setSubInOppPlayer] = useState<OppPlayer | null>(null)
  const [showQScore, setShowQScore] = useState<number | null>(null)
  const [qConfirmPending, setQConfirmPending] = useState<number | null>(null) // Q終了後の確認待ち
  const [foulDialog, setFoulDialog] = useState<{ isOpen: boolean; playerId?: string }>({ isOpen: false })
  const [foulOppDialog, setFoulOppDialog] = useState<{ isOpen: boolean; playerKey?: string; playerName?: string }>({ isOpen: false })
  const [oppTeamFouls, setOppTeamFouls] = useState(0)
  const [oppStatsMap, setOppStatsMap] = useState<Record<string, OppStatData>>({})
  // 相手スタッツの取り消し履歴（自チームの undoStack と同じ時系列で「戻す」を効かせる）
  const [oppUndoStack, setOppUndoStack] = useState<{
    gid: number
    playerKey: string
    deltas: Partial<Record<keyof OppStatData, number>>
    points?: number                     // 得点を伴う操作なら点数（同じgidのスコアイベントも一緒に戻す）
    foulType?: keyof OppFoulData        // ファウルならその種類（チームファウル数とファウルイベントも戻す）
  }[]>([])
  // 5ファウルアウト通知
  const [foulOutAlert, setFoulOutAlert] = useState<{ playerName: string; playerNumber: string } | null>(null)
  // 試合終了の確認モーダル（window.confirmはLINE内ブラウザ等で表示されないことがあるため自前で出す）
  const [confirmFinish, setConfirmFinish] = useState(false)
  // ペイウォール（3試合無料制限）
  const [showPaywall, setShowPaywall] = useState(false)
  // ゲームクロック（10分 = 600秒）
  const [timerSeconds, setTimerSeconds] = useState(600)
  const [timerActive, setTimerActive] = useState(false)
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // タイムアウト記録（JBAスコアシート用）
  const [homeTimeoutRecords, setHomeTimeoutRecords] = useState<TimeoutRecord[]>([])
  const [oppTimeoutRecords, setOppTimeoutRecords] = useState<TimeoutRecord[]>([])
  const [timeoutModal, setTimeoutModal] = useState<{ team: 'home' | 'opp' } | null>(null)
  // ファウルイベント（Q別チームファウル・前後半区切り線用）
  const [foulEvents, setFoulEvents] = useState<FoulEvent[]>([])

  function pushFoulEvent(team: 'us' | 'opponent', key: string, foulType: keyof OppFoulData) {
    setFoulEvents(prev => [...prev, { quarter: currentQuarter, team, key, foulType }])
  }
  function removeLastFoulEvent(team: 'us' | 'opponent', key: string, foulType?: keyof OppFoulData) {
    setFoulEvents(prev => {
      for (let i = prev.length - 1; i >= 0; i--) {
        const e = prev[i]
        if (e.team === team && e.key === key && (!foulType || e.foulType === foulType)) {
          return [...prev.slice(0, i), ...prev.slice(i + 1)]
        }
      }
      return prev
    })
  }

  // Q毎の得点（OT含む動的集計）
  const maxQuarterInEvents = useMemo(() => Math.max(4, ...scoreEvents.map(e => e.quarter), currentQuarter), [scoreEvents, currentQuarter])
  const qScores = useMemo(() => Array.from({length: maxQuarterInEvents}, (_, i) => i + 1).map(q => ({
    us:  scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s,e) => s+e.points, 0),
    opp: scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s,e) => s+e.points, 0),
  })), [scoreEvents, maxQuarterInEvents])

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

  // チーム種別（一般/ミニバス）を取得：タイムアウト規則とスコアシート表示に使う
  useEffect(() => {
    if (!game?.team_id) return
    const supabase = createClient()
    supabase.from('teams').select('category').eq('id', game.team_id).maybeSingle()
      .then(({ data }) => { if (data?.category === 'mini' || data?.category === 'general') setCategory(data.category) })
  }, [game?.team_id])

  // ミニバスは6分クォーター：クロックが未操作（一般の初期値のまま停止中）なら6分に切替
  useEffect(() => {
    if (category !== 'mini') return
    setTimerSeconds(s => (!timerActive && s === 600 ? 360 : s))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category])

  // gameRef / scoreEventsRef を常に最新に同期（saveStats のクロージャずれ対策）
  useEffect(() => { gameRef.current = game }, [game])
  useEffect(() => { scoreEventsRef.current = scoreEvents }, [scoreEvents])

  useEffect(() => {
    if (pending.length > 0) localStorage.setItem(`pending_${id}`, JSON.stringify(pending))
  }, [pending, id])

  useEffect(() => {
    // loading中（loadData実行前）は書かない → 初期render時の[]でデータを上書きするのを防止
    if (loading) return
    localStorage.setItem(`score_events_${id}`, JSON.stringify(scoreEvents))
  }, [scoreEvents, id, loading])

  useEffect(() => {
    if (loading) return
    localStorage.setItem(`foul_events_${id}`, JSON.stringify(foulEvents))
  }, [foulEvents, id, loading])

  // scoreEvents が変わったら Supabase に遅延同期（LINE共有等のクロスデバイス対応）
  // pending による saveStats とは独立して動作し、opponent スコアのみの場合もカバーする
  useEffect(() => {
    if (scoreEvents.length === 0) return
    if (scoreEventsSyncTimer.current) clearTimeout(scoreEventsSyncTimer.current)
    scoreEventsSyncTimer.current = setTimeout(async () => {
      const g = gameRef.current
      if (!g || g.is_finished) return
      const supabase = createClient()
      await supabase.from('games').update({
        score_events_json: scoreEvents,
        our_score: Math.max(0, g.our_score),
        opponent_score: Math.max(0, g.opponent_score),
      }).eq('id', id)
    }, 3000)
    return () => { if (scoreEventsSyncTimer.current) clearTimeout(scoreEventsSyncTimer.current) }
  }, [scoreEvents, id])

  // 得点系スタッツ（成功数）をランニングスコアに合わせて自動修復する。
  // 得点した成功は必ずイベントとして残るため、個人スタッツの成功数がイベント数と
  // ズレている場合は過去の保存不整合が原因。イベント数を正として直す。
  // pending（未保存の操作）がある間はスキップして二重計上を防ぐ。
  const reconcileGuardRef = useRef(false)
  useEffect(() => {
    if (loading || reconcileGuardRef.current) return
    if (pending.length > 0 || savingLockRef.current) return
    if (scoreEvents.length === 0 || statsMap.size === 0) return
    // 自チーム選手ごとの成功数（2P/3P/FT）をイベントから集計
    const made = new Map<string, { fg2: number; fg3: number; ft: number }>()
    for (const ev of scoreEvents) {
      if (ev.team !== 'us' || !ev.player_id) continue
      const m = made.get(ev.player_id) ?? { fg2: 0, fg3: 0, ft: 0 }
      if (ev.points === 3) m.fg3++; else if (ev.points === 2) m.fg2++; else if (ev.points === 1) m.ft++
      made.set(ev.player_id, m)
    }
    const fixes: { sid: string; upd: Record<string, number> }[] = []
    for (const [pid, m] of made) {
      const stat = statsMap.get(pid)
      if (!stat?.id) continue
      const upd: Record<string, number> = {}
      if (stat.fg2_made !== m.fg2) { upd.fg2_made = m.fg2; if ((stat.fg2_attempt ?? 0) < m.fg2) upd.fg2_attempt = m.fg2 }
      if (stat.fg3_made !== m.fg3) { upd.fg3_made = m.fg3; if ((stat.fg3_attempt ?? 0) < m.fg3) upd.fg3_attempt = m.fg3 }
      if (stat.ft_made !== m.ft) { upd.ft_made = m.ft; if ((stat.ft_attempt ?? 0) < m.ft) upd.ft_attempt = m.ft }
      if (Object.keys(upd).length > 0) fixes.push({ sid: stat.id, upd })
    }
    if (fixes.length === 0) return
    reconcileGuardRef.current = true
    ;(async () => {
      try {
        const supabase = createClient()
        for (const f of fixes) await supabase.from('player_stats').update(f.upd).eq('id', f.sid)
        await loadData()
      } catch { /* ignore */ }
      reconcileGuardRef.current = false
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, pending.length, scoreEvents, statsMap])

  useEffect(() => {
    // 初回レンダー時は書き込まない（loadDataで復元する前に空配列で上書きしてしまうため）
    if (!undoRestoredRef.current) return
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

    // 同じ選手に複数の player_stats 行（過去の同時保存による重複）がある場合は
    // 合算して1行にまとめ、余分な行は削除する（自己修復）。これによりスコアシートと
    // 個人スタッツの差異を解消する。
    const map = new Map<string, PlayerStat>()
    const dupRowIds: string[] = []
    const playersWithDup = new Set<string>()
    for (const s of (statsData ?? [])) {
      const existing = map.get(s.player_id)
      if (!existing) {
        map.set(s.player_id, { ...s } as PlayerStat)
      } else {
        const ex = existing as unknown as Record<string, number>
        const cur = s as unknown as Record<string, number>
        for (const k of STAT_NUMERIC_KEYS) ex[k] = (ex[k] ?? 0) + (cur[k] ?? 0)
        dupRowIds.push(s.id)
        playersWithDup.add(s.player_id)
      }
    }
    setStatsMap(map)
    setPlayers(playersData ?? [])

    // 重複行の修復：合算値を残す1行に書き戻してから余分な行を削除する
    if (dupRowIds.length > 0) {
      try {
        for (const pid of playersWithDup) {
          const merged = map.get(pid)
          if (merged?.id) {
            const upd: Record<string, number> = {}
            for (const k of STAT_NUMERIC_KEYS) upd[k] = (merged as unknown as Record<string, number>)[k] ?? 0
            await supabase.from('player_stats').update(upd).eq('id', merged.id)
          }
        }
        await supabase.from('player_stats').delete().in('id', dupRowIds)
      } catch { /* 修復失敗時も合算済みのmapで表示は正しい */ }
    }

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
        const lastEvt = raw[raw.length - 1]
        let events = raw
        // correctOurScore がイベント累計より大きい場合のみ正デルタ補正する
        // （イベント側が大きい場合は縮小しない — スコアシートと header を一致させるため）
        if (lastEvt && correctOurScore > lastEvt.our_score_after) {
          const delta = correctOurScore - lastEvt.our_score_after
          events = raw.map(e => ({ ...e, our_score_after: e.our_score_after + delta }))
        }
        setScoreEvents(events)
        if (events.length > 0 && !gameData.is_finished) {
          const last = events[events.length - 1]
          // our_score_after を正として header に反映（スコアシート合計と一致）
          setGame(prev => prev ? { ...prev, our_score: last.our_score_after, opponent_score: last.opponent_score_after } : prev)
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
    // savedEvents/score_events_json がなく DB 値だけある場合に correctOurScore を反映
    if (!gameData.is_finished && gameData.our_score !== correctOurScore && !savedEvents && !gameData.score_events_json) {
      setGame(prev => prev ? { ...prev, our_score: correctOurScore } : prev)
    }

    // undoStack を復元
    const savedUndo = localStorage.getItem(`undo_stack_${id}`)
    if (savedUndo) {
      try { setUndoStack(JSON.parse(savedUndo)) } catch { /* ignore */ }
    }
    undoRestoredRef.current = true

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

    // court_data_json からコート/サブ/ファウルデータを復元（クロスデバイス対応）
    if (gameData.court_data_json) {
      try {
        const cd = gameData.court_data_json as {
          homeStarters?: Record<string, string[]>
          oppStarters?: Record<string, string[]>
          homeSubs?: Record<string, string[]>
          oppSubs?: Record<string, string[]>
          scoresheetOv?: unknown
          homeTimeouts?: TimeoutRecord[]
          oppTimeouts?: TimeoutRecord[]
          foulEvents?: FoulEvent[]
        }
        // タイムアウト記録の復元
        if (cd.homeTimeouts?.length) setHomeTimeoutRecords(cd.homeTimeouts)
        if (cd.oppTimeouts?.length) setOppTimeoutRecords(cd.oppTimeouts)
        // ファウルイベントの復元（localStorage優先）
        if (!localStorage.getItem(`foul_events_${id}`) && cd.foulEvents?.length)
          localStorage.setItem(`foul_events_${id}`, JSON.stringify(cd.foulEvents))
        for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
          const qs = String(q)
          if (!localStorage.getItem(`court_q${q}_${id}`) && cd.homeStarters?.[qs]?.length)
            localStorage.setItem(`court_q${q}_${id}`, JSON.stringify(cd.homeStarters[qs]))
          if (!localStorage.getItem(`court_opp_q${q}_${id}`) && cd.oppStarters?.[qs]?.length)
            localStorage.setItem(`court_opp_q${q}_${id}`, JSON.stringify(cd.oppStarters[qs]))
          if (!localStorage.getItem(`sub_q${q}_${id}`) && cd.homeSubs?.[qs]?.length)
            localStorage.setItem(`sub_q${q}_${id}`, JSON.stringify(cd.homeSubs[qs]))
          if (!localStorage.getItem(`sub_opp_q${q}_${id}`) && cd.oppSubs?.[qs]?.length)
            localStorage.setItem(`sub_opp_q${q}_${id}`, JSON.stringify(cd.oppSubs[qs]))
        }
        if (!localStorage.getItem(`scoresheet_ov_${id}`) && cd.scoresheetOv)
          localStorage.setItem(`scoresheet_ov_${id}`, JSON.stringify(cd.scoresheetOv))
      } catch { /* ignore */ }
    }

    // 相手スタッツ（ファウル＋FG/リバウンド等）を復元。
    // ファウルしか無い過去の試合でも normalizeOppStat が不足分を0で埋めるので落ちない。
    try {
      const ovRaw = localStorage.getItem(`scoresheet_ov_${id}`)
      const ov = ovRaw ? JSON.parse(ovRaw) : null
      if (ov?.oppPlayers) {
        const fm: Record<string, OppStatData> = {}
        for (const [k, v] of Object.entries(ov.oppPlayers as Record<string, Partial<OppStatData> & { fouls?: number }>)) {
          const entry = normalizeOppStat(v)
          if (hasOppStatRecord(entry)) fm[k] = entry
        }
        if (Object.keys(fm).length > 0) setOppStatsMap(fm)
      }
    } catch { /* ignore */ }

    // ファウルイベントを復元
    try {
      const fe = localStorage.getItem(`foul_events_${id}`)
      if (fe) setFoulEvents(JSON.parse(fe))
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

  // 相手選手の退場（失格含む）判定。自チームと同じ JBA/FIBA ルール（5ファウル/T2/U2/T1+U1）を適用。
  function isOppDisqualified(oppKey: string): boolean {
    const f = oppStatsMap[oppKey]
    return f ? isDisqualified(f as unknown as PlayerStat) : false
  }

  function getOppStat(oppKey: string): OppStatData {
    return oppStatsMap[oppKey] ?? emptyOppStat()
  }

  /**
   * 相手選手のスタッツを増減し、localStorage(scoresheet_ov) にも書き戻す。
   * scoresheet_ov は court_data_json に載って Supabase へ同期されるので、
   * ここに書くだけで永続化とクロスデバイス復元が両方効く。
   */
  function applyOppStatDeltas(playerKey: string, deltas: Partial<Record<keyof OppStatData, number>>) {
    setOppStatsMap(prev => {
      const updated = { ...(prev[playerKey] ?? emptyOppStat()) }
      for (const [k, d] of Object.entries(deltas)) {
        const key = k as keyof OppStatData
        updated[key] = Math.max(0, (updated[key] ?? 0) + (d ?? 0))
      }
      const next = { ...prev, [playerKey]: updated }
      try {
        const raw = localStorage.getItem(`scoresheet_ov_${id}`)
        const ov = raw ? JSON.parse(raw) : {}
        ov.oppPlayers = { ...(ov.oppPlayers ?? {}), [playerKey]: updated }
        localStorage.setItem(`scoresheet_ov_${id}`, JSON.stringify(ov))
      } catch { /* ignore */ }
      return next
    })
  }

  /**
   * 相手選手のスタッツ記録。自チームの handleStatTap と同じボタン構成で動く。
   * 押した項目だけが加算されるので、得点しか押さない使い方でも記録は成立する。
   */
  function recordOppStatTap(btn: typeof STAT_BUTTONS[0]) {
    if (!selectedOppPlayer) return
    const opp = selectedOppPlayer
    const oppName = `#${opp.number} ${opp.name}`

    // ファウルは種類（P/P1/P2/P3/T/U）を選ぶダイアログへ
    if (['fouls_plain', 'fouls_1ft', 'fouls_2ft', 'fouls_3ft', 'technical_fouls'].includes(btn.key)) {
      setFoulOppDialog({ isOpen: true, playerKey: opp.key, playerName: oppName })
      return
    }
    // 退場選手は2P/3P成功のみブロック（FTは退場直後でも打てる）
    if ((btn.key === 'fg2_made' || btn.key === 'fg3_made') && isOppDisqualified(opp.key)) {
      setSelectedOppPlayer(null)
      return
    }

    const key = btn.key as OppBoxKey
    const deltas: Partial<Record<keyof OppStatData, number>> = { [key]: 1 }
    if (key === 'fg2_made') deltas.fg2_attempt = 1
    if (key === 'fg3_made') deltas.fg3_attempt = 1
    if (key === 'ft_made') deltas.ft_attempt = 1

    const pts = key === 'fg2_made' ? 2 : key === 'fg3_made' ? 3 : key === 'ft_made' ? 1 : 0
    applyOppStatDeltas(opp.key, deltas)

    if (pts > 0) {
      // 得点はランニングスコア（scoreEvents）が正。gidを共有して「戻す」で一括取り消しできるようにする
      const gid = updateOpponentScore(pts, oppName)
      setOppUndoStack(prev => [...prev, { gid, playerKey: opp.key, deltas, points: pts }].slice(-30))
    } else {
      setOppUndoStack(prev => [...prev, { gid: ++gidRef.current, playerKey: opp.key, deltas }].slice(-30))
      setSelectedOppPlayer(null)  // 記録後に自動デセレクト（自チームと同じ挙動）
    }
  }

  function recordFoulWithFT(playerId: string, ftCount: number) {
    // ftCount: -1=テクニカル(T), 0=なし(P), 1=1本(P1), 2=2本(P2), 3=3本(P3)
    const foulKey: StatKey = ftCount === -2 ? 'fouls_unsportsmanlike' : ftCount === -1 ? 'technical_fouls' : ftCount === 0 ? 'fouls_plain' : ftCount === 1 ? 'fouls_1ft' : ftCount === 2 ? 'fouls_2ft' : 'fouls_3ft'
    const gid = ++gidRef.current
    // 退場検出（このファウルを加えた後の状態で判定：5ファウル / テクニカル2 等）
    const currentStat = getEffectiveStat(playerId)
    const projected = { ...currentStat, [foulKey]: Number(currentStat[foulKey] ?? 0) + 1 } as PlayerStat
    if (isDisqualified(projected)) {
      const p = players.find(pl => pl.id === playerId)
      if (p) setFoulOutAlert({ playerName: p.name, playerNumber: p.number })
    }
    setPending(prev => [...prev, { playerId, key: foulKey, delta: 1, gid }])
    setTeamFouls(prev => prev + 1)
    pushFoulEvent('us', playerId, foulKey as keyof OppFoulData)
    setFoulDialog({ isOpen: false })
    setSelectedPlayer(null)
  }

  function handleStatTap(btn: typeof STAT_BUTTONS[0]) {
    if (!selectedPlayer) return
    // 退場選手は2P/3Pのみブロック（FTはファウルアウトした直後でも打てる）
    if ((btn.key === 'fg2_made' || btn.key === 'fg3_made') &&
        isDisqualified(getEffectiveStat(selectedPlayer.id))) {
      setSelectedPlayer(null)
      return
    }

    // ファウルボタンはダイアログを開く（テクニカルもこの中で選ぶ）
    if (['fouls_plain', 'fouls_1ft', 'fouls_2ft', 'fouls_3ft', 'technical_fouls'].includes(btn.key)) {
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
        // gameRef.current は次のrender後に更新されるため stale になりやすい
        // 直前のスコアイベントの our_score_after を使う（連続得点でも正確）
        const ourBefore = last ? last.our_score_after : (gameRef.current?.our_score ?? 0)
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

    // 相手スタッツの操作が一番新しければ、それを戻す。
    // 得点を伴う操作は同じgidのスコアイベントも、ファウルはチームファウルも一緒に戻す。
    const lastOpp = oppUndoStack[oppUndoStack.length - 1]
    if (lastOpp && lastOpp.gid > mostRecentHomeGid) {
      const reversed: Partial<Record<keyof OppStatData, number>> = {}
      for (const [k, d] of Object.entries(lastOpp.deltas)) reversed[k as keyof OppStatData] = -(d ?? 0)
      applyOppStatDeltas(lastOpp.playerKey, reversed)
      setOppUndoStack(prev => prev.slice(0, -1))
      if (lastOpp.foulType) {
        setOppTeamFouls(t => Math.max(0, t - 1))
        removeLastFoulEvent('opponent', lastOpp.playerKey, lastOpp.foulType)
      }
      if (lastOpp.points && lastScoreEvent?.team === 'opponent' && lastEvtGid === lastOpp.gid) {
        setGame(g => g ? { ...g, opponent_score: Math.max(0, g.opponent_score - lastOpp.points!) } : g)
        setScoreEvents(prev => prev.slice(0, -1))
      }
      return
    }

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
      const foulChange = group.find(c => ['fouls_plain', 'fouls_1ft', 'fouls_2ft', 'fouls_3ft', 'technical_fouls', 'fouls_unsportsmanlike'].includes(c.key))
      if (foulChange) {
        setTeamFouls(t => Math.max(0, t - 1))
        removeLastFoulEvent('us', foulChange.playerId, foulChange.key as keyof OppFoulData)
      }
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

  // ─── スコアシート手動修正 ─────────────────────────────────────────────────────
  function handleDeleteScoreEvent(idx: number, ev: ScoreEvent) {
    // スコアイベントから削除
    setScoreEvents(prev => removeAndAdjust(prev, idx))
    // ゲームスコアを戻す
    if (ev.team === 'us') {
      setGame(g => g ? { ...g, our_score: Math.max(0, g.our_score - ev.points) } : g)
      // 自チームのスタッツも取り消し（pending経由）
      if (ev.player_id) {
        const gid = ++gidRef.current
        const key: StatKey = ev.points === 1 ? 'ft_made' : ev.points === 2 ? 'fg2_made' : 'fg3_made'
        const attemptKey: StatKey = ev.points === 1 ? 'ft_attempt' : ev.points === 2 ? 'fg2_attempt' : 'fg3_attempt'
        skipUndoStackRef.current = true
        setPending(prev => [...prev,
          { playerId: ev.player_id!, key, delta: -1, gid },
          { playerId: ev.player_id!, key: attemptKey, delta: -1, gid },
        ])
      }
    } else {
      setGame(g => g ? { ...g, opponent_score: Math.max(0, g.opponent_score - ev.points) } : g)
      // 相手スタッツにも成功数を記録している場合は一緒に取り消す（記録していなければ0のまま何も起きない）
      const oppKey = oppPlayerList.find(p => `#${p.number} ${p.name}` === ev.opp_player_name)?.key
      if (oppKey) {
        const key: OppBoxKey = ev.points === 1 ? 'ft_made' : ev.points === 2 ? 'fg2_made' : 'fg3_made'
        const attemptKey: OppBoxKey = ev.points === 1 ? 'ft_attempt' : ev.points === 2 ? 'fg2_attempt' : 'fg3_attempt'
        applyOppStatDeltas(oppKey, { [key]: -1, [attemptKey]: -1 })
      }
    }
  }

  // スコアシートから選手名・背番号を修正する（チーム名簿の players レコードも更新）
  async function handleEditPlayer(playerId: string, newName: string, newNumber: string) {
    const name = newName.trim()
    const number = newNumber.trim()
    if (!name) return
    setPlayers(prev => prev.map(p => p.id === playerId ? { ...p, name, number } : p))
    try {
      const supabase = createClient()
      await supabase.from('players').update({ name, number }).eq('id', playerId)
    } catch { /* オフライン時もローカルには反映済み */ }
  }

  // 相手チームの選手名・背番号を修正する。相手選手のkeyは `opp_番号_名前` 由来のため、
  // 変更時は全参照（ランニングスコア・ファウル・出場・永続化）を旧key→新keyへ移行する。
  function handleEditOppPlayer(oldKey: string, newName: string, newNumber: string) {
    const name = newName.trim()
    const number = newNumber.trim()
    if (!name) return
    const target = oppPlayerList.find(p => p.key === oldKey)
    if (!target || (target.name === name && target.number === number)) return
    const newKey = `opp_${number}_${name}`
    const oldDisplay = `#${target.number} ${target.name}`
    const newDisplay = `#${number} ${name}`

    setOppPlayerList(prev => prev.map(p => p.key === oldKey ? { ...p, key: newKey, number, name } : p))
    setOpponentPlayerKeys(prev => {
      const next = new Set(prev)
      next.delete(`${target.number}_${target.name}`)
      next.add(`${number}_${name}`)
      return next
    })
    // ランニングスコアの相手表示は opp_player_name の #番号 を参照するため更新
    setScoreEvents(prev => prev.map(e => e.team === 'opponent' && e.opp_player_name === oldDisplay ? { ...e, opp_player_name: newDisplay } : e))
    setFoulEvents(prev => prev.map(e => e.team === 'opponent' && e.key === oldKey ? { ...e, key: newKey } : e))
    setOppStatsMap(prev => {
      if (!(oldKey in prev)) return prev
      const next: Record<string, OppStatData> = {}
      for (const [k, v] of Object.entries(prev)) next[k === oldKey ? newKey : k] = v
      return next
    })
    setOppUndoStack(prev => prev.map(e => e.playerKey === oldKey ? { ...e, playerKey: newKey } : e))
    // localStorage 群の key を移行
    try {
      const ovRaw = localStorage.getItem(`scoresheet_ov_${id}`)
      if (ovRaw) {
        const ov = JSON.parse(ovRaw)
        if (ov.oppPlayers && ov.oppPlayers[oldKey] !== undefined) {
          ov.oppPlayers[newKey] = ov.oppPlayers[oldKey]; delete ov.oppPlayers[oldKey]
          localStorage.setItem(`scoresheet_ov_${id}`, JSON.stringify(ov))
        }
      }
    } catch { /* ignore */ }
    for (let q = 1; q <= 10; q++) {
      for (const lsKey of [`court_opp_q${q}_${id}`, `sub_opp_q${q}_${id}`]) {
        try {
          const raw = localStorage.getItem(lsKey)
          if (raw) {
            const arr = JSON.parse(raw) as string[]
            if (arr.includes(oldKey)) localStorage.setItem(lsKey, JSON.stringify(arr.map(k => k === oldKey ? newKey : k)))
          }
        } catch { /* ignore */ }
      }
    }
    // 相手選手リストを永続化（番号・名前更新）
    const updatedList = oppPlayerList.map(p => p.key === oldKey ? { number, name } : { number: p.number, name: p.name })
    localStorage.setItem(`game_${id}_opponent_players`, JSON.stringify(updatedList))
    try { createClient().from('games').update({ opponent_players: updatedList }).eq('id', id) } catch { /* ignore */ }
  }

  // スコアシートから「得点した選手」を付け替える（スタッツも旧選手→新選手へ移動）
  function handleChangeEventPlayer(idx: number, ev: ScoreEvent, newId: string) {
    if (ev.team === 'us') {
      if (newId === ev.player_id) return
      setScoreEvents(prev => prev.map((e, i) => i === idx ? { ...e, player_id: newId } : e))
      const gid = ++gidRef.current
      const key: StatKey = ev.points === 1 ? 'ft_made' : ev.points === 2 ? 'fg2_made' : 'fg3_made'
      const attemptKey: StatKey = ev.points === 1 ? 'ft_attempt' : ev.points === 2 ? 'fg2_attempt' : 'fg3_attempt'
      skipUndoStackRef.current = true
      const changes: PendingChange[] = [
        { playerId: newId, key, delta: 1, gid },
        { playerId: newId, key: attemptKey, delta: 1, gid },
      ]
      if (ev.player_id) {
        changes.push(
          { playerId: ev.player_id, key, delta: -1, gid },
          { playerId: ev.player_id, key: attemptKey, delta: -1, gid },
        )
      }
      setPending(prev => [...prev, ...changes])
    } else {
      const opp = oppPlayerList.find(p => p.key === newId)
      if (!opp) return
      setScoreEvents(prev => prev.map((e, i) => i === idx ? { ...e, opp_player_name: `#${opp.number} ${opp.name}` } : e))
    }
  }

  function handleAddScoreEvent(req: AddEventRequest) {
    const gid = ++gidRef.current
    // scoreEventsに追加（末尾）
    setScoreEvents(prev => {
      const last = prev[prev.length - 1]
      const ourScore = last ? last.our_score_after : (gameRef.current?.our_score ?? 0)
      const oppScore = last ? last.opponent_score_after : (gameRef.current?.opponent_score ?? 0)
      return [...prev, {
        gid, quarter: req.quarter, team: req.team, points: req.points,
        player_id: req.player_id,
        opp_player_name: req.opp_player_name,
        our_score_after: req.team === 'us' ? ourScore + req.points : ourScore,
        opponent_score_after: req.team === 'opponent' ? oppScore + req.points : oppScore,
      }]
    })
    // ゲームスコアに加算
    if (req.team === 'us') {
      setGame(g => g ? { ...g, our_score: g.our_score + req.points } : g)
      // 自チームスタッツにも追加
      if (req.player_id) {
        const key: StatKey = req.points === 1 ? 'ft_made' : req.points === 2 ? 'fg2_made' : 'fg3_made'
        const attemptKey: StatKey = req.points === 1 ? 'ft_attempt' : req.points === 2 ? 'fg2_attempt' : 'fg3_attempt'
        skipUndoStackRef.current = true
        setPending(prev => [...prev,
          { playerId: req.player_id!, key, delta: 1, gid },
          { playerId: req.player_id!, key: attemptKey, delta: 1, gid },
        ])
      }
    } else {
      setGame(g => g ? { ...g, opponent_score: g.opponent_score + req.points } : g)
      // 相手スタッツ側にも成功／試投を反映（スコアシートからの追加分）
      const oppKey = oppPlayerList.find(p => `#${p.number} ${p.name}` === req.opp_player_name)?.key
      if (oppKey) {
        const key: OppBoxKey = req.points === 1 ? 'ft_made' : req.points === 2 ? 'fg2_made' : 'fg3_made'
        const attemptKey: OppBoxKey = req.points === 1 ? 'ft_attempt' : req.points === 2 ? 'fg2_attempt' : 'fg3_attempt'
        applyOppStatDeltas(oppKey, { [key]: 1, [attemptKey]: 1 })
      }
    }
  }

  function handleFoulEdit(playerId: string, isHome: boolean, delta: 1|-1, foulType: keyof OppFoulData) {
    if (isHome) {
      // 自チーム: pending経由でスタッツを更新
      const gid = ++gidRef.current
      skipUndoStackRef.current = true
      setPending(prev => [...prev, { playerId, key: foulType as StatKey, delta, gid }])
      setTeamFouls(prev => Math.max(0, prev + delta))
      if (delta > 0) pushFoulEvent('us', playerId, foulType)
      else removeLastFoulEvent('us', playerId, foulType)
    } else {
      // 相手チーム: oppStatsMapを更新してlocalStorageにも保存
      // 退場検出（加算後に5ファウル/T2/U2 等へ到達したらアラート）
      if (delta > 0) {
        const currentFouls = getOppStat(playerId)
        const projected: OppStatData = { ...currentFouls, [foulType]: currentFouls[foulType] + 1 }
        if (isDisqualified(projected as unknown as PlayerStat) && !isDisqualified(currentFouls as unknown as PlayerStat)) {
          const op = oppPlayerList.find(p => p.key === playerId)
          if (op) setFoulOutAlert({ playerName: op.name, playerNumber: op.number })
        }
      }
      setOppTeamFouls(prev => Math.max(0, prev + delta))
      if (delta > 0) pushFoulEvent('opponent', playerId, foulType)
      else removeLastFoulEvent('opponent', playerId, foulType)
      applyOppStatDeltas(playerId, { [foulType]: delta })
    }
  }

  function halftimeReset() {
    setTeamFouls(0)
    setOppTeamFouls(0)
    setHalfTimeReset(true)
    setTimeout(() => setHalfTimeReset(false), 2000)
  }

  function recordOppFoulWithFT(playerKey: string, ftCount: number) {
    // ftCount: 0=なし(P), 1=P1, 2=P2, 3=P3, -1=テクニカル(T), -2=アンスポ(U)
    const field: keyof OppFoulData = ftCount === -2 ? 'fouls_unsportsmanlike'
      : ftCount === -1 ? 'technical_fouls'
      : ftCount === 0 ? 'fouls_plain'
      : ftCount === 1 ? 'fouls_1ft'
      : ftCount === 2 ? 'fouls_2ft'
      : 'fouls_3ft'
    // 退場検出（このファウルを加えた後の状態で判定：5ファウル / テクニカル2 / アンスポ2 等）
    const currentFouls = getOppStat(playerKey)
    const projected: OppStatData = { ...currentFouls, [field]: currentFouls[field] + 1 }
    if (isDisqualified(projected as unknown as PlayerStat)) {
      const op = oppPlayerList.find(p => p.key === playerKey)
      if (op) setFoulOutAlert({ playerName: op.name, playerNumber: op.number })
    }
    setOppTeamFouls(prev => prev + 1)
    pushFoulEvent('opponent', playerKey, field)
    applyOppStatDeltas(playerKey, { [field]: 1 })
    setOppUndoStack(prev => [...prev, { gid: ++gidRef.current, playerKey, deltas: { [field]: 1 }, foulType: field }].slice(-30))
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

  // 相手の得点を増減する。加点時は採番した gid を返し、呼び出し側が
  // 相手スタッツの取り消し履歴と紐付けられるようにする（減点時は -1）。
  function updateOpponentScore(delta: number, playerName?: string): number {
    const gid = delta > 0 ? ++gidRef.current : -1
    if (delta > 0) {
      setScoreEvents(prev => {
        const last = prev[prev.length - 1]
        // gameRefはrender後に更新 → 直前イベントの値を使う（stale回避）
        const ourCurrent = last ? last.our_score_after : (gameRef.current?.our_score ?? 0)
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
    return gid
  }

  /**
   * games.court_data_json に入れる1まとめのJSONを組み立てる。
   * Q別の出場/交代・スコアシート修正（相手スタッツもここに入る）・ファウルイベント・タイムアウトを含む。
   * 自動保存・試合終了・相手スタッツ同期の3か所で共用する。
   */
  const buildCourtData = useCallback(() => {
    const homeStarters: Record<string, string[]> = {}
    const oppStarters: Record<string, string[]> = {}
    const homeSubs: Record<string, string[]> = {}
    const oppSubs: Record<string, string[]> = {}
    for (let q = 1; q <= 10; q++) {  // OT（延長）も含めて読み書きする
      try {
        const hs = localStorage.getItem(`court_q${q}_${id}`); if (hs) homeStarters[q] = JSON.parse(hs)
        const os = localStorage.getItem(`court_opp_q${q}_${id}`); if (os) oppStarters[q] = JSON.parse(os)
        const hsub = localStorage.getItem(`sub_q${q}_${id}`); if (hsub) homeSubs[q] = JSON.parse(hsub)
        const osub = localStorage.getItem(`sub_opp_q${q}_${id}`); if (osub) oppSubs[q] = JSON.parse(osub)
      } catch { /* ignore */ }
    }
    let scoresheetOv: unknown = null
    try { const ov = localStorage.getItem(`scoresheet_ov_${id}`); if (ov) scoresheetOv = JSON.parse(ov) } catch { /* ignore */ }
    let foulEvs: unknown = null
    try { const fe = localStorage.getItem(`foul_events_${id}`); if (fe) foulEvs = JSON.parse(fe) } catch { /* ignore */ }
    return {
      homeStarters, oppStarters, homeSubs, oppSubs,
      ...(scoresheetOv ? { scoresheetOv } : {}),
      ...(foulEvs ? { foulEvents: foulEvs } : {}),
      // タイムアウト記録も忘れずに含める（以前はここで欠落し、試合終了後に消えていた）
      homeTimeouts: homeTimeoutRecords,
      oppTimeouts: oppTimeoutRecords,
    }
  }, [id, homeTimeoutRecords, oppTimeoutRecords])

  // 相手スタッツだけを記録している間は自チームのpendingが動かず saveStats が走らないため、
  // 単独で court_data_json を遅延同期する（クロスデバイス・リロード対策）。
  const oppSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    if (loading || Object.keys(oppStatsMap).length === 0) return
    if (oppSyncTimer.current) clearTimeout(oppSyncTimer.current)
    oppSyncTimer.current = setTimeout(async () => {
      const g = gameRef.current
      if (!g || g.is_finished) return
      try {
        await createClient().from('games').update({ court_data_json: buildCourtData() }).eq('id', id)
      } catch { /* オフライン時も localStorage には保存済み */ }
    }, 3000)
    return () => { if (oppSyncTimer.current) clearTimeout(oppSyncTimer.current) }
  }, [oppStatsMap, loading, id, buildCourtData])

  const saveStats = useCallback(async () => {
    // 保存処理を直列化（同時並行でDBに重複INSERTされるのを防ぐ）
    if (savingLockRef.current) { saveAgainRef.current = true; return }
    savingLockRef.current = true
    setSaving(true)
    const supabase = createClient()
    // この保存で処理するpendingを固定（保存中に増えた分は消さずに残す）
    const pendingSnapshot = pending
    const savedGids = new Set(pendingSnapshot.map(c => c.gid))

    try {
    if (pendingSnapshot.length > 0) {
      const grouped = new Map<string, PendingChange[]>()
      for (const c of pendingSnapshot) {
        if (!grouped.has(c.playerId)) grouped.set(c.playerId, [])
        grouped.get(c.playerId)!.push(c)
      }

      for (const [playerId, changes] of grouped.entries()) {
        const existing = statsMap.get(playerId)
        if (existing?.id) {
          const existingR = existing as unknown as Record<string, number>
          // 同一キーへの複数変更（例: フリースロー2本連続）を合算してから適用する。
          // 1回ずつ existingR を基準に上書きすると delta が累積されず、最後の1件分しか反映されない。
          const deltaByKey: Record<string, number> = {}
          for (const c of changes) deltaByKey[c.key] = (deltaByKey[c.key] ?? 0) + c.delta
          const updates: Record<string, number> = {}
          for (const [key, delta] of Object.entries(deltaByKey)) updates[key] = Math.max(0, (existingR[key] ?? 0) + delta)
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
        for (const c of pendingSnapshot) {
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
      // score_events_json + court_data_json を同時保存してクロスデバイス同期
      const currentEvents = scoreEventsRef.current
      const courtData = buildCourtData()
      await supabase.from('games')
        .update({
          our_score: Math.max(0, gameRef.current.our_score),
          opponent_score: Math.max(0, gameRef.current.opponent_score),
          ...(currentEvents.length > 0 ? { score_events_json: currentEvents } : {}),
          court_data_json: courtData,
        })
        .eq('id', id)
    }

    await loadData()
    // 保存した分だけ pending から除去（保存中に増えた分は残す＝取りこぼし防止）
    setPending(prev => prev.filter(c => !savedGids.has(c.gid)))
    } catch (e) {
      console.error('saveStats error:', e)
    } finally {
      setSaving(false)
      savingLockRef.current = false   // 例外時もロックを必ず解放（デッドロック防止）
    }
    // 保存中に新たな変更が来ていたら、もう一度保存する
    if (saveAgainRef.current) { saveAgainRef.current = false; setTimeout(() => saveStatsRef.current(), 50) }
  }, [pending, statsMap, id, buildCourtData])

  // saveStatsRef を常に最新に同期（タイマーのクロージャずれ対策）
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { saveStatsRef.current = saveStats }, [saveStats])

  // ゲームクロック カウントダウン
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)
    timerIntervalRef.current = null
    if (!timerActive) return
    timerIntervalRef.current = setInterval(() => {
      setTimerSeconds(s => {
        if (s <= 1) { setTimerActive(false); return 0 }
        return s - 1
      })
    }, 1000)
    return () => { if (timerIntervalRef.current) clearInterval(timerIntervalRef.current) }
  }, [timerActive])

  // ゲームクロックの復元（スマホのスリープ復帰・リロードでタイマーが消えないように）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(`game_clock_${id}`)
      if (!saved) return
      const { seconds, active, updatedAt } = JSON.parse(saved) as { seconds?: number; active?: boolean; updatedAt?: number }
      if (typeof seconds !== 'number') return
      let s = seconds
      if (active) {
        // 稼働中だった場合は離脱していた時間ぶんを差し引いて再開
        const elapsed = Math.floor((Date.now() - (updatedAt ?? Date.now())) / 1000)
        s = Math.max(0, seconds - elapsed)
      }
      setTimerSeconds(s)
      setTimerActive(Boolean(active) && s > 0)
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  // ゲームクロックの保存
  useEffect(() => {
    try {
      localStorage.setItem(`game_clock_${id}`, JSON.stringify({ seconds: timerSeconds, active: timerActive, updatedAt: Date.now() }))
    } catch { /* ignore */ }
  }, [timerSeconds, timerActive, id])

  function formatTimer(s: number) {
    return `${Math.floor(s / 60)}:${(s % 60).toString().padStart(2, '0')}`
  }

  async function advanceQuarter() {
    await saveStats()
    // チームファウルは毎クォーター、両チームともリセット（JBA/FIBA）。
    // ただしOT（第5Q以降）は第4Qの継続扱いのためリセットしない。
    if (currentQuarter + 1 <= 4) {
      setTeamFouls(0)
      setOppTeamFouls(0)
    }
    // タイムアウトの残数はスコアシート記録から都度算出するためリセット不要
    // タイマーをリセット（一般=10分/OT5分、ミニバス=6分/OT3分）
    setTimerActive(false)
    setTimerSeconds(quarterSeconds(category, currentQuarter + 1))
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
    setRecordingTab('record') // 確認が終わったら次Qの記録タブへ自動で戻す
    const supabase = createClient()
    await supabase.from('games').update({ quarter: next }).eq('id', id)
    setCourtSetupMode(true)
    setSelectedPlayer(null)
  }

  async function finishGame() {
    // ── 3試合無料制限チェック ──────────────────────────────────
    // 判定は「チームのオーナー基準」。メンバー（チーム共有ログイン）が終了する場合も、
    // オーナーのサブスク/無料ご招待/無料枠で判定するため team_can_play RPC を使う。
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      let blocked = false
      if (game?.team_id) {
        const { data: canPlay, error: rpcErr } = await supabase.rpc('team_can_play', { t_id: game.team_id })
        if (!rpcErr && typeof canPlay === 'boolean') {
          blocked = !canPlay
        } else {
          // RPC未適用（マイグレーション前）などはフォールバックで従来ロジック（本人基準）
          const [{ data: sub }, freeAccess] = await Promise.all([
            supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
            hasFreeAccess(supabase),
          ])
          const hasSubscription = sub?.status === 'active' || freeAccess
          if (!hasSubscription) {
            const finishedTotal = await getFinishedGamesCount(supabase, user.id)
            blocked = finishedTotal >= FREE_GAMES_LIMIT
          }
        }
      }
      if (blocked) {
        setShowPaywall(true)
        return  // ← 試合終了をブロックしてペイウォールを表示
      }
    }
    // ────────────────────────────────────────────────────────────

    await saveStats()

    // 相手選手・スコアイベント・コートデータを games テーブルに永続化（クロスデバイス対応）
    const oppPlayersData = oppPlayerList.map(p => ({ number: p.number, name: p.name }))
    const courtDataFinal = buildCourtData()
    await supabase.from('games').update({
      is_finished: true,
      quarter: currentQuarter,
      ...(scoreEvents.length > 0 ? { score_events_json: scoreEvents } : {}),
      ...(oppPlayersData.length > 0 ? { opponent_players: oppPlayersData } : {}),
      court_data_json: courtDataFinal,
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
    localStorage.removeItem(`game_clock_${id}`)
  }

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>
  )
  if (!game) return null

  if (game.is_finished) {
    return <FinishedGameView game={game} players={players} statsMap={statsMap} scoreEvents={scoreEvents} oppPlayerList={oppPlayerList} onDeleteEvent={handleDeleteScoreEvent} onAddEvent={handleAddScoreEvent} onChangeEventPlayer={handleChangeEventPlayer} onFoulEdit={handleFoulEdit} onRenamePlayer={handleEditPlayer} onRenameOppPlayer={handleEditOppPlayer} />
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
        disqualifiedIds={players.filter(p => isDisqualified(getEffectiveStat(p.id))).map(p => p.id)}
        disqualifiedOppKeys={oppPlayerList.filter(p => isOppDisqualified(p.key)).map(p => p.key)}
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
        {/* 行1: 戻る / スコア / 保存 — セーフエリア対応 */}
        <div className="flex items-center justify-between px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-1">
          <Link href={`/teams/${game.team_id}`} className="text-[var(--muted)] text-xs min-w-[3rem]">← 戻る</Link>
          <div className="text-center flex-1 mx-2">
            <div className="text-[10px] text-[var(--muted)] truncate">vs {game.opponent}</div>
            <div className="font-bold text-white text-2xl leading-tight tabular-nums">{game.our_score} <span className="text-base text-[var(--muted)]">-</span> {game.opponent_score}</div>
          </div>
          {pending.length > 0 ? (
            <button onClick={saveStats} disabled={saving}
              className="text-[11px] font-bold text-white rounded-xl py-2 px-3 flex-shrink-0"
              style={{ background: saving ? '#555' : '#ee7a2f' }}>
              {saving ? '保存中…' : `保存(${pending.length})`}
            </button>
          ) : <div className="min-w-[3rem]" />}
        </div>

        {/* 行2: クォータータブ + タイマー + メンバー変更 */}
        <div className="flex items-center gap-1.5 px-4 pb-1">
          {Array.from({length: Math.max(4, currentQuarter)}, (_, i) => i + 1).map(q => (
            <button
              key={q}
              disabled={q > currentQuarter}
              onClick={() => q <= currentQuarter ? setShowQScore(showQScore === q ? null : q) : undefined}
              className={`px-2 py-1 rounded-full text-xs font-bold transition-colors ${
                q === currentQuarter
                  ? 'bg-orange-500 text-white active:opacity-80'
                  : q < currentQuarter
                  ? `border transition-colors ${showQScore === q ? 'bg-orange-500/20 border-orange-500 text-orange-400' : 'bg-[var(--card)] text-[var(--muted)] border-[var(--card-border)]'}`
                  : 'opacity-30 bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]'
              }`}
            >
              {q <= 4 ? `Q${q}` : `OT${q - 4}`}
            </button>
          ))}
          {/* ゲームクロック */}
          {!game.is_finished && (
            <div className="flex items-center gap-1 ml-1">
              <button
                onClick={() => setTimerActive(a => !a)}
                className={`text-[10px] font-bold tabular-nums px-2 py-1 rounded-full border transition-colors ${
                  timerActive ? 'bg-orange-500/20 border-orange-500 text-orange-400 animate-pulse'
                  : timerSeconds === 0 ? 'bg-red-500/20 border-red-500/50 text-red-400'
                  : 'bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)]'
                }`}
              >
                {timerActive ? '⏸' : '▶'} {formatTimer(timerSeconds)}
              </button>
              <button
                onClick={() => { setTimerActive(false); setTimerSeconds(quarterSeconds(category, currentQuarter)) }}
                className="text-[10px] text-[var(--muted)] px-1"
                title="タイマーリセット"
              >↺</button>
            </div>
          )}
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
                    <th className="py-1 px-2 text-center text-brand-400">{game.opponent}</th>
                    <th className="py-1 px-3 text-center text-[var(--muted)]">累計</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.from({length: showQScore}, (_, i) => i + 1).map(q => {
                    const qs = qScores[q-1] ?? { us: 0, opp: 0 }
                    cumUs += qs.us; cumOpp += qs.opp
                    const isLast = q === showQScore
                    return (
                      <tr key={q} className={`border-b border-[var(--card-border)]/40 ${isLast ? 'bg-orange-500/10 font-bold' : ''}`}>
                        <td className="py-1.5 px-3 text-[var(--muted)]">{q <= 4 ? `Q${q}` : `OT${q-4}`}</td>
                        <td className="py-1.5 px-2 text-center text-orange-400">{qs.us}</td>
                        <td className="py-1.5 px-2 text-center text-brand-400">{qs.opp}</td>
                        <td className="py-1.5 px-3 text-center text-white font-bold tabular-nums">{cumUs} - {cumOpp}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        })()}

        {/* 行3: 相手スコア / チームファウル / 前半終了リセット */}
        <div className="flex items-center justify-between px-4 pb-1">
          <div className="flex items-center gap-1.5">
            <button onClick={() => updateOpponentScore(-1)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">-</button>
            <span className="text-xs text-[var(--muted)] w-14 text-center">相手 {game.opponent_score}</span>
            <button onClick={() => updateOpponentScore(1)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">+1</button>
            <button onClick={() => updateOpponentScore(2)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">+2</button>
            {category !== 'mini' && (
              <button onClick={() => updateOpponentScore(3)} className="w-7 h-7 rounded-lg bg-[var(--card)] border border-[var(--card-border)] text-white font-bold text-sm">+3</button>
            )}
          </div>
          <div className="flex gap-1.5 items-center">
            <div className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${teamFouls >= 5 ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
              自F: {teamFouls}{teamFouls >= 5 && <span className="text-[9px] font-bold">ペナルティ</span>}
            </div>
            <div className={`text-xs px-2 py-1 rounded-full flex items-center gap-1 ${oppTeamFouls >= 5 ? 'bg-brand-500/20 text-brand-400 border border-brand-500/30' : 'bg-[var(--card)] text-[var(--muted)]'}`}>
              相F: {oppTeamFouls}{oppTeamFouls >= 5 && <span className="text-[9px] font-bold">ペナルティ</span>}
            </div>
            <button
              onClick={halftimeReset}
              className="text-xs px-2 py-1 rounded-full bg-[var(--card)] text-[var(--muted)] border border-[var(--card-border)]"
            >
              {halfTimeReset ? '✓ HT済' : '前半終了'}
            </button>
          </div>
        </div>

        {/* 行4: タイムアウト（一般=前半2/後半3、ミニバス=各Q1、各OT1） */}
        {(() => {
          const scope = timeoutScope(category, currentQuarter)
          const inScope = (recs: TimeoutRecord[]) => recs.filter(r => scope.quarters.includes(r.quarter))
          const homeInScope = inScope(homeTimeoutRecords)
          const oppInScope = inScope(oppTimeoutRecords)
          const homeUsed = homeInScope.length >= scope.limit
          const oppUsed = oppInScope.length >= scope.limit
          // その半/OTで最後に取ったタイムアウトを1件取り消す
          const removeLast = (setter: typeof setHomeTimeoutRecords) => {
            setter(prev => {
              let removeIdx = -1
              prev.forEach((r, i) => { if (scope.quarters.includes(r.quarter)) removeIdx = i })
              return removeIdx < 0 ? prev : prev.filter((_, i) => i !== removeIdx)
            })
          }
          return (
            <div className="flex items-center gap-2 px-4 pb-2 flex-wrap">
              <span className="text-[10px] text-[var(--muted)] flex-shrink-0">タイムアウト<span className="ml-0.5 opacity-70">({scope.label})</span></span>
              {/* 自チーム */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${homeUsed ? 'bg-orange-500/10 border border-orange-500/30' : ''}`}>
                <span className="text-[10px] font-bold text-orange-400">自</span>
                <button onClick={() => removeLast(setHomeTimeoutRecords)} className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--card-border)] text-white text-xs flex items-center justify-center leading-none">-</button>
                <span className={`text-[10px] font-bold px-1 ${homeUsed ? 'text-orange-400' : 'text-white'}`}>
                  {homeInScope.length}/{scope.limit}{homeInScope.length > 0 ? `（${homeInScope.map(r => r.minute).join('・')}分）` : ''}
                </span>
                <button
                  onClick={() => { if (!homeUsed) setTimeoutModal({ team: 'home' }) }}
                  disabled={homeUsed}
                  className={`w-5 h-5 rounded border text-xs flex items-center justify-center leading-none ${homeUsed ? 'opacity-30 bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)] cursor-not-allowed' : 'bg-orange-500/20 border-orange-500/50 text-orange-400'}`}
                >+</button>
              </div>
              {/* 相手チーム */}
              <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${oppUsed ? 'bg-brand-500/10 border border-brand-500/30' : ''}`}>
                <span className="text-[10px] font-bold text-brand-400">相</span>
                <button onClick={() => removeLast(setOppTimeoutRecords)} className="w-5 h-5 rounded bg-[var(--card)] border border-[var(--card-border)] text-white text-xs flex items-center justify-center leading-none">-</button>
                <span className={`text-[10px] font-bold px-1 ${oppUsed ? 'text-brand-400' : 'text-white'}`}>
                  {oppInScope.length}/{scope.limit}{oppInScope.length > 0 ? `（${oppInScope.map(r => r.minute).join('・')}分）` : ''}
                </span>
                <button
                  onClick={() => { if (!oppUsed) setTimeoutModal({ team: 'opp' }) }}
                  disabled={oppUsed}
                  className={`w-5 h-5 rounded border text-xs flex items-center justify-center leading-none ${oppUsed ? 'opacity-30 bg-[var(--card)] border-[var(--card-border)] text-[var(--muted)] cursor-not-allowed' : 'bg-brand-500/20 border-brand-500/50 text-brand-400'}`}
                >+</button>
              </div>
            </div>
          )
        })()}

        {/* 行4: スタッツ記録 / スコアシート タブ */}
        <div className="flex border-t border-[var(--card-border)]">
          <button
            onClick={() => setRecordingTab('record')}
            className={`flex-1 py-2 text-xs font-medium border-b-2 transition-colors ${recordingTab === 'record' ? 'border-orange-500 text-orange-500' : 'border-transparent text-[var(--muted)]'}`}
          >
            スタッツ記録
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
      {recordingTab === 'scoresheet' ? (
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
            oppStatsMap={oppStatsMap}
            onDeleteEvent={handleDeleteScoreEvent}
            onAddEvent={handleAddScoreEvent}
            onChangeEventPlayer={handleChangeEventPlayer}
            onFoulEdit={handleFoulEdit}
            onRenamePlayer={handleEditPlayer}
            onRenameOppPlayer={handleEditOppPlayer}
            foulEvents={foulEvents}
            currentQuarter={currentQuarter}
            category={category}
            homeTimeoutRecords={homeTimeoutRecords}
            oppTimeoutRecords={oppTimeoutRecords}
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
                  const effStat = getEffectiveStat(player.id)
                  const pts = calcPoints(effStat)
                  const foulCount = getTotalFouls(effStat)
                  const isFouledOut = isDisqualified(effStat)
                  const isSelected = selectedPlayer?.id === player.id
                  return (
                    <button
                      key={player.id}
                      disabled={isFouledOut && !subInPlayer}
                      onClick={() => {
                        // 交代モード中はファウルアウト/退場した選手も「退く対象」としてタップ可能にする
                        if (subInPlayer) { substituteHome(player.id); return }
                        if (isFouledOut) return
                        setSelectedPlayer(isSelected ? null : player)
                        setSelectedOppPlayer(null)
                        setSubInOppPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2.5 rounded-xl border transition-all active:scale-95 ${
                        subInPlayer ? 'bg-orange-500/10 border-orange-400 border-dashed'
                        : isFouledOut ? 'bg-red-500/10 border-red-500/40 opacity-60 cursor-not-allowed'
                        : isSelected ? 'bg-orange-500 border-orange-500'
                        : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className={`text-[10px] font-bold flex-shrink-0 w-8 ${isFouledOut ? 'text-red-400' : 'text-orange-300'}`}>#{player.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1 text-left">{player.name}</span>
                      {isFouledOut
                        ? <span className="text-[9px] text-red-400 font-bold flex-shrink-0 ml-1">退場</span>
                        : subInPlayer
                          ? <span className="text-[10px] text-[var(--muted)] flex-shrink-0 ml-1">↕</span>
                          : <span className="text-[10px] flex-shrink-0 ml-1 flex items-center gap-1">
                              <span className="text-[var(--muted)]">{pts}p</span>
                              {foulCount > 0 && (
                                <span className={`font-bold ${foulCount >= 4 ? 'text-red-400' : 'text-[var(--muted)]'}`}>{foulCount}F</span>
                              )}
                            </span>
                      }
                    </button>
                  )
                })}
                {onCourtPlayers.length === 0 && <p className="text-[10px] text-[var(--muted)] py-2 text-center">—</p>}
              </div>
            </div>

            {/* 相手チームコート */}
            <div>
              <div className="text-[9px] text-brand-400 mb-1.5 uppercase tracking-wide">
                {subInOppPlayer ? '相手（交代先）' : '相手チーム'}
              </div>
              <div className="flex flex-col gap-1.5">
                {oppOnCourt.map(player => {
                  const isSelected = selectedOppPlayer?.key === player.key
                  const isFouledOut = isOppDisqualified(player.key)
                  const oppScore = getOppPlayerScore(scoreEvents, `#${player.number} ${player.name}`)
                  const oppFoulData = oppStatsMap[player.key]
                  const oppFoulCount = oppFoulData ? getTotalFouls(oppFoulData as unknown as PlayerStat) : 0
                  return (
                    <button
                      key={player.key}
                      disabled={isFouledOut && !subInOppPlayer}
                      onClick={() => {
                        // 交代モード中は退場した選手も「退く対象」としてタップ可能にする
                        if (subInOppPlayer) { substituteOpp(player.key); return }
                        if (isFouledOut) return
                        setSelectedOppPlayer(isSelected ? null : player)
                        setSelectedPlayer(null)
                        setSubInPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2.5 rounded-xl border transition-all active:scale-95 ${
                        subInOppPlayer ? 'bg-brand-500/10 border-brand-400 border-dashed'
                        : isFouledOut ? 'bg-red-500/10 border-red-500/40 opacity-60 cursor-not-allowed'
                        : isSelected ? 'bg-brand-500 border-brand-500'
                        : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className={`text-[10px] font-bold flex-shrink-0 w-8 ${isFouledOut ? 'text-red-400' : 'text-brand-300'}`}>#{player.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1 text-left">{player.name}</span>
                      {isFouledOut
                        ? <span className="text-[9px] text-red-400 font-bold flex-shrink-0 ml-1">退場</span>
                        : subInOppPlayer
                          ? <span className="text-[10px] text-[var(--muted)] flex-shrink-0 ml-1">↕</span>
                          : <span className="text-[10px] flex-shrink-0 ml-1 flex items-center gap-1">
                              {oppScore > 0 && <span className="text-[var(--muted)]">{oppScore}p</span>}
                              {oppFoulCount > 0 && (
                                <span className={`font-bold ${oppFoulCount >= 4 ? 'text-red-400' : 'text-[var(--muted)]'}`}>{oppFoulCount}F</span>
                              )}
                            </span>
                      }
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

          {/* 相手選手選択中（自チームと同じ内訳を表示。押していない項目は0のまま） */}
          {selectedOppPlayer && (() => {
            const oppStat = getOppStat(selectedOppPlayer.key)
            return (
              <div className="bg-[var(--card)] border border-brand-500/40 rounded-xl px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-brand-300">#{selectedOppPlayer.number} {selectedOppPlayer.name}</span>
                  <span className="text-brand-400 font-bold">{getOppPlayerScore(scoreEvents, `#${selectedOppPlayer.number} ${selectedOppPlayer.name}`)}pts</span>
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-0 text-[10px] text-[var(--muted)] mt-1">
                  <span>2P {oppStat.fg2_made}/{oppStat.fg2_attempt}</span>
                  {category !== 'mini' && <span>3P {oppStat.fg3_made}/{oppStat.fg3_attempt}</span>}
                  <span>FT {oppStat.ft_made}/{oppStat.ft_attempt}</span>
                  <span>REB {oppStat.rebounds}</span>
                  <span>AST {oppStat.assists}</span>
                  <span>STL {oppStat.steals}</span>
                  <span>BLK {oppStat.blocks}</span>
                  <span>TO {oppStat.turnovers}</span>
                </div>
              </div>
            )
          })()}

          {/* スタッツ入力 / 相手得点ボタン */}
          {selectedPlayer ? (
            <div className="grid grid-cols-3 gap-2">
              {/* ミニバス（U12）は3Pシュートなし */}
              {STAT_BUTTONS.filter(btn => category !== 'mini' || (btn.key !== 'fg3_made' && btn.key !== 'fg3_attempt')).map(btn => (
                <button key={btn.key + btn.label} onClick={() => handleStatTap(btn)} className={`stat-btn ${btn.category}`}>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          ) : selectedOppPlayer ? (
            // 相手も自チームと同じボタン。得点だけ押す使い方でもOK（他は0のまま集計される）
            <div className="grid grid-cols-3 gap-2">
              {STAT_BUTTONS.filter(btn => category !== 'mini' || (btn.key !== 'fg3_made' && btn.key !== 'fg3_attempt')).map(btn => (
                <button key={btn.key + btn.label} onClick={() => recordOppStatTap(btn)} className={`stat-btn ${btn.category}`}>
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          ) : !subInPlayer && !subInOppPlayer ? (
            <div className="card text-center py-4">
              {onCourtPlayers.length === 0 && oppOnCourt.length === 0
                ? <p className="text-sm text-[var(--muted)]">「メンバー変更」でコートの選手を設定してください</p>
                : <p className="text-sm text-[var(--muted)]">コートの選手をタップしてスタッツ記録</p>
              }
            </div>
          ) : null}

          {/* ベンチ（自チーム左 / 相手右） */}
          {(homeBench.length > 0 || oppBench.length > 0 || oppPlayerList.length > 0) && (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <div className="text-[10px] text-orange-400 mb-1.5 uppercase tracking-wide">自チームベンチ</div>
                <div className="flex flex-col gap-1.5">
                  {homeBench.length > 0 ? homeBench.map(p => {
                    const benchFouledOut = isDisqualified(getEffectiveStat(p.id))
                    return (
                    <button
                      key={p.id}
                      disabled={benchFouledOut}
                      onClick={() => {
                        if (benchFouledOut) return
                        setSubInPlayer(subInPlayer?.id === p.id ? null : p)
                        setSubInOppPlayer(null)
                        setSelectedPlayer(null)
                        setSelectedOppPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg border text-left transition-all active:scale-95 ${
                        benchFouledOut ? 'opacity-30 cursor-not-allowed bg-red-500/10 border-red-500/20'
                        : subInPlayer?.id === p.id ? 'bg-orange-500/20 border-orange-500'
                        : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className={`text-[10px] font-bold flex-shrink-0 w-8 ${benchFouledOut ? 'text-red-400' : 'text-orange-300'}`}>#{p.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1">{p.name}</span>
                      {benchFouledOut
                        ? <span className="ml-auto text-[9px] text-red-400 flex-shrink-0">退場</span>
                        : subInPlayer?.id === p.id && <span className="ml-auto text-[9px] text-orange-400 flex-shrink-0">IN</span>
                      }
                    </button>
                    )
                  }) : <p className="text-[10px] text-[var(--muted)] py-1">なし</p>}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-brand-400 mb-1.5 uppercase tracking-wide">相手ベンチ</div>
                <div className="flex flex-col gap-1.5">
                  {oppBench.length > 0 ? oppBench.map(p => {
                    const benchFouledOut = isOppDisqualified(p.key)
                    return (
                    <button
                      key={p.key}
                      disabled={benchFouledOut}
                      onClick={() => {
                        if (benchFouledOut) return
                        setSubInOppPlayer(subInOppPlayer?.key === p.key ? null : p)
                        setSubInPlayer(null)
                        setSelectedPlayer(null)
                        setSelectedOppPlayer(null)
                      }}
                      className={`flex items-center gap-1 px-2 py-2 rounded-lg border text-left transition-all active:scale-95 ${
                        benchFouledOut ? 'opacity-30 cursor-not-allowed bg-red-500/10 border-red-500/20'
                        : subInOppPlayer?.key === p.key ? 'bg-brand-500/20 border-brand-500'
                        : 'bg-[var(--card)] border-[var(--card-border)]'
                      }`}
                    >
                      <span className={`text-[10px] font-bold flex-shrink-0 w-8 ${benchFouledOut ? 'text-red-400' : 'text-brand-300'}`}>#{p.number || '—'}</span>
                      <span className="text-xs text-white truncate flex-1">{p.name}</span>
                      {benchFouledOut
                        ? <span className="ml-auto text-[9px] text-red-400 flex-shrink-0">退場</span>
                        : subInOppPlayer?.key === p.key && <span className="ml-auto text-[9px] text-brand-400 flex-shrink-0">IN</span>}
                    </button>
                    )
                  }) : <p className="text-[10px] text-[var(--muted)] py-1">なし</p>}
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
            {/* Q4以降は「試合終了」を大きく中央寄りに、OTを右端に小さく配置 */}
            {!game.is_finished && (
              <button
                onClick={() => setConfirmFinish(true)}
                className={`btn-secondary text-sm py-2.5 text-red-400 border-red-400/30 ${currentQuarter >= 4 ? 'flex-1' : 'px-4'}`}
              >
                試合終了
              </button>
            )}
            {!game.is_finished && (
              <button onClick={advanceQuarter} className={`btn-secondary text-sm py-2.5 ${currentQuarter >= 4 ? 'px-4' : 'flex-1'}`}>
                {currentQuarter < 4
                  ? `Q${currentQuarter + 1}へ →`
                  : currentQuarter === 4
                  ? 'OTへ →'
                  : `OT${currentQuarter - 3}へ →`
                }
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
            <p className="text-sm text-brand-300 text-center mb-1">{foulOppDialog.playerName}</p>
            <p className="text-xs text-[var(--muted)] text-center mb-4">自チームのフリースロー数を選択</p>
            <div className="grid grid-cols-2 gap-3">
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 0)} className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースローなし (P)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 1)} className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースロー1本 (P1)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 2)} className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースロー2本 (P2)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, 3)} className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95">フリースロー3本 (P3)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, -1)} className="bg-yellow-600/20 hover:bg-yellow-500/30 border border-yellow-500/50 text-yellow-300 rounded-lg py-3 font-semibold transition-all active:scale-95">テクニカル (T)</button>
              <button onClick={() => recordOppFoulWithFT(foulOppDialog.playerKey!, -2)} className="bg-red-600/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-lg py-3 font-semibold transition-all active:scale-95">アンスポ (U)</button>
            </div>
            <button onClick={() => setFoulOppDialog({ isOpen: false })} className="w-full mt-4 bg-red-600/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-lg py-2 font-semibold transition-all">キャンセル</button>
          </div>
        </div>
      )}

      {/* ペイウォール — 3試合無料制限 */}
      {showPaywall && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 px-5">
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
            <div className="text-4xl mb-3">🏀</div>
            <h2 className="text-xl font-bold text-white mb-2">3試合の無料体験終了</h2>
            <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--muted)' }}>
              無料体験の3試合を使い切りました。<br />
              続けるには月額プランへの登録が必要です。
            </p>
            <p className="text-xs mb-5" style={{ color: 'var(--muted)' }}>
              ※ 記録中のデータは消えません
            </p>

            <div className="bg-[var(--background)] rounded-xl p-3 mb-5">
              <div className="text-2xl font-bold text-white">¥500<span className="text-sm font-normal" style={{ color: 'var(--muted)' }}>/月</span></div>
              <div className="text-xs" style={{ color: 'var(--muted)' }}>チーム全員・無制限・いつでも解約OK</div>
            </div>

            <a href="/upgrade"
              className="block w-full font-bold text-white rounded-2xl py-4 text-base mb-3 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #ee7a2f, #c85a14)' }}>
              登録する →
            </a>
            <button onClick={() => setShowPaywall(false)}
              className="text-sm underline" style={{ color: 'var(--muted)' }}>
              あとで登録する（試合を終了しない）
            </button>
          </div>
        </div>
      )}

      {/* タイムアウト時間選択モーダル */}
      {timeoutModal && (
        <div className="fixed inset-0 bg-black/60 flex items-end justify-center z-50 pb-safe" onClick={() => setTimeoutModal(null)}>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-t-2xl p-5 w-full max-w-sm shadow-2xl modal-slideup" style={{paddingBottom:'max(1.25rem,env(safe-area-inset-bottom))'}} onClick={e => e.stopPropagation()}>
            <h2 className="text-base font-bold text-white mb-1 text-center">
              {timeoutModal.team === 'home' ? '🟠 自チーム' : '🔵 相手チーム'} タイムアウト
            </h2>
            <p className="text-xs text-[var(--muted)] text-center mb-4">残り時間を選択してください（分）</p>
            <div className="grid grid-cols-6 gap-2 mb-4">
              {Array.from({length: Math.floor(quarterSeconds(category, currentQuarter) / 60) + 1}, (_, i) => i).map(m => (
                <button
                  key={m}
                  onClick={() => {
                    const rec: TimeoutRecord = { quarter: currentQuarter, minute: m }
                    // JBAは前半2/後半3/各OT1まで → 同じ半に複数取れるので追加（置換しない）
                    if (timeoutModal.team === 'home') {
                      setHomeTimeoutRecords(prev => [...prev, rec])
                    } else {
                      setOppTimeoutRecords(prev => [...prev, rec])
                    }
                    setTimeoutModal(null)
                  }}
                  className="py-2.5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-white text-sm font-bold hover:bg-orange-500/20 hover:border-orange-500/50 transition-all active:scale-95"
                >
                  残り{m}分
                </button>
              ))}
            </div>
            <button onClick={() => setTimeoutModal(null)} className="w-full py-2.5 rounded-xl bg-[var(--card)] border border-[var(--card-border)] text-[var(--muted)] text-sm">キャンセル</button>
          </div>
        </div>
      )}

      {/* 5ファウルアウト通知 */}
      {/* 試合終了の確認モーダル */}
      {confirmFinish && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setConfirmFinish(false)}>
          <div className="bg-[var(--card)] border border-[var(--card-border)] rounded-2xl p-6 w-72 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-4xl mb-3">🏀</div>
            <h2 className="text-lg font-bold text-white mb-1">試合を終了しますか？</h2>
            <p className="text-sm text-[var(--muted)] mb-5">終了するとスコアシートが確定します</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setConfirmFinish(false); finishGame() }}
                className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-xl py-3 font-bold transition-all active:scale-95"
              >
                試合終了する
              </button>
              <button
                onClick={() => setConfirmFinish(false)}
                className="w-full btn-secondary rounded-xl py-3 font-bold"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      )}

      {foulOutAlert && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={() => setFoulOutAlert(null)}>
          <div className="bg-[var(--card)] border border-red-500/50 rounded-2xl p-6 w-72 shadow-2xl text-center" onClick={e => e.stopPropagation()}>
            <div className="text-5xl mb-3">🚨</div>
            <h2 className="text-xl font-bold text-red-400 mb-1">ファウルアウト</h2>
            <p className="text-white font-bold text-lg mb-1">
              #{foulOutAlert.playerNumber} {foulOutAlert.playerName}
            </p>
            <p className="text-sm text-[var(--muted)] mb-5">5ファウル — 退場してください</p>
            <button
              onClick={() => setFoulOutAlert(null)}
              className="w-full bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-xl py-3 font-bold transition-all active:scale-95"
            >
              確認
            </button>
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
                className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースローなし
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 1)}
                className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースロー1本
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 2)}
                className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースロー2本
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, 3)}
                className="bg-brand-600/20 hover:bg-brand-500/30 border border-brand-500/50 text-brand-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                フリースロー3本
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, -1)}
                className="bg-orange-600/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                テクニカル（T）
              </button>
              <button
                onClick={() => recordFoulWithFT(foulDialog.playerId!, -2)}
                className="bg-red-600/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-lg py-3 font-semibold transition-all active:scale-95"
              >
                アンスポ（U）
              </button>
            </div>
            <button
              onClick={() => setFoulDialog({ isOpen: false })}
              className="w-full mt-3 bg-red-600/20 hover:bg-red-500/30 border border-red-500/50 text-red-300 rounded-lg py-2 font-semibold transition-all"
            >
              キャンセル
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
