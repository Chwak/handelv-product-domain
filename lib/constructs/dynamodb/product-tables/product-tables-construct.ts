import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface ProductTablesConstructProps {
  environment: string;
  regionCode: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class ProductTablesConstruct extends Construct {
  public readonly productsTable: dynamodb.Table;
  public readonly productMediaTable: dynamodb.Table;
  public readonly productMaterialsTable: dynamodb.Table;
  public readonly productProcessStepsTable: dynamodb.Table;
  public readonly productBatchesTable: dynamodb.Table;
  public readonly productCertificatesTable: dynamodb.Table;
  public readonly categoriesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: ProductTablesConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // Products Table
    this.productsTable = new dynamodb.Table(this, 'ProductsTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-products-table`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: products by maker
    this.productsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-MakerUserId',
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: products by category
    this.productsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-CategoryId',
      partitionKey: {
        name: 'categoryId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: products by status
    this.productsTable.addGlobalSecondaryIndex({
      indexName: 'GSI3-Status',
      partitionKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'createdAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Product Media Table
    this.productMediaTable = new dynamodb.Table(this, 'ProductMediaTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-product-media-table`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'mediaId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Product Materials Table
    this.productMaterialsTable = new dynamodb.Table(this, 'ProductMaterialsTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-product-materials-table`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'materialId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.productMaterialsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-Source',
      partitionKey: {
        name: 'source',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Product Process Steps Table
    this.productProcessStepsTable = new dynamodb.Table(this, 'ProductProcessStepsTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-product-process-steps-table`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'stepOrder',
        type: dynamodb.AttributeType.NUMBER,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Product Batches Table
    this.productBatchesTable = new dynamodb.Table(this, 'ProductBatchesTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-product-batches-table`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'batchId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // Product Certificates Table
    this.productCertificatesTable = new dynamodb.Table(this, 'ProductCertificatesTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-product-certificates-table`,
      partitionKey: {
        name: 'productId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'certificateId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.productCertificatesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-CertificateId',
      partitionKey: {
        name: 'certificateId',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Categories Table
    this.categoriesTable = new dynamodb.Table(this, 'CategoriesTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-categories-table`,
      partitionKey: {
        name: 'categoryId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    this.categoriesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-ParentId',
      partitionKey: {
        name: 'parentId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'name',
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
