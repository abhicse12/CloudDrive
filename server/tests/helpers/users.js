import { createAgent } from './http.js';

let counter = 0;

/**
 * Registers a fresh user and returns a browser-like client that is logged in as them.
 *   const alice = await loginAsNewUser(app);
 *   await alice.post('/api/folders').send({ name: 'Docs' });
 */
export async function loginAsNewUser(app, { name = 'Test User' } = {}) {
  counter += 1;
  const client = await createAgent(app);
  const res = await client.post('/api/auth/register').send({
    name,
    email: `user${counter}-${Date.now()}@example.com`,
    password: 'test-password-123',
  });
  if (res.status !== 201) throw new Error(`Registration failed: ${JSON.stringify(res.body)}`);
  client.user = res.body.data.user;
  return client;
}
