import * as cdk from 'aws-cdk-lib';
import * as stepfunctions from 'aws-cdk-lib/aws-stepfunctions';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import * as fs from 'fs';
import { Construct } from 'constructs';

export interface ProductStateMachineConstructProps {
  environment: string;
  regionCode: string;
  productsTable: dynamodb.ITable;
  productMediaTable: dynamodb.ITable;
}

export class ProductStateMachineConstruct extends Construct {
  public readonly stateMachine: stepfunctions.StateMachine;
  public readonly stateMachineArn: string;

  constructor(scope: Construct, id: string, props: ProductStateMachineConstructProps) {
    super(scope, id);

    // Create CloudWatch Log Group
    const logGroup = new logs.LogGroup(this, 'ProductStateMachineLogGroup', {
      logGroupName: `/aws/stepfunctions/${props.environment}-${props.regionCode}-product-domain-state-machine`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Read ASL JSON definition and perform substitutions
    const aslFilePath = path.join(__dirname, 'product-state-machine.asl.json');
    let aslContent = fs.readFileSync(aslFilePath, 'utf-8');
    aslContent = aslContent.replace(/\${ProductsTableName}/g, props.productsTable.tableName);
    aslContent = aslContent.replace(/\${ProductMediaTableName}/g, props.productMediaTable.tableName);
    
    const definitionBody = stepfunctions.DefinitionBody.fromString(aslContent);

    // Create Express Step Functions state machine
    this.stateMachine = new stepfunctions.StateMachine(this, 'ProductStateMachine', {
      stateMachineName: `${props.environment}-${props.regionCode}-product-domain-state-machine`,
      definitionBody: definitionBody,
      stateMachineType: stepfunctions.StateMachineType.EXPRESS,
      timeout: cdk.Duration.minutes(5),
      tracingEnabled: false,
      logs: {
        destination: logGroup,
        level: stepfunctions.LogLevel.ALL,
        includeExecutionData: true,
      },
    });

    this.stateMachineArn = this.stateMachine.stateMachineArn;

    // Grant permissions
    props.productsTable.grantReadWriteData(this.stateMachine);
    props.productMediaTable.grantReadData(this.stateMachine);

    // Export to SSM
    new ssm.StringParameter(this, 'ProductStateMachineArnParameter', {
      parameterName: `/${props.environment}/product-domain/stepfunctions/state-machine-arn`,
      stringValue: this.stateMachineArn,
      description: 'Product Domain Step Functions State Machine ARN',
    });

    new cdk.CfnOutput(this, 'ProductStateMachineArn', {
      value: this.stateMachineArn,
      description: 'Product Domain Step Functions State Machine ARN',
      exportName: `${props.environment}-${props.regionCode}-product-domain-state-machine-arn`,
    });
  }
}
