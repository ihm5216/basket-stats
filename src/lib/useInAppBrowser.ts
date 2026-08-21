'use client'

import { useEffect, useState } from 'react'

/**
 * LINE・Instagram等のアプリ内ブラウザ（WebView）を検出する。
 *
 * これらの環境ではGoogleが「Use secure browsers」ポリシーで
 * OAuthログインをブロックする（エラー403: disallowed_useragent）。
 * SNSのプロフィールリンクから来た訪問者は全員この環境で開くため、
 * Googleボタンを主導線にすると必ず行き止まりになる。
 */
export function detectInAppBrowser(): boolean {
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

/**
 * アプリ内ブラウザなら true。
 * 初回描画は必ず false を返す（サーバ側の描画と一致させ、
 * ハイドレーションのズレを避けるため）。
 */
export function useInAppBrowser(): boolean {
  const [isInApp, setIsInApp] = useState(false)
  useEffect(() => { setIsInApp(detectInAppBrowser()) }, [])
  return isInApp
}
