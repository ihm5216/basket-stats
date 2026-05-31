-- Migration: subscriptions テーブル作成
-- Stripe サブスクリプション情報を管理
-- Supabase SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS subscriptions (
  id                     uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id                uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id     text,
  stripe_subscription_id text,
  status                 text DEFAULT 'none',
  -- 'active' | 'canceled' | 'past_due' | 'trialing' | 'none'
  current_period_end     timestamptz,
  created_at             timestamptz DEFAULT now(),
  UNIQUE(user_id)
);

-- RLS（行レベルセキュリティ）
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- ユーザーは自分のサブスクリプションのみ参照可能
CREATE POLICY "Users can view own subscription"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

-- Webhookは service_role キーで更新するため INSERT/UPDATE は許可しない
-- （Stripe webhook が SUPABASE_SERVICE_ROLE_KEY で更新する）
