import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as iam from 'aws-cdk-lib/aws-iam';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface PaymentEventConsumerLambdaConstructProps {
  environment: string;
  regionCode: string;
  eventBus: events.IEventBus;
  productsTable: dynamodb.ITable;
  outboxTable: dynamodb.ITable;
  idempotencyTable: dynamodb.ITable;
  removalPolicy: RemovalPolicy;
}

export class PaymentEventConsumerLambdaConstruct extends Construct {
  public readonly function: lambda.IFunction;
  public readonly queue: sqs.IQueue;
  public readonly deadLetterQueue: sqs.IQueue;

  constructor(scope: Construct, id: string, props: PaymentEventConsumerLambdaConstructProps) {
    super(scope, id);

    // Dead Letter Queue for failed event processing
    this.deadLetterQueue = new sqs.Queue(this, 'PaymentEventConsumerDLQ', {
      queueName: `${props.environment}-${props.regionCode}-product-payment-event-consumer-dlq`,
      retentionPeriod: Duration.days(14),
      removalPolicy: props.removalPolicy,
    });

    // Main queue for payment events from EventBridge
    this.queue = new sqs.Queue(this, 'PaymentEventConsumerQueue', {
      queueName: `${props.environment}-${props.regionCode}-product-payment-event-consumer-queue`,
      visibilityTimeout: Duration.seconds(180), // 3x Lambda timeout
      retentionPeriod: Duration.days(4),
      deadLetterQueue: {
        queue: this.deadLetterQueue,
        maxReceiveCount: 3, // Retry 3 times before sending to DLQ
      },
      removalPolicy: props.removalPolicy,
    });

    // Lambda function to process payment events and update inventory
    this.function = new lambdaNodeJs.NodejsFunction(
      this,
      `${props.environment}-${props.regionCode}-PaymentEventConsumer`,
      {
        entry: __dirname + '/../../../functions/lambda/event-consumer/payment-event-consumer-lambda.ts',
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(60),
        memorySize: 256,
        environment: {
          PRODUCTS_TABLE_NAME: props.productsTable.tableName,
          OUTBOX_TABLE_NAME: props.outboxTable.tableName,
          IDEMPOTENCY_TABLE_NAME: props.idempotencyTable.tableName,
          ENVIRONMENT: props.environment,
          REGION_CODE: props.regionCode,
        },
        bundling: {
          externalModules: ['@aws-sdk/*'],
          minify: false,
          sourceMap: false,
        },
      }
    );

    // Grant permissions
    props.productsTable.grantReadWriteData(this.function);
    props.outboxTable.grantReadWriteData(this.function);
    props.idempotencyTable.grantReadWriteData(this.function);

    // Connect Lambda to SQS queue
    this.function.addEventSource(
      new SqsEventSource(this.queue, {
        batchSize: 10,
        reportBatchItemFailures: true,
        maxBatchingWindow: Duration.seconds(5),
      })
    );

    // Allow EventBridge to put messages in the queue
    props.eventBus.grantPutEventsTo(this.function);
  }
}
