import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ssm from "aws-cdk-lib/aws-ssm";
import type { Construct } from "constructs";
import type { DomainStackProps } from "./domain-stack-props";
import { OutboxTableConstruct } from "./constructs/dynamodb/outbox-table/outbox-table-construct";
import { RepublishLambdaConstruct } from "./constructs/lambda/republish/republish-lambda-construct";
import { InventoryTablesConstruct } from "./constructs/dynamodb/inventory-tables/inventory-tables-construct";
import { ProductAppSyncConstruct } from "./constructs/appsync/product-appsync/product-appsync-construct";
import { ProductStateMachineConstruct } from "./constructs/stepfunctions/product-state-machine/product-state-machine-construct";
import { ProductTablesConstruct } from "./constructs/dynamodb/product-tables/product-tables-construct";
import { CreateProductLambdaConstruct } from "./constructs/lambda/product/create-product/create-product-lambda-construct";
import { UpdateProductLambdaConstruct } from "./constructs/lambda/product/update-product/update-product-lambda-construct";
import { MoveProductToDraftLambdaConstruct } from "./constructs/lambda/product/move-product-to-draft/move-product-to-draft-lambda-construct";
import { MoveProductToShelfLambdaConstruct } from "./constructs/lambda/product/move-product-to-shelf/move-product-to-shelf-lambda-construct";
import { MoveProductToBasementLambdaConstruct } from "./constructs/lambda/product/move-product-to-basement/move-product-to-basement-lambda-construct";
import { GetProductLambdaConstruct } from "./constructs/lambda/product/get-product/get-product-lambda-construct";
import { ListProductsLambdaConstruct } from "./constructs/lambda/product/list-products/list-products-lambda-construct";
import { AddProductMediaLambdaConstruct } from "./constructs/lambda/product/add-product-media/add-product-media-lambda-construct";
import { AddProductMaterialLambdaConstruct } from "./constructs/lambda/product/add-product-material/add-product-material-lambda-construct";
import { AddProcessStepLambdaConstruct } from "./constructs/lambda/product/add-process-step/add-process-step-lambda-construct";
import { CreateBatchLambdaConstruct } from "./constructs/lambda/product/create-batch/create-batch-lambda-construct";
import { GenerateCertificateLambdaConstruct } from "./constructs/lambda/product/generate-certificate/generate-certificate-lambda-construct";
import { ProductMediaBucketsConstruct } from "./constructs/s3/product-media-buckets/product-media-buckets-construct";
import { ProductAppSyncResolversConstruct } from "./constructs/appsync/product-appsync-resolvers/product-appsync-resolvers-construct";
import { WaitlistTableConstruct } from "./constructs/dynamodb/waitlist-table/waitlist-table-construct";
import { CreateWaitlistEntryLambdaConstruct } from "./constructs/lambda/waitlist/create-waitlist-entry/create-waitlist-entry-lambda-construct";
import { AddMaterialLambdaConstruct } from "./constructs/lambda/inventory/add-material/add-material-lambda-construct";
import { ListMaterialInventoryLambdaConstruct } from "./constructs/lambda/inventory/list-material-inventory/list-material-inventory-lambda-construct";
import { UpdateMaterialStockLambdaConstruct } from "./constructs/lambda/inventory/update-material-stock/update-material-stock-lambda-construct";
import { GetLowStockMaterialsLambdaConstruct } from "./constructs/lambda/inventory/get-low-stock-materials/get-low-stock-materials-lambda-construct";
import { GetMaterialInventoryLambdaConstruct } from "./constructs/lambda/inventory/get-material-inventory/get-material-inventory-lambda-construct";
import { RecordStockMovementLambdaConstruct } from "./constructs/lambda/inventory/record-stock-movement/record-stock-movement-lambda-construct";
import { GetStockMovementsLambdaConstruct } from "./constructs/lambda/inventory/get-stock-movements/get-stock-movements-lambda-construct";
import { AddSupplierLambdaConstruct } from "./constructs/lambda/inventory/add-supplier/add-supplier-lambda-construct";
import { UpdateSupplierLambdaConstruct } from "./constructs/lambda/inventory/update-supplier/update-supplier-lambda-construct";
import { ListSuppliersLambdaConstruct } from "./constructs/lambda/inventory/list-suppliers/list-suppliers-lambda-construct";
import { GetSupplierLambdaConstruct } from "./constructs/lambda/inventory/get-supplier/get-supplier-lambda-construct";
import { RemoveSupplierLambdaConstruct } from "./constructs/lambda/inventory/remove-supplier/remove-supplier-lambda-construct";
import { ProductEventConsumerLambdaConstruct } from "./constructs/lambda/event-consumer/product-event-consumer-lambda-construct";
import { PaymentEventConsumerLambdaConstruct } from "./constructs/lambda/event-consumer/payment-event-consumer-lambda-construct";
import { importEventBusFromSharedInfra } from "./utils/eventbridge-helper";

