'use client'

// ─── JBA公式スコアシート（印刷用・A4縦） ───────────────────────────────────
// 日本バスケットボール協会の公式スコアシート様式を再現する印刷専用ビュー。
// 画面上は非表示（#jba-print-sheet は globals.css で print のみ表示）。

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Game, Player, PlayerStat } from '@/types'

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
type OppPlayer = { key: string; number: string; name: string }
type TimeoutRecord = { quarter: number; minute: number }
type RunMark = { type: '2P' | '3P' | 'FT'; num: string; quarter: number }
type FoulEvent = { quarter: number; team: 'us' | 'opponent'; key: string; foulType: string }

function foulLabel(t: string): string {
  return t === 'technical_fouls' ? 'T' : t === 'fouls_1ft' ? 'P1' : t === 'fouls_2ft' ? 'P2' : t === 'fouls_3ft' ? 'P3' : 'P'
}

type CourtData = {
  homeStarters?: Record<string, string[]>
  oppStarters?: Record<string, string[]>
  homeSubs?: Record<string, string[]>
  oppSubs?: Record<string, string[]>
  scoresheetOv?: {
    oppPlayers?: Record<string, { fouls?: number; fouls_plain?: number; fouls_1ft?: number; fouls_2ft?: number; fouls_3ft?: number; technical_fouls?: number }>
  }
  foulEvents?: FoulEvent[]
}

const BK = '0.15mm solid #000'
const THICK = '0.5mm solid #000'
// ランニングスコアのマス線。0.15mm は画面（LINE共有）だと細すぎてサブピクセルで
// 消えてしまい「グレーの帯」に見えるため、画面でも各マスが四角く見える太さにする。
const RUN_B = '0.3mm solid #888'
const RED = '#c00000'

function qColor(q?: number) {
  if (!q) return '#000'
  return q === 1 || q === 3 || q > 4 ? RED : '#000'
}

function foulParts(stat?: Partial<PlayerStat>): string[] {
  if (!stat) return []
  const parts: string[] = []
  for (let i = 0; i < (stat.fouls_plain ?? 0); i++) parts.push('P')
  for (let i = 0; i < (stat.fouls_1ft ?? 0); i++) parts.push('P1')
  for (let i = 0; i < (stat.fouls_2ft ?? 0); i++) parts.push('P2')
  for (let i = 0; i < (stat.fouls_3ft ?? 0); i++) parts.push('P3')
  for (let i = 0; i < (stat.technical_fouls ?? 0); i++) parts.push('T')
  return parts
}

// court_data_json 優先・localStorage フォールバックで Q別セットを読む
function readQSets(cd: Record<string, string[]> | undefined, lsPrefix: string, gameId: string): Map<number, Set<string>> {
  const map = new Map<number, Set<string>>()
  for (let q = 1; q <= 4; q++) {
    if (cd?.[q]) { map.set(q, new Set(cd[q])); continue }
    try {
      const s = localStorage.getItem(`${lsPrefix}${q}_${gameId}`)
      if (s) map.set(q, new Set(JSON.parse(s)))
    } catch { /* ignore */ }
  }
  return map
}

