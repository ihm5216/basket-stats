import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY が設定されていません' },
      { status: 500 }
    )
  }

  const formData = await request.formData()
  const file = formData.get('image') as File | null
  if (!file) {
    return NextResponse.json({ error: '画像が指定されていません' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = (
    file.type === 'image/png' ? 'image/png' :
    file.type === 'image/webp' ? 'image/webp' :
    file.type === 'image/gif' ? 'image/gif' :
    'image/jpeg'
  ) as 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif'

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `この日本バスケットボール協会（JBA）の公式記録用紙の写真から情報を読み取ってください。

【重要な列の説明】
- 左端の「No」列：行番号（1,2,3...）→ 不要
- 「ライセンスNo.」列：3桁の数字 → 不要
- 「選手氏名 Players」列：選手の氏名 → 必要（姓名のスペースは除いて続けて書く）
- 右端の「No.」列（小さい列）：背番号（ユニフォームの番号）→ 必要

また用紙上部の「チーム Team」欄のチーム名も読み取ってください。

氏名欄と背番号欄が両方ある行だけを抽出してください。空欄行は除外してください。

以下のJSON形式のみで返してください（他のテキスト不要）：
{"team_name":"チーム名","players":[{"number":"背番号","name":"選手氏名"},...]}`
          },
        ],
      }],
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('Anthropic API error:', errorText)
    return NextResponse.json({ error: `API エラー: ${response.status}` }, { status: 500 })
  }

  const data = await response.json()
  const text = (data.content?.[0]?.text ?? '') as string

  // マークダウンコードブロックを除去してJSONを抽出
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim()

  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) {
    console.error('No JSON found in response:', text)
    return NextResponse.json({ error: '選手データを読み取れませんでした' }, { status: 500 })
  }

  try {
    const parsed = JSON.parse(match[0])
    return NextResponse.json(parsed)
  } catch (e) {
    console.error('JSON parse error:', e, 'text:', match[0])
    return NextResponse.json({ error: 'JSON解析エラー' }, { status: 500 })
  }
}
