'use strict';

const { createCommand } = require('../util/dmCommands');

module.exports = createCommand('dmallsafe', async (client, message, { text }) => {
  return client.campaigns.startAll(message, text, { safe: true });
});
