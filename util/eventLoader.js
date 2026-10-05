'use strict';

const { Events } = require('discord.js');
const onMessage = require('../events/message');
const onReady = require('../events/ready');
const logError = require('./logError');

module.exports = client => {
  client.once(Events.ClientReady, onReady);
  client.on(Events.MessageCreate, message => {
    void onMessage(message).catch(error => logError('Message handler failed', error));
  });
  client.on(Events.Error, error => logError('Discord client error', error));
  client.on(Events.ShardError, error => logError('Discord connection error', error));
};
