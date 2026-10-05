'use strict';

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const { broadcast } = require('../util/broadcast');
const logError = require('../util/logError');

module.exports = {
  name: 'massdm',
  aliases: [],
  enabled: true,
  guildOnly: true,
  requiredPermissions: [PermissionFlagsBits.Administrator],

  async execute(client, message, { text }) {
    const send = content => message.channel.send({ content, allowedMentions: { parse: [] } });
    if (!text || text.length > 4096) {
      await send(`Usage: ${client.config.prefix}massdm <message> (1-4096 characters).`);
      return;
    }
    const guildId = message.guild.id;
    if (client.broadcasts.has(guildId)) {
      await send('An announcement is already running in this server.');
      return;
    }

    // Reserve the guild before fetching members or sending any status messages.
    client.broadcasts.add(guildId);
    try {
      const members = await message.guild.members.fetch();
      const recipients = [...members.values()].filter(member => !member.user.bot).map(member => member.user);
      if (client.shutdownController.signal.aborted) return;
      if (!recipients.length) {
        await send('No eligible members were found in this server.');
        return;
      }
      const embed = new EmbedBuilder()
        .setColor(0x5865f2)
        .setTitle(`${message.guild.name} announcement`)
        .setAuthor({ name: `Sent by ${message.author.tag}` })
        .setDescription(text)
        .setTimestamp();
      const status = await send(`Starting announcement for ${recipients.length} member(s). Delivery results will follow.`);
      const result = await broadcast(recipients, {
        embeds: [embed],
        allowedMentions: { parse: [] },
      }, {
        delayMs: client.config.delayMs,
        signal: client.shutdownController.signal,
      });
      const summary = `Announcement ${result.cancelled ? 'stopped' : 'complete'}: ${result.sent} sent, ${result.failed} failed, ${result.remaining} remaining.`;
      console.log(`[guild ${guildId}] ${summary}`);
      if (!client.shutdownController.signal.aborted) {
        try {
          await status.edit({ content: summary, allowedMentions: { parse: [] } });
        } catch (error) {
          logError('Could not update announcement status', error);
          await send(summary);
        }
      }
      return result;
    } finally {
      client.broadcasts.delete(guildId);
    }
  },
};
