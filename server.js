'use strict';

const http = require('node:http');
const path = require('node:path');
const { Client, GatewayIntentBits } = require('discord.js');
const { loadConfig } = require('./util/config');
const loadCommands = require('./util/commandLoader');
const loadEvents = require('./util/eventLoader');
const logError = require('./util/logError');

function createClient(config) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [], repliedUser: false },
    rest: { timeout: 15_000, retries: 3 },
  });
  // Keep the login token out of command configuration and logs.
  client.config = Object.freeze({ prefix: config.prefix, delayMs: config.delayMs });
  client.broadcasts = new Set();
  client.shutdownController = new AbortController();
  loadCommands(client);
  loadEvents(client);
  return client;
}

function createHealthServer(client) {
  return http.createServer((request, response) => {
    if (request.url !== '/' && request.url !== '/health') {
      response.writeHead(404).end();
      return;
    }
    const ready = client.isReady() && !client.shutdownController.signal.aborted;
    response.writeHead(ready ? 200 : 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });
    response.end(JSON.stringify({ status: ready ? 'ready' : 'unavailable' }));
  });
}

async function start() {
  try {
    process.loadEnvFile(path.join(__dirname, '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const config = loadConfig();
  const client = createClient(config);
  const server = createHealthServer(client);
  let stopPromise;

  const stop = () => {
    if (stopPromise) return stopPromise;
    client.shutdownController.abort();
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    stopPromise = Promise.all([
      new Promise(resolve => {
        server.close(resolve);
        server.closeAllConnections();
      }),
      Promise.resolve().then(() => client.destroy()),
    ]);
    return stopPromise;
  };
  const onSignal = () => {
    void stop().catch(error => {
      logError('Shutdown failed', error);
      process.exitCode = 1;
    });
  };

  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(config.port, config.host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
    server.on('error', error => {
      logError('Health server failed', error);
      process.exitCode = 1;
      onSignal();
    });
    process.once('SIGINT', onSignal);
    process.once('SIGTERM', onSignal);
    await client.login(config.token);
    return { client, server, stop };
  } catch (error) {
    try {
      await stop();
    } catch (stopError) {
      logError('Startup cleanup failed', stopError);
    }
    throw error;
  }
}

if (require.main === module) {
  void start().catch(error => {
    if (error.name === 'ConfigurationError') {
      console.error(error.message);
    } else {
      logError('Startup failed. Check your bot token, intents, and port configuration', error);
    }
    process.exitCode = 1;
  });
}

module.exports = { createClient, createHealthServer, start };
