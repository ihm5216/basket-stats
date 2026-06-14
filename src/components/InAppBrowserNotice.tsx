'use client'

import { useEffect, useState } from 'react'

// LINE等のアプリ内ブラウザ（WebView）を検出する。
// これらの環境ではGoogleが「Use secure browsers」ポリシーで
// OAuthログインをブロックする（エラー403: disallowed_useragent）ため、
// ユーザーに「外部ブラウザで開く」か「メール登録」を案内する。
function detectInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent || ''
  const patterns = [
    /Line\//i,            // LINE
    /FBAN|FBAV|FB_IAB/i,  // Facebook
    /Instagram/i,         // Instagram
    /Messenger/i,         // Messenger
    /Twitter/i,           // X / Twitter
    /TikTok|musical_ly/i, // TikTok
    /KAKAOTALK/i,         // KakaoTalk
    /Snapchat/i,          // Snapchat
    /; wv\)/i,            // 汎用Android WebView
  ]
  return patterns.some(p => p.test(ua))
}

export default function InAppBrowserNotice() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    setShow(detectInAppBrowser())
  }, [])

  if (!show) return null

  return (
    <div className="w-full mb-5 rounded-2xl border-2 border-yellow-500/50 bg-yellow-500/10 px-4 py-3">
      <p className="text-yellow-300 text-sm font-bold mb-1.5">⚠️ アプリ内ブラウザで開いています</p>
      <p className="text-yellow-100/85 text-xs leading-relaxed mb-2">
        この画面（LINEなどの簡易ブラウザ）では、Googleの仕様で「Googleで登録／ログイン」が
        ブロックされます。下のどちらかでご利用ください。
      </p>
      <ul className="text-yellow-100/85 text-xs leading-relaxed list-disc pl-4 space-y-1">
        <li>右上の「⋯」または共有マーク →「ブラウザで開く」でChrome/Safariで開く</li>
        <li>または下の「<span className="font-bold">メールアドレスで登録</span>」を使う（この画面でも使えます）</li>
      </ul>
    </div>
  )
}
