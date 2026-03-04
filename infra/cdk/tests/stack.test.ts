import { App } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PokepredictStack } from '../lib/pokepredict-stack';

describe('CDK scaffold stack', () => {
  it('synthesizes outputs for naming and phase notice', () => {
    const app = new App();
    const stack = new PokepredictStack(app, 'test-stack', {
      project: 'pokepredict',
      stage: 'dev'
    });

    const template = Template.fromStack(stack);
    template.hasOutput('NamingPrefix', {});
    template.hasOutput('Phase0Notice', {});
    expect(template.toJSON().Outputs).toBeTruthy();
  });
});
