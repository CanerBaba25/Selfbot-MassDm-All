'use strict';

const { createCommand, usage, parseTarget } = require('../util/dmCommands');

module.exports = createCommand('dmroleallsafe', async (client, message, { text }) => {
  const target = parseTarget(text, 'role');
  if (!target) return usage(client, message, 'dmroleallsafe @Role [message]');
  return client.campaigns.startRole(message, target.id, target.text, { safe: true });
});
