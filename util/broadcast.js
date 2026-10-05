'use strict';

const { setTimeout: sleep } = require('node:timers/promises');

const NORMAL_PACING = Object.freeze({ delayMs: 1000, batchSize: 20, batchCooldownMs: 300_000 });
const SAFE_PACING = Object.freeze({
  delayMs: 4000,
  batchSize: 0,
  cooldowns: Object.freeze([
    Object.freeze({ every: 100, delayMs: 480_000 }),
    Object.freeze({ every: 40, delayMs: 240_000 }),
    Object.freeze({ every: 15, delayMs: 90_000 }),
  ]),
});

async function broadcast(recipients, payload, {
  delayMs = 1000, batchSize = 20, batchCooldownMs = 300_000, cooldowns = [],
  signal, wait = sleep, onAttempt, onProgress, onCooldown,
} = {}) {
  const result = { sent: 0, failed: 0, remaining: recipients.length, cancelled: false };
  const progress = () => ({ ...result, attempted: result.sent + result.failed, total: recipients.length });
  const pause = async milliseconds => {
    try {
      if (milliseconds > 0) await wait(milliseconds, undefined, { signal });
      return !signal?.aborted;
    } catch (error) {
      if (!signal?.aborted) throw error;
      return false;
    }
  };

  for (let index = 0; index < recipients.length; index += 1) {
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }
    if (index > 0) {
      if (!await pause(delayMs)) {
        result.cancelled = true;
        break;
      }
      const rule = cooldowns.find(item => index % item.every === 0);
      const batchDelay = rule?.delayMs ?? (batchSize > 0 && index % batchSize === 0 ? batchCooldownMs : 0);
      if (batchDelay > 0) {
        await onCooldown?.({ ...progress(), delayMs: batchDelay });
        if (!await pause(batchDelay)) {
          result.cancelled = true;
          break;
        }
      }
    }
    if (signal?.aborted) {
      result.cancelled = true;
      break;
    }

    let success = false;
    let errorCode;
    try {
      await recipients[index].send(payload);
      result.sent += 1;
      success = true;
    } catch (error) {
      result.failed += 1;
      errorCode = typeof error?.code === 'number' ? error.code : error?.status;
      // An invalid bot credential is a job-wide failure, not a closed inbox.
      if (error?.status === 401 || error?.code === 50014) {
        result.cancelled = true;
      }
    }
    result.remaining -= 1;
    await onAttempt?.({ userId: recipients[index].id, success, errorCode });
    await onProgress?.(progress());
    if (result.cancelled) break;
  }
  return result;
}

module.exports = { broadcast, NORMAL_PACING, SAFE_PACING };
