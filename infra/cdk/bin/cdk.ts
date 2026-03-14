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
  cursorSigningSecretParam: cfg.cursorSigningSecretParam,
  cursorSigningSecretVersion: 1,
  sesFromEmail: cfg.sesFromEmail,
  fetchRawTimeoutSeconds: cfg.fetchRawTimeoutSeconds,
  normalizeTimeoutSeconds: cfg.normalizeTimeoutSeconds,
  stateMachineTimeoutMinutes: cfg.stateMachineTimeoutMinutes,
  tcgdex: cfg.tcgdex,
  description: 'PokePredict Phase 5 data platform, API, and alerts stack.'
});
