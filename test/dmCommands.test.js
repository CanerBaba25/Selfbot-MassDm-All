'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const loadCommands = require('../util/commandLoader');
const dispatch = require('../events/message');

const USER_ID = '123456789012345678';
const ROLE_ID = '234567890123456789';
const SUCCESS_FILE = 'dm_success_6af98196-8138-4f6d-865f-e7d12e0dd6df.jsonl';
const commands = [
  require('../komutlar/yaz'),
  require('../komutlar/dm'),
  require('../komutlar/dmpreview'),
  require('../komutlar/dmallsafe'),
  require('../komutlar/dmroleall'),
  require('../komutlar/dmroleallsafe'),
  require('../komutlar/dmretry'),
  require('../komutlar/dmstatus'),
  require('../komutlar/dmstats'),
  require('../komutlar/dmcancel'),
  require('../komutlar/dmestimate'),
  require('../komutlar/dmhelp'),
];

function harness() {
  const calls = [];
  const replies = [];
  const result = { campaign: 'mock-result' };
  const client = {
    config: { prefix: '!' },
    shutdownController: new AbortController(),
    campaigns: {},
  };
  for (const method of ['startAll', 'startRole', 'sendDM', 'preview', 'retry', 'status', 'stats', 'cancel', 'estimate']) {
    client.campaigns[method] = async (...args) => {
      calls.push({ method, args });
      return result;
    };
  }
  const message = {
    client,
    guild: { id: 'guild-id' },
    author: { id: USER_ID, bot: false },
    member: { permissions: { has: () => true } },
    inGuild: () => true,
    channel: {
      async send(payload) {
        replies.push(payload);
        return payload;
      },
    },
  };
  return { client, message, calls, replies, result };
}

function getCommand(name) {
  const command = commands.find(item => item.name === name);
  assert.ok(command, `Expected command ${name}`);
  return command;
}

async function execute(name, text, state = harness()) {
  const result = await getCommand(name).execute(state.client, state.message, {
    text,
    args: text.trim() ? text.trim().split(/\s+/) : [],
  });
  return { ...state, executionResult: result };
}

test('every DM command requires Administrator permission and a server', () => {
  assert.equal(commands.length, 12);
  for (const command of commands) {
    assert.equal(command.enabled, true, command.name);
    assert.equal(command.guildOnly, true, command.name);
    assert.deepEqual(command.requiredPermissions, [PermissionFlagsBits.Administrator], command.name);
  }
});

test('loader registers all commands and the existing massdm command keeps the dmall alias', () => {
  const { client } = harness();
  loadCommands(client);
  assert.equal(client.commands.size, 12);
  assert.equal(client.aliases.get('dmall'), 'massdm');
  assert.deepEqual(client.commands.get('massdm').aliases, ['dmall']);
});

for (const [name, text, method, extraArgs] of [
  ['massdm', 'hello  everyone\nagain', 'startAll', ['hello  everyone\nagain']],
  ['massdm', '', 'startAll', ['']],
  ['dmallsafe', 'hello', 'startAll', ['hello', { safe: true }]],
  ['dmallsafe', '', 'startAll', ['', { safe: true }]],
  ['dmpreview', 'hello  again', 'preview', ['hello  again']],
  ['dmpreview', '', 'preview', ['']],
  ['dmretry', SUCCESS_FILE, 'retry', [SUCCESS_FILE]],
  ['dmstatus', '', 'status', []],
  ['dmstats', '', 'stats', [7]],
  ['dmstats', '1', 'stats', [1]],
  ['dmstats', '365', 'stats', [365]],
  ['dmcancel', '', 'cancel', []],
  ['dmestimate', '1', 'estimate', [1, { safe: false }]],
  ['dmestimate', '20000', 'estimate', [20000, { safe: false }]],
  ['dmestimate', '100000 safe', 'estimate', [100000, { safe: true }]],
  ['dmestimate', '20\tsafe', 'estimate', [20, { safe: true }]],
]) {
  test(`${name} routes ${JSON.stringify(text)} to ${method}`, async () => {
    const state = await execute(name, text);
    assert.deepEqual(state.calls, [{ method, args: [state.message, ...extraArgs] }]);
    assert.deepEqual(state.replies, []);
    assert.equal(state.executionResult, state.result);
  });
}

for (const token of [`<@${USER_ID}>`, `<@!${USER_ID}>`, USER_ID]) {
  test(`dm accepts ${token} and preserves message whitespace`, async () => {
    const text = `${token}\t Hello  everyone\nNext\tline  `;
    const state = await execute('dm', text);
    assert.deepEqual(state.calls, [{
      method: 'sendDM',
      args: [state.message, USER_ID, 'Hello  everyone\nNext\tline'],
    }]);
    assert.deepEqual(state.replies, []);
  });
}

test('dm without optional message forwards the default-message request', async () => {
  const state = await execute('dm', USER_ID);
  assert.deepEqual(state.calls, [{ method: 'sendDM', args: [state.message, USER_ID, ''] }]);
});

