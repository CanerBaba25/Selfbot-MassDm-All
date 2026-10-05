'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../util/config');

const valid = { DISCORD_TOKEN: 'example-bot-credential' };
const configurationError = (error) => error.name === 'ConfigurationError';

test('defaults include a one-second delay and an optional empty default message', () => {
  const config = loadConfig(valid);
  assert.deepEqual(config, {
    token: 'example-bot-credential', prefix: '!', delayMs: 1000,
    defaultMessage: '', port: 3000, host: '0.0.0.0',
  });
  assert.equal(Object.isFrozen(config), true);
});

test('custom settings preserve default message text and trim credentials and numeric settings', () => {
  const defaultMessage = '  Hello everyone!\nSecond line with emoji 👋  ';
  assert.deepEqual(loadConfig({
    DISCORD_TOKEN: ' example-bot-credential ', COMMAND_PREFIX: '!!',
    DM_DELAY_MS: ' 4000 ', DEFAULT_MESSAGE: defaultMessage,
    PORT: ' 8080 ', HOST: ' 127.0.0.1 ',
  }), {
    token: 'example-bot-credential', prefix: '!!', delayMs: 4000,
    defaultMessage, port: 8080, host: '127.0.0.1',
  });
});

test('missing, blank and placeholder credentials remain invalid', () => {
  for (const token of [undefined, '', '   ', 'token', 'TOKEN', 'your_bot_token_here', 'your-token', 'your token']) {
    assert.throws(() => loadConfig({ DISCORD_TOKEN: token }), configurationError);
  }
});

test('command prefixes retain length and whitespace validation', () => {
  for (const prefix of ['', ' ', '! ', '\t!', 'abcdefghijk']) {
    assert.throws(() => loadConfig({ ...valid, COMMAND_PREFIX: prefix }), configurationError);
  }
  assert.equal(loadConfig({ ...valid, COMMAND_PREFIX: 'abcdefghij' }).prefix, 'abcdefghij');
});

test('delay and port settings accept valid boundaries and reject non-integers or out-of-range values', () => {
  for (const delay of ['1000', '60000']) {
    assert.equal(loadConfig({ ...valid, DM_DELAY_MS: delay }).delayMs, Number(delay));
  }
  for (const delay of ['', '999', '60001', '-1000', '1000.5', '1e3', 'Infinity', 'abc']) {
    assert.throws(() => loadConfig({ ...valid, DM_DELAY_MS: delay }), configurationError);
  }
  for (const port of ['1', '65535']) {
    assert.equal(loadConfig({ ...valid, PORT: port }).port, Number(port));
  }
  for (const port of ['', '0', '65536', '-1', '1.5', 'abc']) {
    assert.throws(() => loadConfig({ ...valid, PORT: port }), configurationError);
  }
});

test('an explicitly empty host is rejected', () => {
  for (const host of ['', '  ']) {
    assert.throws(() => loadConfig({ ...valid, HOST: host }), configurationError);
  }
});
