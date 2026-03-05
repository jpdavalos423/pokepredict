import path from 'node:path';
import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  type StackProps,
  Tags
} from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2Integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodejs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as sfn from 'aws-cdk-lib/aws-stepfunctions';
import * as sfnTasks from 'aws-cdk-lib/aws-stepfunctions-tasks';
import * as iam from 'aws-cdk-lib/aws-iam';
import type { Construct } from 'constructs';

export interface PokepredictStackProps extends StackProps {
  project: string;
  stage: string;
  sourceName: string;
  ingestScheduleCron: string;
  cursorSigningSecretParam: string;
  cursorSigningSecretVersion: number;
}

export class PokepredictStack extends Stack {
  constructor(scope: Construct, id: string, props: PokepredictStackProps) {
    super(scope, id, props);

    const isDev = props.stage === 'dev';
    const removalPolicy = isDev ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN;
    const prefix = `${props.project}-${props.stage}`;

    Tags.of(this).add('project', props.project);
    Tags.of(this).add('stage', props.stage);
    Tags.of(this).add('managedBy', 'cdk');

    const cardsTable = this.createTable(`${prefix}-cards`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy
    });
    cardsTable.addGlobalSecondaryIndex({
      indexName: 'gsi1',
      partitionKey: { name: 'gsi1pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi1sk', type: dynamodb.AttributeType.STRING }
    });
    cardsTable.addGlobalSecondaryIndex({
      indexName: 'gsi2',
      partitionKey: { name: 'gsi2pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'gsi2sk', type: dynamodb.AttributeType.STRING }
    });

    const pricesTable = this.createTable(`${prefix}-prices`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy
    });

