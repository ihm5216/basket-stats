'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Team, Game } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'

export default function DashboardPage() {
  const router = useRouter()
  const [teams, setTeams] = useState<Team[]>([])
  const [recentGames, setRecentGames] = useState<(Game & { team: Team })[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }
    setUserEmail(user.email ?? '')

    const [{ data: teamsData }, { data: gamesData }] = await Promise.all([
      supabase.from('teams').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('games').select('*, team:teams(*)').order('game_date', { ascending: false }).limit(5),
    ])

    setTeams(teamsData ?? [])
    setRecentGames((gamesData as (Game & { team: Team })[]) ?? [])
    setLoading(false)
  }

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen">
      {/* ナビゲーション */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-[var(--card-border)] sticky top-0 bg-[var(--background)] z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏀</span>
          <span className="font-bold text-white">BasketStats</span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-sm text-[var(--muted)] hidden sm:block">{userEmail}</span>
          <button onClick={handleLogout} className="text-sm text-[var(--muted)] hover:text-white">ログアウト</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between gap-3 flex-wrap mb-8">
          <h1 className="text-2xl font-bold text-white">ダッシュボード</h1>
          <div className="flex gap-2">
            {teams.length > 0 && (
              <Link
                href={`/games/new?team=${teams[0].id}`}
                className="btn-primary text-sm py-2 px-4"
              >
                🏀 試合を登録
              </Link>
            )}
            <Link href="/teams/new" className="btn-secondary text-sm py-2 px-4">
              + チームを作成
            </Link>
          </div>
        </div>

        {/* チーム一覧 */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">チーム</h2>
          {teams.length === 0 ? (
            <div className="card text-center py-12">
              <p className="text-[var(--muted)] mb-4">チームがまだありません</p>
              <Link href="/teams/new" className="btn-primary">チームを作成する</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {teams.map(team => (
                <Link key={team.id} href={`/teams/${team.id}`} className="card hover:border-orange-500/50 transition-colors cursor-pointer block">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xl">🏀</span>
                        <h3 className="font-bold text-white">{team.name}</h3>
                      </div>
                    </div>
                    <span className="text-[var(--muted)] text-xl">›</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>

        {/* 最近の試合 */}
        {recentGames.length > 0 && (
          <section>
            <h2 className="text-lg font-semibold text-white mb-4">最近の試合</h2>
            <div className="flex flex-col gap-3">
              {recentGames.map(game => (
                <Link key={game.id} href={`/games/${game.id}`} className="card flex items-center justify-between hover:border-orange-500/50 transition-colors">
                  <div>
                    <div className="font-medium text-white">vs {game.opponent}</div>
                    <div className="text-sm text-[var(--muted)]">
                      {format(new Date(game.game_date), 'M月d日（E）', { locale: ja })} · {game.team?.name}
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
          </section>
        )}
      </main>
    </div>
  )
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-[var(--muted)]">読み込み中...</div>
    </div>
  )
}
