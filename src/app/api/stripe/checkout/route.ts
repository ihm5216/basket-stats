import { NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: Request) {
  try {
    const stripeKey = process.env.STRIPE_SECRET_KEY
    const priceId = process.env.STRIPE_PRICE_ID

    if (!stripeKey || stripeKey === 'your_stripe_secret_key') {
      return NextResponse.json({ error: 'Stripe未設定です。.env.localを確認してください。' }, { status: 400 })
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: '未ログイン' }, { status: 401 })

    const stripe = new Stripe(stripeKey)
    const origin = req.headers.get('origin') ?? 'http://localhost:3000'

    // 既存の顧客IDを確認
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle()

    // Stripe Checkout セッション作成
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer: sub?.stripe_customer_id || undefined,
      customer_email: !sub?.stripe_customer_id ? user.email : undefined,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { user_id: user.id },
      },
      success_url: `${origin}/dashboard?upgraded=1`,
      cancel_url: `${origin}/upgrade?canceled=1`,
      locale: 'ja',
      metadata: { user_id: user.id },
    })

    return NextResponse.json({ url: session.url })
  } catch (err) {
    console.error('Stripe checkout error:', err)
    return NextResponse.json({ error: 'チェックアウトの作成に失敗しました' }, { status: 500 })
  }
}
