// The AI call the legacy platform bundled, now a server function.
// The provider key lives in the function's secrets, never in the browser bundle.
Deno.serve(async (req) => {
  const { prompt, context } = await req.json();
  if (typeof prompt !== 'string' || prompt.length > 4000) return new Response('bad request', { status: 400 });
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': Deno.env.get('ANTHROPIC_API_KEY')!, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-5-5', max_tokens: 800,
      system: context ? `Answer using this site content where relevant:\n${context}` : undefined,
      messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) return new Response('upstream error', { status: 502 });
  const j = await r.json();
  return Response.json({ answer: j.content?.[0]?.text ?? '' });
});
