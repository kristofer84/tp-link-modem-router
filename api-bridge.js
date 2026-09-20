#!/usr/bin/env node

import minimist from 'minimist'
import express from 'express'
import nocache from 'nocache'
import swaggerJsdoc from 'swagger-jsdoc'
import swaggerUi from 'swagger-ui-express'
import expressBasicAuth from 'express-basic-auth'

import RouterClient from './src/routerClient.mjs'
import { loadConfig } from './src/config.mjs'
import logger, { configureLogger } from './src/logger.mjs'

// machine-readable output: this runs as a service behind docker/systemd
configureLogger({ format: 'json' })

let configFilePath = './config.json';

const argv = minimist(process.argv.slice(2));

if (typeof argv['config'] !== 'undefined') {
  configFilePath = argv['config'];
}


let config;

try {
  ({ config } = loadConfig({
    path: configFilePath,
    required: ['url', 'login', 'password', 'api_users', 'api_listen_host', 'api_listen_port'],
  }));
} catch (exception) {
  logger.error(exception.message);
  process.exit(1);
}

const app = express();

const client = new RouterClient(config.url, config.login, config.password);

app.use(express.json());
app.use(express.urlencoded({ extended: true })); // support encoded bodies
app.use(nocache());
app.set('router_client', client);
app.set('config', config);
app.disable('x-powered-by');

import smsRoutes from './src/controllers/sms.mjs';
import monitoringRoutes from './src/controllers/monitoring.mjs';
import lteRoutes from './src/controllers/lte.mjs';

const authentication = expressBasicAuth({
  users: config.api_users,
  challenge: true,
});

app.use('/api/v1/sms', authentication, smsRoutes);
app.use('/api/v1/monitoring', authentication, monitoringRoutes);
app.use('/api/v1/lte', authentication, lteRoutes);

const options = {
  // renamed from swaggerDefinition in swagger-jsdoc v5; the old key is
  // silently ignored, which yields an empty spec rather than an error
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Archer MR600 bridge API",
      version: "1.0.0",
      description: "Open Source API bridge for Archer MR600",
    },
    servers: [
      {
        url: `http://${config.api_listen_host}:${config.api_listen_port}/api/v1`
      }
    ]
  },
  apis: ['./src/controllers/*']
};

const specs = swaggerJsdoc(options);

app.use("/", swaggerUi.serve);
app.get(
  "/",
  swaggerUi.setup(specs, {
    explorer: true,
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'API bridge for Archer MR600',
  })
);

app.listen(config.api_listen_port, config.api_listen_host, () => logger.info(`Api bridge listening at http://${config.api_listen_host}:${config.api_listen_port}`))