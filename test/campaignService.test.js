'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCampaignService } = require('../util/campaignService');
const { createCampaignStore } = require('../util/campaignStore');
const { broadcast, SAFE_PACING } = require('../util/broadcast');

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function member(id, { bot = false, roles = [], failure } = {}) {
  const deliveries = [];
  return {
    roles: { cache: new Set(roles) }, deliveries,
    user: { id, bot, async send(payload) {
      deliveries.push(payload);
      if (failure) throw Object.assign(new Error('Cannot deliver'), { code: failure });
    } },
  };
}

function messageFor(members, guildId = 'server-1') {
  const replies = [], edits = [], previews = [];
  const memberMap = new Map(members.map(item => [item.user.id, item]));
  return {
    replies, edits, previews, memberMap,
    author: { id: 'admin', tag: 'Admin', async send(payload) { previews.push(payload); } },
    guild: {
      id: guildId, name: 'Example',
      roles: { async fetch(id) { return id === 'role-1' ? { id } : null; } },
      members: { async fetch(id) {
        if (id === undefined) return memberMap;
        if (!memberMap.has(id)) throw Object.assign(new Error('Unknown member'), { code: 10007 });
        return memberMap.get(id);
      } },
    },
    channel: { async send(payload) {
      replies.push(payload);
      return { async edit(updated) { edits.push(updated); } };
    } },
  };
}

async function fixture(t, options = {}) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-campaign-service-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true, maxRetries: 3, retryDelay: 50 }));
  t.mock.method(console, 'log', () => {});
  t.mock.method(console, 'error', () => {});
  const directory = path.join(temporary, 'logs');
  const store = createCampaignStore(directory);
  const client = {
    config: { delayMs: 1000, defaultMessage: 'Default announcement' },
    broadcasts: new Set(), shutdownController: new AbortController(),
  };
  const waits = [], pacing = [];
  const service = createCampaignService(client, {
    store: options.store?.(store) ?? store,
    sendBroadcast: options.sendBroadcast ?? ((recipients, payload, settings) => {
      pacing.push(settings);
      return broadcast(recipients, payload, {
        ...settings, wait: async milliseconds => { waits.push(milliseconds); },
      });
    }),
  });
  return { client, store, service, directory, waits, pacing };
}

test('all-member campaign filters bots, journals failures, and uses exact normal pacing', async t => {
  const { client, store, service, waits } = await fixture(t);
  const members = Array.from({ length: 21 }, (_, index) => member(`user-${index}`, {
    failure: index === 3 ? 50007 : undefined,
  }));
  const bot = member('bot', { bot: true });
  const message = messageFor([...members, bot]);
  assert.deepEqual(await service.startAll(message), {
    sent: 20, failed: 1, remaining: 0, cancelled: false,
  });
  assert.deepEqual(waits, [...Array(20).fill(1000), 300000]);
  assert.equal(bot.deliveries.length, 0);
  assert.equal(members[0].deliveries[0].embeds[0].data.description, 'Default announcement');
  const campaign = await store.latest(message.guild.id);
  assert.equal(campaign.status, 'complete');
  assert.equal(campaign.sent, 20);
  assert.equal(campaign.failed, 1);
  assert.equal(campaign.remaining, 0);
  assert.deepEqual(campaign.failedIds, ['user-3']);
  assert.ok(message.edits.some(item => item.content.includes('Cooling down for 300 seconds')));
  assert.match(message.edits.at(-1).content, /20 sent, 1 failed, 0 remaining/);
  for (const payload of [...message.replies, ...message.edits, members[0].deliveries[0]]) {
    assert.deepEqual(payload.allowedMentions, { parse: [] });
  }
  assert.equal(client.broadcasts.size, 0);
});

test('role campaigns use slow pacing and exclude other roles and bots', async t => {
  const { service, store, pacing } = await fixture(t);
  const eligible = member('eligible', { roles: ['role-1'] });
  const other = member('other');
  const bot = member('bot', { roles: ['role-1'], bot: true });
  const message = messageFor([eligible, other, bot]);
  await service.startRole(message, 'role-1', 'Role notice', { safe: true });
  assert.equal(eligible.deliveries.length, 1);
  assert.equal(other.deliveries.length, 0);
  assert.equal(bot.deliveries.length, 0);
  assert.equal(pacing[0].delayMs, 4000);
  assert.deepEqual(pacing[0].cooldowns, SAFE_PACING.cooldowns);
  assert.equal((await store.latest(message.guild.id)).mode, 'dmroleallsafe');
  await service.startRole(message, 'missing-role', 'Notice');
  assert.match(message.replies.at(-1).content, /role does not exist/);
  assert.equal(eligible.deliveries.length, 1);
});

