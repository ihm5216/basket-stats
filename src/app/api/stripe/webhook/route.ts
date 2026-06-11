import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

// Stripeのstatusをアプリで扱う4種に正規化（CHECK制約: active/canceled/past_due/trialing）
function mapStatus(s: Stripe.Subscription.Status): 'active' | 'canceled' | 'past_due' | 'trialing' {
  if (s === 'active' || s === 'trialing') return s
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete') return 'past_due'
  return 'canceled' // canceled / incomplete_expired / paused
}

// 新しいStripe APIでは current_period_end が subscription items 側に移動した
function periodEnd(sub: Stripe.Subscription): string | null {
  const item = sub.items?.data?.[0] as (Stripe.SubscriptionItem & { current_period_end?: number }) | undefined
  const ts = item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end
  return ts ? new Date(ts * 1000).toISOString() : null
}

export async function POST(req: Request) {
  const stripeKey = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripeKey || stripeKey === 'your_stripe_secret_key') {
    return NextResponse.json({ error: 'Stripe未設定' }, { status: 400 })
  }

  const stripe = new Stripe(stripeKey)
  const body = await req.text()
  const sig = req.headers.get('stripe-signature') ?? ''

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret ?? '')
  } catch (err) {
    console.error('Webhook signature verification failed:', err)
    return NextResponse.json({ error: 'Webhook署名エラー' }, { status: 400 })
  }

  // Webhookにはユーザーのセッションがないため、anonキーだとRLSで書き込みが
  // すべて弾かれる。サービスロールキーでRLSを越えて書き込む。
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  // 共通: サブスクリプションをDBに保存/更新
  async function upsertSubscription(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id
    if (!userId) {
      console.error('Webhook: subscription without user_id metadata:', sub.id)
      return
    }

    const { error } = await supabase.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      status: mapStatus(sub.status),
      current_period_end: periodEnd(sub),
    }, { onConflict: 'user_id' })

    if (error) console.error('Webhook: subscriptions upsert failed:', error.message)
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await upsertSubscription(event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const { error } = await supabase.from('subscriptions').update({ status: 'canceled' })
        .eq('stripe_subscription_id', sub.id)
      if (error) console.error('Webhook: cancel update failed:', error.message)
      break
    }

    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      if (session.mode === 'subscription' && session.subscription) {
        const fullSub = await stripe.subscriptions.retrieve(session.subscription as string)
        const userId = session.metadata?.user_id
        if (userId) {
          fullSub.metadata = { ...fullSub.metadata, user_id: userId }
          await upsertSubscription(fullSub)
        }
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
