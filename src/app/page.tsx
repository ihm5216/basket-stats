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
    <main className={`${zenKaku.className} scroll-smooth bg-white text-[#2b2015]`}>
      {/* ===== ヘッダー（sticky・全幅）===== */}
      <header
        className="safe-area-top sticky top-0 z-50 border-b border-[#f5e9d8] bg-white/85"
        style={{ backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' }}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-8">
          <div className="text-[17px] font-black tracking-tight md:text-[19px]">🏀 BasketStats</div>
          <nav className="hidden items-center gap-7 text-[13.5px] font-bold text-[#4c4033] lg:flex">
            <a href="#features" className="hover:text-[#ee7a2f]">機能</a>
            <a href="#how" className="hover:text-[#ee7a2f]">使い方</a>
            <a href="#pricing" className="hover:text-[#ee7a2f]">料金</a>
            <a href="#faq" className="hover:text-[#ee7a2f]">よくある質問</a>
          </nav>
          <div className="flex items-center gap-2.5 md:gap-4">
            <Link href="/login" className="text-[13px] font-bold text-[#c85a14] md:text-[13.5px]">
              ログイン
            </Link>
            <Link
              href="/signup"
              className="rounded-[11px] bg-[#ee7a2f] px-[15px] py-2 text-[13px] font-extrabold text-white transition-colors hover:bg-[#c85a14] md:px-5 md:text-[13.5px]"
            >
              無料で試す
            </Link>
          </div>
        </div>
      </header>

      {/* ===== ヒーロー ===== */}
      <section className="relative overflow-hidden bg-[linear-gradient(180deg,#fffdf9_0%,#fdf1e4_100%)]">
        {/* デスクトップ用の背景装飾 */}
        <div
          aria-hidden
          className="pointer-events-none absolute -right-40 -top-40 hidden h-[560px] w-[560px] rounded-full md:block"
          style={{ background: 'radial-gradient(circle, rgba(238,122,47,.10) 0%, rgba(238,122,47,0) 70%)' }}
        />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pb-14 pt-10 md:grid-cols-[1.05fr_1fr] md:px-8 md:pb-24 md:pt-20">
          {/* 左：コピー */}
          <div>
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-[#fdeeda] px-3.5 py-2 text-[12.5px] font-extrabold text-[#c85a14]">
              🎯 月500円でチーム全員が使い放題
            </div>
            <h1 className="mb-4 text-[31px] font-black leading-[1.26] tracking-[-0.025em] sm:text-[38px] md:mb-6 md:text-[42px] md:leading-[1.2] lg:text-[54px] lg:leading-[1.18]">
              バスケのスタッツを、
              <br />
              <span className="text-[#ee7a2f]">もっと簡単に</span>🏀
            </h1>
            <p className="mb-7 text-[15px] font-medium leading-[1.8] text-[#6f6154] md:text-[16.5px] md:leading-[1.9]">
              試合中にタップするだけで自動集計！JBA公式スコアシートがリアルタイムで完成して、
              <span className="font-extrabold text-[#06c755]">LINEを送るだけ</span>
              でチーム全員に届きます✨
            </p>
            <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:gap-5">
              <PrimaryCTA>3試合 無料で始める →</PrimaryCTA>
              <Link href="/login" className="text-center text-[13px] font-bold text-[#8a7a68] underline-offset-4 hover:underline md:text-left">
                すでにアカウントがある方はこちら
              </Link>
            </div>
            <div className="mt-5 flex flex-wrap justify-center gap-2 md:justify-start">
              {['⭐ 3試合無料', '🔒 カード不要', '📱 インストール不要', '🏀 ミニバス・一般 両対応'].map((c) => (
                <span key={c} className="chip-lp">
                  {c}
                </span>
              ))}
            </div>
          </div>

          {/* 右：自動生成されたJBA公式スコアシート全体（チームA/B・ランニングスコアまで一目で見える） */}
          <div className="relative md:pl-6">
            <div className="mx-auto w-full max-w-[380px] rounded-[18px] bg-white p-2 shadow-[0_30px_60px_-25px_rgba(163,70,8,.4),0_0_0_1px_rgba(163,70,8,.06)] md:max-w-[430px]">
              <Image
                src="/scoresheet-sample.png"
                alt="自動生成されたJBA公式スコアシート全体（チーム名・選手名はサンプル）"
                width={1560}
                height={2320}
                className="h-auto w-full rounded-[12px]"
                sizes="(max-width: 768px) 90vw, 430px"
                preload
              />
            </div>
            <div className="absolute -right-1 -top-4 hidden items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#2b2015] shadow-[0_14px_28px_-12px_rgba(43,32,21,.3)] md:flex">
              📋 JBA公式スコアシート<span className="text-[#ee7a2f]">自動生成</span>
            </div>
            <div className="absolute bottom-10 -left-2 hidden items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-[12.5px] font-extrabold text-[#2b2015] shadow-[0_14px_28px_-12px_rgba(43,32,21,.3)] md:flex">
              <LineIcon size={19} /> LINEで<span className="text-[#06c755]">チームに即共有</span>
            </div>
            <div className="mt-4 text-center text-[11.5px] font-semibold text-[#a89680] md:mt-7 md:pr-2 md:text-right">
              ▲ 自動生成されたスコアシート（チーム名・選手名はサンプル）
            </div>
          </div>
        </div>
      </section>

      {/* ===== 数字で見せる強み（トラストバー）===== */}
      <section className="bg-[linear-gradient(90deg,#ee7a2f_0%,#e8720c_100%)]">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-6 py-8 md:grid-cols-4 md:gap-5 md:px-8 md:py-10">
          {trustStats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-white/25 bg-white/10 px-3 py-5 text-center md:py-6">
              <div className="text-[24px] font-black tracking-tight text-white md:text-[32px]">
                {s.value}
                <span className="ml-0.5 text-[13px] font-extrabold text-[#ffd9bd] md:text-[15px]">{s.unit}</span>
              </div>
              <div className="mt-1 text-[11.5px] font-bold text-[#ffe3cd] md:text-[12.5px]">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== 困りごと（Before）===== */}
      <Section bg="#fff">
        <Eyebrow color="#1f6feb">Before</Eyebrow>
        <SectionTitle className="mb-2">
          こんな困りごと、<br className="md:hidden" />
          ありませんか？
        </SectionTitle>
        <p className="mb-7 text-center text-[13.5px] font-medium text-[#8a7a68] md:mb-10 md:text-[15px]">
          バスケの保護者・スタッフみんなの「あるある」です
        </p>
        <div className="mx-auto grid max-w-4xl gap-3 md:grid-cols-2 md:gap-4">
          {pains.map((p) => (
            <div key={p} className="flex items-start gap-3 rounded-2xl border border-[#eceff5] bg-[#f6f8fc] p-4 md:p-5">
              <span className="text-[20px] leading-[1.4]">😓</span>
              <span className="text-[14px] font-semibold leading-[1.6] text-[#4c4033] md:text-[14.5px]">{p}</span>
            </div>
          ))}
        </div>
        <div className="mt-6 flex flex-col items-center md:mt-8">
          <div className="mb-4 text-[22px] text-[#d9b48d]">↓</div>
          <div className="inline-flex items-center gap-2 rounded-2xl bg-[#ee7a2f] px-6 py-3.5 text-[15px] font-black text-white shadow-[0_14px_26px_-12px_rgba(238,122,47,.6)] md:text-[16px]">
            🏀 BasketStats がぜんぶ解決します！
          </div>
        </div>
      </Section>

      {/* ===== 3ステップ ===== */}
      <Section bg="#fbf4ea" id="how">
        <Eyebrow>How it works</Eyebrow>
        <SectionTitle className="mb-8 md:mb-12">
          3ステップで<br className="md:hidden" />
          今日から始められます！
        </SectionTitle>
        <div className="mx-auto grid max-w-5xl gap-3.5 md:grid-cols-3 md:gap-5">
          {steps.map((s, i) => (
            <div key={s.title} className="card-lp flex items-start gap-4 p-5 md:flex-col md:p-7">
              <div
                className="flex h-[38px] w-[38px] flex-none items-center justify-center rounded-[11px] text-[18px] font-black md:h-[46px] md:w-[46px] md:rounded-[14px] md:text-[21px]"
                style={{ background: stepColors[i].bg, color: stepColors[i].fg }}
              >
                {i + 1}
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-1.5 text-[16px] font-black md:mb-2.5 md:text-[17.5px]">{s.title}</div>
                <div className="text-[13.5px] font-medium leading-[1.7] text-[#6f6154] md:text-[14px]">{s.desc}</div>
                <div className="mt-4">{stepVisuals[i]}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 機能（Features）===== */}
      <Section bg="#fff" id="features">
        <Eyebrow color="#7c5cff">Features</Eyebrow>
        <SectionTitle className="mb-8 md:mb-12">
          記録・集計・共有、<br className="md:hidden" />
          ぜんぶこれひとつ！
        </SectionTitle>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-3 md:gap-5 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.title} className="card-lp p-4 transition-shadow hover:shadow-[0_18px_36px_-20px_rgba(12,26,46,.35)] md:p-7">
              <span
                className="mb-3 flex h-[46px] w-[46px] items-center justify-center rounded-[13px] text-[24px] md:h-[54px] md:w-[54px] md:rounded-2xl md:text-[28px]"
                style={{ background: f.tint }}
              >
                {f.title.startsWith('LINE') ? <LineIcon size={28} /> : f.icon}
              </span>
              <div className="mb-2 text-[14.5px] font-black leading-[1.45] md:text-[16px]">{f.title}</div>
              <div className="text-[12.5px] font-medium leading-[1.65] text-[#6f6154] md:text-[13.5px]">{f.desc}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 実際の画面（Real screen）===== */}
      <Section bg="#fbf4ea">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-16">
          <div className="order-2 md:order-1">
            <div className="flex justify-center md:justify-end">
              <div className="w-[256px] rounded-[30px] bg-white p-2 shadow-[0_28px_54px_-22px_rgba(12,26,46,.45),0_0_0_1px_rgba(12,26,46,.06)] md:w-[300px]">
                <div className="relative h-[444px] w-full overflow-hidden rounded-[22px] md:h-[520px]">
                  <Image
                    src="/running-score-screen.jpg"
                    alt="実際の記録画面（ランニングスコア）"
                    fill
                    className="object-cover object-top"
                    sizes="(max-width: 768px) 240px, 300px"
                  />
                </div>
              </div>
            </div>
            <div className="mt-4 text-center text-[11.5px] font-semibold text-[#a89680] md:text-right">
              ▲ 実際の記録画面（ランニングスコア）
            </div>
          </div>
          <div className="order-1 md:order-2">
            <Eyebrow align="left">Real screen</Eyebrow>
            <SectionTitle className="mb-2 md:text-left" align="left">
              タップだけで、<br className="md:hidden" />
              この通りに完成！
            </SectionTitle>
            <p className="mb-6 text-center text-[13.5px] font-medium text-[#8a7a68] md:text-left md:text-[15px] md:leading-[1.9]">
              JBA公式スコアシートとランニングスコアは、試合中に自動で記入してくれます。手書きの転記ミスも、試合後の集計作業も、まるっとゼロに🙌
            </p>
            <div className="hidden flex-col gap-3 md:flex">
              {['得点・ファウル・タイムアウトをタップで記録', 'ランニングスコアに自動で記入', '共有URLを開けば保護者もリアルタイム観戦'].map((t) => (
                <div key={t} className="flex items-center gap-3 text-[14.5px] font-bold text-[#4c4033]">
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#ee7a2f] text-[13px] font-black text-white">✓</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>

      {/* ===== LINE共有 ===== */}
      <Section bg="#f0faf2">
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-2 md:gap-16">
          <div>
            <Eyebrow color="#06c755" align="left">Share via LINE</Eyebrow>
            <SectionTitle className="mb-2" align="left">
              共有は、LINEに<br className="md:hidden" />
              1通送るだけ。
            </SectionTitle>
            <p className="mb-6 text-center text-[13.5px] font-medium leading-[1.8] text-[#8a7a68] md:text-left md:text-[15px] md:leading-[1.9]">
              スコアのURLをコピーして、いつもの保護者グループにペタッと貼るだけ！受け取る側はインストールも登録もいらないので、おじいちゃん・おばあちゃんもスマホですぐ見られます😊
            </p>
            <div className="flex flex-col gap-3">
              {[
                '会場に来られない家族もリアルタイム観戦',
                '受け取る側はタップするだけ・登録不要',
                '試合後はスコアシートもそのまま見られる',
              ].map((t) => (
                <div key={t} className="flex items-center gap-3 text-[13.5px] font-bold text-[#4c4033] md:text-[14.5px]">
                  <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#06c755] text-[13px] font-black text-white">✓</span>
                  {t}
                </div>
              ))}
            </div>
          </div>
          {/* LINEトーク画面風モックアップ */}
          <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-[24px] shadow-[0_28px_54px_-22px_rgba(12,26,46,.4),0_0_0_1px_rgba(12,26,46,.06)]">
            <div className="flex items-center gap-2.5 bg-[#283a4d] px-4 py-3 text-[13px] font-bold text-white">
              <LineIcon size={22} />
              バスケ保護者グループ（12）
            </div>
            <div className="flex flex-col gap-3 bg-[#8cabd8] p-4 pb-6">
              <div className="max-w-[80%] self-start rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[12.5px] font-semibold leading-[1.6] text-[#222]">
                今日の試合どうだった？🏀
              </div>
              <div className="flex items-end gap-1.5 self-end">
                <span className="text-[9.5px] font-semibold text-white/80">既読 11<br />14:02</span>
                <div className="max-w-[80%] rounded-2xl rounded-tr-md bg-[#8de055] px-3.5 py-2.5 text-[12.5px] font-bold leading-[1.6] text-[#173300]">
                  52-41で勝ちました！🎉
                </div>
              </div>
              <div className="flex items-end gap-1.5 self-end">
                <span className="text-[9.5px] font-semibold text-white/80">既読 11<br />14:03</span>
                <div className="w-[80%] rounded-2xl rounded-tr-md bg-[#8de055] p-1.5">
                  <div className="rounded-xl bg-white px-3 py-2.5">
                    <div className="text-[11px] font-black text-[#2b2015]">🏀 青葉イーグルス vs 白鷹ウィングス</div>
                    <div className="my-1 text-[17px] font-black tracking-tight text-[#ee7a2f]">52 - 41 <span className="text-[10.5px] text-[#e0483e]">勝利！</span></div>
                    <div className="text-[10px] font-bold text-[#8496ad]">basketstats.app/share/… スタッツを見る →</div>
                  </div>
                </div>
              </div>
              <div className="max-w-[80%] self-start rounded-2xl rounded-tl-md bg-white px-3.5 py-2.5 text-[12.5px] font-semibold leading-[1.6] text-[#222]">
                リアルタイムで見てました✨ スコアシートまで見られるのすごい！
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ===== スコアラー機能（ダーク面）===== */}
      <Section bg="#fff">
        <Eyebrow>For scorers</Eyebrow>
        <SectionTitle className="mb-8 md:mb-12">
          スコアラーが<br className="md:hidden" />
          本当に欲しかった機能
        </SectionTitle>
        <div className="mx-auto grid max-w-5xl items-center gap-10 md:grid-cols-[1fr_1.2fr] md:gap-12">
          <div className="grid gap-3 md:gap-y-4">
            {differentiators.map((d) => (
              <div key={d} className="flex items-center gap-3 text-[14px] font-semibold text-[#4c4033] md:text-[15px]">
                <span className="flex h-[22px] w-[22px] flex-none items-center justify-center rounded-full bg-[#ee7a2f] text-[13px] font-black text-white">
                  ✓
                </span>
                {d}
              </div>
            ))}
          </div>
          {/* 選手スタッツ画面の再現（実UIと同配色・選手名はダミー） */}
          <div className="overflow-hidden rounded-2xl border border-[#1a3a56] bg-[#0d2235] shadow-[0_28px_54px_-22px_rgba(12,26,46,.45)]">
            <div className="border-b border-[#1a3a56] px-4 py-3 text-[12.5px] font-bold text-[#6ba8c8] md:px-5">選手スタッツ（自動集計）</div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] border-collapse text-right text-[12px] md:text-[12.5px]">
                <thead>
                  <tr className="text-[11px] font-bold text-[#6ba8c8]">
                    <th className="px-3 py-2.5 text-left md:px-4">#</th>
                    <th className="px-2 py-2.5 text-left">名前</th>
                    <th className="px-2 py-2.5 text-[#f0a04b]">得点</th>
                    <th className="px-2 py-2.5">2P</th>
                    <th className="px-2 py-2.5">3P</th>
                    <th className="px-2 py-2.5">REB</th>
                    <th className="px-3 py-2.5 md:px-4">AST</th>
                  </tr>
                </thead>
                <tbody className="text-[#d3e2f5]">
                  {sampleStats.map((r) => (
                    <tr key={r.no} className="border-t border-[#132c44]">
                      <td className="px-3 py-2.5 text-left font-black text-[#f0a04b] md:px-4">{r.no}</td>
                      <td className="px-2 py-2.5 text-left font-bold">{r.name}</td>
                      <td className="px-2 py-2.5 font-black text-[#f0a04b]">{r.pts}</td>
                      <td className="px-2 py-2.5">{r.p2}</td>
                      <td className="px-2 py-2.5">{r.p3}</td>
                      <td className="px-2 py-2.5">{r.reb}</td>
                      <td className="px-3 py-2.5 md:px-4">{r.ast}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-[#f0a04b]/60 font-black">
                    <td className="px-3 py-2.5 text-left text-[#6ba8c8] md:px-4">–</td>
                    <td className="px-2 py-2.5 text-left text-white">合計</td>
                    <td className="px-2 py-2.5 text-[#f0a04b]">40</td>
                    <td className="px-2 py-2.5">9/11</td>
                    <td className="px-2 py-2.5">5/6</td>
                    <td className="px-2 py-2.5">14</td>
                    <td className="px-3 py-2.5 md:px-4">8</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="border-t border-[#1a3a56] px-4 py-2.5 text-[11px] font-semibold text-[#41648a] md:px-5">
              ▲ 実際の集計画面（選手名はサンプルです）
            </div>
          </div>
        </div>
      </Section>

      {/* ===== 料金（Pricing）===== */}
      <Section bg="#fbf4ea" id="pricing">
        <Eyebrow>Pricing</Eyebrow>
        <SectionTitle className="mb-6 md:mb-10">シンプルな料金</SectionTitle>
        <div className="card-lp mx-auto max-w-md border-2 border-[#ee7a2f] px-6 py-9 text-center shadow-[0_24px_44px_-24px_rgba(238,122,47,.45)] md:px-10">
          <div className="mb-2 flex items-baseline justify-center gap-1">
            <span className="text-[46px] font-black tracking-tight text-[#2b2015] md:text-[54px]">¥500</span>
            <span className="text-[17px] font-extrabold text-[#6f6154]">/月</span>
          </div>
          <div className="mb-1.5 text-[14.5px] font-extrabold text-[#c85a14] md:text-[15.5px]">チーム全員、何試合でも使い放題！</div>
          <div className="mb-6 text-[12.5px] font-semibold text-[#8a7a68]">≈ 選手1人あたり 約33円/月</div>
          <div className="mb-7 flex flex-col gap-2.5 border-t border-[#e6edf6] pt-6 text-left">
            {included.map((t) => (
              <div key={t} className="flex items-center gap-2.5 text-[13.5px] font-bold text-[#4c4033]">
                <span className="flex h-[19px] w-[19px] flex-none items-center justify-center rounded-full bg-[#fdeeda] text-[11px] font-black text-[#c85a14]">✓</span>
                {t}
              </div>
            ))}
          </div>
          <PrimaryCTA full className="mb-3">3試合 無料で始める →</PrimaryCTA>
          <div className="text-[12px] font-bold text-[#9b8a76]">クレジットカード不要・いつでも解約OK</div>
        </div>
      </Section>

      {/* ===== FAQ ===== */}
      <Section bg="#fff" id="faq">
        <Eyebrow>FAQ</Eyebrow>
        <SectionTitle className="mb-7 md:mb-10">よくある質問</SectionTitle>
        <div className="mx-auto flex max-w-3xl flex-col gap-3 md:gap-4">
          {faqs.map((f) => (
            <div key={f.q} className="card-lp p-[19px] md:p-6">
              <div className="mb-2 text-[14px] font-black text-[#2b2015] md:text-[15px]">Q. {f.q}</div>
              <div className="text-[13px] font-medium leading-[1.7] text-[#6f6154] md:text-[14px]">{f.a}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* ===== 最終CTA ===== */}
      <section className="bg-[linear-gradient(180deg,#ee7a2f_0%,#c85a14_100%)] px-6 py-14 text-center md:py-20">
        <div className="mb-6 text-[23px] font-black leading-[1.45] text-white md:text-[32px]">
          まずは気軽に、<br className="md:hidden" />
          無料で試してみてください🏀
        </div>
        <Link
          href="/signup"
          className="mx-auto flex w-full max-w-md items-center justify-center rounded-[15px] bg-white p-[17px] text-[16.5px] font-black text-[#c85a14] shadow-[0_14px_26px_-10px_rgba(0,0,0,.3)] transition-transform hover:scale-[1.02] active:scale-[0.98] md:w-auto md:max-w-none md:px-12"
        >
          3試合 無料で始める →
        </Link>
        <div className="mt-4 text-[12.5px] font-bold text-white/85">クレジットカード不要・いつでも解約OK</div>
      </section>

      {/* ===== フッター ===== */}
      <footer className="pb-safe bg-[#33200f] text-[#d9c2ab]">
        <div className="mx-auto max-w-6xl px-6 pb-10 pt-9 md:px-8">
          <div className="mb-4.5 text-[16px] font-black text-white">🏀 BasketStats</div>
          <div className="mb-5 flex flex-wrap gap-x-[18px] gap-y-3 text-[13px] font-semibold">
            <Link href="/login" className="hover:text-white">ログイン</Link>
            <Link href="/signup" className="hover:text-white">新規登録</Link>
            <Link href="/terms" className="hover:text-white">利用規約</Link>
            <Link href="/privacy" className="hover:text-white">プライバシーポリシー</Link>
            <Link href="/tokushoho" className="hover:text-white">特定商取引法に基づく表記</Link>
          </div>
          <div className="border-t border-white/10 pt-4.5 text-[12px] text-[#9a7c5e]">© 2025 BasketStats</div>
        </div>
      </footer>
    </main>
  )
}

/* ─── LP内ヘルパー ─── */

function Section({ bg, children, id }: { bg: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="scroll-mt-16" style={{ background: bg }}>
      <div className="mx-auto max-w-6xl px-6 py-14 md:px-8 md:py-20">{children}</div>
    </section>
  )
}

function Eyebrow({ children, color = '#ee7a2f', align = 'center' }: { children: React.ReactNode; color?: string; align?: 'center' | 'left' }) {
  return (
    <div
      className={`mb-2.5 text-[12px] font-black uppercase tracking-[.14em] md:text-[13px] ${align === 'center' ? 'text-center' : 'text-center md:text-left'}`}
      style={{ color }}
    >
      {children}
    </div>
  )
}

function SectionTitle({
  children,
  color = '#2b2015',
  className = '',
  align = 'center',
}: {
  children: React.ReactNode
  color?: string
  className?: string
  align?: 'center' | 'left'
}) {
  return (
    <h2
      className={`text-[25px] font-black leading-[1.4] tracking-[-0.01em] md:text-[34px] ${align === 'center' ? 'text-center' : 'text-center md:text-left'} ${className}`}
      style={{ color }}
    >
      {children}
    </h2>
  )
}

function PrimaryCTA({ children, className = '', full = false }: { children: React.ReactNode; className?: string; full?: boolean }) {
  return (
    <Link
      href="/signup"
      className={`flex items-center justify-center gap-1.5 rounded-[15px] bg-[#ee7a2f] p-[17px] text-[16.5px] font-black text-white shadow-[0_14px_26px_-10px_rgba(238,122,47,.65)] transition-transform hover:scale-[1.02] active:scale-[0.98] ${
        full ? 'w-full' : 'w-full md:w-auto md:px-10'
      } ${className}`}
    >
      {children}
    </Link>
  )
}

// LINEブランドカラーの吹き出しアイコン
function LineIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <rect width="40" height="40" rx="9" fill="#06c755" />
      <path
        d="M20 8.5c-6.9 0-12.5 4.6-12.5 10.2 0 5 4.4 9.2 10.4 10 .4.1.95.26 1.09.6.12.3.08.78.04 1.1l-.17 1.05c-.05.3-.24 1.22 1.07.66 1.3-.55 7.1-4.2 9.7-7.2 1.8-2 2.87-4 2.87-6.2C32.5 13.1 26.9 8.5 20 8.5z"
        fill="#fff"
      />
    </svg>
  )
}

/* ─── コンテンツ ─── */

const stepColors = [
  { bg: '#fdeeda', fg: '#e8720c' },
  { bg: '#eaf2fe', fg: '#1f6feb' },
  { bg: '#e4f8ea', fg: '#06a34a' },
]

const trustStats = [
  { value: '¥500', unit: '/月', label: 'チーム全員 使い放題' },
  { value: '3', unit: '試合', label: '無料でお試し' },
  { value: 'JBA', unit: '公式', label: 'スコアシート自動生成' },
  { value: '0', unit: '円', label: '導入コスト・インストール不要' },
]

const pains = [
  '試合中に手書きでスコアシートを書くのが大変で、間違いも多い',
  '来られなかった保護者に結果を連絡するのが毎回面倒',
  'シーズン終了後に、選手の成長を数字で振り返れない',
  '記録係の保護者が固定化されて、負担が偏る',
]

// 各ステップの操作イメージ（実UIを模したミニモックアップ・選手名はダミー）
const stepVisuals = [
  // ① 選手登録フォーム風
  <div key="v1" className="w-full rounded-xl border border-[#f0e2cf] bg-[#fffdf9] p-2.5">
    {[
      ['4', '佐藤 蓮'],
      ['5', '鈴木 大翔'],
      ['6', '高橋 陽向'],
    ].map(([no, name]) => (
      <div key={no} className="mb-1.5 flex items-center gap-2 rounded-lg border border-[#f0e2cf] bg-white px-2.5 py-1.5">
        <span className="flex h-5 w-5 flex-none items-center justify-center rounded-md bg-[#fdeeda] text-[10px] font-black text-[#c85a14]">{no}</span>
        <span className="text-[11px] font-bold text-[#4c4033]">{name}</span>
      </div>
    ))}
    <div className="flex items-center justify-center gap-1 rounded-lg border border-dashed border-[#e0b287] py-1.5 text-[10.5px] font-bold text-[#c85a14]">
      ＋ 選手を追加
    </div>
  </div>,
  // ② 試合中の記録画面風（実アプリと同じダーク基調）
  <div key="v2" className="w-full rounded-xl border border-[#1a3a56] bg-[#0d2235] p-2.5">
    <div className="mb-2 flex gap-1.5">
      {['#4', '#5', '#7'].map((n, j) => (
        <span
          key={n}
          className={`rounded-md px-2 py-1 text-[10px] font-black ${j === 0 ? 'bg-[#ee7a2f] text-white' : 'bg-[#13314b] text-[#6ba8c8]'}`}
        >
          {n}
        </span>
      ))}
    </div>
    <div className="grid grid-cols-3 gap-1.5">
      {['2P成功', '3P成功', 'FT成功', 'REB', 'AST', 'ファウル'].map((b, j) => (
        <span
          key={b}
          className={`rounded-lg py-1.5 text-center text-[10px] font-bold ${j === 0 ? 'bg-[#ee7a2f] text-white' : 'bg-[#13314b] text-[#d3e2f5]'}`}
        >
          {b}
        </span>
      ))}
    </div>
  </div>,
  // ③ LINE共有風
  <div key="v3" className="w-full rounded-xl bg-[#8cabd8] p-2.5">
    <div className="ml-auto w-[85%] rounded-xl rounded-tr-sm bg-[#8de055] p-1.5">
      <div className="rounded-lg bg-white px-2.5 py-1.5">
        <div className="text-[9px] font-black text-[#2b2015]">🏀 青葉イーグルス vs 白鷹ウィングス</div>
        <div className="text-[14px] font-black tracking-tight text-[#c85a14]">
          52 - 41 <span className="text-[8.5px] text-[#e0483e]">勝利！</span>
        </div>
        <div className="text-[8.5px] font-bold text-[#9b8a76]">スタッツを見る →</div>
      </div>
    </div>
    <div className="mt-1.5 w-fit max-w-[75%] rounded-xl rounded-tl-sm bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#222]">
      リアルタイムで見てました✨
    </div>
  </div>,
]

const steps = [
  { title: '選手を登録する', desc: '背番号と名前を入れるだけでOK！写真からAIでまとめて登録もできます📸' },
  { title: '試合中にタップで記録', desc: '選手を選んで「2P成功」をポンッ。あとはJBAスコアシートが自動で出来上がります✨' },
  { title: 'LINEで即共有', desc: 'URLをLINEに貼るだけ！来られなかった家族も、リアルタイムで一緒に応援できます📣' },
]

const features = [
  { icon: '📋', tint: '#fdeeda', title: 'JBA公式スコアシートを自動生成', desc: 'タップするだけでリアルタイムに完成！ランニングスコアもおまかせです' },
  { icon: '📱', tint: '#eaf2fe', title: 'スマホ1台でOK・インストール不要', desc: 'ブラウザだけで使えます。iPhone・Android・iPad・PC、ぜんぶ対応！' },
  { icon: '💬', tint: '#e4f8ea', title: 'LINEで全員と即共有', desc: 'URLを送るだけ！みんなのスマホからリアルタイムで見られます' },
  { icon: '📊', tint: '#f1ecfe', title: 'シーズン統計を自動集計', desc: 'FG%・3P%・平均得点を自動で集計。子どもの成長がひと目でわかります😊' },
]

const differentiators = [
  'ミニバス・一般/中高 切り替え対応（6分Q・3Pなし等も自動切替）',
  'OT（延長戦）完全対応',
  '5ファウルアウトを自動通知',
  '1Q1回のタイムアウト管理',
  '試合ゲームクロック機能',
  'ハーフタイムのチームファウル自動リセット',
  '後からスタッツを修正可能',
  'CSVエクスポート対応',
  'オフラインでも記録（後で自動同期）',
]

// 選手名はすべて架空のサンプル
const sampleStats = [
  { no: 4, name: '佐藤 蓮', pts: 10, p2: '2/3', p3: '2/2', reb: 3, ast: 2 },
  { no: 5, name: '鈴木 大翔', pts: 8, p2: '3/3', p3: '0/1', reb: 4, ast: 1 },
  { no: 7, name: '高橋 陽向', pts: 8, p2: '2/2', p3: '1/1', reb: 2, ast: 3 },
  { no: 10, name: '田中 湊', pts: 7, p2: '1/2', p3: '1/1', reb: 1, ast: 1 },
  { no: 14, name: '伊藤 樹', pts: 5, p2: '1/1', p3: '1/1', reb: 3, ast: 0 },
  { no: 23, name: '渡辺 悠真', pts: 2, p2: '0/0', p3: '0/0', reb: 1, ast: 1 },
]

const included = [
  'チーム全員・試合数無制限',
  'JBA公式スコアシート自動生成',
  'シーズン統計・成長グラフ',
  'LINE共有・リアルタイム観戦',
]

const faqs = [
  { q: '無料期間中にクレジットカードは必要？', a: '不要です！最初の3試合は完全無料。気に入ったら、そのまま月500円で続けられます' },
  { q: 'チームのメンバー全員で使える？', a: 'もちろん！月500円でチーム全員が使い放題。選手・保護者・コーチ、みんなで共有できます' },
  { q: 'ミニバス（U12）でも使える？', a: 'はい！チーム設定でいつでも「ミニバス」と「一般/中高」を切り替えOK。6分クォーター・3Pなし・タイムアウト各Q1回など、ルールに合わせて記録画面とスコアシートが自動で変わります' },
  { q: '公式大会の紙スコアシートは別途必要？', a: '公式大会では紙の提出が求められることがあります。ふだんの練習試合・リーグ戦の記録と共有には、BasketStatsがぴったりです🏀' },
  { q: '途中で解約できる？', a: 'いつでも解約OK！違約金などは一切ありません' },
]
