import assert from 'node:assert/strict';
import test from 'node:test';

// Test the real public route without a provider key or a network call.
process.env.MUSE_API_KEY = 'test-key';
process.env.DATABASE_URL = 'file::memory:';
delete process.env.MUSE_BASE_URL;
delete process.env.MUSE_MODEL;
const { onboardingRoutes } = await import('../routes/onboarding');

test('onboarding validates transcripts, tags with Muse, and reports provider fallbacks', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  const post = (text: string) => onboardingRoutes.request('/ai/interests', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  try {
    globalThis.fetch = async (url, init) => {
      calls++;
      assert.equal(url, 'https://api.meta.ai/v1/chat/completions');
      const body = JSON.parse(String(init?.body));
      assert.equal(body.model, 'muse-spark-1.3');
      assert.match(body.messages[1].content, /climb/);
      return Response.json({ choices: [{ message: { content: JSON.stringify({
        interests: ['climbing', 'board_games'], availability: ['weeknights'],
      }) } }] });
    };
    assert.equal((await post(' ')).status, 400);
    assert.equal((await post('x'.repeat(2001))).status, 400);
    assert.equal(calls, 0);
    const tagged = await post('I climb and play board games after work.');
    assert.equal(tagged.status, 200);
    assert.deepEqual(await tagged.json(), {
      interests: ['climbing', 'board_games'], availability: ['weeknights'], source: 'ai',
    });

    // Unknown tags must never make it through to the UI.
    globalThis.fetch = async () => Response.json({ choices: [{ message: {
      content: '{"interests":["made_up"],"availability":[]}',
    } }] });
    assert.deepEqual(await (await post('Climbing on weekend mornings')).json(), {
      interests: ['climbing'], availability: ['weekend_am'], source: 'fallback',
    });
    globalThis.fetch = async () => { throw new Error('provider offline'); };
    assert.deepEqual(await (await post('Coffee on weekends')).json(), {
      interests: ['coffee'], availability: ['weekend_am', 'weekend_pm'], source: 'fallback',
    });
    assert.deepEqual(await (await post('Coffee on weekday mornings')).json(), {
      interests: ['coffee'], availability: [], source: 'fallback',
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
