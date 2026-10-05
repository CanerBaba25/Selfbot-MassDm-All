'use strict';

const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
const { broadcast, NORMAL_PACING, SAFE_PACING } = require('./broadcast');
const { createCampaignStore } = require('./campaignStore');
const logError = require('./logError');

function inputError(message) {
  const error = new Error(message);
  error.name = 'CommandInputError';
  return error;
}

function createCampaignService(client, {
  store = createCampaignStore(path.join(__dirname, '..', 'logs')),
  sendBroadcast = broadcast,
} = {}) {
  const active = new Map();
  const controllers = new Map();
  const shutdownSignal = client.shutdownController.signal;
  const reply = (message, content) => message.channel.send({ content, allowedMentions: { parse: [] } });
  const textFor = text => {
    const body = text || client.config.defaultMessage || '';
    if (!body.trim() || body.length > 4096) {
      throw inputError('Provide a message of 1-4096 characters or set DEFAULT_MESSAGE.');
    }
    return body;
  };
  const payloadFor = (message, text) => ({
    embeds: [new EmbedBuilder()
      .setColor(0x5865f2)
      .setTitle(`${message.guild.name} announcement`)
      .setAuthor({ name: `Sent by ${message.author.tag}` })
      .setDescription(text)
      .setTimestamp()],
    allowedMentions: { parse: [] },
  });
  const pacingFor = safe => safe ? SAFE_PACING : { ...NORMAL_PACING, delayMs: client.config.delayMs };
  const summaryFor = state =>
    `Campaign ${state.id} ${state.status}: ${state.sent} sent, ${state.failed} failed, ${state.remaining} remaining.\nSuccess log: ${state.successLogFile}`;

  async function run(message, { mode, pacing, resolvePlan }) {
    const guildId = message.guild.id;
    if (shutdownSignal.aborted) return;
    if (client.broadcasts.has(guildId)) {
      await reply(message, 'An announcement is already running in this server.');
      return;
    }
    // Reserve before fetching members, inspecting retry logs, or sending feedback.
    client.broadcasts.add(guildId);
    const controller = new AbortController();
    const signal = AbortSignal.any([shutdownSignal, controller.signal]);
    controllers.set(guildId, controller);
    let state;
    let statusMessage;
    let result;
    let failure;
    const update = async content => {
      try {
        await statusMessage.edit({ content, allowedMentions: { parse: [] } });
      } catch (error) {
        logError('Could not update campaign progress', error);
      }
    };

    try {
      const plan = await resolvePlan();
      if (signal.aborted) return;
      const text = textFor(plan.text);
      const recipients = [...new Map(plan.recipients.map(user => [user.id, user])).values()];
      if (!recipients.length) {
        await reply(message, 'No eligible recipients remain for this campaign.');
        return;
      }
      const campaign = await store.create({
        guildId, guildName: message.guild.name,
        authorId: message.author.id, authorTag: message.author.tag,
        message: text, recipientIds: recipients.map(user => user.id), mode,
        parentId: plan.parentId ?? null, rootId: plan.rootId ?? null,
      });
      state = { ...campaign, sent: 0, failed: 0, remaining: recipients.length, total: recipients.length };
      active.set(guildId, state);
      if (signal.aborted) {
        state.status = 'stopped';
        return;
      }
      statusMessage = await reply(message,
        `Starting ${mode} for ${recipients.length} recipient(s).\nSuccess log: ${campaign.successLogFile}`);

      result = await sendBroadcast(recipients, payloadFor(message, text), {
        ...pacing, signal,
        async onAttempt(attempt) {
          state[attempt.success ? 'sent' : 'failed'] += 1;
          state.remaining -= 1;
          // A journal failure stops delivery so retries retain a reliable history.
          await store.record(campaign.id, attempt);
        },
        async onProgress(progress) {
          Object.assign(state, { sent: progress.sent, failed: progress.failed, remaining: progress.remaining });
          delete state.cooldownUntil;
          if (progress.attempted % 20 === 0 && progress.remaining > 0 && !signal.aborted) {
            await update(summaryFor(state));
          }
        },
        async onCooldown(progress) {
          state.cooldownUntil = new Date(Date.now() + progress.delayMs).toISOString();
          if (!signal.aborted) {
            await update(`${summaryFor(state)}\nCooling down for ${progress.delayMs / 1000} seconds.`);
          }
        },
      });
      Object.assign(state, result);
      state.status = result.cancelled ? 'stopped' : 'complete';
    } catch (error) {
      failure = error;
      if (state) state.status = signal.aborted ? 'stopped' : 'error';
    } finally {
      if (state) {
        try {
          await store.finish(state.id, { status: state.status });
        } catch (error) {
          logError('Could not finalize campaign logs', error);
          failure ||= error;
          state.status = 'error';
        }
      }
      active.delete(guildId);
      controllers.delete(guildId);
      client.broadcasts.delete(guildId);
    }

    if (state) {
      const summary = summaryFor(state) + (failure ? '\nCampaign stopped after an error; check the bot logs before retrying.' : '');
      console.log(`[guild ${guildId}] ${state.mode}: ${state.sent} sent, ${state.failed} failed, ${state.remaining} remaining (${state.status}).`);
      if (!shutdownSignal.aborted) {
        try {
          if (!statusMessage) throw new Error('No status message');
          await statusMessage.edit({ content: summary, allowedMentions: { parse: [] } });
        } catch (error) {
          logError('Could not update final campaign status', error);
          await reply(message, summary);
        }
      }
    }
    if (failure) {
      logError('Campaign failed', failure);
      if (!state && !shutdownSignal.aborted) {
        await reply(message, failure.name === 'CommandInputError'
          ? failure.message : 'Could not start the campaign. Check the bot logs and the supplied log filename.');
      }
    }
    return result;
  }

  return {
    async startAll(message, text, { safe = false } = {}) {
      return run(message, {
        mode: safe ? 'dmallsafe' : 'dmall', pacing: pacingFor(safe),
        async resolvePlan() {
          const body = textFor(text);
          const members = await message.guild.members.fetch();
          return { text: body, recipients: [...members.values()].filter(member => !member.user.bot).map(member => member.user) };
        },
      });
    },

    async startRole(message, roleId, text, { safe = false } = {}) {
      return run(message, {
        mode: safe ? 'dmroleallsafe' : 'dmroleall', pacing: pacingFor(safe),
        async resolvePlan() {
          const body = textFor(text);
          if (!await message.guild.roles.fetch(roleId)) throw inputError('That role does not exist in this server.');
          const members = await message.guild.members.fetch();
          return { text: body, recipients: [...members.values()]
            .filter(member => !member.user.bot && member.roles.cache.has(roleId)).map(member => member.user) };
        },
      });
    },

    async sendDM(message, userId, text) {
      return run(message, {
        mode: 'dm', pacing: { delayMs: 0, batchSize: 0 },
        async resolvePlan() {
          const body = textFor(text);
          let member;
          try {
            member = await message.guild.members.fetch(userId);
          } catch (error) {
            if (error.code === 10007 || error.code === 10013) throw inputError('That user is not a member of this server.');
            throw error;
          }
          if (member.user.bot) throw inputError('Choose a human member of this server.');
          return { text: body, recipients: [member.user] };
        },
      });
    },

    async preview(message, text) {
      try {
        await message.author.send(payloadFor(message, textFor(text)));
        await reply(message, 'Preview sent to your DMs.');
      } catch (error) {
        logError('DM preview failed', error);
        await reply(message, error.name === 'CommandInputError' ? error.message : 'Could not send your preview. Check your DM settings.');
      }
    },

    async retry(message, reference) {
      return run(message, {
        mode: 'dmretry', pacing: pacingFor(false),
        async resolvePlan() {
          const { campaign, recipientIds } = await store.retry(reference, message.guild.id);
          const members = await message.guild.members.fetch();
          const recipients = recipientIds.map(id => members.get(id))
            .filter(member => member && !member.user.bot).map(member => member.user);
          return { text: campaign.message, recipients, parentId: campaign.id, rootId: campaign.rootId };
        },
      });
    },

    async status(message) {
      const state = active.get(message.guild.id) || await store.latest(message.guild.id);
      if (!state) return reply(message, 'No campaigns have been recorded in this server.');
      const display = { ...state };
      if (display.status === 'running' && !active.has(message.guild.id)) display.status = 'interrupted';
      const cooldown = display.cooldownUntil && Date.parse(display.cooldownUntil) > Date.now()
        ? `\nCooling down until ${display.cooldownUntil}.` : '';
      return reply(message, summaryFor(display) + cooldown);
    },

    async stats(message, days = 7) {
      const since = new Date(Date.now() - days * 86_400_000).toISOString();
      const campaigns = await store.list(message.guild.id, { since });
      const sent = campaigns.reduce((sum, campaign) => sum + campaign.sent, 0);
      const failed = campaigns.reduce((sum, campaign) => sum + campaign.failed, 0);
      return reply(message,
        `Last ${days} day(s): ${campaigns.length} campaign(s), ${sent} successful attempts, ${failed} failed attempts.\nSuccess rate: ${sent + failed ? (sent / (sent + failed) * 100).toFixed(1) : '0.0'}%.`);
    },

    async cancel(message) {
      const controller = controllers.get(message.guild.id);
      if (!controller) return reply(message, 'No campaign is running in this server.');
      controller.abort();
      return reply(message, 'Cancellation requested. Any in-flight attempt may finish; the final counts will follow.');
    },

    async estimate(message, count, { safe = false } = {}) {
      const pacing = pacingFor(safe);
      let milliseconds = Math.max(0, count - 1) * pacing.delayMs;
      for (let completed = 1; completed < count; completed += 1) {
        const rule = pacing.cooldowns?.find(item => completed % item.every === 0);
        milliseconds += rule?.delayMs ?? (pacing.batchSize > 0 && completed % pacing.batchSize === 0
          ? pacing.batchCooldownMs : 0);
      }
      const seconds = Math.floor(milliseconds / 1000);
      const duration = `${Math.floor(seconds / 86400)}d ${Math.floor(seconds % 86400 / 3600)}h ${Math.floor(seconds % 3600 / 60)}m ${seconds % 60}s`;
      return reply(message,
        `Minimum pacing time for ${count} recipient(s), ${safe ? 'slow' : 'normal'} mode: ${duration}.\nMessage delivery, log writes, and Discord rate-limit waits add more time.`);
    },
  };
}

module.exports = { createCampaignService };
