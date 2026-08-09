import winston from 'winston'

const { combine, timestamp, printf, colorize, errors, json, splat } = winston.format

// This project has two kinds of consumers, so the logger has two output shapes:
//
//   json  the long-running services (api-bridge, sms-cat, smtp-gateway), whose
//         output is collected by docker/systemd and read by machines
//   text  the one-shot CLIs (sms-send), whose output is read by a human
//
// Entry points declare their default through configureLogger(). The LOG_FORMAT
// and LOG_LEVEL environment variables always win, so either can be forced from
// the outside without touching code.
const FORMATS = {
  json: () => combine(
    errors({ stack: true }),
    splat(),
    timestamp(),
    json()
  ),
  text: () => combine(
    errors({ stack: true }),
    splat(),
    timestamp({ format: 'HH:mm:ss' }),
    // winston's colorizer does not check for a terminal itself, and escape
    // codes in a piped or redirected log are worse than no colour at all
    ...(process.stdout.isTTY ? [colorize({ level: true })] : []),
    printf(({ level, message, timestamp, stack, ...meta }) => {
      const details = Object.keys(meta).length > 0 ? ' ' + JSON.stringify(meta) : ''
      return `${timestamp} ${level} ${stack || message}${details}`
    })
  ),
}

const DEFAULT_FORMAT = 'json'
const DEFAULT_LEVEL = 'info'

function buildOptions(format, level) {
  const name = process.env.LOG_FORMAT || format || DEFAULT_FORMAT

  if (typeof FORMATS[name] === 'undefined') {
    throw new Error(`Unknown log format '${name}', expected one of: ${Object.keys(FORMATS).join(', ')}`)
  }

  return {
    level: process.env.LOG_LEVEL || level || DEFAULT_LEVEL,
    format: FORMATS[name](),
    // warnings and errors belong on stderr so CLI output can be piped safely
    transports: [new winston.transports.Console({ stderrLevels: ['error', 'warn'] })],
  }
}

const logger = winston.createLogger(buildOptions())

/**
 * Re-shape the logger for the current entry point.
 *
 * Call once at startup, before anything is logged.
 *
 * @param {{format?: 'json'|'text', level?: string}} options
 */
export function configureLogger(options = {}) {
  logger.configure(buildOptions(options.format, options.level))
  return logger
}

export default logger
