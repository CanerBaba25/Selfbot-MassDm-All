'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createCampaignStore } = require('../util/campaignStore');

async function fixture(t) {
  const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'dm-campaign-store-'));
  t.after(() => fs.rm(temporary, { recursive: true, force: true }));
  const directory = path.join(temporary, 'logs');
  return { directory, store: createCampaignStore(directory) };
}

function details(overrides = {}) {
  return {
    guildId: 'server-1', guildName: 'Example', authorId: 'admin-1',
    authorTag: 'Admin', message: 'Announcement', recipientIds: ['a', 'b', 'c'],
    mode: 'all', ...overrides,
  };
}

test('directory is created lazily and completed campaigns survive reopening', async (t) => {
  const { directory, store } = await fixture(t);
  assert.equal(await store.latest('server-1'), null);
  await assert.rejects(fs.access(directory), { code: 'ENOENT' });
  const created = await store.create(details());
  assert.equal(created.rootId, created.id);
  assert.equal(created.parentId, null);
  assert.equal(created.status, 'running');
  assert.equal(await fs.readFile(path.join(directory, created.successLogFile), 'utf8'), '');
  assert.equal(await fs.readFile(path.join(directory, created.failedLogFile), 'utf8'), '');
  await store.record(created.id, { userId: 'a', success: true });
  await store.record(created.id, { userId: 'b', success: false, errorCode: 50007 });
  await store.finish(created.id, { status: 'completed' });

  const reopened = createCampaignStore(directory);
  const campaign = await reopened.get(created.successLogFile, 'server-1');
  assert.equal(campaign.message, 'Announcement');
  assert.equal(campaign.status, 'completed');
  assert.ok(!Number.isNaN(Date.parse(campaign.finishedAt)));
  assert.deepEqual(campaign.sentIds, ['a']);
  assert.deepEqual(campaign.failedIds, ['b']);
  assert.equal(campaign.sent, 1);
  assert.equal(campaign.failed, 1);
  assert.equal(campaign.remaining, 1);
  const failedEntry = JSON.parse(await fs.readFile(path.join(directory, created.failedLogFile), 'utf8'));
  assert.equal(failedEntry.errorCode, 50007);
  assert.ok(!Number.isNaN(Date.parse(failedEntry.timestamp)));
  assert.equal((await fs.readdir(directory)).filter((name) => name.endsWith('.tmp')).length, 0);
});

test('only campaign IDs and exact success filenames can be read, within the same guild', async (t) => {
  const { store } = await fixture(t);
  const campaign = await store.create(details());
  await assert.rejects(store.get(campaign.id, 'server-2'), /another server/);
  await assert.rejects(store.retry(campaign.successLogFile, 'server-2'), /another server/);
  for (const reference of [
    '../secret.json', `../${campaign.successLogFile}`, `logs/${campaign.successLogFile}`,
    `logs\\${campaign.successLogFile}`, `C:\\logs\\${campaign.successLogFile}`,
    `/tmp/${campaign.successLogFile}`, campaign.failedLogFile,
    `campaign_${campaign.id}.json`, `${campaign.successLogFile}\n`, undefined,
  ]) {
    await assert.rejects(store.get(reference, 'server-1'), /reference|exact success/);
  }
  await assert.rejects(store.get('00000000-0000-0000-0000-000000000000', 'server-1'), /not found/);
});

test('counts unique recipients and lets success supersede a previous failure', async (t) => {
  const { directory, store } = await fixture(t);
  const campaign = await store.create(details({ recipientIds: ['a', 'a', 'b', 'c'] }));
  const metadataBefore = await fs.readFile(path.join(directory, `campaign_${campaign.id}.json`), 'utf8');
  await store.record(campaign.id, { userId: 'a', success: false });
  await store.record(campaign.id, { userId: 'a', success: true });
  await store.record(campaign.id, { userId: 'a', success: true });
  await store.record(campaign.id, { userId: 'b', success: false });
  await store.record(campaign.id, { userId: 'b', success: false });
  await assert.rejects(store.record(campaign.id, { userId: 'outsider', success: true }), /Invalid/);
  const hydrated = await store.get(campaign.id, 'server-1');
  assert.deepEqual(hydrated.recipientIds, ['a', 'b', 'c']);
  assert.deepEqual(hydrated.sentIds, ['a']);
  assert.deepEqual(hydrated.failedIds, ['b']);
  assert.equal(hydrated.remaining, 1);
  assert.equal(await fs.readFile(path.join(directory, `campaign_${campaign.id}.json`), 'utf8'), metadataBefore);
});