export class ProductDomainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: DomainStackProps) {
    super(scope, id, props);

    cdk.Tags.of(this).add("Domain", "hand-made-product-domain");
    cdk.Tags.of(this).add("Environment", props.environment);
    cdk.Tags.of(this).add("Project", "hand-made");
    cdk.Tags.of(this).add("Region", props.regionCode);
    cdk.Tags.of(this).add("StackName", this.stackName);

    const removalPolicy = props.environment === 'prod'
      ? cdk.RemovalPolicy.RETAIN
      : cdk.RemovalPolicy.DESTROY;

    const idempotencyTable = new dynamodb.Table(this, "ProductIdempotencyTable", {
      tableName: `${props.environment}-${props.regionCode}-product-domain-idempotency`,
      partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expires_at",
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: props.environment === "prod" },
    });

    const sharedEventBus = importEventBusFromSharedInfra(this, props.environment);
    const schemaRegistryName = ssm.StringParameter.valueForStringParameter(
      this,
      `/${props.environment}/shared-infra/glue/schema-registry-name`,
    );

    // ========== PRODUCER PATTERN: Outbox + Republish ==========
    const outboxTable = new OutboxTableConstruct(this, "OutboxTable", {
      environment: props.environment,
      regionCode: props.regionCode,
      domainName: "product-domain",
      removalPolicy,
    });

    const republishLambda = new RepublishLambdaConstruct(this, "RepublishLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      domainName: "product-domain",
      outboxTable: outboxTable.table,
      eventBus: sharedEventBus,
      schemaRegistryName,
      removalPolicy,
    });

    // Product inventory feature - DynamoDB tables
    const inventoryTables = new InventoryTablesConstruct(this, "InventoryTables", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    // Export inventory table names to SSM for cross-stack references
    new ssm.StringParameter(this, "MaterialInventoryTableNameParameter", {
      parameterName: `/${props.environment}/product-domain/dynamodb/material-inventory-table-name`,
      stringValue: inventoryTables.materialInventoryTable.tableName,
      description: "Material Inventory DynamoDB Table Name",
    });

    new ssm.StringParameter(this, "StockMovementsTableNameParameter", {
      parameterName: `/${props.environment}/product-domain/dynamodb/stock-movements-table-name`,
      stringValue: inventoryTables.stockMovementsTable.tableName,
      description: "Stock Movements DynamoDB Table Name",
    });

    new ssm.StringParameter(this, "SuppliersTableNameParameter", {
      parameterName: `/${props.environment}/product-domain/dynamodb/suppliers-table-name`,
      stringValue: inventoryTables.suppliersTable.tableName,
      description: "Suppliers DynamoDB Table Name",
    });

    new ssm.StringParameter(this, "BasementProductsTableNameParameter", {
      parameterName: `/${props.environment}/product-domain/dynamodb/basement-products-table-name`,
      stringValue: inventoryTables.basementProductsTable.tableName,
      description: "Basement Products DynamoDB Table Name",
    });

    new ssm.StringParameter(this, "ProductQuantitiesTableNameParameter", {
      parameterName: `/${props.environment}/product-domain/dynamodb/product-quantities-table-name`,
      stringValue: inventoryTables.productQuantitiesTable.tableName,
      description: "Product Quantities DynamoDB Table Name",
    });

    // Product Domain AppSync GraphQL API (single API for shelf + inventory features)
    const productAppSync = new ProductAppSyncConstruct(this, "ProductAppSync", {
      environment: props.environment,
      regionCode: props.regionCode,
    });

    // Product shelf feature - S3 buckets for product media
    const productMediaBuckets = new ProductMediaBucketsConstruct(this, "ProductMediaBuckets", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    // Product shelf feature - DynamoDB tables
    const productTables = new ProductTablesConstruct(this, "ProductTables", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    const waitlistTable = new WaitlistTableConstruct(this, "WaitlistTable", {
      environment: props.environment,
      regionCode: props.regionCode,
      removalPolicy,
    });

    new ssm.StringParameter(this, "WaitlistTableNameParameter", {
      parameterName: `/${props.environment}/product-domain/dynamodb/waitlist-table-name`,
      stringValue: waitlistTable.waitlistTable.tableName,
      description: "Waitlist DynamoDB Table Name",
    });

    new ProductEventConsumerLambdaConstruct(this, "ProductEventConsumer", {
      environment: props.environment,
      regionCode: props.regionCode,
      eventBus: sharedEventBus,
      idempotencyTable,
      schemaRegistryName,
      removalPolicy,
    });

    // ========== EVENT CONSUMER: Payment Events from Payment Domain ==========
    // This consumer listens for payment.captured events and updates inventory
    new PaymentEventConsumerLambdaConstruct(this, "PaymentEventConsumer", {
      environment: props.environment,
      regionCode: props.regionCode,
      eventBus: sharedEventBus,
      productsTable: productTables.productsTable,
      outboxTable: outboxTable.table,
      idempotencyTable,
      removalPolicy,
    });

    // Product shelf feature - Step Functions
    const productStateMachine = new ProductStateMachineConstruct(this, "ProductStateMachine", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      productMediaTable: productTables.productMediaTable,
    });

    // Product shelf feature - Lambda functions
    const createProductLambda = new CreateProductLambdaConstruct(this, "CreateProductLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    const updateProductLambda = new UpdateProductLambdaConstruct(this, "UpdateProductLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      outboxTable: outboxTable.table,
      removalPolicy,
    });

    const moveProductToDraftLambda = new MoveProductToDraftLambdaConstruct(this, "MoveProductToDraftLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    const moveProductToShelfLambda = new MoveProductToShelfLambdaConstruct(this, "MoveProductToShelfLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      outboxTable: outboxTable.table,
      removalPolicy,
    });

    const moveProductToBasementLambda = new MoveProductToBasementLambdaConstruct(this, "MoveProductToBasementLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      outboxTable: outboxTable.table,
      removalPolicy,
    });

    const getProductLambda = new GetProductLambdaConstruct(this, "GetProductLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      productMediaTable: productTables.productMediaTable,
      removalPolicy,
    });

    const listProductsLambda = new ListProductsLambdaConstruct(this, "ListProductsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    const addProductMediaLambda = new AddProductMediaLambdaConstruct(this, "AddProductMediaLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      productMediaTable: productTables.productMediaTable,
      productMediaBucket: productMediaBuckets.productMediaBucket,
      removalPolicy,
    });

    const addProductMaterialLambda = new AddProductMaterialLambdaConstruct(this, "AddProductMaterialLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    const addProcessStepLambda = new AddProcessStepLambdaConstruct(this, "AddProcessStepLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    const createBatchLambda = new CreateBatchLambdaConstruct(this, "CreateBatchLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    const generateCertificateLambda = new GenerateCertificateLambdaConstruct(this, "GenerateCertificateLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      productsTable: productTables.productsTable,
      removalPolicy,
    });

    // Material Inventory Lambda functions
    const addMaterialLambda = new AddMaterialLambdaConstruct(this, "AddMaterialLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      materialInventoryTable: inventoryTables.materialInventoryTable,
      removalPolicy,
    });

    const listMaterialInventoryLambda = new ListMaterialInventoryLambdaConstruct(this, "ListMaterialInventoryLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      materialInventoryTable: inventoryTables.materialInventoryTable,
      removalPolicy,
    });

    const updateMaterialStockLambda = new UpdateMaterialStockLambdaConstruct(this, "UpdateMaterialStockLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      materialInventoryTable: inventoryTables.materialInventoryTable,
      removalPolicy,
    });

    const getMaterialInventoryLambda = new GetMaterialInventoryLambdaConstruct(this, "GetMaterialInventoryLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      materialInventoryTable: inventoryTables.materialInventoryTable,
      removalPolicy,
    });

    const getLowStockMaterialsLambda = new GetLowStockMaterialsLambdaConstruct(this, "GetLowStockMaterialsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      materialInventoryTable: inventoryTables.materialInventoryTable,
      removalPolicy,
    });

    // Stock Movements Lambda functions
    const recordStockMovementLambda = new RecordStockMovementLambdaConstruct(this, "RecordStockMovementLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      stockMovementsTable: inventoryTables.stockMovementsTable,
      removalPolicy,
    });

    const getStockMovementsLambda = new GetStockMovementsLambdaConstruct(this, "GetStockMovementsLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      stockMovementsTable: inventoryTables.stockMovementsTable,
      removalPolicy,
    });

    // Supplier Lambda functions
    const addSupplierLambda = new AddSupplierLambdaConstruct(this, "AddSupplierLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      suppliersTable: inventoryTables.suppliersTable,
      removalPolicy,
    });

    const updateSupplierLambda = new UpdateSupplierLambdaConstruct(this, "UpdateSupplierLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      suppliersTable: inventoryTables.suppliersTable,
      removalPolicy,
    });

    const listSuppliersLambda = new ListSuppliersLambdaConstruct(this, "ListSuppliersLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      suppliersTable: inventoryTables.suppliersTable,
      removalPolicy,
    });

    const getSupplierLambda = new GetSupplierLambdaConstruct(this, "GetSupplierLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      suppliersTable: inventoryTables.suppliersTable,
      removalPolicy,
    });

    const removeSupplierLambda = new RemoveSupplierLambdaConstruct(this, "RemoveSupplierLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      suppliersTable: inventoryTables.suppliersTable,
      removalPolicy,
    });

    const createWaitlistEntryLambda = new CreateWaitlistEntryLambdaConstruct(this, "CreateWaitlistEntryLambda", {
      environment: props.environment,
      regionCode: props.regionCode,
      waitlistTable: waitlistTable.waitlistTable,
      removalPolicy,
    });

    // Product Domain - AppSync resolvers for shelf features
    new ProductAppSyncResolversConstruct(this, "ProductResolvers", {
      api: productAppSync.api,
      createProductLambda: createProductLambda.function,
      updateProductLambda: updateProductLambda.function,
      moveProductToDraftLambda: moveProductToDraftLambda.function,
      moveProductToShelfLambda: moveProductToShelfLambda.function,
      moveProductToBasementLambda: moveProductToBasementLambda.function,
      getProductLambda: getProductLambda.function,
      listProductsLambda: listProductsLambda.function,
      addProductMediaLambda: addProductMediaLambda.function,
      addProductMaterialLambda: addProductMaterialLambda.function,
      addProcessStepLambda: addProcessStepLambda.function,
      createBatchLambda: createBatchLambda.function,
      generateCertificateLambda: generateCertificateLambda.function,
      // Material Inventory Lambdas
      addMaterialLambda: addMaterialLambda.function,
      listMaterialInventoryLambda: listMaterialInventoryLambda.function,
      updateMaterialStockLambda: updateMaterialStockLambda.function,
      getMaterialInventoryLambda: getMaterialInventoryLambda.function,
      getLowStockMaterialsLambda: getLowStockMaterialsLambda.function,
      recordStockMovementLambda: recordStockMovementLambda.function,
      getStockMovementsLambda: getStockMovementsLambda.function,
      addSupplierLambda: addSupplierLambda.function,
      updateSupplierLambda: updateSupplierLambda.function,
      listSuppliersLambda: listSuppliersLambda.function,
      getSupplierLambda: getSupplierLambda.function,
      removeSupplierLambda: removeSupplierLambda.function,
      createWaitlistEntryLambda: createWaitlistEntryLambda.function,
    });
  }
}
