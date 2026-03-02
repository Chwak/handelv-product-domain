import * as cdk from "aws-cdk-lib";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";
import * as path from "path";

export interface CreateWaitlistEntryLambdaConstructProps {
  environment: string;
  regionCode: string;
  waitlistTable: dynamodb.ITable;
  removalPolicy?: cdk.RemovalPolicy;
}

export class CreateWaitlistEntryLambdaConstruct extends Construct {
  public readonly function: lambda.IFunction;

  constructor(scope: Construct, id: string, props: CreateWaitlistEntryLambdaConstructProps) {
    super(scope, id);

    const role = new iam.Role(this, "CreateWaitlistEntryLambdaRole", {
      roleName: `${props.environment}-${props.regionCode}-product-domain-create-waitlist-entry-lambda-role`,
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      description: "IAM role for Create Waitlist Entry Lambda",
      inlinePolicies: {
        CloudWatchLogsAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
              resources: [
                `arn:aws:logs:${cdk.Aws.REGION}:${cdk.Aws.ACCOUNT_ID}:log-group:/aws/lambda/${props.environment}-${props.regionCode}-product-domain-create-waitlist-entry-lambda*`,
              ],
            }),
          ],
        }),
        DynamoDBAccess: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              effect: iam.Effect.ALLOW,
              actions: ["dynamodb:PutItem", "dynamodb:GetItem"],
              resources: [props.waitlistTable.tableArn],
            }),
          ],
        }),
      },
    });

    const logGroup = new logs.LogGroup(this, "CreateWaitlistEntryLogGroup", {
      logGroupName: `/aws/lambda/${props.environment}-${props.regionCode}-product-domain-create-waitlist-entry-lambda`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: props.removalPolicy ?? cdk.RemovalPolicy.DESTROY,
    });

    const lambdaCodePath = path.join(
      __dirname,
      "../../../../functions/lambda/waitlist/create-waitlist-entry/create-waitlist-entry-lambda.ts"
    );
    this.function = new NodejsFunction(this, "CreateWaitlistEntryFunction", {
      functionName: `${props.environment}-${props.regionCode}-product-domain-create-waitlist-entry-lambda`,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: "handler",
      entry: lambdaCodePath,
      role,
      timeout: cdk.Duration.seconds(10),
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
        ENVIRONMENT: props.environment,
        REGION_CODE: props.regionCode,
        WAITLIST_TABLE_NAME: props.waitlistTable.tableName,
        LOG_LEVEL: props.environment === "prod" ? "ERROR" : "INFO",
      },
      description: "Create a waitlist entry",
    });

    if (props.removalPolicy) {
      this.function.applyRemovalPolicy(props.removalPolicy);
    }
  }
}