    const latestPricesTable = this.createTable(`${prefix}-latest-prices`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy
    });

    const holdingsTable = this.createTable(`${prefix}-holdings`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      removalPolicy
    });

    const alertsByUserTable = this.createTable(`${prefix}-alerts-by-user`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      removalPolicy
    });

    const alertsByCardTable = this.createTable(`${prefix}-alerts-by-card`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      removalPolicy
    });

    const signalsTable = this.createTable(`${prefix}-signals`, {
      partitionKey: { name: 'pk', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'sk', type: dynamodb.AttributeType.STRING },
      removalPolicy
    });

    const rawBucket = new s3.Bucket(this, 'RawArchiveBucket', {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      lifecycleRules: [{
        expiration: Duration.days(90)
      }],
      removalPolicy,
      autoDeleteObjects: isDev
    });

    const bundling: lambdaNodejs.BundlingOptions = {
      format: lambdaNodejs.OutputFormat.CJS,
      target: 'node22',
      sourceMap: false
    };

    const pipelineSrcPath = path.resolve(__dirname, '../../../apps/pipeline/src/handlers');
    const startRunFunction = new lambdaNodejs.NodejsFunction(this, 'StartRunFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineSrcPath, 'startRun.ts'),
      handler: 'handler',
      timeout: Duration.seconds(30),
      bundling
    });

    const fetchRawFunction = new lambdaNodejs.NodejsFunction(this, 'FetchRawFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineSrcPath, 'fetchRaw.ts'),
      handler: 'handler',
      timeout: Duration.seconds(60),
      bundling,
      environment: {
        RAW_BUCKET: rawBucket.bucketName,
        SOURCE_NAME: props.sourceName,
        TABLE_CARDS: cardsTable.tableName,
        TABLE_PRICES: pricesTable.tableName,
        TABLE_LATEST_PRICES: latestPricesTable.tableName
      }
    });

    const normalizeFunction = new lambdaNodejs.NodejsFunction(this, 'NormalizeFunction', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: path.join(pipelineSrcPath, 'normalize.ts'),
      handler: 'handler',
      timeout: Duration.seconds(120),
      bundling,
      environment: {
        RAW_BUCKET: rawBucket.bucketName,
        SOURCE_NAME: props.sourceName,
        TABLE_CARDS: cardsTable.tableName,
        TABLE_PRICES: pricesTable.tableName,
        TABLE_LATEST_PRICES: latestPricesTable.tableName
      }
    });

    const apiSrcPath = path.resolve(__dirname, '../../../apps/api/src/handler.ts');
    const apiFunction = new lambdaNodejs.NodejsFunction(this, 'ApiLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      entry: apiSrcPath,
      handler: 'handler',
      timeout: Duration.seconds(15),
      bundling,
      environment: {
        CURSOR_SIGNING_SECRET_PARAM: props.cursorSigningSecretParam,
        CURSOR_SIGNING_SECRET_VERSION: String(props.cursorSigningSecretVersion),
        TABLE_CARDS: cardsTable.tableName,
        TABLE_PRICES: pricesTable.tableName,
        TABLE_LATEST_PRICES: latestPricesTable.tableName,
        TABLE_HOLDINGS: holdingsTable.tableName,
        TABLE_ALERTS_BY_USER: alertsByUserTable.tableName,
        TABLE_ALERTS_BY_CARD: alertsByCardTable.tableName,
        TABLE_SIGNALS: signalsTable.tableName
      }
    });

    rawBucket.grantWrite(fetchRawFunction);
    rawBucket.grantRead(normalizeFunction);
    cardsTable.grantReadData(normalizeFunction);
    pricesTable.grantReadWriteData(normalizeFunction);
    latestPricesTable.grantReadWriteData(normalizeFunction);

    cardsTable.grantReadData(apiFunction);
    pricesTable.grantReadData(apiFunction);
    latestPricesTable.grantReadData(apiFunction);
    holdingsTable.grantReadWriteData(apiFunction);

    const region = Stack.of(this).region;
    const account = Stack.of(this).account;
    apiFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['ssm:GetParameter'],
      resources: [
        `arn:aws:ssm:${region}:${account}:parameter${props.cursorSigningSecretParam}`
      ]
    }));

    const startRunTask = new sfnTasks.LambdaInvoke(this, 'StartRun', {
      lambdaFunction: startRunFunction,
      payloadResponseOnly: true
    });

    const fetchRawTask = new sfnTasks.LambdaInvoke(this, 'FetchRaw', {
      lambdaFunction: fetchRawFunction,
      payloadResponseOnly: true
    });

    const normalizeTask = new sfnTasks.LambdaInvoke(this, 'Normalize', {
      lambdaFunction: normalizeFunction,
      payloadResponseOnly: true
    });

    const definition = startRunTask.next(fetchRawTask).next(normalizeTask);

    const stateMachine = new sfn.StateMachine(this, 'IngestionStateMachine', {
      stateMachineName: `${prefix}-ingestion`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: Duration.minutes(10)
    });

    new events.Rule(this, 'IngestionScheduleRule', {
      schedule: events.Schedule.expression(props.ingestScheduleCron),
      targets: [
        new targets.SfnStateMachine(stateMachine, {
          input: events.RuleTargetInput.fromObject({
            source: props.sourceName,
            mode: 'scheduled'
          })
        })
      ]
    });

    const httpApi = new apigatewayv2.HttpApi(this, 'PublicApi', {
      apiName: `${prefix}-public-api`,
      createDefaultStage: true
    });

    const defaultStage = httpApi.defaultStage?.node.defaultChild as apigatewayv2.CfnStage | undefined;
    if (defaultStage) {
      defaultStage.defaultRouteSettings = {
        throttlingBurstLimit: 100,
        throttlingRateLimit: 50
      };
    }

    const apiIntegration = new apigatewayv2Integrations.HttpLambdaIntegration(
      'PublicApiIntegration',
      apiFunction
    );

    httpApi.addRoutes({
      path: '/health',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/cards',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/cards/{cardId}',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/cards/{cardId}/price/latest',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/cards/{cardId}/prices',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/portfolio',
      methods: [apigatewayv2.HttpMethod.GET],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/portfolio/holdings',
      methods: [apigatewayv2.HttpMethod.POST],
      integration: apiIntegration
    });

    httpApi.addRoutes({
      path: '/portfolio/holdings/{holdingId}',
      methods: [apigatewayv2.HttpMethod.DELETE],
      integration: apiIntegration
    });

    new cloudwatch.Alarm(this, 'StateMachineFailuresAlarm', {
      metric: stateMachine.metricFailed({
        period: Duration.minutes(5),
        statistic: 'sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Pokepredict ingestion state machine failed executions.'
    });

    this.createLambdaErrorAlarm('StartRunErrorsAlarm', startRunFunction);
    this.createLambdaErrorAlarm('FetchRawErrorsAlarm', fetchRawFunction);
    this.createLambdaErrorAlarm('NormalizeErrorsAlarm', normalizeFunction);
    this.createLambdaErrorAlarm('ApiLambdaErrorsAlarm', apiFunction);

    new cloudwatch.Alarm(this, 'Api5xxAlarm', {
      metric: new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName: '5xx',
        dimensionsMap: {
          ApiId: httpApi.httpApiId,
          Stage: '$default'
        },
        statistic: 'sum',
        period: Duration.minutes(5)
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: 'Pokepredict public API 5XX responses exceeded threshold.'
    });

    new CfnOutput(this, 'CardsTableName', { value: cardsTable.tableName });
    new CfnOutput(this, 'PricesTableName', { value: pricesTable.tableName });
    new CfnOutput(this, 'LatestPricesTableName', { value: latestPricesTable.tableName });
    new CfnOutput(this, 'HoldingsTableName', { value: holdingsTable.tableName });
    new CfnOutput(this, 'AlertsByUserTableName', { value: alertsByUserTable.tableName });
    new CfnOutput(this, 'AlertsByCardTableName', { value: alertsByCardTable.tableName });
    new CfnOutput(this, 'SignalsTableName', { value: signalsTable.tableName });
    new CfnOutput(this, 'RawBucketName', { value: rawBucket.bucketName });
    new CfnOutput(this, 'IngestionStateMachineArn', { value: stateMachine.stateMachineArn });
    new CfnOutput(this, 'IngestionScheduleExpression', { value: props.ingestScheduleCron });
    new CfnOutput(this, 'ApiBaseUrl', { value: httpApi.apiEndpoint });
    new CfnOutput(this, 'ApiLambdaName', { value: apiFunction.functionName });
  }

  private createTable(
    tableName: string,
    props: Omit<dynamodb.TableProps, 'tableName'>
  ): dynamodb.Table {
    return new dynamodb.Table(this, tableName, {
      tableName,
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      ...props
    });
  }

  private createLambdaErrorAlarm(id: string, fn: lambda.Function): void {
    new cloudwatch.Alarm(this, id, {
      metric: fn.metricErrors({
        period: Duration.minutes(5),
        statistic: 'sum'
      }),
      threshold: 1,
      evaluationPeriods: 1,
      alarmDescription: `Pokepredict ${fn.functionName} error alarm.`
    });
  }
}
