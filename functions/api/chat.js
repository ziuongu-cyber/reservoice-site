export async function onRequestPost(context) {
  try {
    const { request, env } = context;
    const body = await request.json().catch(() => ({}));
    const message = (body.message || '').trim();

    if (!message) {
      return json({ error: 'Missing message' }, 400);
    }

    if (!env.XAI_API_KEY_2 && !env.XAI_API_KEY) {
      return json({
        error: 'Chat backend is not configured yet.',
        detail: 'Set XAI_API_KEY_2 or XAI_API_KEY as a Pages environment variable.'
      }, 503);
    }

    const systemPrompt = `You are a support assistant for an early-stage startup website.

The startup is building an AI phone receptionist for restaurants focused on Germany-first, multilingual reservation workflows.

Your job is to answer visitor questions clearly, briefly, and accurately.

What you can help with:
- what the product does
- who it is for
- current stage
- languages supported
- what the prototype/demo shows
- how to request a demo
- how to contact the team

Known facts:
- The product is an AI phone receptionist for restaurants.
- It is focused on restaurant reservation calls and related guest phone interactions.
- It is an early prototype, not a fully launched product.
- It is focused on Germany-first restaurant workflows.
- It is designed around multilingual guest communication.
- The site includes a prototype demo and a contact/demo request path.
- Contact email: hello@reservoice.tech
- The website is: https://reservoice.tech

Tone:
- brief
- helpful
- calm
- confident
- not robotic
- not overly salesy
- plain text only
- no markdown formatting
- no bullet stars
- avoid em dashes

Rules:
- Do not invent traction, customers, pilots, partnerships, or numbers.
- Do not invent pricing, business hours, addresses, or technical claims not provided.
- Do not pretend the product is fully live if it is still prototype-stage.
- If a question asks for unknown business details, say: “I’m not fully sure about that yet — please contact hello@reservoice.tech for the most accurate details.”
- If a visitor wants to explore the product, suggest the prototype demo and demo request path.
- Keep answers short unless the user asks for more detail.
- Use the exact brand spelling: ReserVoice.
- Do not write markdown like **bold** or bullet points with *.
- Prefer simple sentences and standard punctuation.
- Avoid em dashes; use commas or short sentences instead.`;

    const apiKey = env.XAI_API_KEY_2 || env.XAI_API_KEY;
    const resp = await fetch('https://api.x.ai/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4.20-reasoning',
        input: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: message }
        ]
      })
    });

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return json({ error: 'Upstream xAI request failed', detail: data }, 502);
    }

    let answer = extractText(data) || 'I'm not fully sure about that yet, please contact hello@reservoice.tech for the most accurate details.';
    answer = sanitizeAnswer(answer);
    return json({ answer });
  } catch (error) {
    return json({ error: 'Unexpected server error', detail: String(error) }, 500);
  }
}

function extractText(data) {
  if (typeof data.output_text === 'string' && data.output_text.trim()) return data.output_text.trim();
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (typeof c.text === 'string' && c.text.trim()) return c.text.trim();
          if (typeof c.output_text === 'string' && c.output_text.trim()) return c.output_text.trim();
        }
      }
    }
  }
  return null;
}


function sanitizeAnswer(text) {
  return String(text)
    .replace(/\*\*/g, '')
    .replace(/^\s*[*-]\s+/gm, '')
    .replace(/—/g, ', ')
    .replace(/Reservoice|Reservoice|reservoice/gi, 'ReserVoice')
    .replace(/
{3,}/g, '\n\n')
    .trim();
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
