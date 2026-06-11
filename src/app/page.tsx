import Link from 'next/link'
import Image from 'next/image'

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col" style={{ background: 'var(--background)' }}>

      {/* ===== HERO ===== */}
      <section className="relative min-h-[100svh] flex flex-col overflow-hidden">
        {/* Background image */}
        <div className="absolute inset-0">
          <Image
            src="/hero-basketball.png"
            alt="バスケットボール試合"
            fill
            className="object-cover"
            style={{ objectPosition: 'center center' }}
            priority
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#091929]/97 via-[#091929]/80 to-[#091929]/30" />
          <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-[#091929] to-transparent" />
        </div>

        {/* Header nav — モバイルで見切れないよう最適化 */}
        <header className="relative z-20 flex items-center justify-between px-4 py-3 safe-area-top">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-lg flex-shrink-0">🏀</span>
            <span className="font-bold text-base text-white tracking-tight truncate">BasketStats</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* モバイルではログインを小さく、CTAを目立たせる */}
            <Link href="/login" className="text-xs text-white/70 px-2 py-1.5 hidden xs:block">ログイン</Link>
            <Link href="/login" className="text-xs text-white/70 px-2 py-1.5 xs:hidden">ログイン</Link>
            <Link href="/signup"
              className="text-xs font-bold text-white rounded-full px-4 py-2"
              style={{ background: '#0ea5e9' }}>
              無料で試す
            </Link>
          </div>
        </header>

        {/* Hero content */}
        <div className="relative z-10 flex-1 flex items-center px-5 pt-4 pb-12">
          <div className="w-full max-w-lg">
            {/* バッジ */}
            <div className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold mb-5"
              style={{ background: 'rgba(14,165,233,0.2)', border: '1px solid rgba(14,165,233,0.5)', color: '#38bdf8' }}>
              🎯 月500円 / チーム全員が使い放題
            </div>

            <h1 className="text-[2.6rem] leading-[1.15] font-bold text-white mb-4 tracking-tight">
              バスケの<br />スタッツを<br />
              <span style={{ color: '#38bdf8' }}>もっと簡単に</span>
            </h1>

            <p className="text-sm leading-relaxed mb-2" style={{ color: '#a8d4ec' }}>
              試合中にタップするだけで自動集計。<br />
              JBA公式スコアシートをリアルタイム生成。<br />
              LINEを送るだけでチーム全員と共有。
            </p>

            {/* 信頼バッジ */}
            <div className="flex items-center gap-3 mb-6 mt-3">
              <div className="flex items-center gap-1 text-xs" style={{ color: '#60a5fa' }}>
                <span>⭐</span><span>5試合無料</span>
              </div>
              <div className="flex items-center gap-1 text-xs" style={{ color: '#60a5fa' }}>
                <span>🔒</span><span>カード不要</span>
              </div>
              <div className="flex items-center gap-1 text-xs" style={{ color: '#60a5fa' }}>
                <span>📱</span><span>インストール不要</span>
              </div>
            </div>

            {/* CTA ボタン — モバイルは縦並び */}
            <div className="flex flex-col gap-3 w-full">
              <Link href="/signup"
                className="w-full text-center font-bold text-white rounded-2xl py-4 text-base shadow-lg active:scale-95 transition-transform"
                style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
                5試合 無料で始める →
              </Link>
              <Link href="/login"
                className="w-full text-center font-bold rounded-2xl py-3.5 text-sm active:scale-95 transition-transform"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)', color: 'white' }}>
                すでにアカウントがある方
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ===== 痛みポイント（共感セクション）===== */}
      <section className="px-5 py-14 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-white text-center mb-2">
          こんな困りごとありませんか？
        </h2>
        <p className="text-xs text-center mb-8" style={{ color: 'var(--muted)' }}>バスケの保護者・スタッフ共通の悩み</p>
        <div className="flex flex-col gap-3">
          {pains.map(p => (
            <div key={p} className="flex items-start gap-3 p-3.5 rounded-xl"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <span className="text-red-400 flex-shrink-0 mt-0.5">😓</span>
              <span className="text-sm" style={{ color: '#fca5a5' }}>{p}</span>
            </div>
          ))}
        </div>
        {/* 解決矢印 */}
        <div className="text-center my-6 text-2xl">⬇️</div>
        <div className="text-center font-bold text-white text-lg">
          BasketStats で<span style={{ color: '#38bdf8' }}>全部解決</span>します
        </div>
      </section>

      {/* ===== 使い方3ステップ ===== */}
      <section className="px-5 py-10 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-white text-center mb-8">
          3ステップで試合記録スタート
        </h2>
        <div className="flex flex-col gap-4">
          {steps.map((s, i) => (
            <div key={i} className="flex items-start gap-4 p-4 rounded-2xl"
              style={{ background: 'rgba(14,165,233,0.08)', border: '1px solid rgba(14,165,233,0.2)' }}>
              <div className="w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-base"
                style={{ background: '#0ea5e9', color: 'white' }}>
                {i + 1}
              </div>
              <div>
                <div className="font-bold text-white text-sm mb-0.5">{s.title}</div>
                <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{s.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="px-5 py-10 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-white text-center mb-8">
          記録・集計・共有がこれひとつで
        </h2>
        <div className="flex flex-col gap-4">
          {features.map((f) => (
            <div key={f.title} className="card flex items-start gap-4">
              <div className="text-3xl flex-shrink-0">{f.icon}</div>
              <div>
                <h3 className="font-bold text-white text-sm mb-1">{f.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>{f.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== DIFFERENTIATORS ===== */}
      <section className="px-5 pb-10 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-white text-center mb-6">
          スコアラーが本当に欲しかった機能
        </h2>
        <div className="flex flex-col gap-2">
          {differentiators.map((d) => (
            <div key={d} className="flex items-center gap-3 px-4 py-3 rounded-xl"
              style={{ background: 'rgba(14,165,233,0.07)', border: '1px solid rgba(14,165,233,0.15)' }}>
              <span style={{ color: '#38bdf8' }} className="font-bold flex-shrink-0">✓</span>
              <span className="text-sm" style={{ color: '#cce8f8' }}>{d}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ===== PRICING ===== */}
      <section className="px-5 pb-10 max-w-sm mx-auto w-full text-center">
        <div className="card p-6">
          <div className="text-xs mb-2 font-bold" style={{ color: '#38bdf8' }}>シンプルな料金</div>
          <div className="text-5xl font-bold text-white mb-1">
            ¥500<span className="text-base font-normal" style={{ color: 'var(--muted)' }}>/月</span>
          </div>
          <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>チーム全員が無制限で利用可能</div>
          {/* 換算コスト */}
          <div className="text-xs mb-5 font-bold" style={{ color: '#38bdf8' }}>
            ≈ 選手1人あたり約<span className="text-xl">33</span>円/月
          </div>
          <Link href="/signup"
            className="block w-full text-center font-bold text-white rounded-2xl py-4 text-base shadow-lg active:scale-95 transition-transform mb-3"
            style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
            5試合 無料で始める
          </Link>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>クレジットカード不要・いつでも解約OK</p>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="px-5 pb-16 max-w-lg mx-auto w-full">
        <h2 className="text-xl font-bold text-white text-center mb-6">よくある質問</h2>
        <div className="flex flex-col gap-3">
          {faqs.map(f => (
            <div key={f.q} className="card p-4">
              <div className="font-bold text-white text-sm mb-1.5">Q. {f.q}</div>
              <div className="text-xs leading-relaxed" style={{ color: 'var(--muted)' }}>A. {f.a}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 最終 CTA ===== */}
      <section className="px-5 pb-safe-bottom pb-10 max-w-sm mx-auto w-full text-center">
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>まずは無料で試してみてください</p>
        <Link href="/signup"
          className="block w-full text-center font-bold text-white rounded-2xl py-4 text-base shadow-lg active:scale-95 transition-transform mb-3"
          style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)' }}>
          5試合 無料で始める →
        </Link>
        <p className="text-xs" style={{ color: 'var(--muted)' }}>クレジットカード不要・いつでも解約OK</p>
      </section>

      <footer className="text-center py-6 text-xs border-t px-4" style={{ color: 'var(--muted)', borderColor: 'var(--card-border)' }}>
        <div className="mb-2 flex justify-center gap-4">
          <Link href="/login" className="hover:text-white transition-colors">ログイン</Link>
          <Link href="/signup" className="hover:text-white transition-colors">新規登録</Link>
        </div>
        <div className="mb-2 flex justify-center gap-4 flex-wrap">
          <Link href="/terms" className="hover:text-white transition-colors">利用規約</Link>
          <Link href="/privacy" className="hover:text-white transition-colors">プライバシーポリシー</Link>
          <Link href="/tokushoho" className="hover:text-white transition-colors">特定商取引法に基づく表記</Link>
        </div>
        © 2025 BasketStats
      </footer>
    </main>
  )
}

const pains = [
  '試合中に手書きでスコアシートを書くのが大変で間違いが多い',
  '試合に来られなかった保護者に結果を連絡するのが毎回面倒',
  'シーズン終了後に選手の成長を数字で振り返れない',
  'スコア記録係の保護者が固定化されて負担が偏る',
]

const steps = [
  { title: '選手を登録する', desc: '背番号と名前を入力するだけ。写真からAI一括登録も可能。' },
  { title: '試合中にタップで記録', desc: '選手を選んで「2P成功」などをタップ。JBAスコアシートが自動生成されます。' },
  { title: 'LINEで即共有', desc: 'URLをコピーしてLINEに貼るだけ。来られなかった保護者もリアルタイムで閲覧可能。' },
]

const features = [
  { icon: '📋', title: 'JBA公式スコアシートを自動生成', desc: 'タップするだけでリアルタイムにスコアシートが完成。ランニングスコアも自動記入。' },
  { icon: '📱', title: 'スマホ1台でOK・インストール不要', desc: 'ブラウザだけで使えます。iPhone・Android・iPad・PC全対応。' },
  { icon: '🔗', title: 'LINEで全員と即共有', desc: 'URLを送るだけ。別デバイスからスコアシートをリアルタイム閲覧できます。' },
  { icon: '📊', title: 'シーズン統計を自動集計', desc: 'FG%・3P%・平均得点を全試合分自動集計。選手の成長がひと目でわかります。' },
]

const differentiators = [
  'OT（延長戦）完全対応',
  '5ファウルアウト自動通知',
  '1クォーター1回タイムアウト管理',
  '試合ゲームクロック機能',
  'ハーフタイムのチームファウル自動リセット',
  '後からスタッツを修正可能',
  'CSVエクスポート対応',
  'オフラインでも記録（後で自動同期）',
]

const faqs = [
  { q: '無料期間中にクレジットカードは必要ですか？', a: '不要です。最初の5試合は完全無料でお使いいただけます。それ以降は月500円でご利用いただけます。' },
  { q: 'チームのメンバー全員で使えますか？', a: 'はい。月500円でチーム全員が無制限で使えます。選手・保護者・コーチ全員に共有できます。' },
  { q: 'JBA公式大会の紙スコアシートは別途必要ですか？', a: '公式大会では紙の提出が求められる場合があります。本アプリは練習試合・リーグ戦での記録・共有に最適です。' },
  { q: '途中で解約できますか？', a: 'いつでも解約できます。違約金等は一切ありません。' },
]
