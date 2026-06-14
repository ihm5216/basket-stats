// Supabase認証エラーをユーザー向けの分かりやすい日本語に変換する。
// 特にメール送信のレート制限（429）は原因が分からないと無限に再試行されるため明示する。
export function authErrorMessage(error: { message?: string; status?: number; code?: string }): string {
  const msg = (error.message ?? '').toLowerCase()
  const code = (error.code ?? '').toLowerCase()

  if (error.status === 429 || msg.includes('rate limit') || msg.includes('too many') || code.includes('over_email_send_rate_limit')) {
    return 'メール送信の回数制限に達しました。少し時間をおいて（数十分〜1時間後）から再度お試しください。'
  }
  if (msg.includes('invalid') && msg.includes('email')) {
    return 'メールアドレスの形式をご確認ください。'
  }
  if (msg.includes('signups not allowed') || msg.includes('signup is disabled')) {
    return '現在、新規登録を受け付けていません。しばらくお待ちください。'
  }
  if (msg.includes('email') && (msg.includes('not') || msg.includes('confirm'))) {
    return 'このメールアドレスは確認が完了していません。届いたメールのリンクをタップしてください。'
  }
  // 原因不明時は実際のメッセージも添える（デバッグのため）
  return `送信に失敗しました。通信環境をご確認のうえ再度お試しください。${error.message ? `（${error.message}）` : ''}`
}
