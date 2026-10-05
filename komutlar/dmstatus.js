'use strict';

const { createCommand, usage } = require('../util/dmCommands');

module.exports = createCommand('dmstatus', async (client, message, { text }) => {
  if (text.trim()) return usage(client, message, 'dmstatus');
  return client.campaigns.status(message);
});
