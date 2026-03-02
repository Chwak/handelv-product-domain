import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface MoveProductToShelfLambdaConstructProps {
  environment: string;
  regionCode: string;
  productsTable: dynamodb.ITable;
  outboxTable: dynamodb.ITable;
  removalPolicy: RemovalPolicy;
}

export class MoveProductToShelfLambdaConstruct extends Construct {
  public readonly function: lambda.IFunction;

  constructor(scope: Construct, id: string, props: MoveProductToShelfLambdaConstructProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'MoveProductToShelfLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-MoveProductToShelf`,
      retention: props.removalPolicy === RemovalPolicy.RETAIN ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy,
    });

    this.function = new lambdaNodeJs.NodejsFunction(
      this,
      `${props.environment}-${props.regionCode}-MoveProductToShelf`,
      {
        entry: __dirname + '/../../../../functions/lambda/product/move-product-to-shelf/move-product-to-shelf-lambda.ts',
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(10),
        memorySize: 256,
        logGroup: logGroup,
        environment: {
          PRODUCTS_TABLE_NAME: props.productsTable.tableName,
          OUTBOX_TABLE_NAME: props.outboxTable.tableName,
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

    props.productsTable.grantReadWriteData(this.function);
    props.outboxTable.grantWriteData(this.function);
  }
}
