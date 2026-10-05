'use strict';

const { createCommand, usage, parseLogFile } = require('../util/dmCommands');

module.exports = createCommand('dmretry', async (client, message, { text }) => {
  const filename = parseLogFile(text);
  if (!filename) return usage(client, message, 'dmretry <success_log_file>');
  return client.campaigns.retry(message, filename);
});
