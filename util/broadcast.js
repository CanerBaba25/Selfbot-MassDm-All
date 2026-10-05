'use strict';

const { setTimeout: sleep } = require('node:timers/promises');

async function broadcast(recipients, payload, { delayMs, signal, wait = sleep }) {
  const result = { sent: 0, failed: 0, remaining: recipients.length, cancelled: false };
  for (let index = 0; index < recipients.length; index += 1) {
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }
    if (index > 0) {
      try {
        await wait(delayMs, undefined, { signal });
      } catch (error) {
        if (!signal?.aborted) throw error;
        result.cancelled = true;
        break;
      }
    }
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }

    try {
      await recipients[index].send(payload);
      result.sent += 1;
    } catch (error) {
      result.failed += 1;
      // An invalid bot credential is a job-wide failure, not a closed inbox.
      if (error?.status === 401 || error?.code === 50014) {
        result.cancelled = true;
      }
    }
    result.remaining -= 1;
    if (result.cancelled) break;
  }
  return result;
}

module.exports = { broadcast };
