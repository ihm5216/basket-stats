'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function SignupPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [teamName, setTeamName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (password.length < 8) {
      setError('パスワードは8文字以上で設定してください')
      setLoading(false)
      return
    }

    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { team_name: teamName },
      },
    })

    if (error) {
      setError('登録に失敗しました: ' + error.message)
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <span className="text-2xl">🏀</span>
        <span className="font-bold text-xl text-white">BasketStats</span>
      </Link>

      <div className="card w-full max-w-sm">
        <h1 className="text-xl font-bold text-white mb-2">14日間無料で始める</h1>
        <p className="text-sm text-[var(--muted)] mb-6">クレジットカード不要</p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-lg p-3 mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSignup} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">チーム名</label>
            <input
              type="text"
              className="input-field"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              required
              placeholder="例：○○高校バスケ部"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">メールアドレス</label>
            <input
              type="email"
              className="input-field"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              placeholder="example@email.com"
            />
          </div>
          <div>
            <label className="block text-sm text-[var(--muted)] mb-1.5">パスワード（8文字以上）</label>
            <input
              type="password"
              className="input-field"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              minLength={8}
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary w-full justify-center mt-2">
            {loading ? '登録中...' : '無料で始める'}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--muted)] mt-4">
          登録すると利用規約・プライバシーポリシーに同意したことになります
        </p>
        <p className="text-center text-sm text-[var(--muted)] mt-3">
          アカウントをお持ちの方は{' '}
          <Link href="/login" className="text-orange-400 hover:underline">ログイン</Link>
        </p>
      </div>
    </main>
  )
}
