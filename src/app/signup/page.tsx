'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Step = 'top' | 'email' | 'sent'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [teamName, setTeamName] = useState('')
  const [step, setStep] = useState<Step>('top')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── OAuth共通 ────────────────────────────────
  async function handleOAuth(provider: 'google' | 'apple') {
    setLoading(true); setError('')
    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(`${provider === 'google' ? 'Google' : 'Apple'}登録に失敗しました: ${error.message}`)
        setLoading(false)
      }
      // リダイレクトが起きない場合のフォールバック
      setTimeout(() => setLoading(false), 5000)
    } catch (e) {
      setError('登録に失敗しました。再度お試しください。')
      setLoading(false)
    }
  }

  // ── Magic Link 新規登録 ──────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !teamName.trim()) return
    setLoading(true); setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        shouldCreateUser: true,
        data: { team_name: teamName.trim() },
      },
    })
    if (error) { setError('登録に失敗しました。メールアドレスを確認してください。'); setLoading(false) }
    else { setStep('sent'); setLoading(false) }
  }

  // ── 送信完了 ─────────────────────────────────
  if (step === 'sent') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-5">🎉</div>
          <h1 className="text-xl font-bold text-white mb-3">メールを確認してください</h1>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>
            <span className="text-white font-bold break-all">{email}</span> に<br />登録リンクを送りました
          </p>
          <div className="card p-4 text-left my-6">
            <div className="text-xs font-bold text-white mb-2">📋 次のステップ</div>
            <ol className="text-xs space-y-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              <li>1. メールアプリを開く</li>
              <li>2.「BasketStats にサインイン」のリンクをタップ</li>
              <li>3. チームを設定して試合記録スタート！</li>
            </ol>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>迷惑メールフォルダも確認してみてください</p>
          <button onClick={() => { setStep('top'); setError('') }} className="text-sm underline" style={{ color: 'var(--muted)' }}>
            ← 最初に戻る
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
        <h1 className="text-2xl font-bold text-white mb-1 text-center">14日間 無料で始める</h1>
        <p className="text-xs text-center mb-7" style={{ color: 'var(--muted)' }}>
          クレジットカード不要・いつでも解約OK<br />
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-[#38bdf8] underline">ログイン</Link>
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {step === 'top' && (
          <div className="flex flex-col gap-3">

            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
              一番簡単な方法
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
              <div className="flex-1 text-left">
                <div>Googleで始める</div>
                <div className="text-[10px] font-normal" style={{ color: '#888' }}>YouTube・Gmailをお持ちの方におすすめ</div>
              </div>
            </button>

            {/* Apple */}
            <button onClick={() => handleOAuth('apple')} disabled={loading}
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform"
              style={{ background: '#111', color: 'white', border: '1px solid #333' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white" className="ml-3 flex-shrink-0">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="flex-1 text-left">
                <div>Appleで始める</div>
                <div className="text-[10px] font-normal" style={{ color: '#888' }}>iPhoneをお使いの方・Face ID 対応</div>
              </div>
            </button>

            {/* 区切り */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>またはメールで登録</span>
              <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
            </div>

            {/* メール登録 */}
            <button onClick={() => { setStep('email'); setError('') }} disabled={loading}
              className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform"
              style={{ background: 'rgba(14,165,233,0.12)', border: '1px solid rgba(14,165,233,0.4)', color: '#38bdf8' }}>
              <span className="text-xl ml-3">✉️</span>
              <div className="flex-1 text-left">
                <div>メールで登録</div>
                <div className="text-[10px] font-normal" style={{ color: 'rgba(56,189,248,0.7)' }}>パスワード不要・チーム専用アドレスも使えます</div>
              </div>
            </button>

            {/* LINE（近日公開）*/}
            <button disabled
              className="w-full flex items-center gap-3 rounded-2xl py-3 font-bold text-sm opacity-40 cursor-not-allowed"
              style={{ background: '#06C755', color: 'white' }}>
              <svg width="20" height="20" viewBox="0 0 40 40" fill="white" className="ml-3 flex-shrink-0">
                <path d="M20 2C10.06 2 2 9.16 2 17.9c0 5.6 3.54 10.52 8.86 13.36-.39 1.46-1.42 5.3-1.63 6.12-.26 1.02.37 1.01.78.74.32-.21 5.1-3.47 7.17-4.88.9.13 1.83.2 2.77.2 9.94 0 18-7.16 18-15.9S29.94 2 20 2z"/>
              </svg>
              <div className="flex-1 text-left">
                <div>LINEで登録</div>
                <div className="text-[10px] font-normal" style={{ color: 'rgba(255,255,255,0.7)' }}>準備中 — 近日公開予定</div>
              </div>
            </button>

          </div>
        )}

        {/* ── メール登録フォーム ── */}
        {step === 'email' && (
          <form onSubmit={handleSignup} className="flex flex-col gap-3">
            <button type="button" onClick={() => setStep('top')}
              className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--muted)' }}>
              ← 戻る
            </button>
            <h2 className="font-bold text-white mb-1">メールで登録</h2>
            <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>
              チーム専用アドレス・個人アドレスどちらでもOK。<br />パスワードは設定不要です。
            </p>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>チーム名</label>
              <input type="text" className="input-field text-base" value={teamName}
                onChange={e => setTeamName(e.target.value)} required placeholder="例：○○高校バスケ部"
                autoComplete="organization" autoFocus />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>メールアドレス</label>
              <input type="email" className="input-field text-base" value={email}
                onChange={e => setEmail(e.target.value)} required placeholder="example@email.com"
                autoComplete="email" />
            </div>
            <button type="submit" disabled={loading || !email || !teamName.trim()}
              className="w-full text-center font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50 mt-1"
              style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
              {loading ? '送信中…' : '✉️ 登録リンクを送る'}
            </button>
            <p className="text-[11px] text-center" style={{ color: 'var(--muted)' }}>
              メールのリンクをタップするだけで登録完了
            </p>
          </form>
        )}

      </div>
    </main>
  )
}
