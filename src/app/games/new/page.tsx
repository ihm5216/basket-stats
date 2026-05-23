'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { Team } from '@/types'
import { Suspense } from 'react'

function NewGameForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const teamId = searchParams.get('team')

  const [teams, setTeams] = useState<Team[]>([])
  const [selectedTeam, setSelectedTeam] = useState(teamId ?? '')
  const [opponent, setOpponent] = useState('')
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0])
  const [location, setLocation] = useState('')
  const [homeOrAway, setHomeOrAway] = useState<'home' | 'away'>('home')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    async function loadTeams() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }
      const { data } = await supabase.from('teams').select('*').eq('user_id', user.id)
      setTeams(data ?? [])
    }
    loadTeams()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedTeam) return
    setLoading(true)

    const supabase = createClient()
    const { data, error } = await supabase
      .from('games')
      .insert({
        team_id: selectedTeam,
        opponent: opponent.trim(),
        game_date: gameDate,
        location: location.trim() || null,
        home_or_away: homeOrAway,
        our_score: 0,
        opponent_score: 0,
        quarter: 1,
        is_finished: false,
      })
      .select()
      .single()

    if (!error && data) {
      router.push(`/games/${data.id}`)
    } else {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-8">
      <Link href={teamId ? `/teams/${teamId}` : '/dashboard'} className="text-[var(--muted)] text-sm hover:text-white mb-6 inline-flex items-center gap-1">
        ← 戻る
      </Link>
      <h1 className="text-2xl font-bold text-white mb-8">試合を追加</h1>

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">チーム</label>
          <select
            className="input-field"
            value={selectedTeam}
            onChange={e => setSelectedTeam(e.target.value)}
            required
          >
            <option value="">選択してください</option>
            {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">対戦相手</label>
          <input
            className="input-field"
            value={opponent}
            onChange={e => setOpponent(e.target.value)}
            required
            placeholder="例：○○高校"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">試合日</label>
          <input
            type="date"
            className="input-field"
            value={gameDate}
            onChange={e => setGameDate(e.target.value)}
            required
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">会場（任意）</label>
          <input
            className="input-field"
            value={location}
            onChange={e => setLocation(e.target.value)}
            placeholder="例：○○体育館"
          />
        </div>

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">ホーム / アウェイ</label>
          <div className="flex gap-3">
            {(['home', 'away'] as const).map(v => (
              <button
                key={v}
                type="button"
                onClick={() => setHomeOrAway(v)}
                className={`flex-1 py-2 rounded-lg border font-medium text-sm transition-colors ${homeOrAway === v ? 'bg-orange-500 border-orange-500 text-white' : 'bg-transparent border-[var(--card-border)] text-[var(--muted)]'}`}
              >
                {v === 'home' ? 'ホーム' : 'アウェイ'}
              </button>
            ))}
          </div>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
          {loading ? '作成中...' : '試合を作成して記録開始'}
        </button>
      </form>
    </main>
  )
}

export default function NewGamePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--muted)]">読み込み中...</div>}>
      <NewGameForm />
    </Suspense>
  )
}
