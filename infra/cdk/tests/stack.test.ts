import { App } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { describe, expect, it } from 'vitest';
import { PokepredictStack } from '../lib/pokepredict-stack';

describe('Phase 5 stack', () => {
  it('creates pipeline + public API resources with alarms and outputs', () => {
    const app = new App();
    const stack = new PokepredictStack(app, 'test-stack', {
      project: 'pokepredict',
      stage: 'dev',
      sourceName: 'fixture',
      ingestScheduleCron: 'cron(0 6 * * ? *)',
      cursorSigningSecretParam: '/pokepredict/dev/cursor-signing-secret',
      cursorSigningSecretVersion: 1,
      sesFromEmail: 'alerts+dev@pokepredict.dev',
      fetchRawTimeoutSeconds: 900,
      normalizeTimeoutSeconds: 300,
      stateMachineTimeoutMinutes: 30,
      tcgdex: {
        baseUrl: 'https://api.tcgdex.net/v2/en',
        listPath: '/cards',
        setsPath: '/sets',
        detailPathTemplate: '/cards/{id}',
        excludedSeriesIds: 'tcgp',
        pageSize: 100,
        maxPages: 0,
        detailConcurrency: 8,
        maxRetries: 2,
        retryBaseDelayMs: 250,
        requestTimeoutMs: 10000,
        failureRateThreshold: '0.25'
      }
    });

    const template = Template.fromStack(stack);

    template.resourceCountIs('AWS::DynamoDB::Table', 7);
    template.resourceCountIs('AWS::StepFunctions::StateMachine', 1);
    template.resourceCountIs('AWS::Events::Rule', 1);
    template.resourceCountIs('AWS::Lambda::Function', 7);
    template.resourceCountIs('AWS::ApiGatewayV2::Api', 1);
    template.resourceCountIs('AWS::ApiGatewayV2::Route', 12);
    template.resourceCountIs('AWS::CloudWatch::Alarm', 8);

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

    template.hasResourceProperties('AWS::Lambda::Function', {
      Timeout: 900,
      Environment: {
        Variables: Match.objectLike({
          TCGDEX_BASE_URL: 'https://api.tcgdex.net/v2/en',
          TCGDEX_DETAIL_CONCURRENCY: '8',
          TCGDEX_EXCLUDED_SERIES_IDS: 'tcgp'
        })
      }
    });

    const stateMachines = template.findResources('AWS::StepFunctions::StateMachine');
    const stateMachineBody = JSON.stringify(Object.values(stateMachines)[0]);
    expect(stateMachineBody).toContain('StartRun');
    expect(stateMachineBody).toContain('FetchRaw');
    expect(stateMachineBody).toContain('Normalize');
    expect(stateMachineBody).toContain('ComputeSignals');
    expect(stateMachineBody).toContain('AlertsEval');

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

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /cards/{cardId}/signals/latest'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /portfolio'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /portfolio/holdings'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'DELETE /portfolio/holdings/{holdingId}'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'GET /alerts'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'POST /alerts'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Route', {
      RouteKey: 'DELETE /alerts/{alertId}'
    });

    template.hasResourceProperties('AWS::ApiGatewayV2::Stage', {
      DefaultRouteSettings: {
        ThrottlingBurstLimit: 100,
        ThrottlingRateLimit: 50
      }
    });

    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:PutItem', 'dynamodb:DeleteItem'])
          })
        ])
      }
    });

    const outputs = template.toJSON().Outputs ?? {};
    expect(outputs).toHaveProperty('ApiBaseUrl');
    expect(outputs).toHaveProperty('ApiLambdaName');
  }, 20000);
});
