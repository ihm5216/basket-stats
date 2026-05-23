'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function NewTeamPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.push('/login'); return }

    const shareToken = crypto.randomUUID()
    const { data, error } = await supabase
      .from('teams')
      .insert({ user_id: user.id, name, share_token: shareToken })
      .select()
      .single()

    if (error) {
      setError('チームの作成に失敗しました')
      setLoading(false)
    } else {
      router.push(`/teams/${data.id}`)
    }
  }

  return (
    <main className="min-h-screen max-w-lg mx-auto px-4 py-8">
      <Link href="/dashboard" className="text-[var(--muted)] text-sm hover:text-white mb-6 inline-flex items-center gap-1">
        ← ダッシュボードに戻る
      </Link>

      <h1 className="text-2xl font-bold text-white mb-8">チームを作成</h1>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="card flex flex-col gap-4">
        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">チーム名</label>
          <input
            type="text"
            className="input-field"
            value={name}
            onChange={e => setName(e.target.value)}
            required
            placeholder="例：○○高校バスケ部"
          />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
          {loading ? '作成中...' : 'チームを作成する'}
        </button>
      </form>
    </main>
  )
}
