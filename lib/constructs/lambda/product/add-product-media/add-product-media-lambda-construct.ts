import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as path from 'path';

export interface AddProductMediaLambdaConstructProps {
  environment: string;
  regionCode: string;
  productsTable: dynamodb.ITable;
  productMediaTable: dynamodb.ITable;
  productMediaBucket?: s3.IBucket;
  removalPolicy?: cdk.RemovalPolicy;
}

export class AddProductMediaLambdaConstruct extends Construct {
  public readonly function: lambda.IFunction;

  constructor(scope: Construct, id: string, props: AddProductMediaLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, 'AddProductMediaLambdaRole', {
      roleName: `${props.environment}-${props.regionCode}-product-domain-add-product-media-lambda-role`,
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      description: 'IAM role for Add Product Media Lambda',
      inlinePolicies: {
        CloudWatchLogsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: [
                'logs:CreateLogGroup',
                'logs:CreateLogStream',
                'logs:PutLogEvents',
              ],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-product-domain-add-product-media-lambda*`,
              ],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ['dynamodb:GetItem', 'dynamodb:PutItem'],
              resources: [
                props.productsTable.tableArn,
                props.productMediaTable.tableArn,
              ],
            }),
          ],
        }),
      },
    });

    // Add S3 permissions if bucket is provided
    if (props.productMediaBucket) {
      role.addToPolicy(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: ['s3:PutObject', 's3:GetObject', 's3:DeleteObject'],
          resources: [`${props.productMediaBucket.bucketArn}/*`],
        })
      );
    }

    const logGroup = new logs.LogGroup(this, 'AddProductMediaLogGroup', {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-product-domain-add-product-media-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(__dirname, '../../../../functions/lambda/product/add-product-media/add-product-media-lambda.ts');
    this.function = new NodejsFunction(this, 'AddProductMediaFunction', {
      functionName: `${props.environment}-${props.regionCode}-product-domain-add-product-media-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'handler',
      entry: lambdaCodePath,
      role,
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      tracing: lambda.Tracing.DISABLED,
      logGroup,
      bundling: {
        minify: true,
        sourceMap: false,
        target: 'node22',
        externalModules: ['@aws-sdk/*'],
      },
      environment: {
        ENVIRONMENT: props.environment,
        REGION_CODE: props.regionCode,
        PRODUCTS_TABLE_NAME: props.productsTable.tableName,
        PRODUCT_MEDIA_TABLE_NAME: props.productMediaTable.tableName,
        PRODUCT_MEDIA_BUCKET_NAME: props.productMediaBucket?.bucketName || '',
        LOG_LEVEL: props.environment === 'prod' ? 'ERROR' : 'INFO',
      },
      description: 'Add media (images, videos) to a product',
    });

    props.productsTable.grantReadData(this.function);
    props.productMediaTable.grantWriteData(this.function);
    if (props.productMediaBucket) {
      props.productMediaBucket.grantReadWrite(this.function);
    }


    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
