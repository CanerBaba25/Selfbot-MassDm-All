'use strict';

const { createCommand } = require('../util/dmCommands');

module.exports = createCommand('dmpreview', async (client, message, { text }) => {
  return client.campaigns.preview(message, text);
});
