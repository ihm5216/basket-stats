'use client'

import { useState } from 'react'
import { useInAppBrowser } from '@/lib/useInAppBrowser'

/**
 * アプリ内ブラウザ（LINE・Instagram等）で開かれたときの案内。
 *
 * SNSのプロフィールリンクから来た訪問者は全員ここを通るので、
 * 長い警告でファーストビューを潰さないよう1〜2行に抑える。
 * 「メール登録ならこのまま進める」ことを先に伝え、
 * Chrome/Safariへ移りたい人向けにURLコピーを用意する。
 */
export default function InAppBrowserNotice() {
  const isInApp = useInAppBrowser()
  const [copied, setCopied] = useState(false)

  if (!isInApp) return null

  async function copyLink() {
    const url = window.location.href
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
    } catch {
      // clipboard APIが使えないWebView向けのフォールバック
      const ta = document.createElement('textarea')
      ta.value = url
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy'); setCopied(true) } catch { /* 失敗時は何も出さない */ }
      document.body.removeChild(ta)
    }
    setTimeout(() => setCopied(false), 3000)
  }

  return (
    <div
      className="w-full mb-4 rounded-xl px-3.5 py-2.5"
      style={{ background: 'rgba(234,179,8,0.10)', border: '1px solid rgba(234,179,8,0.35)' }}
    >
      <p className="text-[11px] leading-relaxed" style={{ color: 'rgba(254,240,138,0.95)' }}>
        アプリ内ブラウザのため<span className="font-bold">Googleログインは使えません</span>。下の<span className="font-bold">メールのボタン</span>ならこのまま進めます。
      </p>
      <button
        type="button"
        onClick={copyLink}
        className="mt-2 text-[11px] font-bold underline active:opacity-60"
        style={{ color: 'rgba(254,240,138,0.95)' }}
      >
        {copied ? '✓ コピーしました。Safari/Chromeに貼り付けてください' : '🔗 リンクをコピーしてブラウザで開く'}
      </button>
    </div>
  )
}
