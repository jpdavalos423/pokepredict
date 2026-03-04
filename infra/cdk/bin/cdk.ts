#!/usr/bin/env node
import { App } from 'aws-cdk-lib';
import { PokepredictStack } from '../lib/pokepredict-stack';
import { loadCdkEnvConfig } from '../src/config/env';

const app = new App();
const cfg = loadCdkEnvConfig();

new PokepredictStack(app, `${cfg.project}-${cfg.stage}-stack`, {
  env: {
    account: cfg.account,
    region: cfg.region
  },
  project: cfg.project,
  stage: cfg.stage,
  sourceName: cfg.sourceName,
  ingestScheduleCron: cfg.ingestScheduleCron,
  description: 'PokePredict Phase 1 data platform stack.'
});
