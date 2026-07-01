import Link from 'next/link'
import Image from 'next/image'
import type { Viewport } from 'next'
import { Zen_Kaku_Gothic_New } from 'next/font/google'

// LP専用フォント（このページにスコープ。アプリ本体は既存のシステムフォントのまま）
const zenKaku = Zen_Kaku_Gothic_New({
  weight: ['400', '500', '700', '900'],
  subsets: ['latin'],
  display: 'swap',
  preload: false,
})

// LPは明るいライト基調なので、モバイルのアドレスバー/ステータスバー色を白に上書きする
// （アプリ本体のダーク #091929 は layout.tsx 側でそのまま維持される）
export const viewport: Viewport = {
  themeColor: '#ffffff',
}

export default function Home() {
  return (
    <main
      className={zenKaku.className}
      style={{ background: '#dde6f1', minHeight: '100vh', display: 'flex', justifyContent: 'center' }}
    >
      {/* 480px 中央寄せのモバイル前提カラム */}
      <div
        className="w-full"
        style={{
          maxWidth: 480,
          background: '#fff',
          color: '#0c1a2e',
          minHeight: '100vh',
          boxShadow: '0 0 60px -20px rgba(10,28,54,.25)',
          overflow: 'hidden',
        }}
      >
        {/* ===== ヘッダー（sticky）===== */}
        <header
          className="safe-area-top"
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '13px 20px',
            background: 'rgba(255,255,255,.85)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            borderBottom: '1px solid #eef3f9',
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-.01em' }}>🏀 BasketStats</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Link href="/login" style={{ fontSize: 13, fontWeight: 700, color: '#1f4a86' }}>
              ログイン
            </Link>
            <Link
              href="/signup"
              style={{ fontSize: 13, fontWeight: 800, color: '#fff', background: '#1f6feb', padding: '8px 15px', borderRadius: 11 }}
            >
              無料で試す
            </Link>
          </div>
        </header>

        {/* ===== ヒーロー ===== */}
        <section style={{ padding: '40px 24px 48px', background: 'linear-gradient(180deg,#ffffff 0%,#eef4fd 100%)' }}>
          <div
            className="inline-flex items-center gap-1.5"
            style={{ background: '#eaf2fe', color: '#1657c0', fontSize: 12.5, fontWeight: 800, padding: '8px 14px', borderRadius: 999, marginBottom: 20 }}
          >
            🎯 月500円でチーム全員が使い放題
          </div>
          <h1 style={{ fontSize: 38, lineHeight: 1.26, fontWeight: 900, letterSpacing: '-.025em', marginBottom: 16 }}>
            バスケのスタッツを、
            <br />
            もっと簡単に。
          </h1>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: '#4a5b70', fontWeight: 500, marginBottom: 26 }}>
            試合中にタップするだけで自動集計。JBA公式スコアシートをリアルタイム生成し、LINEを送るだけでチーム全員と共有できます。
          </p>
          <PrimaryCTA style={{ marginBottom: 13 }}>3試合 無料で始める →</PrimaryCTA>
          <div style={{ textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#5d6b7e', marginBottom: 24 }}>
            <Link href="/login" style={{ color: '#5d6b7e' }}>
              すでにアカウントがある方はこちら
            </Link>
          </div>
          <div className="flex flex-wrap justify-center" style={{ gap: 8, marginBottom: 30 }}>
            {['⭐ 3試合無料', '🔒 カード不要', '📱 インストール不要'].map((c) => (
              <span key={c} className="chip-lp">
                {c}
              </span>
            ))}
          </div>
          {/* ヒーロー写真 */}
          <div
            className="relative w-full overflow-hidden"
            style={{ height: 210, borderRadius: 22, boxShadow: '0 20px 40px -22px rgba(31,111,235,.4)' }}
          >
            <Image src="/hero-basketball.jpg" alt="試合中のプレー" fill className="object-cover" sizes="(max-width: 480px) 100vw, 480px" priority />
          </div>
        </section>

        {/* ===== 困りごと（Before）===== */}
        <Section bg="#fff">
          <Eyebrow>Before</Eyebrow>
          <SectionTitle style={{ marginBottom: 8 }}>
            こんな困りごと、
            <br />
            ありませんか？
          </SectionTitle>
          <p style={{ textAlign: 'center', fontSize: 13.5, color: '#6a7b90', fontWeight: 500, marginBottom: 28 }}>
            バスケの保護者・スタッフ共通の悩み
          </p>
          <div className="flex flex-col" style={{ gap: 12 }}>
            {pains.map((p) => (
              <div
                key={p}
                className="flex items-start"
                style={{ gap: 13, padding: '16px 17px', borderRadius: 16, background: '#f6f8fc', border: '1px solid #eceff5' }}
              >
                <span style={{ fontSize: 20, lineHeight: 1.4 }}>😓</span>
                <span style={{ fontSize: 14, lineHeight: 1.6, fontWeight: 600, color: '#3a4a5e' }}>{p}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-col items-center" style={{ marginTop: 22 }}>
            <div style={{ fontSize: 22, color: '#9fb4cc', marginBottom: 16 }}>↓</div>
            <div
              className="inline-flex items-center"
              style={{ gap: 8, background: '#1f6feb', color: '#fff', fontSize: 15, fontWeight: 900, padding: '14px 22px', borderRadius: 14, boxShadow: '0 14px 26px -12px rgba(31,111,235,.6)' }}
            >
              🏀 BasketStats で全部解決します
            </div>
          </div>
        </Section>

        {/* ===== 3ステップ ===== */}
        <Section bg="#f4f8fd">
          <Eyebrow>How it works</Eyebrow>
          <SectionTitle style={{ marginBottom: 30 }}>
            3ステップで
            <br />
            試合記録スタート
          </SectionTitle>
          <div className="flex flex-col" style={{ gap: 14 }}>
            {steps.map((s, i) => (
              <div key={s.title} className="card-lp flex items-start" style={{ padding: '22px 20px', gap: 16 }}>
                <div
                  className="flex items-center justify-center"
                  style={{ flex: '0 0 auto', width: 38, height: 38, borderRadius: 11, background: '#eaf2fe', color: '#1f6feb', fontWeight: 900, fontSize: 18 }}
                >
                  {i + 1}
                </div>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>{s.title}</div>
                  <div style={{ fontSize: 13.5, lineHeight: 1.7, color: '#56697e', fontWeight: 500 }}>{s.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </Section>

        {/* ===== 機能（Features）===== */}
        <Section bg="#fff">
          <Eyebrow>Features</Eyebrow>
          <SectionTitle style={{ marginBottom: 30 }}>
            記録・集計・共有が
            <br />
            これひとつで
          </SectionTitle>
          <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {features.map((f) => (
              <div key={f.title} className="card-lp" style={{ padding: '20px 17px' }}>
                <span style={{ fontSize: 26, display: 'block', marginBottom: 12 }}>{f.icon}</span>
                <div style={{ fontSize: 14.5, fontWeight: 900, lineHeight: 1.45, marginBottom: 8 }}>{f.title}</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.65, color: '#56697e', fontWeight: 500 }}>{f.desc}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ===== 実際の画面（Real screen）===== */}
        <Section bg="#f4f8fd">
          <Eyebrow>Real screen</Eyebrow>
          <SectionTitle style={{ marginBottom: 8 }}>
            タップだけで、
            <br />
            この通りに完成。
          </SectionTitle>
          <p style={{ textAlign: 'center', fontSize: 13.5, color: '#6a7b90', fontWeight: 500, marginBottom: 28 }}>
            JBA公式スコアシートとランニングスコアを、試合中に自動で記入。
          </p>
          <div className="flex justify-center">
            <div
              style={{ width: 256, borderRadius: 30, overflow: 'hidden', background: '#fff', padding: 8, boxShadow: '0 28px 54px -22px rgba(12,26,46,.45), 0 0 0 1px rgba(12,26,46,.06)' }}
            >
              <div className="relative overflow-hidden" style={{ width: '100%', height: 444, borderRadius: 22 }}>
                <Image
                  src="/running-score-screen.jpg"
                  alt="実際の記録画面（ランニングスコア）"
                  fill
                  className="object-cover object-top"
                  sizes="240px"
                />
              </div>
            </div>
          </div>
          <div style={{ textAlign: 'center', fontSize: 11.5, color: '#9aa8bc', fontWeight: 600, marginTop: 16 }}>
            ▲ 実際の記録画面（ランニングスコア）
          </div>
        </Section>

        {/* ===== スコアラー機能（ダーク面）===== */}
        <Section bg="#0c1a2e" style={{ color: '#eaf2ff' }}>
          <Eyebrow color="#5fa8ff">For scorers</Eyebrow>
          <SectionTitle color="#f3f8ff" style={{ marginBottom: 28 }}>
            スコアラーが
            <br />
            本当に欲しかった機能
          </SectionTitle>
          <div className="flex flex-col" style={{ gap: 11 }}>
            {differentiators.map((d) => (
              <div key={d} className="flex items-center" style={{ gap: 11, fontSize: 14, fontWeight: 600, color: '#d3e2f5' }}>
                <span
                  className="flex items-center justify-center"
                  style={{ flex: '0 0 auto', width: 22, height: 22, borderRadius: '50%', background: '#1f6feb', color: '#fff', fontSize: 13, fontWeight: 900 }}
                >
                  ✓
                </span>
                {d}
              </div>
            ))}
          </div>
        </Section>

        {/* ===== 料金（Pricing）===== */}
        <Section bg="#f4f8fd">
          <Eyebrow>Pricing</Eyebrow>
          <SectionTitle style={{ marginBottom: 24 }}>シンプルな料金</SectionTitle>
          <div
            className="card-lp"
            style={{ padding: '34px 24px', textAlign: 'center', border: '2px solid #1f6feb', boxShadow: '0 24px 44px -24px rgba(31,111,235,.45)' }}
          >
            <div className="flex items-baseline justify-center" style={{ gap: 3, marginBottom: 8 }}>
              <span style={{ fontSize: 46, fontWeight: 900, letterSpacing: '-.02em', color: '#0c1a2e' }}>¥500</span>
              <span style={{ fontSize: 17, fontWeight: 800, color: '#56697e' }}>/月</span>
            </div>
            <div style={{ fontSize: 14.5, fontWeight: 800, color: '#1f4a86', marginBottom: 6 }}>チーム全員が無制限で利用可能</div>
            <div style={{ fontSize: 12.5, color: '#6a7b90', fontWeight: 600, marginBottom: 24 }}>≈ 選手1人あたり 約33円/月</div>
            <PrimaryCTA style={{ marginBottom: 13 }}>3試合 無料で始める →</PrimaryCTA>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#7a8aa0' }}>クレジットカード不要・いつでも解約OK</div>
          </div>
        </Section>

        {/* ===== FAQ ===== */}
        <Section bg="#fff">
          <Eyebrow>FAQ</Eyebrow>
          <SectionTitle style={{ marginBottom: 26 }}>よくある質問</SectionTitle>
          <div className="flex flex-col" style={{ gap: 12 }}>
            {faqs.map((f) => (
              <div key={f.q} className="card-lp" style={{ padding: '18px 19px' }}>
                <div style={{ fontSize: 14, fontWeight: 900, color: '#0c1a2e', marginBottom: 8 }}>Q. {f.q}</div>
                <div style={{ fontSize: 13, lineHeight: 1.7, color: '#56697e', fontWeight: 500 }}>{f.a}</div>
              </div>
            ))}
          </div>
        </Section>

        {/* ===== 最終CTA ===== */}
        <section style={{ padding: '52px 24px', background: 'linear-gradient(180deg,#1f6feb 0%,#1657c0 100%)', textAlign: 'center' }}>
          <div style={{ fontSize: 23, fontWeight: 900, color: '#fff', lineHeight: 1.45, marginBottom: 22 }}>
            まずは無料で
            <br />
            試してみてください
          </div>
          <Link
            href="/signup"
            className="flex items-center justify-center w-full active:scale-[0.98] transition-transform"
            style={{ fontWeight: 900, fontSize: 16.5, padding: 17, borderRadius: 15, background: '#fff', color: '#1657c0', boxShadow: '0 14px 26px -10px rgba(0,0,0,.3)', marginBottom: 13 }}
          >
            3試合 無料で始める →
          </Link>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,.85)' }}>クレジットカード不要・いつでも解約OK</div>
        </section>

        {/* ===== フッター ===== */}
        <footer className="pb-safe" style={{ padding: '34px 24px 40px', background: '#0c1a2e', color: '#9db4d0' }}>
          <div style={{ fontSize: 16, fontWeight: 900, color: '#fff', marginBottom: 18 }}>🏀 BasketStats</div>
          <div className="flex flex-wrap" style={{ gap: 18, marginBottom: 22, fontSize: 13, fontWeight: 600 }}>
            <Link href="/login" style={{ color: '#9db4d0' }}>ログイン</Link>
            <Link href="/signup" style={{ color: '#9db4d0' }}>新規登録</Link>
            <Link href="/terms" style={{ color: '#9db4d0' }}>利用規約</Link>
            <Link href="/privacy" style={{ color: '#9db4d0' }}>プライバシーポリシー</Link>
            <Link href="/tokushoho" style={{ color: '#9db4d0' }}>特定商取引法に基づく表記</Link>
          </div>
          <div style={{ fontSize: 12, color: '#5d738f', borderTop: '1px solid rgba(255,255,255,.08)', paddingTop: 18 }}>© 2025 BasketStats</div>
        </footer>
      </div>
    </main>
  )
}

/* ─── LP内ヘルパー ─── */

function Section({ bg, children, style }: { bg: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ padding: '54px 24px', background: bg, ...style }}>{children}</section>
}

function Eyebrow({ children, color = '#1f6feb' }: { children: React.ReactNode; color?: string }) {
  return (
    <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: '.14em', color, textTransform: 'uppercase', textAlign: 'center', marginBottom: 10 }}>
      {children}
    </div>
  )
}

function SectionTitle({ children, color = '#0c1a2e', style }: { children: React.ReactNode; color?: string; style?: React.CSSProperties }) {
  return (
    <h2 style={{ fontSize: 25, fontWeight: 900, lineHeight: 1.4, letterSpacing: '-.01em', textAlign: 'center', color, ...style }}>
      {children}
    </h2>
  )
}

function PrimaryCTA({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <Link
      href="/signup"
      className="flex items-center justify-center gap-1.5 w-full active:scale-[0.98] transition-transform"
      style={{ fontWeight: 900, fontSize: 16.5, padding: 17, borderRadius: 15, background: '#1f6feb', color: '#fff', boxShadow: '0 14px 26px -10px rgba(31,111,235,.65)', ...style }}
    >
      {children}
    </Link>
  )
}

/* ─── コンテンツ ─── */

const pains = [
  '試合中に手書きでスコアシートを書くのが大変で、間違いも多い',
  '来られなかった保護者に結果を連絡するのが毎回面倒',
  'シーズン終了後に、選手の成長を数字で振り返れない',
  '記録係の保護者が固定化されて、負担が偏る',
]

const steps = [
  { title: '選手を登録する', desc: '背番号と名前を入力するだけ。写真からAI一括登録も可能です。' },
  { title: '試合中にタップで記録', desc: '選手を選んで「2P成功」などをタップ。JBAスコアシートが自動生成されます。' },
  { title: 'LINEで即共有', desc: 'URLをコピーしてLINEに貼るだけ。来られなかった保護者もリアルタイムで閲覧できます。' },
]

const features = [
  { icon: '📋', title: 'JBA公式スコアシートを自動生成', desc: 'タップするだけでリアルタイムに完成。ランニングスコアも自動記入。' },
  { icon: '📱', title: 'スマホ1台でOK・インストール不要', desc: 'ブラウザだけで使えます。iPhone・Android・iPad・PC全対応。' },
  { icon: '🔗', title: 'LINEで全員と即共有', desc: 'URLを送るだけ。別デバイスからリアルタイム閲覧できます。' },
  { icon: '📊', title: 'シーズン統計を自動集計', desc: 'FG%・3P%・平均得点を全試合分自動集計。成長がひと目で。' },
]

const differentiators = [
  'OT（延長戦）完全対応',
  '5ファウルアウトを自動通知',
  '1Q1回のタイムアウト管理',
  '試合ゲームクロック機能',
  'ハーフタイムのチームファウル自動リセット',
  '後からスタッツを修正可能',
  'CSVエクスポート対応',
  'オフラインでも記録（後で自動同期）',
]

const faqs = [
  { q: '無料期間中にクレジットカードは必要？', a: '不要です。最初の3試合は完全無料。それ以降は月500円でご利用いただけます。' },
  { q: 'チームのメンバー全員で使える？', a: 'はい。月500円でチーム全員が無制限。選手・保護者・コーチ全員に共有できます。' },
  { q: '公式大会の紙スコアシートは別途必要？', a: '公式大会では紙の提出が求められる場合があります。本アプリは練習試合・リーグ戦での記録・共有に最適です。' },
  { q: '途中で解約できる？', a: 'いつでも解約できます。違約金等は一切ありません。' },
]
