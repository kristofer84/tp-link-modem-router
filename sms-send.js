#!/usr/bin/env node
// Send SMS via router

import fs from 'fs'
import minimist from 'minimist'
import RouterClient from './src/routerClient.mjs'
import { TP_ACT, TP_CONTROLLERS } from './src/routerProtocol.mjs'
import logger, { configureLogger } from './src/logger.mjs'

// human-readable output by default; LOG_FORMAT=json overrides for scripted use
configureLogger({ format: 'text' })

// change these values if you do not want to provide them as args
// using the config.json file is recommended
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
    '  LOG_FORMAT=text|json   output shape (default: text)',
    '  LOG_LEVEL=info|debug   verbosity (default: info)',
    '',
  ].join('\n'));
  process.exit(1);
}

if (typeof argv['config'] !== 'undefined') {
  configFilePath = argv['config'];
}

try {
  let rawConfig = fs.readFileSync(configFilePath);
  let config = JSON.parse(rawConfig);
  routerUiUrl = config.url;
  routerUiLogin = config.login;
  routerUiPassword = config.password;
} catch(exception) {
  logger.warn(`Config file ${configFilePath} could not be read, falling back to defaults and arguments`);
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

const payloadGetSendSmsResult = {
  method: TP_ACT.ACT_GET,
  controller: TP_CONTROLLERS.LTE_SMS_SENDNEWMSG,
  attrs: [
    'sendResult'
  ]
}

let exitCode = 0;

try {
  await client.connect();

  verifySubmission(await client.execute(payloadSendSms));

  exitCode = reportSendResult(await client.execute(payloadGetSendSmsResult));
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
  const sendResult = result.error === 0 ? result.data[0]['sendResult'] : null;

  if (sendResult === 1) {
    logger.info('SMS sent successfully');
    return 0;
  }

  if (sendResult === 3) {
    //TODO sendResult=3 means queued or processing ??
    logger.warn('SMS sending was accepted but not yet processed');
    return 0;
  }

  logger.error('SMS could not be sent by router', { error: result.error, sendResult });
  return 1;
}
