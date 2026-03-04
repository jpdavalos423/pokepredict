import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PokepredictStack } from '../lib/pokepredict-stack';

describe('Phase 1 data platform stack', () => {
  it('creates data platform resources with StartRun-first pipeline', () => {
    const app = new App();
    const stack = new PokepredictStack(app, 'test-stack', {
      project: 'pokepredict',
      stage: 'dev',
      sourceName: 'fixture',
      ingestScheduleCron: 'cron(0 6 * * ? *)'
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 7);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    template.resourceCountIs('AWS::Events::Rule', 1);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 4);

    template.resourceCountIs('AWS::Lambda::Function', 4);
    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x'
    });

    const stateMachines = template.findResources('AWS::StepFunctions::StateMachine');
    const stateMachineBody = JSON.stringify(Object.values(stateMachines)[0]);
    expect(stateMachineBody).toContain('StartRun');
    expect(stateMachineBody).toContain('FetchRaw');
    expect(stateMachineBody).toContain('Normalize');

    template.hasResourceProperties('AWS::Events::Rule', {
      ScheduleExpression: 'cron(0 6 * * ? *)'
    });

    template.hasResourceProperties('AWS::Events::Rule', {
      Targets: Match.arrayWith([
        Match.objectLike({
          Input: JSON.stringify({
            source: 'fixture',
            mode: 'scheduled'
          })
        })
      ])
    });

    template.hasResourceProperties('AWS::S3::Bucket', {
      BucketName: Match.absent()
    });

    expect(template.toJSON().Outputs).toBeTruthy();
  });
});
