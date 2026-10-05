'use strict';

const { createCommand, usage } = require('../util/dmCommands');

module.exports = createCommand('dmestimate', async (client, message, { text }) => {
  const match = /^([1-9]\d{0,5})(?:\s+(safe))?$/.exec(text.trim());
  const count = match ? Number(match[1]) : 0;
  if (!count || count > 100000) {
    return usage(client, message, 'dmestimate <recipient_count> [safe] (1-100000 recipients)');
  }
  return client.campaigns.estimate(message, count, { safe: match[2] === 'safe' });
});
