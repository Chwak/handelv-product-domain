import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as events from "aws-cdk-lib/aws-events";
import * as lambdaEventSources from "aws-cdk-lib/aws-lambda-event-sources";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import { Construct } from "constructs";
import * as path from "path";

const SQS_MAX_RECEIVE_COUNT = 5;
const LAMBDA_TIMEOUT_SECONDS = 30;
const VISIBILITY_TIMEOUT_SECONDS = LAMBDA_TIMEOUT_SECONDS * 6;

export interface ProductEventConsumerLambdaConstructProps {
  environment: string;
  regionCode: string;
  eventBus: events.IEventBus;
  idempotencyTable: dynamodb.ITable;
  schemaRegistryName: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class ProductEventConsumerLambdaConstruct extends Construct {
  public readonly function: NodejsFunction;
  public readonly queue: sqs.Queue;
  public readonly deadLetterQueue: sqs.Queue;

  constructor(scope: Construct, id: string, props: ProductEventConsumerLambdaConstructProps) {
    super(scope, id);

    const deadLetterQueue = new sqs.Queue(this, "ProductMakerEventsDlq", {
      queueName: `${props.environment}-${props.regionCode}-product-domain-maker-events-dlq`,
      retentionPeriod: cdk.Duration.days(14),
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });
    this.deadLetterQueue = deadLetterQueue;

    const queue = new sqs.Queue(this, "ProductMakerEventsQueue", {
      queueName: `${props.environment}-${props.regionCode}-product-domain-maker-events-queue`,
      retentionPeriod: cdk.Duration.days(14),
      visibilityTimeout: cdk.Duration.seconds(VISIBILITY_TIMEOUT_SECONDS),
      receiveMessageWaitTime: cdk.Duration.seconds(20),
      deadLetterQueue: {
        queue: deadLetterQueue,
        maxReceiveCount: SQS_MAX_RECEIVE_COUNT,
      },
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });
    this.queue = queue;

    const eventRule = new events.Rule(this, "ProductEventRule", {
      eventBus: props.eventBus,
      description: "EventBridge rule to SQS for product-domain consumers",
      eventPattern: {
        source: ["hand-made.maker-domain", "hand-made.collector-domain"],
        detailType: ["maker.profile.created.v1", "collector.profile.created.v1"],
      },
    });

    eventRule.addTarget(new targets.SqsQueue(queue));

    const logGroup = new logs.LogGroup(this, "ProductEventConsumerLogGroup", {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-product-domain-event-consumer-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, "../../../../functions/lambda/event-consumer/product-event-consumer-lambda.ts");
    this.function = new NodejsFunction(this, "ProductEventConsumerFunction", {
      functionName: `${props.environment}-${props.regionCode}-product-domain-event-consumer-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: lambdaCodePath,
      timeout: cdk.Duration.seconds(LAMBDA_TIMEOUT_SECONDS),
      memorySize: 256,
      tracing: lambda.Tracing.DISABLED,
      logGroup,
      bundling: {
        minify: true,
        sourceMap: false,
        target: "node22",
        externalModules: ["@aws-sdk/*"],
      },
      environment: {
        IDEMPOTENCY_TABLE_NAME: props.idempotencyTable.tableName,
        SCHEMA_REGISTRY_NAME: props.schemaRegistryName,
        LOG_LEVEL: props.environment === "prod" ? "ERROR" : "INFO",
      },
      description: "Consume maker domain events for product domain read models",
    });

    this.function.addEventSource(new lambdaEventSources.SqsEventSource(queue, {
      batchSize: 10,
      reportBatchItemFailures: true,
    }));

    props.idempotencyTable.grantReadWriteData(this.function);

    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ["glue:GetSchema", "glue:GetSchemaVersion"],
        resources: ["*"],
      })
    );

    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
