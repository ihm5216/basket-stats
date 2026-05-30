'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Step = 'form' | 'sent'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [teamName, setTeamName] = useState('')
  const [step, setStep] = useState<Step>('form')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // ── Google OAuth ─────────────────────────────
  async function handleGoogle() {
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
        queryParams: {
          // チーム名はOAuth後にダッシュボードで設定
        },
      },
    })
    if (error) {
      setError('Googleログインに失敗しました')
      setLoading(false)
    }
  }

  // ── Magic Link 登録 ───────────────────────────
  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !teamName.trim()) return
    setLoading(true)
    setError('')

    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        shouldCreateUser: true,  // 新規作成を許可
        data: { team_name: teamName.trim() },
      },
    })

    if (error) {
      setError('登録に失敗しました。メールアドレスを確認してください。')
      setLoading(false)
    } else {
      setStep('sent')
      setLoading(false)
    }
  }

  // ── 送信完了 ────────────────────────────────
  if (step === 'sent') {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm text-center">
          <div className="text-6xl mb-6">🎉</div>
          <h1 className="text-xl font-bold text-white mb-3">メールを確認してください</h1>
          <p className="text-sm leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>
            <span className="text-white font-bold">{email}</span> に<br />
            アカウント開設用のリンクを送りました
          </p>
          <p className="text-xs mb-8" style={{ color: 'var(--muted)' }}>
            メールのリンクをタップするだけで<br />
            すぐに使い始められます。
          </p>
          <div className="card p-4 text-left mb-6">
            <div className="text-xs font-bold text-white mb-2">📋 次のステップ</div>
            <ol className="text-xs space-y-1.5" style={{ color: 'var(--muted)' }}>
              <li>1. メールを開く</li>
              <li>2. 「BasketStats にサインイン」のリンクをタップ</li>
              <li>3. チームを作成して試合記録スタート！</li>
            </ol>
          </div>
          <button
            onClick={() => { setStep('form'); setError('') }}
            className="text-sm underline"
            style={{ color: 'var(--muted)' }}
          >
            入力内容を変更する
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
        <p className="text-xs text-center mb-6" style={{ color: 'var(--muted)' }}>
          クレジットカード不要・いつでも解約OK
        </p>

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {/* ── Google 登録（最速）── */}
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
          Googleで始める（一番簡単）
        </button>

        {/* 区切り */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
          <span className="text-xs" style={{ color: 'var(--muted)' }}>またはメールで登録</span>
          <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
        </div>

        {/* ── メール登録（Magic Link）── */}
        <form onSubmit={handleSignup} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--muted)' }}>
              チーム名
            </label>
            <input
              type="text"
              className="input-field text-base"
              value={teamName}
              onChange={e => setTeamName(e.target.value)}
              required
              placeholder="例：○○高校バスケ部"
              autoComplete="organization"
            />
          </div>
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

          <button
            type="submit"
            disabled={loading || !email || !teamName.trim()}
            className="w-full text-center font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50 mt-1"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}
          >
            {loading ? '送信中…' : '✉️ 登録リンクをメール送信'}
          </button>

          <p className="text-[11px] text-center" style={{ color: 'var(--muted)' }}>
            パスワード不要。メールのリンクをタップするだけで登録完了。
          </p>
        </form>

        <p className="text-center text-xs mt-6" style={{ color: 'var(--muted)' }}>
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-[#38bdf8] underline">ログイン</Link>
        </p>
      </div>
    </main>
  )
}
