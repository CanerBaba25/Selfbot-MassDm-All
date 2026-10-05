'use strict';

function invalid(message) {
  const error = new Error(message);
  error.name = 'ConfigurationError';
  throw error;
}

function integer(env, key, fallback, minimum, maximum) {
  const raw = env[key] === undefined ? String(fallback) : env[key].trim();
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    invalid(`${key} must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function loadConfig(env = process.env) {
  const token = env.DISCORD_TOKEN?.trim();
  if (!token || /^(token|your_bot_token_here|your[-_ ]?token)$/i.test(token)) {
    invalid('Set DISCORD_TOKEN to your bot token in .env or the environment.');
  }
  const prefix = env.COMMAND_PREFIX ?? '!';
  if (!prefix || prefix.length > 10 || /\s/.test(prefix)) {
    invalid('COMMAND_PREFIX must contain 1-10 characters without whitespace.');
  }
  const host = (env.HOST ?? '0.0.0.0').trim();
  if (!host) invalid('HOST cannot be empty.');

  return Object.freeze({
    token,
    prefix,
    delayMs: integer(env, 'DM_DELAY_MS', 7000, 1000, 60_000),
    port: integer(env, 'PORT', 3000, 1, 65535),
    host,
  });
}

module.exports = { loadConfig };