export default function JBAOfficialSheet({ game, players, statsMap, scoreEvents, oppPlayerList, gameId, homeTimeoutRecords, oppTimeoutRecords }: {
  game: Game
  players: Player[]
  statsMap: Map<string, PlayerStat>
  scoreEvents: ScoreEvent[]
  oppPlayerList: OppPlayer[]
  gameId: string
  homeTimeoutRecords?: TimeoutRecord[]
  oppTimeoutRecords?: TimeoutRecord[]
}) {
  const [teamName, setTeamName] = useState('')
  useEffect(() => {
    const supabase = createClient()
    supabase.from('teams').select('name').eq('id', game.team_id).maybeSingle()
      .then(({ data }) => { if (data?.name) setTeamName(data.name) })
  }, [game.team_id])

  const cd = (game.court_data_json ?? {}) as CourtData
  const homeStarters = useMemo(() => readQSets(cd.homeStarters, 'court_q', gameId), [cd.homeStarters, gameId])
  const oppStarters = useMemo(() => readQSets(cd.oppStarters, 'court_opp_q', gameId), [cd.oppStarters, gameId])
  const homeSubs = useMemo(() => readQSets(cd.homeSubs, 'sub_q', gameId), [cd.homeSubs, gameId])
  const oppSubs = useMemo(() => readQSets(cd.oppSubs, 'sub_opp_q', gameId), [cd.oppSubs, gameId])

  // ファウルイベント（Q別チームファウル・前後半区切り線用）
  const foulEvents = useMemo<FoulEvent[]>(() => {
    if (cd.foulEvents?.length) return cd.foulEvents
    try {
      const fe = localStorage.getItem(`foul_events_${gameId}`)
      if (fe) return JSON.parse(fe)
    } catch { /* ignore */ }
    return []
  }, [cd.foulEvents, gameId])

  // 相手チームのファウル（court_data_json → localStorage フォールバック）
  const oppFouls = useMemo(() => {
    if (cd.scoresheetOv?.oppPlayers) return cd.scoresheetOv.oppPlayers
    try {
      const s = localStorage.getItem(`scoresheet_ov_${gameId}`)
      if (s) return (JSON.parse(s).oppPlayers ?? {}) as NonNullable<CourtData['scoresheetOv']>['oppPlayers']
    } catch { /* ignore */ }
    return {}
  }, [cd.scoresheetOv, gameId])

  // ランニングスコア用マーク
  const { aMarks, bMarks, aQEnds, bQEnds } = useMemo(() => {
    const aMarks = new Map<number, RunMark>()
    const bMarks = new Map<number, RunMark>()
    const aLastByQ = new Map<number, number>()
    const bLastByQ = new Map<number, number>()
    let aC = 0, bC = 0
    for (const ev of scoreEvents) {
      const type: '2P' | '3P' | 'FT' = ev.points === 1 ? 'FT' : ev.points === 2 ? '2P' : '3P'
      if (ev.team === 'us') {
        const num = players.find(p => p.id === ev.player_id)?.number ?? ''
        aC += ev.points
        aMarks.set(aC, { type, num, quarter: ev.quarter })
        aLastByQ.set(ev.quarter, aC)
      } else {
        const m = ev.opp_player_name?.match(/#(\d+)/)
        bC += ev.points
        bMarks.set(bC, { type, num: m ? m[1] : '', quarter: ev.quarter })
        bLastByQ.set(ev.quarter, bC)
      }
    }
    const aQEnds = new Set<number>(); aLastByQ.forEach(v => aQEnds.add(v))
    const bQEnds = new Set<number>(); bLastByQ.forEach(v => bQEnds.add(v))
    return { aMarks, bMarks, aQEnds, bQEnds }
  }, [scoreEvents, players])

  const maxQ = Math.max(4, ...scoreEvents.map(e => e.quarter))
  const qScores = Array.from({ length: maxQ }, (_, i) => i + 1).map(q => ({
    us: scoreEvents.filter(e => e.quarter === q && e.team === 'us').reduce((s, e) => s + e.points, 0),
    opp: scoreEvents.filter(e => e.quarter === q && e.team === 'opponent').reduce((s, e) => s + e.points, 0),
  }))
  const totalUs = qScores.reduce((s, q) => s + q.us, 0)
  const totalOpp = qScores.reduce((s, q) => s + q.opp, 0)
  const nameA = teamName || '自チーム'
  const nameB = game.opponent

  const dateStr = game.game_date
    ? new Date(game.game_date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric' })
    : ''

  // ── 部品: 記入欄（下線） ──
  function Field({ label, value, width }: { label: string; value?: string; width?: string }) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: '1mm' }}>
        <span style={{ fontSize: '2.4mm' }}>{label}</span>
        <span style={{ borderBottom: BK, minWidth: width ?? '20mm', fontSize: '2.8mm', fontWeight: 'bold', textAlign: 'center', padding: '0 1mm' }}>
          {value ?? ' '}
        </span>
      </span>
    )
  }

  // ── 部品: 二本線（未使用マスの消し込み） ──
  function DoubleLine({ width }: { width: string }) {
    return (
      <span style={{ display: 'inline-block', width, verticalAlign: 'middle' }}>
        <span style={{ display: 'block', borderTop: '0.3mm solid #000', marginBottom: '0.7mm' }} />
        <span style={{ display: 'block', borderTop: '0.3mm solid #000' }} />
      </span>
    )
  }

  // ── 部品: タイムアウト欄（未使用マスは二本線で消し込み） ──
  function TimeoutBoxes({ recs }: { recs?: TimeoutRecord[] }) {
    const firstHalf = (recs ?? []).filter(r => r.quarter <= 2).slice(0, 2)
    const secondHalf = (recs ?? []).filter(r => r.quarter === 3 || r.quarter === 4).slice(0, 3)
    const ot = (recs ?? []).filter(r => r.quarter >= 5).slice(0, 1)
    const box = (rec: TimeoutRecord | undefined, key: number, crossUnused: boolean) => (
      <span key={key} style={{ display: 'inline-flex', width: '4.5mm', height: '4mm', border: BK, alignItems: 'center', justifyContent: 'center', fontSize: '2.6mm', verticalAlign: 'middle', marginRight: '0.5mm' }}>
        {rec !== undefined ? rec.minute : crossUnused ? <DoubleLine width="3mm" /> : ' '}
      </span>
    )
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '2mm', fontSize: '2.4mm' }}>
        <span style={{ fontWeight: 'bold' }}>タイムアウト</span>
        <span>前半 {[0, 1].map(i => box(firstHalf[i], i, true))}</span>
        <span>後半 {[0, 1, 2].map(i => box(secondHalf[i], i, true))}</span>
        <span>延長 {[0].map(i => box(ot[i], i, false))}</span>
      </div>
    )
  }

  // ── 部品: チームファウル欄（×で消し込み・未使用マスは二重線） ──
  function TeamFoulBoxes({ sideEvents }: { sideEvents: FoulEvent[] }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5mm', fontSize: '2.4mm' }}>
        <span style={{ fontWeight: 'bold' }}>チームファウル</span>
        {[1, 2, 3, 4].map(q => {
          // OT中のファウルは第4Qの欄に加算（FIBA準拠）
          const cnt = sideEvents.filter(e => q === 4 ? e.quarter >= 4 : e.quarter === q).length
          return (
            <span key={q} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3mm' }}>
              <span style={{ fontSize: '2.2mm' }}>第{q}Q</span>
              {[1, 2, 3, 4].map(n => (
                <span key={n} style={{ display: 'inline-flex', width: '3.2mm', height: '3.6mm', border: BK, alignItems: 'center', justifyContent: 'center', fontSize: '2.2mm' }}>
                  {n <= cnt
                    ? <span style={{ fontWeight: 'bold', fontSize: '3mm' }}>×</span>
                    : sideEvents.length > 0
                      ? <DoubleLine width="2.2mm" />
                      : <span style={{ color: '#888' }}>{n}</span>}
                </span>
              ))}
            </span>
          )
        })}
      </div>
    )
  }

  // ── 部品: チームの選手テーブル ──
  function TeamTable({ label, name, list, starters, subs, getFouls, timeoutRecs, sideEvents }: {
    label: 'A' | 'B'
    name: string
    list: { id: string; number: string; name: string }[]
    starters: Map<number, Set<string>>
    subs: Map<number, Set<string>>
    getFouls: (id: string) => string[]
    timeoutRecs?: TimeoutRecord[]
    sideEvents: FoulEvent[]
  }) {
    const q1 = starters.get(1) ?? new Set<string>()
    const playedSet = new Set<string>()
    starters.forEach(set => set.forEach(id => playedSet.add(id)))
    subs.forEach(set => set.forEach(id => playedSet.add(id)))

    return (
      <div style={{ border: THICK, marginBottom: '2mm' }}>
        <div style={{ borderBottom: BK, padding: '0.8mm 1.5mm', display: 'flex', alignItems: 'baseline', gap: '2mm' }}>
          <span style={{ fontWeight: 'bold', fontSize: '3.2mm' }}>チーム{label}</span>
          <span style={{ borderBottom: BK, flex: 1, fontSize: '3mm', fontWeight: 'bold', paddingLeft: '1mm' }}>{name}</span>
        </div>
        <div style={{ borderBottom: BK, padding: '0.6mm 1.5mm' }}><TimeoutBoxes recs={timeoutRecs} /></div>
        <div style={{ borderBottom: BK, padding: '0.6mm 1.5mm' }}><TeamFoulBoxes sideEvents={sideEvents} /></div>
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: '13mm' }} />
            <col />
            <col style={{ width: '7mm' }} />
            <col style={{ width: '7mm' }} />
            {[1, 2, 3, 4, 5].map(n => <col key={n} style={{ width: '5.6mm' }} />)}
          </colgroup>
          <thead>
            <tr style={{ height: '4.5mm' }}>
              <th style={{ border: BK, fontSize: '1.9mm', fontWeight: 'normal' }}>ライセンス<br />番号</th>
              <th style={{ border: BK, fontSize: '2.2mm', fontWeight: 'normal' }}>選手氏名</th>
              <th style={{ border: BK, fontSize: '2.2mm', fontWeight: 'normal' }}>No.</th>
              <th style={{ border: BK, fontSize: '2.2mm', fontWeight: 'normal' }}>出場</th>
              <th colSpan={5} style={{ border: BK, fontSize: '2.2mm', fontWeight: 'normal' }}>ファウル</th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 15 }, (_, i) => {
              const p = list[i]
              const statParts = p ? getFouls(p.id) : []
              // 時系列イベントがスタッツと整合する場合はそちらを優先（前後半の区切り線を引ける）
              const pEvents = p ? sideEvents.filter(e => e.key === p.id) : []
              const useChrono = pEvents.length > 0 && pEvents.length === statParts.length
              const parts = useChrono ? pEvents.map(e => foulLabel(e.foulType)) : statParts
              const halfCount = useChrono ? pEvents.filter(e => e.quarter <= 2).length : -1
              const isStarter = p ? q1.has(p.id) : false
              const played = p ? playedSet.has(p.id) || parts.length > 0 : false
              return (
                <tr key={i} style={{ height: '4.6mm' }}>
                  <td style={{ border: BK }} />
                  <td style={{ border: BK, fontSize: '2.6mm', textAlign: 'center', padding: '0 1mm', overflow: 'hidden', whiteSpace: 'nowrap' }}>{p?.name ?? ''}</td>
                  <td style={{ border: BK, textAlign: 'center', fontSize: '2.8mm', fontWeight: 'bold' }}>{p?.number ?? ''}</td>
                  <td style={{ border: BK, textAlign: 'center', fontSize: '2.8mm' }}>
                    {isStarter
                      ? <span style={{ display: 'inline-block', width: '3.6mm', height: '3.6mm', border: '0.3mm solid #000', borderRadius: '50%', lineHeight: '3.4mm' }}>×</span>
                      : played ? '×' : ''}
                  </td>
                  {[0, 1, 2, 3, 4].map(f => {
                    const cellNo = f + 1
                    // 前半/後半の区切り太線（公式: 前半のファウルを太線で囲む）
                    const halfRight = halfCount > 0 && cellNo === halfCount
                    const halfLeft = halfCount === 0 && parts.length > 0 && cellNo === 1
                    return (
                      <td key={f} style={{ border: BK, borderRight: halfRight ? THICK : BK, borderLeft: halfLeft ? THICK : undefined, textAlign: 'center', fontSize: '2.3mm', fontWeight: 'bold' }}>
                        {parts[f] ?? (p ? <span style={{ display: 'inline-block', width: '70%', borderTop: '0.3mm solid #000', verticalAlign: 'middle' }} /> : '')}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {['コーチ', 'アシスタントコーチ'].map(role => (
              <tr key={role} style={{ height: '4.6mm' }}>
                <td colSpan={2} style={{ border: BK, fontSize: '2.3mm', paddingLeft: '1mm' }}>{role}</td>
                <td colSpan={2} style={{ border: BK }} />
                {[0, 1, 2].map(f => <td key={f} style={{ border: BK }} />)}
                <td colSpan={2} style={{ border: BK, background: '#000' }} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
  }

  // ── 部品: ランニングスコアのマス中身（記録画面と同じ見せ方） ──
  // 2点=背番号　3点=背番号を○で囲む　フリースロー=●＋背番号
  function markContent(mark: RunMark | undefined): React.ReactNode {
    if (!mark) return null
    const color = qColor(mark.quarter)
    const num = mark.num || '—'
    if (mark.type === 'FT') return <span style={{ color, fontWeight: 'bold', fontSize: '2.4mm' }}>●{num}</span>
    if (mark.type === '2P') return <span style={{ color, fontWeight: 'bold', fontSize: '2.7mm' }}>{num}</span>
    // 3P
    return <span style={{ display: 'inline-block', minWidth: '3.2mm', height: '3.2mm', border: `0.3mm solid ${color}`, borderRadius: '50%', fontSize: '2.2mm', lineHeight: '3mm', color, fontWeight: 'bold' }}>{num}</span>
  }

  // ランニングスコア: 3列グループ × 40行 = 1〜120（記録画面と同じ構成）
  const groups = [0, 1, 2]

  return (
    <div id="jba-print-sheet">
      <div style={{ width: '100%', background: '#fff', color: '#000', fontFamily: '"Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif' }}>

        {/* ヘッダー */}
        <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '4mm', letterSpacing: '1mm', marginBottom: '1.5mm' }}>
          スコアシート　SCORE SHEET
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1mm' }}>
          <Field label="大会名" width="70mm" />
          <Field label="ゲームNo." width="12mm" />
        </div>
        <div style={{ display: 'flex', gap: '4mm', marginBottom: '1mm' }}>
          <Field label="月日" value={dateStr} width="32mm" />
          <Field label="開始時刻" width="14mm" />
          <Field label="終了時刻" width="14mm" />
          <Field label="場所" value={game.location ?? ''} width="38mm" />
        </div>
        <div style={{ display: 'flex', gap: '4mm', marginBottom: '2mm' }}>
          <Field label="クルーチーフ" width="28mm" />
          <Field label="アンパイア1" width="28mm" />
          <Field label="アンパイア2" width="28mm" />
        </div>

        {/* 本体: 左=チーム表 / 右=ランニングスコア */}
        <div style={{ display: 'flex', gap: '2mm', alignItems: 'flex-start' }}>
          <div style={{ flex: '0 0 100mm' }}>
            <TeamTable
              label="A" name={nameA}
              sideEvents={foulEvents.filter(e => e.team === 'us')}
              list={players.map(p => ({ id: p.id, number: p.number ?? '', name: p.name }))}
              starters={homeStarters} subs={homeSubs}
              getFouls={id => foulParts(statsMap.get(id))}
              timeoutRecs={homeTimeoutRecords}
            />
            <TeamTable
              label="B" name={nameB}
              sideEvents={foulEvents.filter(e => e.team === 'opponent')}
              list={oppPlayerList.map(p => ({ id: p.key, number: p.number, name: p.name }))}
              starters={oppStarters} subs={oppSubs}
              getFouls={id => foulParts(oppFouls?.[id] ? {
                fouls_plain: oppFouls[id].fouls_plain ?? oppFouls[id].fouls ?? 0,
                fouls_1ft: oppFouls[id].fouls_1ft ?? 0,
                fouls_2ft: oppFouls[id].fouls_2ft ?? 0,
                fouls_3ft: oppFouls[id].fouls_3ft ?? 0,
                technical_fouls: oppFouls[id].technical_fouls ?? 0,
              } : undefined)}
              timeoutRecs={oppTimeoutRecords}
            />

            {/* スコア欄 */}
            <div style={{ border: THICK, padding: '1mm 1.5mm', fontSize: '2.5mm' }}>
              <div style={{ fontWeight: 'bold', marginBottom: '0.8mm' }}>スコア　SCORE</div>
              {Array.from({ length: maxQ }, (_, i) => i + 1).map(q => (
                <div key={q} style={{ display: 'flex', gap: '2mm', marginBottom: '0.5mm' }}>
                  <span style={{ width: '22mm' }}>{q <= 4 ? `第${q}ピリオド` : `延長${q - 4}`}</span>
                  <span>A <b style={{ borderBottom: BK, display: 'inline-block', minWidth: '8mm', textAlign: 'center' }}>{qScores[q - 1].us}</b></span>
                  <span>B <b style={{ borderBottom: BK, display: 'inline-block', minWidth: '8mm', textAlign: 'center' }}>{qScores[q - 1].opp}</b></span>
                </div>
              ))}
              <div style={{ display: 'flex', gap: '2mm', marginTop: '1mm', fontWeight: 'bold', fontSize: '3mm' }}>
                <span style={{ width: '22mm' }}>最終スコア</span>
                <span>A <b style={{ borderBottom: THICK, display: 'inline-block', minWidth: '8mm', textAlign: 'center' }}>{totalUs}</b></span>
                <span>B <b style={{ borderBottom: THICK, display: 'inline-block', minWidth: '8mm', textAlign: 'center' }}>{totalOpp}</b></span>
              </div>
              <div style={{ marginTop: '1mm' }}>
                <Field label="勝者チーム名" value={totalUs === totalOpp ? '' : totalUs > totalOpp ? nameA : nameB} width="40mm" />
              </div>
            </div>

            {/* 署名欄 */}
            <div style={{ border: THICK, borderTop: 'none', padding: '1mm 1.5mm', fontSize: '2.4mm', display: 'flex', flexDirection: 'column', gap: '1mm' }}>
              <Field label="スコアラー" width="50mm" />
              <Field label="アシスタントスコアラー" width="42mm" />
              <Field label="タイマー" width="50mm" />
              <Field label="ショットクロックオペレーター" width="36mm" />
            </div>
          </div>

          {/* ランニングスコア */}
          <div style={{ flex: 1 }}>
            <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '2.8mm', marginBottom: '0.8mm' }}>
              ランニングスコア　RUNNING SCORE
            </div>
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'fixed' }}>
              <colgroup>
                {groups.flatMap(g => [
                  <col key={`a${g}`} style={{ width: `${100 / 6}%` }} />,
                  <col key={`b${g}`} style={{ width: `${100 / 6}%` }} />,
                ])}
              </colgroup>
              <thead>
                <tr style={{ height: '4mm' }}>
                  {groups.flatMap(g => [
                    <th key={`a${g}`} style={{ border: RUN_B, fontSize: '2.4mm' }}>A</th>,
                    <th key={`b${g}`} style={{ border: RUN_B, borderRight: g < 2 ? THICK : RUN_B, fontSize: '2.4mm' }}>B</th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 40 }, (_, row) => (
                  <tr key={row}>
                    {groups.flatMap(g => {
                      const n = g * 40 + row + 1
                      const aM = aMarks.get(n)
                      const bM = bMarks.get(n)
                      const aEnd = aQEnds.has(n)
                      const bEnd = bQEnds.has(n)
                      const cornerNum = (
                        <span style={{ position: 'absolute', top: 0, left: '0.3mm', fontSize: '1.5mm', color: '#bbb', lineHeight: 1 }}>{n}</span>
                      )
                      return [
                        <td key={`a${n}`} style={{ border: RUN_B, borderBottom: aEnd ? THICK : RUN_B, height: '4.2mm', position: 'relative', textAlign: 'center', verticalAlign: 'middle', background: aM ? 'rgba(0,0,0,0.03)' : undefined }}>
                          {cornerNum}{markContent(aM)}
                        </td>,
                        <td key={`b${n}`} style={{ border: RUN_B, borderBottom: bEnd ? THICK : RUN_B, borderRight: g < 2 ? THICK : RUN_B, height: '4.2mm', position: 'relative', textAlign: 'center', verticalAlign: 'middle', background: bM ? 'rgba(0,0,0,0.03)' : undefined }}>
                          {cornerNum}{markContent(bM)}
                        </td>,
                      ]
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: '2mm', color: '#333', marginTop: '0.8mm' }}>
              各マスの小さい数字＝累計得点　A=自チーム / B=相手　中の数字＝得点した選手の背番号　2点=数字　3点=○囲み　フリースロー＝●　太線＝ピリオド終了　赤＝第1・第3ピリオド／延長
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
