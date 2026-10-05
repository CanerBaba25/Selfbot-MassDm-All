'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const ID_PATTERN = new RegExp(`^${UUID}$`);
const SUCCESS_PATTERN = new RegExp(`^dm_success_(${UUID})\\.jsonl$`);
const METADATA_PATTERN = new RegExp(`^campaign_(${UUID})\\.json$`);

function campaignId(reference) {
  if (typeof reference !== 'string') throw new Error('Invalid campaign reference.');
  if (ID_PATTERN.test(reference)) return reference;
  const match = SUCCESS_PATTERN.exec(reference);
  if (match) return match[1];
  throw new Error('Use a campaign ID or the exact success log filename.');
}

function createCampaignStore(directory) {
  const logDirectory = path.resolve(directory);
  const cache = new Map();
  const filename = (name) => path.join(logDirectory, name);
  const metadataFile = (id) => filename(`campaign_${id}.json`);
  const logFile = (id, success) => filename(`dm_${success ? 'success' : 'failed'}_${id}.jsonl`);

  async function readMetadata(id) {
    let metadata;
    try {
      metadata = JSON.parse(await fs.readFile(metadataFile(id), 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') throw new Error('Campaign not found.');
      throw error;
    }
    if (metadata.id !== id || !ID_PATTERN.test(metadata.rootId)
        || !Array.isArray(metadata.recipientIds)
        || metadata.recipientIds.some((userId) => typeof userId !== 'string')) {
      throw new Error('Invalid campaign metadata.');
    }
    cache.set(id, { metadata, recipients: new Set(metadata.recipientIds) });
    return metadata;
  }

  async function writeMetadata(metadata) {
    const temporary = filename(`.campaign_${metadata.id}_${randomUUID()}.tmp`);
    try {
      await fs.writeFile(temporary, JSON.stringify(metadata, null, 2), {
        encoding: 'utf8', flag: 'wx', flush: true,
      });
      await fs.rename(temporary, metadataFile(metadata.id));
    } catch (error) {
      await fs.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    cache.set(metadata.id, { metadata, recipients: new Set(metadata.recipientIds) });
  }

  async function readIds(id, success) {
    let contents;
    try {
      contents = await fs.readFile(logFile(id, success), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') return new Set();
      throw error;
    }
    const lines = contents.split('\n');
    const ids = new Set();
    for (let index = 0; index < lines.length; index += 1) {
      if (!lines[index].trim()) continue;
      let entry;
      try {
        entry = JSON.parse(lines[index]);
      } catch (error) {
        // A process interruption can leave only the final JSONL row incomplete.
        if (index === lines.length - 1 && !contents.endsWith('\n')) break;
        throw error;
      }
      if (typeof entry.userId === 'string') ids.add(entry.userId);
    }
    return ids;
  }

  async function hydrate(metadata) {
    const [successes, failures] = await Promise.all([
      readIds(metadata.id, true), readIds(metadata.id, false),
    ]);
    const recipients = [...new Set(metadata.recipientIds)];
    const sentIds = recipients.filter((id) => successes.has(id));
    const failedIds = recipients.filter((id) => failures.has(id) && !successes.has(id));
    return {
      ...metadata, sentIds, failedIds, sent: sentIds.length, failed: failedIds.length,
      remaining: recipients.length - sentIds.length - failedIds.length,
    };
  }

  async function create({ guildId, guildName, authorId, authorTag, message,
    recipientIds, mode, parentId = null, rootId = null }) {
    if (typeof guildId !== 'string' || !guildId || typeof message !== 'string'
        || !Array.isArray(recipientIds)
        || recipientIds.some((id) => typeof id !== 'string' || !id)) {
      throw new Error('Invalid campaign details.');
    }
    if (parentId !== null && !ID_PATTERN.test(parentId)) throw new Error('Invalid parent campaign ID.');
    if (rootId !== null && !ID_PATTERN.test(rootId)) throw new Error('Invalid root campaign ID.');
    const id = randomUUID();
    const metadata = {
      id, rootId: rootId ?? id, parentId, createdAt: new Date().toISOString(),
      status: 'running', guildId, guildName, authorId, authorTag, message,
      recipientIds: [...new Set(recipientIds)], mode,
      successLogFile: `dm_success_${id}.jsonl`, failedLogFile: `dm_failed_${id}.jsonl`,
    };
    await fs.mkdir(logDirectory, { recursive: true });
    await fs.writeFile(logFile(id, true), '', { flag: 'wx' });
    await fs.writeFile(logFile(id, false), '', { flag: 'wx' });
    await writeMetadata(metadata);
    return metadata;
  }

  async function record(reference, { userId, success, errorCode }) {
    const id = campaignId(reference);
    if (!cache.has(id)) await readMetadata(id);
    if (typeof success !== 'boolean' || !cache.get(id).recipients.has(userId)) {
      throw new Error('Invalid campaign delivery record.');
    }
    const entry = { userId, success, timestamp: new Date().toISOString() };
    if (!success) entry.errorCode = errorCode ?? null;
    await fs.appendFile(logFile(id, success), `${JSON.stringify(entry)}\n`, {
      encoding: 'utf8', flush: true,
    });
  }

  async function get(reference, guildId) {
    const metadata = await readMetadata(campaignId(reference));
    if (metadata.guildId !== guildId) throw new Error('Campaign belongs to another server.');
    return hydrate(metadata);
  }

  async function finish(reference, { status }) {
    if (typeof status !== 'string' || !status) throw new Error('Invalid campaign status.');
    const metadata = await readMetadata(campaignId(reference));
    const finished = { ...metadata, status, finishedAt: new Date().toISOString() };
    await writeMetadata(finished);
    return hydrate(finished);
  }

  async function list(guildId, { since } = {}) {
    const threshold = since === undefined ? -Infinity : new Date(since).getTime();
    if (Number.isNaN(threshold)) throw new Error('Invalid campaign start date.');
    let entries;
    try {
      entries = await fs.readdir(logDirectory);
    } catch (error) {
      if (error.code === 'ENOENT') return [];
      throw error;
    }
    const metadata = await Promise.all(entries.filter((name) => METADATA_PATTERN.test(name))
      .map((name) => readMetadata(METADATA_PATTERN.exec(name)[1])));
    const matching = metadata.filter((item) => item.guildId === guildId
      && new Date(item.createdAt).getTime() >= threshold);
    const campaigns = await Promise.all(matching.map(hydrate));
    return campaigns.sort((a, b) => b.createdAt.localeCompare(a.createdAt)
      || b.id.localeCompare(a.id));
  }

  async function latest(guildId) {
    return (await list(guildId))[0] ?? null;
  }

  async function retry(reference, guildId) {
    const campaign = await get(reference, guildId);
    const related = (await list(guildId)).filter((item) => item.rootId === campaign.rootId);
    const sent = new Set(related.flatMap((item) => item.sentIds));
    return { campaign, recipientIds: campaign.failedIds.filter((id) => !sent.has(id)) };
  }

  return { create, record, finish, get, latest, list, retry };
}

module.exports = { createCampaignStore };
