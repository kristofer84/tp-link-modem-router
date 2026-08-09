import fs from 'fs'

/**
 * Configuration comes from a JSON file overlaid with environment variables, so
 * a container can run with nothing mounted into it:
 *
 *   docker run --env-file ./.env -p 3000:3000 ghcr.io/kristofer84/tp-link-modem-router
 *
 * Environment wins over the file, and the file is optional -- a missing one is
 * only an error if it leaves a required key unset. That ordering matters for
 * the image: config.json is deliberately not baked in, so the published image
 * carries no credentials and can stay public.
 */

// environment variable -> config.json key
const STRING_KEYS = {
  ROUTER_URL: 'url',
  ROUTER_LOGIN: 'login',
  ROUTER_PASSWORD: 'password',
  API_LISTEN_HOST: 'api_listen_host',
  API_CLIENT_URL: 'api_client_url',
  API_CLIENT_LOGIN: 'api_client_login',
  API_CLIENT_PASSWORD: 'api_client_password',
  SMS_GATEWAY_URL: 'sms_gateway_url',
  SMS_GATEWAY_LOGIN: 'sms_gateway_login',
  SMS_GATEWAY_PASSWORD: 'sms_gateway_password',
  SMS_GATEWAY_DOMAIN: 'sms_gateway_domain',
  SMS_GATEWAY_LISTEN_HOST: 'sms_gateway_listen_host',
}

const NUMBER_KEYS = {
  API_LISTEN_PORT: 'api_listen_port',
  API_CLIENT_POLLING_DELAY: 'api_client_polling_delay',
  SMS_GATEWAY_LISTEN_PORT: 'sms_gateway_listen_port',
}

// listening on loopback is a poor default inside a container, where it would
// make the published port unreachable
const DEFAULTS = {
  api_listen_host: '0.0.0.0',
  api_listen_port: 3000,
  api_client_polling_delay: 5000,
  sms_gateway_listen_host: '0.0.0.0',
  sms_gateway_listen_port: 1025,
}

// reverse lookup, so an error message can name the variable the user should set
const ENV_FOR_KEY = Object.fromEntries(
  Object.entries({ ...STRING_KEYS, ...NUMBER_KEYS }).map(([env, key]) => [key, env])
)

/**
 * Parse the API_USERS form `alice:secret,bob:hunter2` into the object shape
 * express-basic-auth expects.
 */
function parseUsers(value) {
  const users = {};

  for (const pair of value.split(',')) {
    const entry = pair.trim();

    if (entry === '') {
      continue;
    }

    // split on the first colon only: passwords may contain colons
    const separator = entry.indexOf(':');

    if (separator < 1) {
      throw new Error(`API_USERS entry '${entry}' is not in user:password form`);
    }

    users[entry.slice(0, separator)] = entry.slice(separator + 1);
  }

  if (Object.keys(users).length === 0) {
    throw new Error('API_USERS is set but contains no user:password pairs');
  }

  return users;
}

function readConfigFile(configFilePath) {
  try {
    return JSON.parse(fs.readFileSync(configFilePath));
  } catch (exception) {
    // absent or unreadable is fine as long as the environment fills the gaps
    return null;
  }
}

/**
 * Build the effective configuration.
 *
 * @param {{path?: string, required?: string[]}} options
 * @returns {{config: object, source: {file: boolean}}}
 */
export function loadConfig(options = {}) {
  const configFilePath = options.path || 'config.json';
  const required = options.required || [];

  const fromFile = readConfigFile(configFilePath);
  const config = { ...DEFAULTS, ...(fromFile || {}) };

  for (const [variable, key] of Object.entries(STRING_KEYS)) {
    if (typeof process.env[variable] !== 'undefined') {
      config[key] = process.env[variable];
    }
  }

  for (const [variable, key] of Object.entries(NUMBER_KEYS)) {
    if (typeof process.env[variable] === 'undefined') {
      continue;
    }

    const parsed = Number.parseInt(process.env[variable], 10);

    if (Number.isNaN(parsed)) {
      throw new Error(`${variable} must be a number, got '${process.env[variable]}'`);
    }

    config[key] = parsed;
  }

  if (typeof process.env.API_USERS !== 'undefined') {
    config.api_users = parseUsers(process.env.API_USERS);
  }

  const missing = required.filter(key => {
    const value = config[key];
    return typeof value === 'undefined' || value === null || value === '';
  });

  if (missing.length > 0) {
    const described = missing
      .map(key => (key === 'api_users' ? 'api_users (API_USERS)' : `${key} (${ENV_FOR_KEY[key] || 'no env equivalent'})`))
      .join(', ');

    throw new Error(
      `Missing required configuration: ${described}. ` +
      `Set the environment variables, or provide them in ${configFilePath}.`
    );
  }

  return { config, source: { file: fromFile !== null } };
}

export default loadConfig
