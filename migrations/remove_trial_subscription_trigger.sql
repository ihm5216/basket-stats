-- ─────────────────────────────────────────────────────────────────────
-- 修正: 新規ユーザーに 'trialing'（有料扱い）サブスクを自動付与していた
-- トリガーを修正する。無料枠は「5試合」でアプリ側がカウント管理するため、
-- subscriptions 行は Stripe 決済時に Webhook が作成するもののみでよい。
--
-- 実行方法: Supabase ダッシュボード → SQL Editor に貼り付けて Run
-- ─────────────────────────────────────────────────────────────────────

-- 1. トリガー関数から trialing サブスク作成を削除（チーム作成は残す）
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.raw_user_meta_data->>'team_name' IS NOT NULL AND NEW.raw_user_meta_data->>'team_name' != '' THEN
    INSERT INTO teams (user_id, name)
    VALUES (NEW.id, NEW.raw_user_meta_data->>'team_name');
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. 既存ユーザーに残っている trialing 行を掃除
--    （Stripe決済していないのに有料扱いになるのを防ぐ。
--      アプリ側も 'active' のみ有料と判定するよう修正済みなので、
--      このUPDATEは保険。実行しても安全）
UPDATE subscriptions SET status = 'canceled'
WHERE status = 'trialing' AND stripe_subscription_id IS NULL;
