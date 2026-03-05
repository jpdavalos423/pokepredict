import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PokepredictStack } from '../lib/pokepredict-stack';

describe('Phase 2 stack', () => {
  it('creates pipeline + public API resources with alarms and outputs', () => {
    const app = new App();
    const stack = new PokepredictStack(app, 'test-stack', {
      project: 'pokepredict',
      stage: 'dev',
      sourceName: 'fixture',
      ingestScheduleCron: 'cron(0 6 * * ? *)',
      cursorSigningSecretParam: '/pokepredict/dev/cursor-signing-secret',
      cursorSigningSecretVersion: 1
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 7);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    template.resourceCountIs('AWS::Events::Rule', 1);
    template.resourceCountIs('AWS::Lambda::Function', 5);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 5);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 6);

    template.hasResourceProperties('AWS::Lambda::Function', {
      Runtime: 'nodejs22.x'
    });

    template.hasResourceProperties('AWS::Lambda::Function', {
      Environment: {
        Variables: Match.objectLike({
          CURSOR_SIGNING_SECRET_PARAM: '/pokepredict/dev/cursor-signing-secret',
          TABLE_CARDS: Match.anyValue(),
          TABLE_PRICES: Match.anyValue(),
          TABLE_LATEST_PRICES: Match.anyValue()
        })
      }
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

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /cards'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /cards/{cardId}/price/latest'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 50
      }
    });

    const outputs = template.toJSON().Outputs ?? {};
    expect(outputs).toHaveProperty('ApiBaseUrl');
    expect(outputs).toHaveProperty('ApiLambdaName');
  });
});
