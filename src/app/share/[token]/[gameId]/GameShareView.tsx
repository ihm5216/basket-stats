'use client'

import Link from 'next/link'
import { Game, Player, PlayerStat } from '@/types'
import { calcPoints } from '@/lib/stats'
import JBAOfficialSheet from '@/app/games/[id]/JBAOfficialSheet'

type OppPlayerJson = { number: string; name: string }
type TimeoutRecord = { quarter: number; minute: number }
type ScoreEvent = {
  quarter: number
  team: 'us' | 'opponent'
  points: number
  player_id?: string
  opp_player_name?: string
  our_score_after: number
  opponent_score_after: number
}

export default function GameShareView({ token, teamName, game, players, stats }: {
  token: string
  teamName: string
  game: Game
  players: Player[]
  stats: PlayerStat[]
}) {
  const statsMap = new Map(stats.map(s => [s.player_id, s]))
  const scoreEvents = (Array.isArray(game.score_events_json) ? game.score_events_json : []) as ScoreEvent[]
  const oppJson = (Array.isArray(game.opponent_players) ? game.opponent_players : []) as OppPlayerJson[]
  const oppPlayerList = oppJson.map(p => ({ key: `opp_${p.number}_${p.name}`, number: p.number, name: p.name }))
  const cd = (game.court_data_json ?? {}) as { homeTimeouts?: TimeoutRecord[]; oppTimeouts?: TimeoutRecord[] }

  const eventsOurTotal = scoreEvents.filter(e => e.team === 'us').reduce((s, e) => s + e.points, 0)
  const ourScore = Math.max(game.our_score, eventsOurTotal)
  const won = ourScore > game.opponent_score

  const rows = players
    .filter(p => statsMap.has(p.id))
    .map(p => ({ player: p, stat: statsMap.get(p.id)! }))

  return (
    <main className="min-h-screen">
      <div className="max-w-4xl mx-auto px-3 py-6">
        {/* ヘッダー */}
        <div className="print:hidden">
          <Link href={`/share/${token}`} className="text-xs" style={{ color: 'var(--muted)' }}>← {teamName} のスタッツ一覧へ</Link>
          <div className="mt-3 mb-1 flex items-center justify-between">
            <div>
              <div className="text-xs mb-0.5" style={{ color: 'var(--muted)' }}>
                {teamName} vs {game.opponent}
                {game.game_date ? `　${new Date(game.game_date).toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric' })}` : ''}
              </div>
              <div className="text-3xl font-bold text-white">
                {ourScore} <span className="text-xl" style={{ color: 'var(--muted)' }}>-</span> {game.opponent_score}
                <span className={`ml-3 text-sm font-bold ${won ? 'text-green-400' : 'text-red-400'}`}>{won ? '勝利' : ourScore < game.opponent_score ? '敗北' : '引き分け'}</span>
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="bg-[var(--card)] border border-[var(--card-border)] text-sm font-bold px-3 py-2 rounded-lg"
              style={{ color: 'var(--muted)' }}
            >🖨 印刷</button>
          </div>
        </div>

        {/* スコアシート（白背景の公式様式・スマホは横スクロール） */}
        <section className="mt-4 print:hidden">
          <h2 className="text-sm font-semibold text-white mb-2">スコアシート</h2>
          <div className="rounded-xl overflow-x-auto" style={{ background: '#fff' }}>
            <div style={{ width: '198mm', padding: '4mm' }}>
              <style>{`#jba-print-sheet { display: block; }`}</style>
              <JBAOfficialSheet
                game={game}
                players={players}
                statsMap={statsMap}
                scoreEvents={scoreEvents}
                oppPlayerList={oppPlayerList}
                gameId={game.id}
                homeTimeoutRecords={cd.homeTimeouts ?? []}
                oppTimeoutRecords={cd.oppTimeouts ?? []}
              />
            </div>
          </div>
          <p className="text-[10px] mt-1" style={{ color: 'var(--muted)' }}>※ 横にスクロールできます。「🖨 印刷」からA4で印刷・PDF保存できます。</p>
        </section>

        {/* 印刷時のみ表示されるシート（globals.cssの印刷CSSが #jba-print-sheet のみを出力する） */}

        {/* 選手スタッツ */}
        {rows.length > 0 && (
          <section className="mt-6 print:hidden">
            <h2 className="text-sm font-semibold text-white mb-2">選手スタッツ</h2>
            <div className="overflow-x-auto card p-0">
              <table className="w-full text-sm min-w-[560px]">
                <thead>
                  <tr className="text-[10px] border-b border-[var(--card-border)] uppercase" style={{ color: 'var(--muted)' }}>
                    <th className="text-left py-2 pl-3 pr-3 w-8">#</th>
                    <th className="text-left py-2 pr-3">名前</th>
                    <th className="text-right py-2 pr-3 text-orange-400">得点</th>
                    <th className="text-right py-2 pr-3">2P</th>
                    <th className="text-right py-2 pr-3">3P</th>
                    <th className="text-right py-2 pr-3">FT</th>
                    <th className="text-right py-2 pr-3">REB</th>
                    <th className="text-right py-2 pr-3">AST</th>
                    <th className="text-right py-2 pr-3">STL</th>
                    <th className="text-right py-2 pr-3">BLK</th>
                    <th className="text-right py-2 pr-3">F</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ player, stat }) => (
                    <tr key={player.id} className="border-b border-[var(--card-border)]">
                      <td className="py-2.5 pl-3 pr-3 text-orange-400 font-bold text-xs">{player.number || '—'}</td>
                      <td className="py-2.5 pr-3 text-white font-medium whitespace-nowrap">{player.name}</td>
                      <td className="py-2.5 pr-3 text-right font-bold text-orange-400">{calcPoints(stat)}</td>
                      <td className="py-2.5 pr-3 text-right text-xs" style={{ color: 'var(--muted)' }}>{stat.fg2_made}/{stat.fg2_attempt}</td>
                      <td className="py-2.5 pr-3 text-right text-xs" style={{ color: 'var(--muted)' }}>{stat.fg3_made}/{stat.fg3_attempt}</td>
                      <td className="py-2.5 pr-3 text-right text-xs" style={{ color: 'var(--muted)' }}>{stat.ft_made}/{stat.ft_attempt}</td>
                      <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--muted)' }}>{stat.rebounds}</td>
                      <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--muted)' }}>{stat.assists}</td>
                      <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--muted)' }}>{stat.steals}</td>
                      <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--muted)' }}>{stat.blocks}</td>
                      <td className="py-2.5 pr-3 text-right" style={{ color: 'var(--muted)' }}>{(stat.fouls_plain ?? 0) + (stat.fouls_1ft ?? 0) + (stat.fouls_2ft ?? 0) + (stat.fouls_3ft ?? 0) + (stat.technical_fouls ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <footer className="text-center mt-10 text-xs print:hidden" style={{ color: 'var(--muted)' }}>
          Powered by <span className="text-orange-400">BasketStats</span>
        </footer>
      </div>
    </main>
  )
}
