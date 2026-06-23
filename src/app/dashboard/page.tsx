'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { hasFreeAccess, FREE_GAMES_LIMIT } from '@/lib/freeAccess'
import { Team, Game } from '@/types'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import { Suspense } from 'react'

type TrialInfo = {
  finishedGames: number
  remaining: number
  hasSubscription: boolean
  freeAccess: boolean      // オーナー / 友達の無料ご招待
  canPlay: boolean
}

function DashboardContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const upgraded = searchParams.get('upgraded')

  const [teams, setTeams] = useState<Team[]>([])
  const [recentGames, setRecentGames] = useState<(Game & { team: Team })[]>([])
  const [loading, setLoading] = useState(true)
  const [userEmail, setUserEmail] = useState('')
  const [trial, setTrial] = useState<TrialInfo | null>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    // 10秒でタイムアウト
    const timeout = setTimeout(() => {
      setLoading(false)
    }, 10000)

    try {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      clearTimeout(timeout)
      // クライアントとmiddlewareのセッション判定がズレると /login ⇄ /dashboard の
      // 無限ループになるため、残留Cookieを破棄してからハードリダイレクトで脱出する
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
      window.location.href = '/login'
      return
    }
    setUserEmail(user.email ?? '')

    // まずチームを取得、その後ゲームを取得（RLS対応）
    let [{ data: teamsData }, { data: subData }, freeAccess] = await Promise.all([
      supabase.from('teams').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('subscriptions').select('status').eq('user_id', user.id).maybeSingle(),
      hasFreeAccess(supabase),
    ])

    // 保険: 登録時トリガーでのチーム自動作成が失敗していた場合、
    // ここでメタデータの team_name から作り直す（クライアントはRLSで自分のチームを作成可）
    if ((teamsData ?? []).length === 0) {
      const teamName = (user.user_metadata?.team_name as string | undefined)?.trim()
      if (teamName) {
        const { data: created } = await supabase
          .from('teams')
          .insert({ user_id: user.id, name: teamName })
          .select('*')
        if (created && created.length > 0) teamsData = created
      }
    }

    const teamIds = (teamsData ?? []).map((t: Team) => t.id)
    const { data: gamesData } = teamIds.length > 0
      ? await supabase.from('games').select('*, team:teams(*)').in('team_id', teamIds).order('game_date', { ascending: false }).limit(5)
      : { data: [] }

    const myTeams = teamsData ?? []
    setTeams(myTeams)
    setRecentGames((gamesData as (Game & { team: Team })[]) ?? [])

    // 終了済み試合数カウント
    let finishedCount = 0
    if (myTeams.length > 0) {
      const teamIds = myTeams.map(t => t.id)
      const { count } = await supabase
        .from('games')
        .select('id', { count: 'exact', head: true })
        .in('team_id', teamIds)
        .eq('is_finished', true)
      finishedCount = count ?? 0
    }

    // 'trialing' は登録時トリガーの初期値のため有料扱いにしない（有料は 'active' のみ）
    const hasSubscription = subData?.status === 'active'
    setTrial({
      finishedGames: finishedCount,
      remaining: Math.max(0, FREE_GAMES_LIMIT - finishedCount),
      hasSubscription,
      freeAccess,
      // 有料 or 無料ご招待なら無制限
      canPlay: finishedCount < FREE_GAMES_LIMIT || hasSubscription || freeAccess,
    })

    clearTimeout(timeout)
    setLoading(false)
    } catch (e) {
      console.error('Dashboard load error:', e)
      clearTimeout(timeout)
      setLoading(false)
    }
  }

  async function handleLogout() {
    const supabase = createClient()
    // サーバー側の失効が固まっても3秒で打ち切り、ローカルのCookieは確実に消す
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 3000)),
      ])
    } catch { /* ignore */ }
    try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
    // SPA遷移ではなく全画面リロードでmiddlewareの判定もリセットする
    window.location.href = '/'
  }

  if (loading) return <LoadingScreen />

  return (
    <div className="min-h-screen">
      {/* ナビゲーション */}
      <nav className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)] sticky top-0 bg-[var(--background)] z-10">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏀</span>
          <span className="font-bold text-white">BasketStats</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-[var(--muted)] hidden sm:block truncate max-w-[180px]">{userEmail}</span>
          <button onClick={handleLogout} className="text-xs text-[var(--muted)] hover:text-white">ログアウト</button>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-6">

        {/* ── アップグレード成功バナー ── */}
        {upgraded && (
          <div className="mb-4 p-4 rounded-2xl text-center font-bold"
            style={{ background: 'rgba(16,185,129,0.15)', border: '1px solid rgba(16,185,129,0.4)', color: '#34d399' }}>
            🎉 登録完了！ありがとうございます。これからも全試合の記録が使えます。
          </div>
        )}

        {/* ── 試用状況バー（有料・無料ご招待のときは表示しない） ── */}
        {trial && !trial.hasSubscription && !trial.freeAccess && (
          <TrialStatusBar trial={trial} />
        )}

        {/* ── 無料ご招待 バッジ（オーナー・友達） ── */}
        {trial && !trial.hasSubscription && trial.freeAccess && (
          <div className="mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm"
            style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: '#34d399' }}>
            <span>🎁</span><span className="font-bold">無料ご招待プラン 利用中 — 全試合が無制限です</span>
          </div>
        )}

        {/* ── 有料プラン バッジ ── */}
        {trial?.hasSubscription && (
          <div className="mb-4 flex items-center justify-between px-4 py-2.5 rounded-xl"
            style={{ background: 'rgba(14,165,233,0.1)', border: '1px solid rgba(14,165,233,0.3)' }}>
            <div className="flex items-center gap-2 text-sm" style={{ color: '#38bdf8' }}>
              <span>⭐</span><span className="font-bold">スタンダードプラン 利用中</span>
            </div>
            <button
              onClick={async () => {
                const res = await fetch('/api/stripe/portal', { method: 'POST' })
                const { url } = await res.json()
                if (url) window.location.href = url
              }}
              className="text-xs underline"
              style={{ color: 'var(--muted)' }}
            >
              プランを管理
            </button>
          </div>
        )}

        {/* ヘッダー */}
        <div className="flex items-center justify-between gap-3 flex-wrap mb-6">
          <h1 className="text-xl font-bold text-white">ダッシュボード</h1>
          <div className="flex gap-2">
            {teams.length > 0 && (
              <Link href={`/games/new?team=${teams[0].id}`} className="btn-primary text-sm py-2 px-4">
                🏀 試合を登録
              </Link>
            )}
            <Link href="/teams/new" className="btn-secondary text-sm py-2 px-4">+ チームを作成</Link>
          </div>
        </div>

        {/* チーム一覧 */}
        <section className="mb-6">
          <h2 className="text-base font-semibold text-white mb-3">チーム</h2>
          {teams.length === 0 ? (
            <div className="card text-center py-10">
              <p className="text-[var(--muted)] mb-4">チームがまだありません</p>
              <Link href="/teams/new" className="btn-primary">チームを作成する</Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {teams.map(team => (
                <Link key={team.id} href={`/teams/${team.id}`} className="card hover:border-orange-500/50 transition-colors cursor-pointer block py-3 px-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">🏀</span>
                      <h3 className="font-bold text-white">{team.name}</h3>
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
            <h2 className="text-base font-semibold text-white mb-3">最近の試合</h2>
            <div className="flex flex-col gap-2">
              {recentGames.map(game => (
                <Link key={game.id} href={`/games/${game.id}`} className="card flex items-center justify-between hover:border-orange-500/50 transition-colors py-3 px-4">
                  <div>
                    <div className="font-medium text-white text-sm">vs {game.opponent}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {format(new Date(game.game_date), 'M月d日（E）', { locale: ja })} · {game.team?.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`text-base font-bold ${game.our_score > game.opponent_score ? 'text-green-400' : game.our_score < game.opponent_score ? 'text-red-400' : 'text-white'}`}>
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

/** 試用状況バー */
function TrialStatusBar({ trial }: { trial: TrialInfo }) {
  const dots = Array.from({ length: FREE_GAMES_LIMIT }, (_, i) => i < trial.finishedGames)
  const isOver = trial.finishedGames >= FREE_GAMES_LIMIT

  if (isOver) {
    return (
      <div className="mb-4 rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.4)', background: 'rgba(239,68,68,0.08)' }}>
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-bold text-red-400">🔒 無料体験期間終了</span>
            <Link href="/upgrade" className="text-xs font-bold text-white rounded-xl px-3 py-1.5 active:scale-95 transition-transform"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              登録する →
            </Link>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>
            3試合の無料体験ありがとうございました。続けるには月額プランへの登録が必要です。データは消えません。
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-4 rounded-2xl px-4 py-3" style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.25)' }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold" style={{ color: '#38bdf8' }}>
          🎮 無料体験中 — 残り {trial.remaining} 試合
        </span>
        <Link href="/upgrade" className="text-xs underline" style={{ color: 'var(--muted)' }}>プランを見る</Link>
      </div>
      <div className="flex gap-1.5">
        {dots.map((used, i) => (
          <div key={i} className="flex-1 h-2 rounded-full" style={{ background: used ? '#0ea5e9' : 'rgba(14,165,233,0.2)' }} />
        ))}
      </div>
      <p className="text-[10px] mt-1.5" style={{ color: 'var(--muted)' }}>
        {trial.finishedGames}/{FREE_GAMES_LIMIT} 試合終了 · 月500円で無制限に
      </p>
    </div>
  )
}

function LoadingScreen() {
  return <div className="min-h-screen flex items-center justify-center"><div className="text-[var(--muted)]">読み込み中...</div></div>
}

export default function DashboardPage() {
  return <Suspense fallback={<LoadingScreen />}><DashboardContent /></Suspense>
}
