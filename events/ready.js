'use strict';

module.exports = client => {
  console.log(`[${new Date().toISOString()}] Logged in as ${client.user.tag}.`);
  console.log(`Loaded ${client.commands.size} command(s) across ${client.guilds.cache.size} server(s).`);
};
