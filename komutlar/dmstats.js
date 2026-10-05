'use strict';

const { createCommand, usage, parseDays } = require('../util/dmCommands');

module.exports = createCommand('dmstats', async (client, message, { text }) => {
  const days = parseDays(text);
  if (days === null) return usage(client, message, 'dmstats [days] (1-365 days)');
  return client.campaigns.stats(message, days);
});
