import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    if (!stripeKey || stripeKey === 'your_stripe_secret_key') {
      return NextResponse.json({ error: 'Stripe未設定' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未ログイン' }, { status: 401 })

    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!sub?.stripe_customer_id) {
      return NextResponse.json({ error: 'サブスクリプションが見つかりません' }, { status: 404 })
    }

    const stripe = new Stripe(stripeKey)
    const origin = req.headers.get('origin') ?? 'http://localhost:3000'
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: `${origin}/dashboard`,
    })

    return NextResponse.json({ url: portalSession.url })
  } catch (err) {
    console.error('Portal error:', err)
    return NextResponse.json({ error: 'ポータルの作成に失敗しました' }, { status: 500 })
  }
}
