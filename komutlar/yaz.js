'use strict';

const { createCommand } = require('../util/dmCommands');

module.exports = createCommand('massdm', async (client, message, { text }) => {
  return client.campaigns.startAll(message, text);
}, ['dmall']);
