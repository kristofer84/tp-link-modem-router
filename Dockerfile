# syntax=docker/dockerfile:1

# This builds the source in *this* repository. It used to curl a master.zip
# from upstream instead, which meant building the repo produced somebody else's
# code and ignored every local change -- including, in a fork, all of them.

FROM node:lts-alpine AS dependencies
WORKDIR /app
# copied on their own so a source-only change does not re-run yarn install
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production

FROM node:lts-alpine
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY . .

# No config.json is baked in: configuration comes from the environment (see
# src/config.mjs), so this image holds no credentials and can be published.
# A config.json may still be mounted at /app/config.json if preferred.
ENV NODE_ENV=production

USER node
EXPOSE 3000
CMD ["node", "./api-bridge.js"]
