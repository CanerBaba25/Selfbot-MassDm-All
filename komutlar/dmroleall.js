'use strict';

const { createCommand, usage, parseTarget } = require('../util/dmCommands');

module.exports = createCommand('dmroleall', async (client, message, { text }) => {
  const target = parseTarget(text, 'role');
  if (!target) return usage(client, message, 'dmroleall @Role [message]');
  return client.campaigns.startRole(message, target.id, target.text);
});
