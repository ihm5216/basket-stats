'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

type Mode = 'top' | 'magic' | 'password' | 'sent'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<Mode>('top')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── OAuth共通 ────────────────────────────────
  async function handleOAuth(provider: 'google' | 'apple') {
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(`エラー: ${error.message}`)
        setLoading(false)
        return
      }
      // dataにURLがある場合は手動でリダイレクト
      if (data?.url) {
        window.location.href = data.url
      } else {
        setError('リダイレクトURLが取得できませんでした。Supabaseの設定を確認してください。')
        setLoading(false)
      }
    } catch (e: any) {
      setError(`例外エラー: ${e?.message ?? String(e)}`)
      setLoading(false)
    }
  }

  // ── Magic Link ───────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    if (!email) return
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard`, shouldCreateUser: false },
    })
    if (error) { setError('メール送信に失敗しました。登録済みのメアドかご確認ください。'); setLoading(false) }
    else { setMode('sent'); setLoading(false) }
  }

  // ── パスワード ────────────────────────────────
  async function handlePassword(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError('メールアドレスまたはパスワードが違います'); setLoading(false) }
    else { router.push('/dashboard') }
  }

  // ── 送信完了画面 ─────────────────────────────
  if (mode === 'sent') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-5">📩</div>
          <h1 className="text-xl font-bold text-white mb-3">メールを送信しました</h1>
          <p className="text-sm leading-relaxed mb-1" style={{ color: 'var(--muted)' }}>
            <span className="text-white font-bold break-all">{email}</span> に<br />ログイン用のリンクを送りました
          </p>
          <p className="text-xs mb-8 leading-relaxed" style={{ color: 'var(--muted)' }}>
            メールを開いて「ログイン」リンクをタップするだけ。<br />迷惑メールフォルダもご確認ください。
          </p>
          <button onClick={() => { setMode('top'); setError('') }} className="text-sm underline" style={{ color: 'var(--muted)' }}>
            ← 最初に戻る
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">

      {/* ロゴ */}
      <Link href="/" className="flex items-center gap-2 mb-8">
        <span className="text-2xl">🏀</span>
        <span className="font-bold text-xl text-white">BasketStats</span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-1 text-center">ログイン</h1>
        <p className="text-xs text-center mb-7" style={{ color: 'var(--muted)' }}>
          アカウントをお持ちでない方は{' '}
          <Link href="/signup" className="text-[#38bdf8] underline">無料登録はこちら</Link>
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {/* ── ① Google ── */}
        {mode === 'top' && (
          <div className="flex flex-col gap-3">

            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
              SNS・メールアカウントでログイン
            </div>

            {/* Google */}
            <button onClick={() => handleOAuth('google')} disabled={loading}
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform border"
              style={{ background: 'white', color: '#222', borderColor: '#ddd' }}>
              <svg width="20" height="20" viewBox="0 0 48 48" className="ml-3 flex-shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              <span className="flex-1 text-left">Googleでログイン</span>
              <span className="text-[10px] mr-3 font-normal" style={{ color: '#888' }}>YouTube / Gmail</span>
            </button>

            {/* Apple */}
            <button onClick={() => handleOAuth('apple')} disabled={loading}
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform"
              style={{ background: '#111', color: 'white', border: '1px solid #333' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="ml-3 flex-shrink-0">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <span className="flex-1 text-left">Appleでログイン</span>
              <span className="text-[10px] mr-3 font-normal" style={{ color: '#888' }}>Face ID 対応</span>
            </button>

            {/* 区切り */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>または</span>
              <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
            </div>

            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
              メールでログイン
            </div>

            {/* Magic Link */}
            <button onClick={() => { setMode('magic'); setError('') }} disabled={loading}
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.4)', color: '#38bdf8' }}>
              <span className="text-xl ml-3">✉️</span>
              <span className="flex-1 text-left">メールリンクでログイン</span>
              <span className="text-[10px] mr-3 font-normal" style={{ color: 'rgba(56,189,248,0.7)' }}>パスワード不要</span>
            </button>

            {/* パスワード */}
            <button onClick={() => { setMode('password'); setError('') }} disabled={loading}
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'var(--card)', border: '1px solid var(--card-border)', color: 'var(--muted)' }}>
              <span className="text-xl ml-3">🔒</span>
              <span className="flex-1 text-left">メール + パスワード</span>
              <span className="text-[10px] mr-3 font-normal">従来のログイン</span>
            </button>

            {/* LINE（近日公開）*/}
            <button disabled
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm opacity-40 cursor-not-allowed"
              style={{ background: '#06C755', color: 'white', border: '1px solid #06C755' }}>
              <svg width="20" height="20" viewBox="0 0 40 40" fill="white" className="ml-3 flex-shrink-0">
                <path d="M20 2C10.06 2 2 9.16 2 17.9c0 5.6 3.54 10.52 8.86 13.36-.39 1.46-1.42 5.3-1.63 6.12-.26 1.02.37 1.01.78.74.32-.21 5.1-3.47 7.17-4.88.9.13 1.83.2 2.77.2 9.94 0 18-7.16 18-15.9S29.94 2 20 2z"/>
              </svg>
              <span className="flex-1 text-left">LINEでログイン</span>
              <span className="text-[10px] mr-3 rounded-full px-2 py-0.5" style={{ background: 'rgba(255,255,255,0.3)' }}>近日公開</span>
            </button>

          </div>
        )}

        {/* ── Magic Link 入力 ── */}
        {mode === 'magic' && (
          <form onSubmit={handleMagicLink} className="flex flex-col gap-3">
            <button type="button" onClick={() => setMode('top')}
              className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--muted)' }}>
              ← 戻る
            </button>
            <h2 className="font-bold text-white mb-1">メールリンクでログイン</h2>
            <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>
              メールアドレスを入力してください。<br />
              ログイン用のリンクをすぐ送ります。パスワード不要です。
            </p>
            <input type="email" className="input-field text-base" value={email}
              onChange={e => setEmail(e.target.value)} required placeholder="example@email.com"
              autoComplete="email" autoFocus />
            <button type="submit" disabled={loading || !email}
              className="w-full text-center font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              {loading ? '送信中…' : '✉️ ログインリンクを送る'}
            </button>
          </form>
        )}

        {/* ── パスワード入力 ── */}
        {mode === 'password' && (
          <form onSubmit={handlePassword} className="flex flex-col gap-3">
            <button type="button" onClick={() => setMode('top')}
              className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--muted)' }}>
              ← 戻る
            </button>
            <h2 className="font-bold text-white mb-1">メール + パスワード</h2>
            <input type="email" className="input-field text-base" value={email}
              onChange={e => setEmail(e.target.value)} required placeholder="メールアドレス"
              autoComplete="email" autoFocus />
            <input type="password" className="input-field text-base" value={password}
              onChange={e => setPassword(e.target.value)} required placeholder="パスワード"
              autoComplete="current-password" />
            <button type="submit" disabled={loading}
              className="w-full text-center font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              {loading ? 'ログイン中…' : 'ログイン'}
            </button>
          </form>
        )}

      </div>
    </main>
  )
}
