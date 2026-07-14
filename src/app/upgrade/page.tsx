'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function UpgradeContent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const searchParams = useSearchParams()
  const canceled = searchParams.get('canceled')

  async function handleCheckout() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/stripe/checkout', { method: 'POST' })
      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        setError(data.error ?? 'エラーが発生しました')
        setLoading(false)
      }
    } catch {
      setError('通信エラーが発生しました')
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-5 py-12">
      <Link href="/dashboard" className="text-xs mb-8" style={{ color: 'var(--muted)' }}>← ダッシュボードに戻る</Link>

      <div className="w-full max-w-sm">
        {/* ヘッダー */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-4">🏀</div>
          <h1 className="text-2xl font-bold text-white mb-2">3試合の無料体験、いかがでしたか？</h1>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--muted)' }}>
            続けるには月額プランへの登録が必要です。<br />
            データはそのまま引き継がれます。
          </p>
        </div>

        {canceled && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-sm rounded-xl p-3 mb-4 text-center">
            登録をキャンセルしました。いつでも登録できます。
          </div>
        )}

        {error && (
          <div className="bg-red-500/10 border border-red-500/30 text-red-400 text-sm rounded-xl p-3 mb-4">
            {error}
          </div>
        )}

        {/* 料金カード */}
        <div className="card mb-4" style={{ border: '2px solid rgba(238,122,47,0.5)' }}>
          <div className="text-center">
            <div className="text-xs font-bold mb-1" style={{ color: '#f0a04b' }}>スタンダードプラン</div>
            <div className="text-5xl font-bold text-white mb-1">
              ¥500<span className="text-base font-normal" style={{ color: 'var(--muted)' }}>/月</span>
            </div>
            <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>チーム全員が無制限で利用可能</div>
            <div className="text-xs font-bold mb-6" style={{ color: '#f0a04b' }}>
              ≈ 選手1人あたり約<span className="text-lg">33</span>円/月
            </div>

            {/* 含まれる機能 */}
            <div className="text-left flex flex-col gap-2 mb-6">
              {included.map(item => (
                <div key={item} className="flex items-center gap-2 text-sm">
                  <span style={{ color: '#10b981' }}>✓</span>
                  <span style={{ color: '#cce8f8' }}>{item}</span>
                </div>
              ))}
            </div>

            <button
              onClick={handleCheckout}
              disabled={loading}
              className="w-full font-bold text-white rounded-2xl py-4 text-base active:scale-95 transition-transform disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #ee7a2f, #c85a14)' }}
            >
              {loading ? '移動中…' : '今すぐ登録する →'}
            </button>
            <p className="text-[11px] mt-3" style={{ color: 'var(--muted)' }}>
              クレジットカードで安全に決済・いつでも解約OK
            </p>
          </div>
        </div>

        {/* 安心の保証 */}
        <div className="grid grid-cols-3 gap-2 text-center mb-6">
          {guarantees.map(g => (
            <div key={g.label} className="card p-3">
              <div className="text-xl mb-1">{g.icon}</div>
              <div className="text-[10px] leading-tight" style={{ color: 'var(--muted)' }}>{g.label}</div>
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-3 flex-wrap text-[10px]" style={{ color: 'var(--muted)' }}>
          <Link href="/tokushoho" className="underline">特定商取引法に基づく表記</Link>
          <Link href="/terms" className="underline">利用規約</Link>
          <Link href="/privacy" className="underline">プライバシーポリシー</Link>
        </div>
      </div>
    </main>
  )
}

export default function UpgradePage() {
  return (
    <Suspense>
      <UpgradeContent />
    </Suspense>
  )
}

const included = [
  '試合記録・スコアシートが無制限',
  'JBA公式スコアシート自動生成',
  'LINEでリアルタイム共有',
  'シーズン統計・CSVエクスポート',
  '5ファウルアウト自動通知',
  'OT（延長戦）対応',
  'タイムアウト管理',
]

const guarantees = [
  { icon: '🔒', label: 'カード情報は\nStripeで安全管理' },
  { icon: '🔄', label: 'いつでも\n解約OK' },
  { icon: '💾', label: 'データは\n消えません' },
]
