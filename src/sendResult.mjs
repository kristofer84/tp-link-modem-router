import { TP_ACT, TP_CONTROLLERS } from './routerProtocol.mjs'

/**
 * Reading back whether a submitted SMS actually left the modem.
 *
 * Caveat worth knowing before building on this: the router exposes a single
 * global `sendResult` on LTE_SMS_SENDNEWMSG describing the most recent send.
 * It is not keyed by message, so a second send started before the first is
 * verified overwrites it. That is fine for the one-at-a-time use this sees, and
 * it is why verification is opt-in rather than the default.
 *
 * Note also that this is the *router's* view: it means the modem handed the
 * message to the network. The protocol carries no delivery receipt, so nothing
 * here can assert that a handset received anything.
 */

export const PAYLOAD_GET_SEND_RESULT = {
  method: TP_ACT.ACT_GET,
  controller: TP_CONTROLLERS.LTE_SMS_SENDNEWMSG,
  attrs: ['sendResult'],
}

export const SEND_RESULT = {
  SENT: 1,
  QUEUED: 3,
}

export const SEND_STATUS = {
  SENT: 'sent',
  QUEUED: 'queued',
  FAILED: 'failed',
}

const DEFAULT_TIMEOUT_MS = 5000;
const DEFAULT_INTERVAL_MS = 500;

/**
 * Pull the numeric sendResult out of a router response, or null if the
 * response does not carry one.
 */
export function readSendResult(result) {
  if (!result || result.error !== 0 || !Array.isArray(result.data) || result.data.length === 0) {
    return null;
  }

  const value = result.data[0]['sendResult'];

  return typeof value === 'number' ? value : null;
}

/**
 * @returns {{sendResult: number|null, status: 'sent'|'queued'|'failed'}}
 */
export function interpretSendResult(result) {
  const sendResult = readSendResult(result);

  if (sendResult === SEND_RESULT.SENT) {
    return { sendResult, status: SEND_STATUS.SENT };
  }

  if (sendResult === SEND_RESULT.QUEUED) {
    return { sendResult, status: SEND_STATUS.QUEUED };
  }

  return { sendResult, status: SEND_STATUS.FAILED };
}

/**
 * Ask the router for the outcome, re-asking while it reports "queued" until it
 * settles or the timeout expires. A still-queued result is returned as such
 * rather than being treated as a failure: it usually means the message is on
 * its way, just slower than we were willing to wait.
 */
export async function pollSendResult(client, options = {}) {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const intervalMs = options.intervalMs ?? DEFAULT_INTERVAL_MS;
  const deadline = Date.now() + timeoutMs;

  let outcome = interpretSendResult(await client.execute(PAYLOAD_GET_SEND_RESULT));

  while (outcome.status === SEND_STATUS.QUEUED && Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, intervalMs));
    outcome = interpretSendResult(await client.execute(PAYLOAD_GET_SEND_RESULT));
  }

  return outcome;
}
