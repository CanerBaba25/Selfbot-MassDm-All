'use strict';

const { createCommand, usage, parseTarget } = require('../util/dmCommands');

module.exports = createCommand('dm', async (client, message, { text }) => {
  const target = parseTarget(text, 'user');
  if (!target) return usage(client, message, 'dm @user [message]');
  return client.campaigns.sendDM(message, target.id, target.text);
});
