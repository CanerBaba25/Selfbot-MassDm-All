'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { broadcast, NORMAL_PACING, SAFE_PACING } = require('../util/broadcast');

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function recipients(count, sent, failure = () => undefined) {
  return Array.from({ length: count }, (_, index) => ({
    id: String(index + 1),
    async send(payload) {
      sent.push({ index: index + 1, payload });
      const error = failure(index + 1);
      if (error) throw error;
    },
  }));
}

test('normal defaults wait one second per attempt and add five minutes before recipients 21 and 41', async () => {
  const sent = [];
  const waits = [];
  const payload = { content: 'Announcement' };
  const result = await broadcast(recipients(41, sent), payload, {
    wait: async (milliseconds) => waits.push({ milliseconds, after: sent.length }),
  });
  assert.deepEqual(NORMAL_PACING, { delayMs: 1000, batchSize: 20, batchCooldownMs: 300_000 });
  assert.deepEqual(waits.filter((item) => item.milliseconds === 300_000), [
    { milliseconds: 300_000, after: 20 }, { milliseconds: 300_000, after: 40 },
  ]);
  assert.equal(waits.filter((item) => item.milliseconds === 1000).length, 40);
  assert.deepEqual(waits.filter((item) => item.after === 20).map((item) => item.milliseconds), [1000, 300_000]);
  assert.deepEqual(waits.filter((item) => item.after === 40).map((item) => item.milliseconds), [1000, 300_000]);
  assert.ok(sent.every((item) => item.payload === payload));
  assert.deepEqual(result, { sent: 41, failed: 0, remaining: 0, cancelled: false });
});

test('ending at recipient 20 does not add an unnecessary final wait or cooldown', async () => {
  const sent = [];
  const waits = [];
  await broadcast(recipients(20, sent), 'Message', { wait: async (delay) => waits.push(delay) });
  assert.deepEqual(waits, Array(19).fill(1000));
});

test('both successful and failed attempts count toward the 20-recipient cooldown', async () => {
  const sent = [];
  const cooldowns = [];
  const attempts = [];
  const result = await broadcast(recipients(21, sent, (index) => index % 2 === 0 ? { code: 50007 } : undefined), 'Message', {
    wait: async () => {},
    onAttempt: async (attempt) => attempts.push(attempt),
    onCooldown: async (progress) => cooldowns.push(progress),
  });
  assert.equal(attempts.length, 21);
  assert.deepEqual(attempts[1], { userId: '2', success: false, errorCode: 50007 });
  assert.deepEqual(cooldowns, [{ sent: 10, failed: 10, remaining: 1, cancelled: false,
    attempted: 20, total: 21, delayMs: 300_000 }]);
  assert.deepEqual(result, { sent: 11, failed: 10, remaining: 0, cancelled: false });
});

for (const cooldown of [false, true]) {
  test(`cancelling during ${cooldown ? 'a batch cooldown' : 'a normal delay'} stops the next delivery`, async () => {
    const controller = new AbortController();
    const sent = [];
    const stopAtDelay = cooldown ? 300_000 : 1000;
    const result = await broadcast(recipients(21, sent), 'Message', {
      signal: controller.signal,
      wait: async (delay, unused, options) => {
        assert.equal(options.signal, controller.signal);
        if (delay === stopAtDelay) {
          controller.abort();
          throw new DOMException('Stopped', 'AbortError');
        }
      },
    });
    const delivered = cooldown ? 20 : 1;
    assert.equal(sent.length, delivered);
    assert.deepEqual(result, { sent: delivered, failed: 0, remaining: 21 - delivered, cancelled: true });
  });
}

test('an already-cancelled campaign sends nothing', async () => {
  const controller = new AbortController();
  controller.abort();
  const sent = [];
  const result = await broadcast(recipients(2, sent), 'Message', {
    signal: controller.signal, wait: async () => assert.fail('Unexpected wait'),
  });
  assert.equal(sent.length, 0);
  assert.deepEqual(result, { sent: 0, failed: 0, remaining: 2, cancelled: true });
});