test('direct DMs only target human members and preview does not create campaigns', async t => {
  const { service, store, waits } = await fixture(t);
  const human = member('human');
  const bot = member('bot', { bot: true });
  const message = messageFor([human, bot]);
  await service.preview(message, 'Preview text');
  assert.equal(message.previews[0].embeds[0].data.description, 'Preview text');
  assert.equal(await store.latest(message.guild.id), null);
  await service.sendDM(message, 'bot', 'Text');
  assert.match(message.replies.at(-1).content, /human member/);
  await service.sendDM(message, 'outsider', 'Text');
  assert.match(message.replies.at(-1).content, /not a member/);
  await service.sendDM(message, 'human', 'Personal notice');
  assert.equal(human.deliveries[0].embeds[0].data.description, 'Personal notice');
  assert.equal(bot.deliveries.length, 0);
  assert.deepEqual(waits, []);
  assert.equal((await store.latest(message.guild.id)).mode, 'dm');
});

test('invalid content is rejected before member fetch and releases the reservation', async t => {
  const { client, service } = await fixture(t);
  client.config.defaultMessage = '';
  const message = messageFor([]);
  let fetches = 0;
  message.guild.members.fetch = async () => { fetches += 1; throw new Error('Must not fetch'); };
  await service.startAll(message, '');
  await service.startAll(message, 'x'.repeat(4097));
  assert.equal(fetches, 0);
  assert.equal(client.broadcasts.size, 0);
  assert.match(message.replies.at(-1).content, /1-4096/);
});

test('guild is reserved before member fetch and cancellation prevents a pending campaign', async t => {
  const { client, service, store } = await fixture(t);
  const human = member('human');
  const message = messageFor([human]);
  const fetched = deferred(), entered = deferred();
  let fetches = 0;
  message.guild.members.fetch = async () => {
    fetches += 1;
    entered.resolve();
    return fetched.promise;
  };
  const pending = service.startAll(message, 'Notice');
  await entered.promise;
  await service.startAll(message, 'Duplicate');
  assert.match(message.replies.at(-1).content, /already running/);
  assert.equal(fetches, 1);
  await service.cancel(message);
  fetched.resolve(message.memberMap);
  await pending;
  assert.equal(human.deliveries.length, 0);
  assert.equal(await store.latest(message.guild.id), null);
  assert.equal(client.broadcasts.size, 0);
});

test('cancel interrupts cooldown and persists partial counts without blocking other guilds', async t => {
  const cooling = deferred();
  const { client, service, store } = await fixture(t, {
    sendBroadcast: (recipients, payload, settings) => broadcast(recipients, payload, {
      ...settings, wait: async (milliseconds, value, { signal }) => {
        if (milliseconds !== 300000) return;
        cooling.resolve();
        await new Promise((resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          if (signal.aborted) abort();
          else signal.addEventListener('abort', abort, { once: true });
        });
      },
    }),
  });
  const members = Array.from({ length: 21 }, (_, index) => member(`user-${index}`));
  const message = messageFor(members);
  const pending = service.startAll(message, 'Notice');
  await cooling.promise;
  await service.status(message);
  assert.match(message.replies.at(-1).content, /20 sent, 0 failed, 1 remaining/);
  assert.match(message.replies.at(-1).content, /Cooling down until/);
  const other = member('other');
  await service.startAll(messageFor([other], 'server-2'), 'Other notice');
  assert.equal(other.deliveries.length, 1);
  assert.equal(client.broadcasts.has('server-1'), true);
  await service.cancel(message);
  assert.deepEqual(await pending, { sent: 20, failed: 0, remaining: 1, cancelled: true });
  assert.equal(members[20].deliveries.length, 0);
  const campaign = await store.latest('server-1');
  assert.equal(campaign.status, 'stopped');
  assert.equal(campaign.remaining, 1);
  assert.equal(client.broadcasts.size, 0);
  assert.match(message.edits.at(-1).content, /stopped: 20 sent/);
  await service.cancel(message);
  assert.match(message.replies.at(-1).content, /No campaign is running/);
});

test('shutdown cancels pacing and avoids further channel feedback', async t => {
  const waiting = deferred();
  const { client, service, store } = await fixture(t, {
    sendBroadcast: (recipients, payload, settings) => broadcast(recipients, payload, {
      ...settings, wait: async (milliseconds, value, { signal }) => {
        waiting.resolve();
        await new Promise((resolve, reject) => {
          const abort = () => reject(Object.assign(new Error('Aborted'), { name: 'AbortError' }));
          if (signal.aborted) abort();
          else signal.addEventListener('abort', abort, { once: true });
        });
      },
    }),
  });
  const members = [member('a'), member('b')];
  const message = messageFor(members);
  const pending = service.startAll(message, 'Notice');
  await waiting.promise;
  client.shutdownController.abort();
  await pending;
  assert.equal(members[1].deliveries.length, 0);
  assert.equal(message.replies.length, 1);
  assert.equal(message.edits.length, 0);
  assert.equal((await store.latest('server-1')).status, 'stopped');
  assert.equal(client.broadcasts.size, 0);
});

