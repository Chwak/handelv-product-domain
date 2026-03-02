import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as lambdaNodeJs from 'aws-cdk-lib/aws-lambda-nodejs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface MoveProductToDraftLambdaConstructProps {
  environment: string;
  regionCode: string;
  productsTable: dynamodb.ITable;
  removalPolicy: RemovalPolicy;
}

export class MoveProductToDraftLambdaConstruct extends Construct {
  public readonly function: lambda.IFunction;

  constructor(scope: Construct, id: string, props: MoveProductToDraftLambdaConstructProps) {
    super(scope, id);

    const logGroup = new logs.LogGroup(this, 'MoveProductToDraftLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-MoveProductToDraft`,
      retention: props.removalPolicy === RemovalPolicy.RETAIN ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy,
    });

    this.function = new lambdaNodeJs.NodejsFunction(
      this,
      `${props.environment}-${props.regionCode}-MoveProductToDraft`,
      {
        entry: __dirname + '/../../../../functions/lambda/product/move-product-to-draft/move-product-to-draft-lambda.ts',
        handler: 'handler',
        runtime: lambda.Runtime.NODEJS_20_X,
        timeout: Duration.seconds(10),
        memorySize: 256,
        logGroup: logGroup,
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
      }
    );

    props.productsTable.grantReadWriteData(this.function);
  }
}