for (const error of [{ status: 401 }, { code: 50014 }]) {
  test(`invalid credentials (${error.status ?? error.code}) stop all further attempts`, async () => {
    const sent = [];
    const attempts = [];
    const result = await broadcast(recipients(4, sent, (index) => index === 2 ? error : undefined), 'Message', {
      wait: async () => {}, onAttempt: async (attempt) => attempts.push(attempt),
    });
    assert.equal(sent.length, 2);
    assert.equal(attempts[1].success, false);
    assert.deepEqual(result, { sent: 1, failed: 1, remaining: 2, cancelled: true });
  });
}

test('onAttempt is awaited before progress or another delivery', async () => {
  const sent = [];
  const entered = deferred();
  const release = deferred();
  const progress = [];
  const running = broadcast(recipients(2, sent), 'Message', {
    wait: async () => {},
    onAttempt: async (attempt) => {
      if (attempt.userId === '1') {
        entered.resolve();
        await release.promise;
      }
    },
    onProgress: async (snapshot) => progress.push(snapshot),
  });
  await entered.promise;
  assert.equal(sent.length, 1);
  assert.equal(progress.length, 0);
  release.resolve();
  await running;
  assert.equal(sent.length, 2);
  assert.equal(progress.length, 2);
});

test('onProgress is awaited and receives independent progress snapshots', async () => {
  const sent = [];
  const entered = deferred();
  const release = deferred();
  const progress = [];
  const running = broadcast(recipients(2, sent), 'Message', {
    wait: async () => {},
    onProgress: async (snapshot) => {
      progress.push(snapshot);
      if (snapshot.attempted === 1) {
        entered.resolve();
        await release.promise;
      }
    },
  });
  await entered.promise;
  assert.equal(sent.length, 1);
  release.resolve();
  await running;
  assert.deepEqual(progress.map((item) => [item.attempted, item.remaining]), [[1, 1], [2, 0]]);
});

test('onCooldown is awaited before its wait or another delivery', async () => {
  const sent = [];
  const waits = [];
  const entered = deferred();
  const release = deferred();
  const running = broadcast(recipients(21, sent), 'Message', {
    wait: async (delay) => waits.push(delay),
    onCooldown: async (snapshot) => {
      assert.equal(snapshot.attempted, 20);
      entered.resolve();
      await release.promise;
    },
  });
  await entered.promise;
  assert.equal(sent.length, 20);
  assert.equal(waits.includes(300_000), false);
  release.resolve();
  await running;
  assert.equal(sent.length, 21);
  assert.equal(waits.includes(300_000), true);
});

test('a delivery journal failure stops the campaign immediately', async () => {
  const sent = [];
  const journalError = new Error('Disk full');
  await assert.rejects(broadcast(recipients(3, sent), 'Message', {
    wait: async () => assert.fail('Unexpected wait'),
    onAttempt: async () => { throw journalError; },
    onProgress: async () => assert.fail('Unexpected progress callback'),
  }), (error) => error === journalError);
  assert.equal(sent.length, 1);
});

test('unexpected wait failures are surfaced instead of sending more messages', async () => {
  const sent = [];
  await assert.rejects(broadcast(recipients(3, sent), 'Message', {
    wait: async () => { throw new Error('Unexpected wait failure'); },
  }), /Unexpected wait failure/);
  assert.equal(sent.length, 1);
});

test('slow pacing prioritizes the 100-recipient rule over 40, then 15 at shared boundaries', async () => {
  const sent = [];
  const cooldowns = new Map();
  const waits = [];
  const result = await broadcast(recipients(601, sent), 'Message', {
    ...SAFE_PACING,
    wait: async (delay) => waits.push(delay),
    onCooldown: async (snapshot) => cooldowns.set(snapshot.attempted, snapshot.delayMs),
  });
  assert.equal(cooldowns.get(15), 90_000);
  assert.equal(cooldowns.get(40), 240_000);
  assert.equal(cooldowns.get(100), 480_000);
  assert.equal(cooldowns.get(120), 240_000);
  assert.equal(cooldowns.get(200), 480_000);
  assert.equal(cooldowns.get(600), 480_000);
  assert.equal(cooldowns.has(20), false);
  assert.equal(waits.filter((delay) => delay === 4000).length, 600);
  assert.equal(waits.includes(300_000), false);
  assert.equal(result.sent, 601);
});
