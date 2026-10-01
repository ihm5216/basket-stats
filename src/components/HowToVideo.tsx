'use client'

import { useEffect, useState } from 'react'

// 小さなサムネをタップすると全画面で使い方動画を再生する。
// 体育館の弱い電波を考えて、タップされるまで動画本体は読み込まない。
export default function HowToVideo({ src, poster, label }: { src: string; poster: string; label: string }) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group relative w-20 flex-shrink-0 overflow-hidden rounded-lg border border-orange-500/50"
        aria-label={`${label}を再生`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={poster} alt="" className="block aspect-[9/16] w-full object-cover opacity-80" />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/35">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-orange-500 pl-0.5 text-sm text-white shadow">▶</span>
          <span className="text-[10px] font-bold text-white">{label}</span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/85 p-4"
          onClick={() => setOpen(false)}
        >
          <video
            src={src}
            poster={poster}
            autoPlay
            muted
            loop
            playsInline
            className="max-h-[80vh] w-auto max-w-full rounded-xl"
            onClick={e => e.stopPropagation()}
          />
          <button type="button" onClick={() => setOpen(false)} className="btn-secondary text-sm py-2 px-6">
            閉じる
          </button>
        </div>
      )}
    </>
  )
}
