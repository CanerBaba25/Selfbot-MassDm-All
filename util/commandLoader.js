'use strict';

const fs = require('node:fs');
const path = require('node:path');

module.exports = (client, directory = path.join(__dirname, '..', 'komutlar')) => {
  const commands = new Map();
  const aliases = new Map();
  const names = new Set();
  const files = fs.readdirSync(directory, { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.js'))
    .map(entry => entry.name).sort();
  if (!files.length) throw new Error('No command files found.');

  for (const file of files) {
    const command = require(path.resolve(directory, file));
    if (!command || !/^[a-z0-9_-]+$/.test(command.name || '') ||
        typeof command.execute !== 'function' || !Array.isArray(command.aliases) ||
        !Array.isArray(command.requiredPermissions) || typeof command.guildOnly !== 'boolean' ||
        typeof command.enabled !== 'boolean') {
      throw new Error(`Invalid command definition: ${file}`);
    }
    for (const name of [command.name, ...command.aliases]) {
      if (typeof name !== 'string' || !/^[a-z0-9_-]+$/.test(name) || names.has(name)) {
        throw new Error(`Invalid or duplicate command name in ${file}`);
      }
      names.add(name);
    }
    commands.set(command.name, command);
    for (const alias of command.aliases) aliases.set(alias, command.name);
  }
  client.commands = commands;
  client.aliases = aliases;
};