test('retry uses saved text, skips departed members, and omits previous retry successes', async t => {
  const { service, store } = await fixture(t);
  const a = member('a'), b = member('b', { failure: 50007 });
  const c = member('c', { failure: 50007 }), d = member('departed', { failure: 50007 });
  const message = messageFor([a, b, c, d]);
  await service.startAll(message, 'Saved message');
  const original = await store.latest('server-1');
  const recovered = member('b');
  message.memberMap.set('b', recovered);
  message.memberMap.delete('departed');
  await service.retry(message, original.successLogFile);
  assert.equal(a.deliveries.length, 1);
  assert.equal(recovered.deliveries.length, 1);
  assert.equal(recovered.deliveries[0].embeds[0].data.description, 'Saved message');
  assert.equal(c.deliveries.length, 2);
  assert.equal(d.deliveries.length, 1);
  const child = (await store.list('server-1')).find(item => item.parentId === original.id);
  assert.equal(child.rootId, original.id);
  assert.deepEqual(child.recipientIds, ['b', 'c']);
  await service.retry(message, original.successLogFile);
  assert.equal(recovered.deliveries.length, 1);
  assert.equal(c.deliveries.length, 3);
  await service.retry(messageFor([a], 'server-2'), original.successLogFile);
  await service.retry(message, `../${original.successLogFile}`);
  assert.equal(a.deliveries.length, 1);
  assert.match(message.replies.at(-1).content, /Could not start/);
});

test('initial progress-channel failure stops before delivery and releases the guild', async t => {
  const { client, service, store } = await fixture(t);
  const human = member('human');
  const message = messageFor([human]);
  let replies = 0;
  message.channel.send = async () => {
    replies += 1;
    if (replies === 1) throw new Error('Channel unavailable');
    return { async edit() {} };
  };
  await service.startAll(message, 'Notice');
  assert.equal(human.deliveries.length, 0);
  assert.equal((await store.latest('server-1')).status, 'error');
  assert.equal(client.broadcasts.size, 0);
});

test('journal failure halts delivery before the next recipient', async t => {
  const { client, service, store } = await fixture(t, {
    store: real => ({ ...real, async record() { throw new Error('Disk full'); } }),
  });
  const members = [member('a'), member('b')];
  const message = messageFor(members);
  await service.startAll(message, 'Notice');
  assert.equal(members[0].deliveries.length, 1);
  assert.equal(members[1].deliveries.length, 0);
  assert.equal((await store.latest('server-1')).status, 'error');
  assert.match(message.edits.at(-1).content, /check the bot logs before retrying/);
  assert.equal(client.broadcasts.size, 0);
});

test('status survives restart, displays interruptions, and stats stay guild-scoped', async t => {
  const { client, service, store, directory } = await fixture(t);
  const message = messageFor([member('a'), member('b', { failure: 50007 })]);
  await service.status(message);
  assert.match(message.replies.at(-1).content, /No campaigns/);
  await service.startAll(message, 'Notice');
  await service.startAll(messageFor([member('other')], 'server-2'), 'Other');
  const restarted = createCampaignService(client, { store: createCampaignStore(directory) });
  await restarted.status(message);
  assert.match(message.replies.at(-1).content, /complete: 1 sent, 1 failed, 0 remaining/);
  await restarted.stats(message);
  assert.match(message.replies.at(-1).content, /1 campaign\(s\), 1 successful attempts, 1 failed attempts/);
  assert.match(message.replies.at(-1).content, /50\.0%/);
  const interrupted = await store.create({
    guildId: 'server-3', guildName: 'Example', authorId: 'admin', authorTag: 'Admin',
    message: 'Interrupted', recipientIds: ['x', 'y'], mode: 'dmall',
  });
  await store.record(interrupted.id, { userId: 'x', success: true });
  const thirdMessage = messageFor([], 'server-3');
  await restarted.status(thirdMessage);
  assert.match(thirdMessage.replies.at(-1).content, /interrupted: 1 sent, 0 failed, 1 remaining/);
});

test('estimate matches pacing boundaries without an unused final cooldown', async t => {
  const { service } = await fixture(t);
  const message = messageFor([]);
  for (const [count, safe, duration] of [
    [1, false, '0d 0h 0m 0s'], [20, false, '0d 0h 0m 19s'],
    [21, false, '0d 0h 5m 20s'], [20000, false, '3d 16h 48m 19s'],
    [16, true, '0d 0h 2m 30s'], [121, true, '0d 0h 38m 30s'],
  ]) {
    await service.estimate(message, count, { safe });
    assert.ok(message.replies.at(-1).content.includes(duration), message.replies.at(-1).content);
  }
});
