'use strict';

const { PermissionFlagsBits } = require('discord.js');

function createCommand(name, execute, aliases = []) {
  return {
    name,
    aliases,
    enabled: true,
    guildOnly: true,
    requiredPermissions: [PermissionFlagsBits.Administrator],
    execute,
  };
}

function usage(client, message, syntax) {
  return message.channel.send({
    content: `Usage: ${client.config.prefix}${syntax}`,
    allowedMentions: { parse: [] },
  });
}

function parseTarget(text, type) {
  const match = /^\s*(\S+)(?:\s+([\s\S]*))?$/.exec(text);
  if (!match) return null;
  const mentionPattern = type === 'role' ? /^<@&(\d{17,20})>$/ : /^<@!?(\d{17,20})>$/;
  const mention = mentionPattern.exec(match[1]);
  const id = mention ? mention[1] : /^\d{17,20}$/.test(match[1]) ? match[1] : null;
  return id ? { id, text: (match[2] || '').trim() } : null;
}

function parseLogFile(text) {
  const filename = text.trim();
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/.test(filename) ? filename : null;
}

function parseDays(text) {
  const value = text.trim();
  if (!value) return 7;
  if (!/^[1-9]\d{0,2}$/.test(value)) return null;
  const days = Number(value);
  return days <= 365 ? days : null;
}

module.exports = { createCommand, usage, parseTarget, parseLogFile, parseDays };
