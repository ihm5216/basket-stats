# BasketStats セットアップ手順

## 1. Supabase（データベース）の設定

1. https://supabase.com にアクセスし、無料アカウントを作成
2. 「New project」でプロジェクトを作成（名前: basket-stats）
3. 左メニューの「SQL Editor」を開く
4. このフォルダの `supabase_schema.sql` の内容を全選択してエディタに貼り付け、「Run」を押す
5. 左メニューの「Project Settings → API」を開き以下をコピー:
   - `URL` → `.env.local` の `NEXT_PUBLIC_SUPABASE_URL` に貼り付け
   - `anon public` → `.env.local` の `NEXT_PUBLIC_SUPABASE_ANON_KEY` に貼り付け
   - `service_role` → `.env.local` の `SUPABASE_SERVICE_ROLE_KEY` に貼り付け

## 2. Stripe（決済）の設定

1. https://stripe.com/jp でアカウントを作成
2. ダッシュボードの「開発者 → APIキー」から:
   - 公開可能キー → `.env.local` の `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
   - シークレットキー → `.env.local` の `STRIPE_SECRET_KEY`
3. 「製品カタログ」→「製品を追加」→「月額500円の商品」を作成
   - 価格ID（price_xxx）→ `.env.local` の `STRIPE_PRICE_ID`

## 3. ローカルで起動

```bash
cd basket-stats
npm run dev
```

ブラウザで http://localhost:3000 を開く

## 4. Vercel にデプロイ（公開）

1. https://github.com でアカウント作成
2. 「New repository」→「basket-stats」で作成
3. このフォルダをGitHubにプッシュ（詳細は別途案内）
4. https://vercel.com でアカウント作成（GitHubでログイン）
5. 「Add New Project」→ GitHubのリポジトリを選択
6. 「Environment Variables」に `.env.local` の内容を全部入力
7. 「Deploy」を押すと公開URL（xxx.vercel.app）が発行される

## 5. 環境変数（.env.local）

```
NEXT_PUBLIC_SUPABASE_URL=           ← Supabaseから
NEXT_PUBLIC_SUPABASE_ANON_KEY=      ← Supabaseから
SUPABASE_SERVICE_ROLE_KEY=          ← Supabaseから
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY= ← Stripeから
STRIPE_SECRET_KEY=                  ← Stripeから
STRIPE_WEBHOOK_SECRET=              ← Stripeから（後で設定）
STRIPE_PRICE_ID=                    ← Stripeから
NEXT_PUBLIC_APP_URL=https://あなたのURL.vercel.app
```
