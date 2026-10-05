'use strict';

const logError = require('../util/logError');

module.exports = async message => {
  const { client } = message;
  if (message.author.bot || message.webhookId || client.shutdownController.signal.aborted) return;
  if (!message.content.startsWith(client.config.prefix)) return;

  const body = message.content.slice(client.config.prefix.length).trim();
  const match = /^(\S+)(?:\s+([\s\S]*))?$/.exec(body);
  if (!match) return;
  const name = match[1].toLowerCase();
  const command = client.commands.get(client.aliases.get(name) || name);
  if (!command) return;

  const reply = content => message.channel.send({ content, allowedMentions: { parse: [] } });
  try {
    if (!command.enabled) {
      await reply('This command is disabled.');
      return;
    }
    if (command.guildOnly && !message.inGuild()) {
      await reply('Use this command in a server.');
      return;
    }
    if (command.requiredPermissions.length &&
        !message.member?.permissions.has(command.requiredPermissions)) {
      await reply('You need Administrator permission to use this command.');
      return;
    }
    const text = (match[2] || '').trim();
    await command.execute(client, message, { text, args: text ? text.split(/\s+/) : [] });
  } catch (error) {
    logError(`Command ${command.name} failed`, error);
    try {
      await reply('The command could not finish. Check the bot logs before retrying.');
    } catch (replyError) {
      logError('Could not send command feedback', replyError);
    }
  }
};
