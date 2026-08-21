'use client'

import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { authErrorMessage } from '@/lib/authError'
import InAppBrowserNotice from '@/components/InAppBrowserNotice'
import { useInAppBrowser } from '@/lib/useInAppBrowser'

type Step = 'top' | 'email' | 'sent'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [teamName, setTeamName] = useState('')
  const [step, setStep] = useState<Step>('top')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  // アプリ内ブラウザではGoogleが必ず失敗するので、導線の順番を入れ替える
  const isInApp = useInAppBrowser()

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
    if (error) { setError(authErrorMessage(error)); setLoading(false) }
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

  // ── 登録ボタン（アプリ内ブラウザかどうかで表示順を入れ替える）──
  const googleButton = (
    <button onClick={() => handleOAuth('google')} disabled={loading || isInApp}
      className={`w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm transition-transform border ${isInApp ? 'opacity-45 cursor-not-allowed' : 'active:scale-95'}`}
      style={{ background: 'white', color: '#222', borderColor: '#ddd' }}>
      <svg width="20" height="20" viewBox="0 0 48 48" className="ml-3 flex-shrink-0">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.36-8.16 2.36-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
      </svg>
      <div className="flex-1 text-left">
        <div>Googleで始める</div>
        <div className="text-[10px] font-normal" style={{ color: '#888' }}>
          {isInApp ? 'この画面では使えません（ブラウザで開くと使えます）' : 'YouTube・Gmailをお持ちの方におすすめ'}
        </div>
      </div>
    </button>
  )

  const emailButton = (
    <button onClick={() => { setStep('email'); setError('') }} disabled={loading}
      className="w-full flex items-center gap-3 rounded-2xl py-3.5 font-bold text-sm active:scale-95 transition-transform"
      style={isInApp
        ? { background: 'linear-gradient(135deg, #ee7a2f, #c85a14)', color: 'white', border: '1px solid rgba(238,122,47,0.4)' }
        : { background: 'rgba(238,122,47,0.12)', border: '1px solid rgba(238,122,47,0.4)', color: '#f0a04b' }}>
      <span className="text-xl ml-3">✉️</span>
      <div className="flex-1 text-left">
        <div>メールアドレスで登録</div>
        <div className="text-[10px] font-normal" style={{ color: isInApp ? 'rgba(255,255,255,0.85)' : 'rgba(56,189,248,0.7)' }}>
          Yahoo!・docomo・iCloud などどのメールでもOK
        </div>
      </div>
    </button>
  )

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <span className="text-2xl">🏀</span>
        <span className="font-bold text-xl text-white">BasketStats</span>
      </Link>

      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-white mb-1 text-center">3試合 無料で始める</h1>
        <p className="text-xs text-center mb-7" style={{ color: 'var(--muted)' }}>
          クレジットカード不要・いつでも解約OK<br />
          すでにアカウントをお持ちの方は{' '}
          <Link href="/login" className="text-[#f0a04b] underline">ログイン</Link>
        </p>

        <InAppBrowserNotice />

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {step === 'top' && (
          <div className="flex flex-col gap-3">

            <div className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--muted)' }}>
              {isInApp ? 'この画面ですぐ登録できます' : '一番簡単な方法'}
            </div>

            {/* アプリ内ブラウザでは動くほう（メール）を先頭に出す */}
            {isInApp ? emailButton : googleButton}

            {/* 区切り */}
            <div className="flex items-center gap-3 my-1">
              <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
              <span className="text-[10px]" style={{ color: 'var(--muted)' }}>
                {isInApp ? 'ブラウザで開いた場合はこちら' : 'またはメールアドレスで登録（Yahoo!等）'}
              </span>
              <div className="flex-1 h-px" style={{ background: 'var(--card-border)' }} />
            </div>

            {isInApp ? googleButton : emailButton}

            {/* Apple ログインは Supabase 側のプロバイダ設定（要 Apple Developer 契約）が
                完了するまで非表示。設定後に復活させること。 */}

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

            <p className="text-[10px] text-center mt-2 leading-relaxed" style={{ color: 'var(--muted)' }}>
              登録することで
              <Link href="/terms" className="underline">利用規約</Link>
              と
              <Link href="/privacy" className="underline">プライバシーポリシー</Link>
              に同意したものとみなされます
            </p>
          </div>
        )}

        {/* ── メール登録フォーム ── */}
        {step === 'email' && (
          <form onSubmit={handleSignup} className="flex flex-col gap-3">
            <button type="button" onClick={() => setStep('top')}
              className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--muted)' }}>
              ← 戻る
            </button>
            <h2 className="font-bold text-white mb-1">メールアドレスで登録</h2>
            <p className="text-xs leading-relaxed mb-2" style={{ color: 'var(--muted)' }}>
              Yahoo!・docomo・iCloud・Gmail などどのメールアドレスでもOK。<br />パスワードは不要です（届いたリンクをタップするだけ）。
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
              style={{ background: 'linear-gradient(135deg, #ee7a2f, #c85a14)' }}>
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
