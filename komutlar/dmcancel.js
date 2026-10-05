'use strict';

const { createCommand, usage } = require('../util/dmCommands');

module.exports = createCommand('dmcancel', async (client, message, { text }) => {
  if (text.trim()) return usage(client, message, 'dmcancel');
  return client.campaigns.cancel(message);
});