for (const name of ['dmroleall', 'dmroleallsafe']) {
  for (const token of [`<@&${ROLE_ID}>`, ROLE_ID]) {
    test(`${name} accepts ${token} and preserves message whitespace`, async () => {
      const state = await execute(name, `${token}  first  second\nthird`);
      const options = name === 'dmroleallsafe' ? [{ safe: true }] : [];
      assert.deepEqual(state.calls, [{
        method: 'startRole',
        args: [state.message, ROLE_ID, 'first  second\nthird', ...options],
      }]);
      assert.deepEqual(state.replies, []);
    });
  }
  test(`${name} accepts an omitted optional message`, async () => {
    const state = await execute(name, `<@&${ROLE_ID}>`);
    const options = name === 'dmroleallsafe' ? [{ safe: true }] : [];
    assert.deepEqual(state.calls, [{ method: 'startRole', args: [state.message, ROLE_ID, '', ...options] }]);
  });
}

for (const [name, inputs] of [
  ['dm', ['', '@user hello', `<@&${ROLE_ID}> hello`, '<@123> hello', '123 hello']],
  ['dmroleall', ['', '@Role hello', `<@${USER_ID}> hello`, '<@&123> hello']],
  ['dmroleallsafe', ['', '@Role hello', `<@!${USER_ID}> hello`]],
  ['dmretry', ['', `${SUCCESS_FILE} extra`, '../file.jsonl', 'logs/file.jsonl', 'logs\\file.jsonl', '.', '..', 'C:file.jsonl']],
  ['dmstatus', ['extra', '\nextra']],
  ['dmstats', ['0', '-1', '366', '1.5', '7 extra', '+7', '07', '1e2', 'NaN']],
  ['dmcancel', ['extra', '\nextra']],
  ['dmhelp', ['extra', '\nextra']],
  ['dmestimate', ['', '0', '-1', '100001', '1.5', '20 slower', '20 Safe', '20 safe extra', '20 safe safe', '+20', '020', '1e3', 'NaN']],
]) {
  test(`${name} rejects malformed arguments before calling the service`, async t => {
    for (const text of inputs) {
      await t.test(JSON.stringify(text), async () => {
        const state = await execute(name, text);
        assert.deepEqual(state.calls, []);
        assert.equal(state.replies.length, 1);
        assert.match(state.replies[0].content, new RegExp(`^Usage: !${name}(?: |$)`));
        assert.deepEqual(state.replies[0].allowedMentions, { parse: [] });
      });
    }
  });
}

test('usage honors the configured prefix', async () => {
  const state = harness();
  state.client.config.prefix = '?';
  await execute('dm', '', state);
  assert.match(state.replies[0].content, /^Usage: \?dm /);
});

test('dmhelp lists every command with the configured prefix and suppresses mentions', async () => {
  const state = harness();
  state.client.config.prefix = '?';
  await execute('dmhelp', '', state);
  assert.deepEqual(state.calls, []);
  assert.equal(state.replies.length, 1);
  const reply = state.replies[0];
  for (const command of commands) {
    const spelling = command.name === 'massdm' ? 'dmall' : command.name;
    assert.ok(reply.content.includes(`?${spelling}`), command.name);
  }
  assert.match(reply.content, /alias: massdm/);
  assert.match(reply.content, /configured default message/);
  assert.deepEqual(reply.allowedMentions, { parse: [] });
  assert.ok(reply.content.length <= 2000);
});

test('dispatcher resolves dmall and preserves internal message whitespace', async () => {
  const state = harness();
  loadCommands(state.client);
  state.message.content = '!dmall hello  everyone\nagain';
  await dispatch(state.message);
  assert.deepEqual(state.calls, [{ method: 'startAll', args: [state.message, 'hello  everyone\nagain'] }]);
});

test('dispatcher rejects every DM command when Administrator permission is missing', async () => {
  for (const command of commands) {
    const state = harness();
    loadCommands(state.client);
    state.message.member.permissions.has = permissions => {
      assert.deepEqual(permissions, [PermissionFlagsBits.Administrator]);
      return false;
    };
    state.message.content = `!${command.name} hello`;
    await dispatch(state.message);
    assert.deepEqual(state.calls, [], command.name);
    assert.match(state.replies[0].content, /Administrator/, command.name);
    assert.deepEqual(state.replies[0].allowedMentions, { parse: [] });
  }
});

test('dispatcher rejects every DM command outside a server', async () => {
  for (const command of commands) {
    const state = harness();
    loadCommands(state.client);
    state.message.inGuild = () => false;
    state.message.guild = null;
    state.message.member = null;
    state.message.content = `!${command.name} hello`;
    await dispatch(state.message);
    assert.deepEqual(state.calls, [], command.name);
    assert.match(state.replies[0].content, /server/, command.name);
  }
});
