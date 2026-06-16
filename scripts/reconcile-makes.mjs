// 旧バグ（保存時に同一キーの複数変更を上書きして潰していた）で過少計上された
// made 系スタッツを、正本である score_events_json から検出・修復する一回限りのスクリプト。
//   ドライラン: node --env-file=.env.local scripts/reconcile-makes.mjs
//   適用:       node --env-file=.env.local scripts/reconcile-makes.mjs --apply
import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) { console.error('Missing SUPABASE env'); process.exit(1) }
const APPLY = process.argv.includes('--apply')
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: games, error: gErr } = await sb.from('games').select('id, opponent, game_date, score_events_json')
if (gErr) { console.error(gErr); process.exit(1) }

const { data: allStats } = await sb.from('player_stats').select('*')
const { data: players } = await sb.from('players').select('id, name, number')
const pName = new Map(players.map(p => [p.id, `#${p.number} ${p.name}`]))
const statsByGame = new Map()
for (const s of allStats ?? []) {
  if (!statsByGame.has(s.game_id)) statsByGame.set(s.game_id, [])
  statsByGame.get(s.game_id).push(s)
}

const corrections = []   // { id, before, update }
let gamesWithIssues = 0

for (const g of games ?? []) {
  const events = Array.isArray(g.score_events_json) ? g.score_events_json : []
  if (!events.length) continue
  // 自チーム選手ごとの made 集計
  const made = new Map()
  for (const ev of events) {
    if (ev.team !== 'us' || !ev.player_id) continue
    const m = made.get(ev.player_id) ?? { ft: 0, fg2: 0, fg3: 0 }
    if (ev.points === 1) m.ft++; else if (ev.points === 2) m.fg2++; else if (ev.points === 3) m.fg3++
    made.set(ev.player_id, m)
  }
  const stats = statsByGame.get(g.id) ?? []
  const statByPid = new Map(stats.map(s => [s.player_id, s]))
  let gameHeader = false
  for (const [pid, m] of made) {
    const st = statByPid.get(pid)
    if (!st?.id) continue
    const upd = {}
    if (m.ft  > (st.ft_made  ?? 0)) { upd.ft_made  = m.ft;  upd.ft_attempt  = Math.max(st.ft_attempt  ?? 0, m.ft) }
    if (m.fg2 > (st.fg2_made ?? 0)) { upd.fg2_made = m.fg2; upd.fg2_attempt = Math.max(st.fg2_attempt ?? 0, m.fg2) }
    if (m.fg3 > (st.fg3_made ?? 0)) { upd.fg3_made = m.fg3; upd.fg3_attempt = Math.max(st.fg3_attempt ?? 0, m.fg3) }
    if (Object.keys(upd).length) {
      if (!gameHeader) { console.log(`\n■ ${g.opponent}（${g.game_date}）game=${g.id}`); gameHeader = true; gamesWithIssues++ }
      const ptsBefore = (st.fg2_made??0)*2 + (st.fg3_made??0)*3 + (st.ft_made??0)
      const ptsAfter  = (upd.fg2_made??st.fg2_made??0)*2 + (upd.fg3_made??st.fg3_made??0)*3 + (upd.ft_made??st.ft_made??0)
      console.log(`  ${pName.get(pid) ?? pid}: 得点 ${ptsBefore} → ${ptsAfter}  ${JSON.stringify(upd)}`)
      corrections.push({ id: st.id, before: { fg2_made: st.fg2_made, fg2_attempt: st.fg2_attempt, fg3_made: st.fg3_made, fg3_attempt: st.fg3_attempt, ft_made: st.ft_made, ft_attempt: st.ft_attempt }, update: upd })
    }
  }
}

console.log(`\n=== ${corrections.length}件の選手スタッツに過少計上を検出（${gamesWithIssues}試合） ===`)
if (!corrections.length) { console.log('修復対象なし。'); process.exit(0) }

if (!APPLY) {
  console.log('ドライランです。--apply で適用します。')
  process.exit(0)
}

// 適用前にバックアップ
const backupPath = `scripts/reconcile-backup-${Date.now()}.json`
writeFileSync(backupPath, JSON.stringify(corrections, null, 2))
console.log(`バックアップ: ${backupPath}`)
let ok = 0
for (const c of corrections) {
  const { error } = await sb.from('player_stats').update(c.update).eq('id', c.id)
  if (error) console.error(`  ✗ ${c.id}`, error.message); else ok++
}
console.log(`適用完了: ${ok}/${corrections.length}`)
