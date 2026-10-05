'use strict';

const { createCommand, usage } = require('../util/dmCommands');

module.exports = createCommand('dmhelp', async (client, message, { text }) => {
  if (text.trim()) return usage(client, message, 'dmhelp');
  const prefix = client.config.prefix;
  const commands = [
    'dm @user [message] — Send a DM to one server member.',
    'dmpreview [message] — Preview a DM by sending it to yourself.',
    'dmall [message] — DM all non-bot server members (alias: massdm).',
    'dmallsafe [message] — Use longer delays for all members.',
    'dmroleall @Role [message] — DM non-bot members of a role.',
    'dmroleallsafe @Role [message] — Use longer delays for a role.',
    'dmretry <success_log_file> — Retry failed recipients from a campaign.',
    'dmstatus — Show the latest campaign status.',
    'dmstats [days] — Show delivery statistics (default: 7 days).',
    'dmcancel — Stop the active campaign in this server.',
    'dmestimate <recipient_count> [safe] — Estimate campaign waiting time.',
    'dmhelp — Show this command list.',
  ];
  return message.channel.send({
    content: `DM commands (Administrator permission required):\n${commands.map(command => `${prefix}${command}`).join('\n')}\nOmit [message] to use the configured default message.`,
    allowedMentions: { parse: [] },
  });
});
