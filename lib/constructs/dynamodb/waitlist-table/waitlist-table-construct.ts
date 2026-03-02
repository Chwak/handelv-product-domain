import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

export interface WaitlistTableConstructProps {
  environment: string;
  regionCode: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class WaitlistTableConstruct extends Construct {
  public readonly waitlistTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: WaitlistTableConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    this.waitlistTable = new dynamodb.Table(this, "WaitlistTable", {
      tableName: `${props.environment}-${props.regionCode}-product-domain-waitlist-table`,
      partitionKey: {
        name: "email",
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === "prod" },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.waitlistTable.addGlobalSecondaryIndex({
      indexName: "GSI1-CreatedAt",
      partitionKey: {
        name: "interest",
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: "createdAt",
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
