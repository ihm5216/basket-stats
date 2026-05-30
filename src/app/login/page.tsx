'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'magic' | 'password' | 'sent'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('magic')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Magic Link ──────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        shouldCreateUser: false,  // ログインのみ（新規はsignupページへ）
      },
    })
    if (error) {
      setError('メール送信に失敗しました。メールアドレスを確認してください。')
      setLoading(false)
    } else {
      setMode('sent')
      setLoading(false)
    }
  }

  // ── パスワードログイン ────────────────────────
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('メールアドレスまたはパスワードが違います')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  // ── Google OAuth ─────────────────────────────
  async function handleGoogle() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) {
      setError('Googleログインに失敗しました')
      setLoading(false)
    }
  }

  // ── 送信完了画面 ────────────────────────────
  if (mode === 'sent') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-6">📩</div>
          <h1 className="text-xl font-bold text-white mb-3">メールを送信しました</h1>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>
            <span className="text-white font-bold">{email}</span> に<br />
            ログイン用のリンクを送りました
          </p>
          <p className="text-xs mb-8" style={{ color: 'var(--muted)' }}>
            メールのリンクをタップするとログインできます。<br />
            迷惑メールフォルダも確認してみてください。
          </p>
          <button
            onClick={() => { setMode('magic'); setError('') }}
            className="text-sm underline"
            style={{ color: 'var(--muted)' }}
          >
            メールアドレスを変更する
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <span className="text-2xl">🏀</span>
        <span className="font-bold text-xl text-white">BasketStats</span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-1 text-center">ログイン</h1>
        <p className="text-xs text-center mb-6" style={{ color: 'var(--muted)' }}>
          アカウントをお持ちでない方は{' '}
          <Link href="/signup" className="text-[#38bdf8] underline">無料登録はこちら</Link>
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {/* ── Google ログイン ── */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 rounded-2xl py-3.5 mb-4 font-bold text-sm active:scale-95 transition-transform border"
          style={{ background: 'white', color: '#222', borderColor: '#ddd' }}
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
            <path fill="none" d="M0 0h48v48H0z"/>
          </svg>
          Googleでログイン
        </button>

        {/* 区切り */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>または</span>
          <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
        </div>

        {/* ── Magic Link（メインの認証方法）── */}
        {mode === 'magic' && (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                メールアドレス
              </label>
              <input
                type="email"
                className="input-field text-base"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="example@email.com"
                autoComplete="email"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || !email}
              className="w-full text-center font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}
            >
              {loading ? '送信中…' : '✉️ ログインリンクをメール送信'}
            </button>
            <p className="text-[11px] text-center" style={{ color: 'var(--muted)' }}>
              メールアドレスにログイン用リンクを送ります。パスワード不要。
            </p>

            {/* パスワードログインへの切り替え */}
            <button
              type="button"
              onClick={() => setMode('password')}
              className="text-xs text-center mt-1 underline"
              style={{ color: 'var(--muted)' }}
            >
              パスワードでログイン
            </button>
          </form>
        )}

        {/* ── パスワードログイン（サブ）── */}
        {mode === 'password' && (
          <form onSubmit={handlePassword} className="flex flex-col gap-3">
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                メールアドレス
              </label>
              <input
                type="email"
                className="input-field text-base"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="example@email.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
                パスワード
              </label>
              <input
                type="password"
                className="input-field text-base"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full text-center font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}
            >
              {loading ? 'ログイン中…' : 'ログイン'}
            </button>
            <button
              type="button"
              onClick={() => setMode('magic')}
              className="text-xs text-center underline"
              style={{ color: 'var(--muted)' }}
            >
              ← メールリンクで簡単ログインに戻る
            </button>
          </form>
        )}
      </div>
    </main>
  )
}
