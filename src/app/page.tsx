import Link from 'next/link'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col">
      <header className="flex items-center justify-between px-4 py-3 border-b border-[var(--card-border)]">
        <div className="flex items-center gap-2">
          <span className="text-xl">🏀</span>
          <span className="font-bold text-lg text-white">BasketStats</span>
        </div>
        <div className="flex gap-2">
          <Link href="/login" className="btn-secondary text-sm py-2 px-3">ログイン</Link>
          <Link href="/signup" className="btn-primary text-sm py-2 px-3">無料で始める</Link>
        </div>
      </header>

      <section className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="inline-flex items-center gap-2 bg-orange-500/10 border border-orange-500/30 rounded-full px-4 py-1.5 text-orange-400 text-sm font-medium mb-6">
          🎯 月500円でチーム全員が使い放題
        </div>
        <h1 className="text-4xl md:text-6xl font-bold text-white leading-tight mb-6">
          バスケのスタッツを<br />
          <span className="text-orange-500">もっと簡単に</span>
        </h1>
        <p className="text-[var(--muted)] text-lg max-w-xl mb-10">
          試合中にタップするだけで自動集計。シーズン通算の確率・平均得点をひと目で確認。
          URLを送るだけでチーム全員と共有できます。
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/signup" className="btn-primary text-lg px-8 py-4">
            14日間無料で試す
          </Link>
          <Link href="/share/demo" className="btn-secondary text-lg px-8 py-4">
            デモを見る
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-20 max-w-3xl w-full text-left">
          {features.map((f) => (
            <div key={f.title} className="card">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="font-bold text-white mb-1">{f.title}</h3>
              <p className="text-sm text-[var(--muted)]">{f.desc}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 max-w-2xl w-full">
          <h2 className="text-2xl font-bold text-white mb-6">既存アプリで足りなかった機能を全部搭載</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-left">
            {differentiators.map((d) => (
              <div key={d} className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
                <span className="text-green-400 mt-0.5">✓</span>
                <span className="text-sm text-gray-300">{d}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-16 card max-w-sm w-full text-center">
          <div className="text-[var(--muted)] text-sm mb-1">シンプルな料金</div>
          <div className="text-5xl font-bold text-white mb-1">¥500<span className="text-lg text-[var(--muted)]">/月</span></div>
          <div className="text-[var(--muted)] text-sm mb-6">チーム全員が無制限で利用可能</div>
          <Link href="/signup" className="btn-primary w-full justify-center">
            14日間無料で試す
          </Link>
          <p className="text-xs text-[var(--muted)] mt-3">クレジットカード不要・いつでも解約OK</p>
        </div>
      </section>

      <footer className="text-center py-6 text-[var(--muted)] text-sm border-t border-[var(--card-border)]">
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
