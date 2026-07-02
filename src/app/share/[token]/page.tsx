import { createClient as createServiceClient } from '@supabase/supabase-js'
import { aggregateSeasonStats } from '@/lib/stats'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import AutoRefresh from '../AutoRefresh'

// 進行中試合のライブ表示があるため常に最新データを取得する
export const dynamic = 'force-dynamic'

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  // シェアページはRLSをバイパスするためサービスロールキーを使用
  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: team } = await supabase
    .from('teams')
    .select('*')
    .eq('share_token', token)
    .single()

  if (!team) notFound()

  const { data: allGames } = await supabase
    .from('games')
    .select('*')
    .eq('team_id', team.id)
    .order('game_date', { ascending: false })

  type GameRow = { id: string; opponent: string; game_date: string; our_score: number; opponent_score: number; location?: string; is_finished: boolean }
  // 終了試合（統計・勝敗の対象）と、今日の進行中試合（ライブ速報）に分ける
  const games = ((allGames ?? []) as GameRow[]).filter(g => g.is_finished)
  const todayJst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10)
  const liveGames = ((allGames ?? []) as GameRow[]).filter(g => !g.is_finished && g.game_date.slice(0, 10) === todayJst)

  const { data: statsData } = await supabase
    .from('player_stats')
    .select('*, player:players(*)')
    .in('game_id', games.map(g => g.id))

  const seasonStats = statsData ? aggregateSeasonStats(statsData as Parameters<typeof aggregateSeasonStats>[0]) : []
  const wins = games.filter(g => g.our_score > g.opponent_score).length
  const losses = games.length - wins

  return (
    <main className="min-h-screen">
      {liveGames.length > 0 && <AutoRefresh />}
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* ヘッダー */}
        <div className="flex items-center gap-3 mb-8">
          <span className="text-3xl">🏀</span>
          <div>
            <h1 className="text-2xl font-bold text-white">{team.name}</h1>
            <p className="text-[var(--muted)] text-sm">シーズンスタッツ（公開）</p>
          </div>
        </div>

        {/* 進行中の試合（ライブ速報・自動更新） */}
        {liveGames.length > 0 && (
          <section className="mb-8">
            <div className="flex flex-col gap-3">
              {liveGames.map(game => (
                <Link
                  key={game.id}
                  href={`/share/${token}/${game.id}`}
                  className="card flex items-center justify-between border-red-500/40 hover:border-red-500 transition-colors"
                >
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="flex items-center gap-1.5 text-[11px] font-bold text-red-400 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                        進行中
                      </span>
                      <span className="text-[10px] text-[var(--muted)]">自動更新中</span>
                    </div>
                    <div className="font-medium text-white">vs {game.opponent}</div>
                    <div className="text-xs text-orange-400 mt-1">📋 スコアシートを見る →</div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-white">
                      {game.our_score} - {game.opponent_score}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* シーズンサマリー */}
        {games && games.length > 0 && (
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="card text-center">
              <div className="text-3xl font-bold text-white">{games.length}</div>
              <div className="text-sm text-[var(--muted)]">終了試合</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-green-400">{wins}</div>
              <div className="text-sm text-[var(--muted)]">勝利</div>
            </div>
            <div className="card text-center">
              <div className="text-3xl font-bold text-red-400">{losses}</div>
              <div className="text-sm text-[var(--muted)]">敗北</div>
            </div>
          </div>
        )}

        {/* シーズン統計テーブル */}
        {seasonStats.length > 0 && (
          <section className="mb-8">
            <h2 className="text-lg font-semibold text-white mb-4">選手スタッツ</h2>
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
                  {seasonStats.map(s => (
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
          </section>
        )}

        {/* 試合履歴 */}
        {games && games.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">試合結果</h2>
            <div className="flex flex-col gap-3">
              {games.map((game: { id: string; opponent: string; game_date: string; our_score: number; opponent_score: number; location?: string }) => (
                <Link key={game.id} href={`/share/${token}/${game.id}`} className="card flex items-center justify-between hover:border-orange-500/50 transition-colors">
                  <div>
                    <div className="font-medium text-white">vs {game.opponent}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {format(new Date(game.game_date), 'M月d日（E）', { locale: ja })}
                      {game.location ? ` · ${game.location}` : ''}
                    </div>
                    <div className="text-xs text-orange-400 mt-1">📋 スコアシートを見る →</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-lg font-bold ${game.our_score > game.opponent_score ? 'text-green-400' : 'text-red-400'}`}>
                      {game.our_score} - {game.opponent_score}
                    </div>
                    <div className="text-xs text-[var(--muted)]">{game.our_score > game.opponent_score ? '○ 勝' : '● 負'}</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {games.length === 0 && liveGames.length === 0 && (
          <div className="card text-center py-16 text-[var(--muted)]">
            まだ試合データがありません
          </div>
        )}

        <footer className="text-center mt-12 text-xs text-[var(--muted)]">
          Powered by <span className="text-orange-400">BasketStats</span>
        </footer>
      </div>
    </main>
  )
}