test('latest and list filter by guild and campaign start date', async (t) => {
  const { directory, store } = await fixture(t);
  const old = await store.create(details());
  const recent = await store.create(details());
  const other = await store.create(details({ guildId: 'server-2' }));
  for (const [campaign, createdAt] of [
    [old, '2026-01-01T00:00:00.000Z'],
    [recent, '2026-02-01T00:00:00.000Z'],
    [other, '2026-03-01T00:00:00.000Z'],
  ]) {
    await fs.writeFile(path.join(directory, `campaign_${campaign.id}.json`),
      JSON.stringify({ ...campaign, createdAt }));
  }
  assert.equal((await store.latest('server-1')).id, recent.id);
  assert.equal((await store.latest('server-2')).id, other.id);
  assert.equal(await store.latest('unknown'), null);
  assert.deepEqual((await store.list('server-1')).map((item) => item.id), [recent.id, old.id]);
  assert.deepEqual((await store.list('server-1', { since: new Date('2026-02-01') }))
    .map((item) => item.id), [recent.id]);
  assert.deepEqual(await store.list('server-1', { since: '2026-04-01' }), []);
  await assert.rejects(store.list('server-1', { since: 'nonsense' }), /Invalid/);
});

test('repeated and nested retries omit successes anywhere in the original campaign chain', async (t) => {
  const { directory, store } = await fixture(t);
  const original = await store.create(details());
  await store.record(original.id, { userId: 'a', success: true });
  await store.record(original.id, { userId: 'b', success: false });
  await store.record(original.id, { userId: 'c', success: false });
  assert.deepEqual((await store.retry(original.successLogFile, 'server-1')).recipientIds, ['b', 'c']);
  const child = await store.create(details({ recipientIds: ['b', 'c'], parentId: original.id, rootId: original.id }));
  await store.record(child.id, { userId: 'b', success: true });
  await store.record(child.id, { userId: 'c', success: false });
  const unrelated = await store.create(details({ recipientIds: ['c'] }));
  await store.record(unrelated.id, { userId: 'c', success: true });
  assert.deepEqual((await store.retry(original.id, 'server-1')).recipientIds, ['c']);
  assert.deepEqual((await store.retry(child.id, 'server-1')).recipientIds, ['c']);
  const nested = await store.create(details({ recipientIds: ['c'], parentId: child.id, rootId: original.id }));
  await store.record(nested.id, { userId: 'c', success: true });
  const reopened = createCampaignStore(directory);
  assert.deepEqual((await reopened.retry(original.id, 'server-1')).recipientIds, []);
  assert.deepEqual((await reopened.retry(child.id, 'server-1')).recipientIds, []);
});

test('interrupted campaigns retain recorded results and ignore a truncated final log row', async (t) => {
  const { directory, store } = await fixture(t);
  const campaign = await store.create(details());
  await store.record(campaign.id, { userId: 'a', success: true });
  await store.record(campaign.id, { userId: 'b', success: false });
  await fs.appendFile(path.join(directory, campaign.successLogFile), '{"userId":"c"');
  const resumed = createCampaignStore(directory);
  const status = await resumed.get(campaign.id, 'server-1');
  assert.equal(status.status, 'running');
  assert.equal(status.finishedAt, undefined);
  assert.equal(status.sent, 1);
  assert.equal(status.failed, 1);
  assert.equal(status.remaining, 1);
  assert.deepEqual((await resumed.retry(campaign.id, 'server-1')).recipientIds, ['b']);
});

test('corrupt completed JSONL rows are surfaced rather than silently changing delivery counts', async (t) => {
  const { directory, store } = await fixture(t);
  const campaign = await store.create(details());
  await fs.appendFile(path.join(directory, campaign.successLogFile), 'invalid-json\n');
  await assert.rejects(store.get(campaign.id, 'server-1'), SyntaxError);
});
