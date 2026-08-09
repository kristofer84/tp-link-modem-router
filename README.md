# Goodies for Archer LTE routers

> **This is a fork.** Upstream [plewin/tp-link-modem-router](https://github.com/plewin/tp-link-modem-router)
> has had no commits since November 2021. This fork carries small fixes on the
> `patches` branch; see [Fork changes](#fork-changes) below.

## Features

### Implemented

* Easy to use script to send SMS
* Easy to use script to receive SMS
* REST API bridge for managing and sending SMS
* SMTP to SMS gateway

## Installation and requirements

You need `nodejs` and `yarn`. Install them first.

```bash
# clone this repository and execute to install required dependencies
yarn install
``` 

## Usage

### Limitations and warnings

* Bridge API is subject to change without warnings.
* Special characters work but careful how you escape them in your shell command.
* Script and API must be in the same network of the router (IP is verified by the router's backend).
* You should avoid connecting to the router web UI while using these tools because it might cause unexpected behaviors.
* Time and timezone must be configured on router for accurate received SMS times.

### Send SMS command

```bash
# example passing all arguments as command line args
./sms-send.js --url="http://192.168.1.1" --login="admin" --password="myrouterpassword" "0612345678" "my text message"

# returns 0 on success, 1 on error
# pipe output to /dev/null if you do not want debug output

# you can also hardcode the credentials in the file or in the default config file : config.json
./sms-send.js 0612345678 "my text message"

# it is possible to supply your own config file using the --config arg
./sms-send.js --config="/tmp/config.json" 0612345678 "my text message"

# sample config file (config.json) for sms-send.js
{
    "url": "http://192.168.1.1",
    "login": "admin",
    "password": "myrouterpassword"
}

```

### REST API Bridge

```bash
# Start API bridge, using local config.json
./api-bridge.js

# Using custom config.json file
./api-bridge.js --config=/tmp/config.json

# Sample config.json file
{
    "url": "http://192.168.1.1",
    "login": "admin",
    "password": "myrouterpassword",
    "api_listen_host": "127.0.0.1",
    "api_listen_port": 3000,
    "api_users": { "apiuser": "pleasechangeme" }
}

# Explore API on http://127.0.0.1:3000

# Sample queries
# ==============
# List received SMS
curl --user apiuser:pleasechangeme -X GET "http://127.0.0.1:3000/api/v1/sms/inbox" -H  "accept: application/json"

# Sending SMS application/x-www-form-urlencoded style
curl --user apiuser:pleasechangeme -d to=0123456789 -d content=test1 -X POST "http://127.0.0.1:3000/api/v1/sms/outbox" -H  "accept: application/json"

# Sending SMS application/json style
curl --user apiuser:pleasechangeme -d '{"to":"0123456789", "content":"test2"}' -H 'Content-Type: application/json' -X POST "http://127.0.0.1:3000/api/v1/sms/outbox" -H  "accept: application/json"
```

### Receive SMS with SMS cat

```bash
# Example piping new SMS to command to your own command process_incoming_sms
./sms-cat.js --config=/tmp/config.json | \
    jq -c 'select(.message|contains("Received SMS")) | .sms' | \
    jq -c --raw-output 'select(.from=="+33123456789") .content' | \
    while read smsContent; do ./process_incoming_sms "$smsContent"; done

# Sample config file for sms-cat.js
{
    "api_client_url": "http://localhost:3000",
    "api_client_login": "apiuser",
    "api_client_password": "pleasechangeme",
    "api_client_polling_delay": 5000
}
```

### SMTP to SMS Gateway

```bash
# Start listening for emails
./smtp-gateway.js --config=/tmp/config.json

# Sample config file for smtp-gateway.js
{
    "sms_gateway_url": "http://localhost:3000",
    "sms_gateway_login": "apiuser",
    "sms_gateway_password": "pleasechangeme",
    "sms_gateway_domain": "smtp2sms.local",
    "sms_gateway_listen_host": "127.0.0.1",
    "sms_gateway_listen_port": 1025
}
```

```bash
# SMTP Example
curl -vv smtp://127.0.0.1:1025 --mail-rcpt 123456789@smtp2sms.local --upload-file <(echo && echo -n "Hello world from curl")
```

```
*   Trying 127.0.0.1:1025...
  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current
                                 Dload  Upload   Total   Spent    Left  Speed
  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0* Connected to 127.0.0.1 (127.0.0.1) port 1025 (#0)
< 220 dom0 ESMTP SMTP gateway for SMS API
> EHLO 11
< 250-dom0 Nice to meet you, [127.0.0.1]
< 250-PIPELINING
< 250-8BITMIME
< 250-SMTPUTF8
< 250-AUTH LOGIN PLAIN
< 250 STARTTLS
> MAIL FROM:<>
< 250 Accepted
> RCPT TO:<123456789@smtp2sms.local>
< 250 Accepted
> DATA
< 354 End data with <CR><LF>.<CR><LF>
} [26 bytes data]
< 250 OK: message queued
100    26    0     0    0    26      0     49 --:--:-- --:--:-- --:--:--    49
* Connection #0 to host 127.0.0.1 left intact
```

## Supported models

* TP-Link Archer MR200 v5
    * Firmware Version : ‪1.2.0 0.9.1 v0001.0 Build 210120 Rel.67320n
* TP-Link Archer MR600
* TP-Link TL-MR6400 v5
    * Firmware Version : 1.1.0 0.9.1 v0001.0 Build 200511 Rel.43036n

## Common errors

HTTP 403 while sending SMS or using API bridge
: You might want to double-check that the password supplied is correct and that you call the script from the same network/subnet as the router.

## Development and debugging the router's protocol

To debug the interaction between your browser and the router, first log in on the router UI and then paste this code in the developer console of your browser.
All traffic will be logged in plain text in the console.

```javascript
$.Iencryptor.AESDecrypt_backup = $.Iencryptor.AESDecrypt;
$.Iencryptor.AESEncrypt_backup = $.Iencryptor.AESEncrypt;
$.Iencryptor.AESDecrypt = function(data) {
	let decrypted = $.Iencryptor.AESDecrypt_backup(data);
	console.log("RECV:\n" + decrypted);
	return decrypted;
}
$.Iencryptor.AESEncrypt = function(data) {
	console.log("SEND:\n" + data);
	return $.Iencryptor.AESEncrypt_backup(data);
}
```

### Alternatives and projects of interest

I can offer no guarantees about the following projects

* https://github.com/hercule115/TPLink-Archer
  * Python command line tool to dump MR600 router config and update dynamic DNS
* https://github.com/jeedom/plugin-tplinksms
  * Plugin for Jeedom that provides an UI
* https://github.com/mehmetbeyHZ/tp-link-m7200-api
  * PHP library for TP-Link M7000 range of products
* https://github.com/McMlok/DomoticzToRouterSmsBot
* https://github.com/jonscheiding/tplink-vpn-ddns



## Running the published image

The fork publishes `ghcr.io/kristofer84/tp-link-modem-router` for `linux/arm64`
on every push, so a host needs neither a clone nor a local build:

```bash
docker run --env-file ./.env -p 3000:3000 ghcr.io/kristofer84/tp-link-modem-router
```

Configuration comes from the environment, so nothing has to be mounted and the
image itself carries no credentials:

| Variable | Used by | Default |
|---|---|---|
| `ROUTER_URL` | all | `http://192.168.1.1` |
| `ROUTER_LOGIN` | all | — |
| `ROUTER_PASSWORD` | all | — |
| `API_USERS` | api-bridge | — (`user:pass,user2:pass2`) |
| `API_LISTEN_HOST` | api-bridge | `0.0.0.0` |
| `API_LISTEN_PORT` | api-bridge | `3000` |
| `API_CLIENT_URL` / `_LOGIN` / `_PASSWORD` / `_POLLING_DELAY` | sms-cat | polling delay `5000` |
| `SMS_GATEWAY_URL` / `_LOGIN` / `_PASSWORD` / `_DOMAIN` / `_LISTEN_HOST` / `_LISTEN_PORT` | smtp-gateway | `0.0.0.0`, `1025` |
| `LOG_FORMAT` / `LOG_LEVEL` | all | `json` (`text` for the CLI) / `info` |

A `config.json` still works and can be mounted at `/app/config.json`; the
environment takes precedence over it, and a missing file is only an error if it
leaves a required key unset. Missing configuration is reported by name:

```
Missing required configuration: url (ROUTER_URL), login (ROUTER_LOGIN). Set the
environment variables, or provide them in ./config.json.
```

## Fork changes

Changes carried in this fork, relative to upstream `master` (`108b7f3`):

### The Dockerfile now builds this repository

Upstream's `Dockerfile` `curl`s `master.zip` from GitHub rather than using the
build context, so building the repo produced upstream's code and ignored every
local change — in a fork, that means all of them. It now copies the context,
installs production dependencies in a separate stage so a source-only change
does not re-run `yarn install`, and runs as the `node` user. A `.dockerignore`
keeps `config.json` and `.env` out of image layers even when they are present
locally.

### Configuration from the environment

Added `src/config.mjs`: a JSON file overlaid with environment variables, shared
by all four entry points. This is what makes a credential-free published image
possible — see [Running the published image](#running-the-published-image).

### Consistent log output

Upstream mixed two output styles in a single stream: the CLIs printed plain text
via `console.log` while the shared `RouterClient` they call logged JSON through
winston, so running `sms-send.js` produced interleaved JSON objects and prose.

`src/logger.mjs` now offers two formats, and each entry point picks one:

| Entry point | Format | Rationale |
|---|---|---|
| `sms-send.js` | `text` | one-shot CLI, read by a human |
| `api-bridge.js` | `json` | service, output collected by docker/systemd |
| `sms-cat.js` | `json` | long-lived poller |
| `smtp-gateway.js` | `json` | service |

Two environment variables override the built-in defaults everywhere:

* `LOG_FORMAT=text|json` — output shape
* `LOG_LEVEL=error|warn|info|debug` — verbosity (default `info`)

Colour is applied only when stdout is a terminal, warnings and errors go to
stderr, and all remaining `console.*` calls were moved onto the logger. Usage
text is the one deliberate exception: it is help output, not a log event, so it
is still written plainly to stderr.

### Secrets no longer logged at info level

* `sms-send.js` printed the router password in cleartext on every run, in an
  `args` dump. The password is gone from that line entirely.
* `RouterClient` logged the generated AES key and IV, the signed authentication
  payload, the session cookie and the token id at `info`. These are now `debug`,
  so they stay available for manual decryption while debugging but no longer
  land in service logs by default.

### Fixed crash in the `sms-cat.js` error path

`logger.notice(...)` was called on an abnormal HTTP response, but winston's
default (npm) levels have no `notice` — the call threw a `TypeError` and killed
the poller on the exact path meant to keep it running. It is now `logger.warn`.

### Exit codes from `sms-send.js`

Upstream exited `0` even when the router reported that the SMS could not be
sent, which makes the script unusable in a pipeline or from a monitoring check.
It now exits `1` on a failed send or an unexpected `sendResult`, and `0` on
success or on a queued (`sendResult=3`) message. Disconnection now happens in a
`finally` block, so a failed send still releases the router session.
