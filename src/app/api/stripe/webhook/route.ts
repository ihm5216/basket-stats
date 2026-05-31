import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

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

  const supabase = await createClient()

  // 共通: サブスクリプションをDBに保存/更新
  async function upsertSubscription(sub: Stripe.Subscription) {
    const userId = sub.metadata?.user_id
    if (!userId) return

    await supabase.from('subscriptions').upsert({
      user_id: userId,
      stripe_customer_id: sub.customer as string,
      stripe_subscription_id: sub.id,
      status: sub.status,
      current_period_end: new Date((sub as Stripe.Subscription & { current_period_end: number }).current_period_end * 1000).toISOString(),
    }, { onConflict: 'user_id' })
  }

  switch (event.type) {
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
      await upsertSubscription(event.data.object as Stripe.Subscription)
      break

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      await supabase.from('subscriptions').update({ status: 'canceled' })
        .eq('stripe_subscription_id', sub.id)
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
