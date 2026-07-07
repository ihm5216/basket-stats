'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function NewTeamPage() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [category, setCategory] = useState<'general' | 'mini'>('general')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      // セッション判定ズレによるリダイレクトループ防止（ハードリダイレクト）
      try { await supabase.auth.signOut({ scope: 'local' }) } catch { /* ignore */ }
      window.location.href = '/login'
      return
    }

    const shareToken = crypto.randomUUID()
    const { data, error } = await supabase
      .from('teams')
      .insert({ user_id: user.id, name, share_token: shareToken, category })
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

        <div>
          <label className="block text-sm text-[var(--muted)] mb-1.5">カテゴリー</label>
          <div className="grid grid-cols-2 gap-2">
            {([
              { key: 'general', label: '一般 / 中高', sub: 'U15以上・10分Q・タイムアウト 前半2/後半3' },
              { key: 'mini', label: 'ミニバス', sub: 'U12・6分Q・3Pなし・タイムアウト 各Q1回' },
            ] as const).map(opt => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setCategory(opt.key)}
                className="text-left rounded-xl p-3 border transition-colors"
                style={category === opt.key
                  ? { background: 'rgba(14,165,233,0.12)', borderColor: 'rgba(14,165,233,0.6)' }
                  : { background: 'var(--card)', borderColor: 'var(--card-border)' }}
              >
                <div className="font-bold text-sm" style={{ color: category === opt.key ? '#38bdf8' : '#fff' }}>{opt.label}</div>
                <div className="text-[10px] mt-0.5" style={{ color: 'var(--muted)' }}>{opt.sub}</div>
              </button>
            ))}
          </div>
          <p className="text-[10px] mt-1.5" style={{ color: 'var(--muted)' }}>
            ※ ルール（クォーター時間・3P有無・タイムアウト・公式スコアシート）が切り替わります。あとから変更も可能です。
          </p>
        </div>

        <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
          {loading ? '作成中...' : 'チームを作成する'}
        </button>
      </form>
    </main>
  )
}
