import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface InventoryTablesConstructProps {
  environment: string;
  regionCode: string;
  removalPolicy?: cdk.RemovalPolicy;
}

export class InventoryTablesConstruct extends Construct {
  public readonly materialInventoryTable: dynamodb.Table;
  public readonly stockMovementsTable: dynamodb.Table;
  public readonly suppliersTable: dynamodb.Table;
  public readonly basementProductsTable: dynamodb.Table;
  public readonly productQuantitiesTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: InventoryTablesConstructProps) {
    super(scope, id);

    const removalPolicy = props.removalPolicy ?? cdk.RemovalPolicy.DESTROY;

    // Material Inventory Table - Track all raw materials makers have
    this.materialInventoryTable = new dynamodb.Table(this, 'MaterialInventoryTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-material-inventory-table`,
      partitionKey: {
        name: 'makerUserId',
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

    // GSI: Find materials by type (e.g., all leather, all wood)
    this.materialInventoryTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-MaterialType',
      partitionKey: {
        name: 'materialType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'currentStock',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // GSI: Find low stock materials across all makers
    this.materialInventoryTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-StockStatus',
      partitionKey: {
        name: 'stockStatus',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'lastRestockDate',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Stock Movements Table - Track all inventory changes (audit trail)
    this.stockMovementsTable = new dynamodb.Table(this, 'StockMovementsTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-stock-movements-table`,
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'movementTimestamp#materialId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      timeToLiveAttribute: 'ttl', // Auto-delete old movements after 2 years
    });

    // GSI: Query movements by material
    this.stockMovementsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-MaterialId',
      partitionKey: {
        name: 'materialId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'movementTimestamp',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Query movements by type (purchase, usage, waste, return)
    this.stockMovementsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-MovementType',
      partitionKey: {
        name: 'movementType',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'movementTimestamp',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Suppliers Table - Track material suppliers and relationships
    this.suppliersTable = new dynamodb.Table(this, 'SuppliersTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-suppliers-table`,
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'supplierId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: Find suppliers by location
    this.suppliersTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-SupplierLocation',
      partitionKey: {
        name: 'country',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'city',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Find suppliers by reliability score
    this.suppliersTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-ReliabilityScore',
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'reliabilityScore',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // Basement Products Table - Archive for unpublished/removed products from shelf
    this.basementProductsTable = new dynamodb.Table(this, 'BasementProductsTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-basement-products-table`,
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'shelfItemId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: Find products by archive date
    this.basementProductsTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-ArchivedDate',
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'archivedAt',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // GSI: Find products by status
    this.basementProductsTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-Status',
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'status',
        type: dynamodb.AttributeType.STRING,
      },
    });

    // Product Quantities Table - Track quantity of products on shelf
    this.productQuantitiesTable = new dynamodb.Table(this, 'ProductQuantitiesTable', {
      tableName: `${props.environment}-${props.regionCode}-product-domain-product-quantities-table`,
      partitionKey: {
        name: 'shelfItemId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === 'prod' },
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
    });

    // GSI: Find low stock products
    this.productQuantitiesTable.addGlobalSecondaryIndex({
      indexName: 'GSI1-StockStatus',
      partitionKey: {
        name: 'stockStatus',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'currentQuantity',
        type: dynamodb.AttributeType.NUMBER,
      },
    });

    // GSI: Query by maker for all product quantities
    this.productQuantitiesTable.addGlobalSecondaryIndex({
      indexName: 'GSI2-MakerUserId',
      partitionKey: {
        name: 'makerUserId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'lastUpdated',
        type: dynamodb.AttributeType.STRING,
      },
    });
  }
}
