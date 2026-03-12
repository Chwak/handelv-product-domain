import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface CommissionReadyForShelfConsumerLambdaConstructProps {
  environment: string;
  regionCode: string;
  eventBus: events.IEventBus;
  productsTable: dynamodb.ITable;
  removalPolicy: RemovalPolicy;
}

export class CommissionReadyForShelfConsumerLambdaConstruct extends Construct {
  public readonly function: lambda.IFunction;
  public readonly queue: sqs.IQueue;

  constructor(scope: Construct, id: string, props: CommissionReadyForShelfConsumerLambdaConstructProps) {
    super(scope, id);

    this.queue = new sqs.Queue(this, 'CommissionReadyForShelfConsumerQueue', {
      queueName: `${props.environment}-${props.regionCode}-product-commission-ready-for-shelf-consumer-queue`,
      visibilityTimeout: Duration.seconds(180),
      retentionPeriod: Duration.days(4),
      removalPolicy: props.removalPolicy,
    });

    this.function = new lambdaNodeJs.NodejsFunction(
      this,
      `${props.environment}-${props.regionCode}-CommissionReadyForShelfConsumer`,
      {
        entry: `${__dirname}/../../../functions/lambda/event-consumer/commission-ready-for-shelf-consumer-lambda.ts`,
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(60),
        memorySize: 256,
        environment: {
          PRODUCTS_TABLE_NAME: props.productsTable.tableName,
          ENVIRONMENT: props.environment,
          REGION_CODE: props.regionCode,
        },
        bundling: {
          externalModules: ['@aws-sdk/*'],
          minify: false,
          sourceMap: false,
        },
      },
    );

    props.productsTable.grantReadWriteData(this.function);

    this.function.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 10,
        reportBatchItemFailures: true,
      }),
    );

    const rule = new events.Rule(this, 'CommissionReadyForShelfRule', {
      eventBus: props.eventBus,
      eventPattern: {
        source: ['hand-made.maker-domain'],
        detailType: ['commission.proposal.ready_for_shelf.v1'],
      },
    });

    rule.addTarget(new targets.SqsQueue(this.queue));
  }
}
