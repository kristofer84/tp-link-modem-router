#!/usr/bin/env node
// Send SMS via router

import minimist from 'minimist'
import RouterClient from './src/routerClient.mjs'
import { TP_ACT, TP_CONTROLLERS } from './src/routerProtocol.mjs'
import logger, { configureLogger } from './src/logger.mjs'
import { loadConfig } from './src/config.mjs'
import { PAYLOAD_GET_SEND_RESULT, SEND_STATUS, interpretSendResult } from './src/sendResult.mjs'

// human-readable output by default; LOG_FORMAT=json overrides for scripted use
configureLogger({ format: 'text' })

// last-resort fallbacks, overridden by config.json, then the environment,
// then the command line arguments
let routerUiUrl = 'http://192.168.1.1';
let routerUiLogin = 'admin';
let routerUiPassword = 'myrouterpassword';
let configFilePath = 'config.json';

const argv = minimist(process.argv.slice(2), {
  string: '_', // prevent string to number conversion
});

if (argv['_'].length !== 2) {
  // usage is help text rather than a log event, so it is written plainly
  process.stderr.write([
    'This command requires 2 arguments, a number and a string text message',
    '',
    'Examples:',
    '  $self --url="http://192.168.1.1" --login=admin --password=myrouterpassword 0612345678 "my text message"',
    '  $self --config=/tmp/config.json 0612345678 "my text message"',
    '  $self 0612345678 "my text message"',
    '',
    'Environment:',
    '  ROUTER_URL, ROUTER_LOGIN, ROUTER_PASSWORD   router credentials',
    '  LOG_FORMAT=text|json                        output shape (default: text)',
    '  LOG_LEVEL=info|debug                        verbosity (default: info)',
    '',
  ].join('\n'));
  process.exit(1);
}

if (typeof argv['config'] !== 'undefined') {
  configFilePath = argv['config'];
}

try {
  // file, then environment, then the command line arguments below
  const { config } = loadConfig({ path: configFilePath });
  routerUiUrl = config.url || routerUiUrl;
  routerUiLogin = config.login || routerUiLogin;
  routerUiPassword = config.password || routerUiPassword;
} catch (exception) {
  logger.error(exception.message);
  process.exit(1);
}

if (typeof argv['url'] !== 'undefined') {
  routerUiUrl = argv['url'];
}

if (typeof argv['login'] !== 'undefined') {
  routerUiLogin = argv['login'];
}

if (typeof argv['password'] !== 'undefined') {
  routerUiPassword = argv['password'];
}

const to = argv['_'][0];
const textContent = argv['_'][1];

// the router password is deliberately absent here: it is never useful in a log
// and this line used to print it in cleartext on every run
logger.debug('Resolved configuration', { routerUiUrl, routerUiLogin, to });

const client = new RouterClient(routerUiUrl, routerUiLogin, routerUiPassword);

const payloadSendSms = {
  method: TP_ACT.ACT_SET,
  controller: TP_CONTROLLERS.LTE_SMS_SENDNEWMSG,
  attrs: {
    'index': 1,
    to,
    textContent,
  }
}

let exitCode = 0;

try {
  await client.connect();

  verifySubmission(await client.execute(payloadSendSms));

  exitCode = reportSendResult(await client.execute(PAYLOAD_GET_SEND_RESULT));
} catch (error) {
  logger.error(`SMS could not be sent: ${error.message}`);
  logger.debug('Failure details', { stack: error.stack });
  exitCode = 1;
} finally {
  // only meaningful if we got far enough to hold a session
  if (client.isReady) {
    await client.disconnect().catch(error => logger.debug(`Disconnect failed: ${error.message}`));
  }
}

process.exit(exitCode);

function verifySubmission(result) {
  if (result.error !== 0) {
    // hopefully we will never have this error
    throw new Error('SMS send operation was not accepted');
  }

  logger.info('SMS send operation was accepted');
}

/**
 * Report on the router's own view of the send, and map it to an exit code so
 * that callers can react to a failure instead of parsing the output.
 *
 * @returns {number} process exit code
 */
function reportSendResult(result) {
  const outcome = interpretSendResult(result);

  if (outcome.status === SEND_STATUS.SENT) {
    logger.info('SMS sent successfully');
    return 0;
  }

  if (outcome.status === SEND_STATUS.QUEUED) {
    logger.warn('SMS sending was accepted but not yet processed');
    return 0;
  }

  logger.error('SMS could not be sent by router', { error: result.error, sendResult: outcome.sendResult });
  return 1;
}
