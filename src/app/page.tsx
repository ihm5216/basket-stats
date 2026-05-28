import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>

      {/* ===== HERO ===== */}
      <section className="relative min-h-screen flex flex-col overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/hero-basketball.png"
            alt="バスケットボール試合"
            fill
            className="object-cover object-center"
            priority
          />
          {/* Gradient overlay: left side dark for text, right side semi-transparent */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#091929]/95 via-[#091929]/75 to-[#091929]/30" />
          {/* Bottom fade */}
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#091929] to-transparent" />
        </div>

        {/* Header nav */}
        <header className="relative z-20 flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🏀</span>
            <span className="font-bold text-xl text-white tracking-tight">BasketStats</span>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="btn-secondary text-sm py-2 px-4">ログイン</Link>
            <Link href="/signup" className="btn-primary text-sm py-2 px-4">無料で始める</Link>
          </div>
        </header>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex items-center px-6 md:px-16 py-20">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium mb-6 border"
              style={{ background: 'rgba(14,165,233,0.15)', borderColor: 'rgba(14,165,233,0.4)', color: '#38bdf8' }}>
              🎯 月500円でチーム全員が使い放題
            </div>

            <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
              バスケの<br />スタッツを<br />
              <span style={{ color: '#38bdf8' }}>もっと簡単に</span>
            </h1>

            <p className="text-lg mb-10" style={{ color: '#a8d4ec' }}>
              試合中にタップするだけで自動集計。<br />
              シーズン通算の確率・平均得点をひと目で確認。<br />
              URLを送るだけでチーム全員と共有できます。
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/signup" className="btn-primary text-lg px-8 py-4">
                14日間無料で試す
              </Link>
              <Link href="/share/demo" className="btn-secondary text-lg px-8 py-4">
                デモを見る
              </Link>
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div className="relative z-10 flex justify-center pb-8">
          <div className="animate-bounce text-2xl" style={{ color: '#38bdf8' }}>↓</div>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="px-6 py-20 max-w-5xl mx-auto w-full">
        <h2 className="text-2xl md:text-3xl font-bold text-white text-center mb-12">
          記録・集計・共有がこれひとつで
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {features.map((f) => (
            <div key={f.title} className="card text-center">
              <div className="text-4xl mb-4">{f.icon}</div>
              <h3 className="font-bold text-white mb-2">{f.title}</h3>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ===== DIFFERENTIATORS ===== */}
      <section className="px-6 pb-20 max-w-3xl mx-auto w-full">
        <h2 className="text-2xl font-bold text-white text-center mb-8">
          既存アプリで足りなかった機能を全部搭載
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {differentiators.map((d) => (
            <div key={d} className="flex items-start gap-3 p-4 rounded-xl"
              style={{ background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.2)' }}>
              <span style={{ color: '#38bdf8' }} className="mt-0.5 font-bold">✓</span>
              <span className="text-sm" style={{ color: '#cce8f8' }}>{d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section className="px-6 pb-24 max-w-sm mx-auto w-full text-center">
        <div className="card">
          <div className="text-sm mb-1" style={{ color: 'var(--muted)' }}>シンプルな料金</div>
          <div className="text-5xl font-bold text-white mb-1">
            ¥500<span className="text-lg" style={{ color: 'var(--muted)' }}>/月</span>
          </div>
          <div className="text-sm mb-6" style={{ color: 'var(--muted)' }}>チーム全員が無制限で利用可能</div>
          <Link href="/signup" className="btn-primary w-full justify-center text-center block">
            14日間無料で試す
          </Link>
          <p className="text-xs mt-3" style={{ color: 'var(--muted)' }}>クレジットカード不要・いつでも解約OK</p>
        </div>
      </section>

      <footer className="text-center py-6 text-sm border-t" style={{ color: 'var(--muted)', borderColor: 'var(--card-border)' }}>
        © 2025 BasketStats
      </footer>
    </main>
  )
}

const features = [
  { icon: '📱', title: 'スマホ・iPad・PCで動く', desc: 'アプリのインストール不要。ブラウザだけで使えます。' },
  { icon: '⚡', title: 'タップで即記録', desc: '試合中に画面タップだけでスタッツ入力。選手を選んでボタンを押すだけ。' },
  { icon: '📊', title: 'シーズン統計を自動集計', desc: 'FG%・3P%・平均得点など、全試合分を自動で集計・グラフ表示。' },
]

const differentiators = [
  'シーズン・期間別の統計集計',
  '個別スタッツを後から修正可能',
  'オフラインでも記録（後で同期）',
  '試合日付を後から手動設定',
  'シュート成功時に試投を自動カウント',
  'ハーフタイムのチームファウルリセット',
  'CSVエクスポート対応',
  'プレータイム（出場時間）を記録・集計',
]
