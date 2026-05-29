import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>

      {/* ===== HERO ===== */}
      <section className="relative h-svh flex flex-col overflow-hidden" style={{minHeight: '580px'}}>
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/hero-basketball.png"
            alt="バスケットボール試合"
            fill
            className="object-cover"
            style={{ objectPosition: '60% center' }}
            priority
          />
          {/* Gradient overlay */}
          <div className="absolute inset-0 bg-gradient-to-r from-[#091929]/95 via-[#091929]/75 to-[#091929]/20" />
          <div className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#091929] to-transparent" />
        </div>

        {/* Header nav */}
        <header className="relative z-20 flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏀</span>
            <span className="font-bold text-lg text-white tracking-tight">BasketStats</span>
          </div>
          <div className="flex gap-2">
            <Link href="/login" className="btn-secondary text-sm py-1.5 px-3">ログイン</Link>
            <Link href="/signup" className="btn-primary text-sm py-1.5 px-3">無料で始める</Link>
          </div>
        </header>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex items-center px-5 md:px-16">
          <div className="max-w-xl">
            <div className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium mb-4 border"
              style={{ background: 'rgba(14,165,233,0.15)', borderColor: 'rgba(14,165,233,0.4)', color: '#38bdf8' }}>
              🎯 月500円でチーム全員が使い放題
            </div>

            <h1 className="text-3xl md:text-6xl font-bold text-white leading-tight mb-4">
              バスケの<br />スタッツを<br />
              <span style={{ color: '#38bdf8' }}>もっと簡単に</span>
            </h1>

            <p className="text-sm md:text-lg mb-6" style={{ color: '#a8d4ec' }}>
              試合中にタップするだけで自動集計。<br className="hidden sm:inline" />
              JBA公式スコアシートをリアルタイム生成。<br className="hidden sm:inline" />
              URLを送るだけでチーム全員と共有できます。
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <Link href="/signup" className="btn-primary px-6 py-3 text-base">
                14日間無料で試す
              </Link>
              <Link href="/login" className="btn-secondary px-6 py-3 text-base">
                ログインして試合記録へ
              </Link>
            </div>
          </div>
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
          スコアラーが本当に欲しかった機能
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
  { icon: '📊', title: 'シーズン統計を自動集計', desc: 'FG%・3P%・平均得点など、全試合分を自動で集計。JBA公式スコアシートも生成。' },
]

const differentiators = [
  'JBA公式スコアシートをリアルタイム生成',
  'OT（延長戦）対応・5ファウルアウト自動通知',
  'LINE共有で別デバイスからリアルタイム閲覧',
  '個別スタッツを後から修正可能',
  'オフラインでも記録（後で同期）',
  'ハーフタイムのチームファウルリセット',
  'タイムアウト残数の管理',
  'CSVエクスポート対応',
]
