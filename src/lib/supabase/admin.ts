import { createClient } from '@supabase/supabase-js'

/**
 * サービスロール（service_role）で動くサーバ専用 Supabase クライアント。
 *
 * RLS をバイパスできるため、**サーバ（Route Handler）内でのみ**使用すること。
 * クライアント（ブラウザ）に絶対に露出させない。用途:
 *  - チームログインのパスワード照合（team_credentials は本人/メンバーから読めないため）
 *  - チームメンバー登録（team_members への INSERT）
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase のサービスロール設定が見つかりません（SUPABASE_SERVICE_ROLE_KEY）。')
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
