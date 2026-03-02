import * as appsync from 'aws-cdk-lib/aws-appsync';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export interface ProductAppSyncResolversConstructProps {
  api: appsync.IGraphqlApi;
  createProductLambda?: lambda.IFunction;
  updateProductLambda?: lambda.IFunction;
  moveProductToDraftLambda?: lambda.IFunction;
  moveProductToShelfLambda?: lambda.IFunction;
  moveProductToBasementLambda?: lambda.IFunction;
  getProductLambda?: lambda.IFunction;
  listProductsLambda?: lambda.IFunction;
  addProductMediaLambda?: lambda.IFunction;
  addProductMaterialLambda?: lambda.IFunction;
  addProcessStepLambda?: lambda.IFunction;
  createBatchLambda?: lambda.IFunction;
  generateCertificateLambda?: lambda.IFunction;
  // Material Inventory Lambdas
  addMaterialLambda?: lambda.IFunction;
  listMaterialInventoryLambda?: lambda.IFunction;
  updateMaterialStockLambda?: lambda.IFunction;
  getMaterialInventoryLambda?: lambda.IFunction;
  getLowStockMaterialsLambda?: lambda.IFunction;
  // Stock Movements Lambdas
  recordStockMovementLambda?: lambda.IFunction;
  getStockMovementsLambda?: lambda.IFunction;
  // Supplier Lambdas
  addSupplierLambda?: lambda.IFunction;
  updateSupplierLambda?: lambda.IFunction;
  listSuppliersLambda?: lambda.IFunction;
  getSupplierLambda?: lambda.IFunction;
  removeSupplierLambda?: lambda.IFunction;
  createWaitlistEntryLambda?: lambda.IFunction;
}

export class ProductAppSyncResolversConstruct extends Construct {
  constructor(scope: Construct, id: string, props: ProductAppSyncResolversConstructProps) {
    super(scope, id);

    // Create Product Mutation Resolver
    if (props.createProductLambda) {
      const createProductDataSource = props.api.addLambdaDataSource(
        'CreateProductDataSource',
        props.createProductLambda
      );

      createProductDataSource.createResolver('CreateProductResolver', {
        typeName: 'Mutation',
        fieldName: 'createProduct',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Update Product Mutation Resolver
    if (props.updateProductLambda) {
      const updateProductDataSource = props.api.addLambdaDataSource(
        'UpdateProductDataSource',
        props.updateProductLambda
      );

      updateProductDataSource.createResolver('UpdateProductResolver', {
        typeName: 'Mutation',
        fieldName: 'updateProduct',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Product Lifecycle Stage Transition Resolvers
    if (props.moveProductToDraftLambda) {
      const moveProductToDraftDataSource = props.api.addLambdaDataSource(
        'MoveProductToDraftDataSource',
        props.moveProductToDraftLambda
      );

      moveProductToDraftDataSource.createResolver('MoveProductToDraftResolver', {
        typeName: 'Mutation',
        fieldName: 'moveProductToDraft',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.moveProductToShelfLambda) {
      const moveProductToShelfDataSource = props.api.addLambdaDataSource(
        'MoveProductToShelfDataSource',
        props.moveProductToShelfLambda
      );

      moveProductToShelfDataSource.createResolver('MoveProductToShelfResolver', {
        typeName: 'Mutation',
        fieldName: 'moveProductToShelf',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.moveProductToBasementLambda) {
      const moveProductToBasementDataSource = props.api.addLambdaDataSource(
        'MoveProductToBasementDataSource',
        props.moveProductToBasementLambda
      );

      moveProductToBasementDataSource.createResolver('MoveProductToBasementResolver', {
        typeName: 'Mutation',
        fieldName: 'moveProductToBasement',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Query Resolvers
    if (props.getProductLambda) {
      const getProductDataSource = props.api.addLambdaDataSource(
        'GetProductDataSource',
        props.getProductLambda
      );

      getProductDataSource.createResolver('GetProductResolver', {
        typeName: 'Query',
        fieldName: 'getProduct',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.listProductsLambda) {
      const listProductsDataSource = props.api.addLambdaDataSource(
        'ListProductsDataSource',
        props.listProductsLambda
      );

      listProductsDataSource.createResolver('ListProductsResolver', {
        typeName: 'Query',
        fieldName: 'listProducts',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Additional Mutation Resolvers
    if (props.addProductMediaLambda) {
      const addProductMediaDataSource = props.api.addLambdaDataSource(
        'AddProductMediaDataSource',
        props.addProductMediaLambda
      );

      addProductMediaDataSource.createResolver('AddProductMediaResolver', {
        typeName: 'Mutation',
        fieldName: 'addProductMedia',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.addProductMaterialLambda) {
      const addProductMaterialDataSource = props.api.addLambdaDataSource(
        'AddProductMaterialDataSource',
        props.addProductMaterialLambda
      );

      addProductMaterialDataSource.createResolver('AddProductMaterialResolver', {
        typeName: 'Mutation',
        fieldName: 'addProductMaterial',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.addProcessStepLambda) {
      const addProcessStepDataSource = props.api.addLambdaDataSource(
        'AddProcessStepDataSource',
        props.addProcessStepLambda
      );

      addProcessStepDataSource.createResolver('AddProcessStepResolver', {
        typeName: 'Mutation',
        fieldName: 'addProcessStep',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.createBatchLambda) {
      const createBatchDataSource = props.api.addLambdaDataSource(
        'CreateBatchDataSource',
        props.createBatchLambda
      );

      createBatchDataSource.createResolver('CreateBatchResolver', {
        typeName: 'Mutation',
        fieldName: 'createBatch',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.generateCertificateLambda) {
      const generateCertificateDataSource = props.api.addLambdaDataSource(
        'GenerateCertificateDataSource',
        props.generateCertificateLambda
      );

      generateCertificateDataSource.createResolver('GenerateCertificateResolver', {
        typeName: 'Mutation',
        fieldName: 'generateCertificate',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Material Inventory Mutation Resolvers
    if (props.addMaterialLambda) {
      const addMaterialDataSource = props.api.addLambdaDataSource(
        'AddMaterialDataSource',
        props.addMaterialLambda
      );

      addMaterialDataSource.createResolver('AddMaterialResolver', {
        typeName: 'Mutation',
        fieldName: 'addMaterialToInventory',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateMaterialStockLambda) {
      const updateMaterialStockDataSource = props.api.addLambdaDataSource(
        'UpdateMaterialStockDataSource',
        props.updateMaterialStockLambda
      );

      updateMaterialStockDataSource.createResolver('UpdateMaterialStockResolver', {
        typeName: 'Mutation',
        fieldName: 'updateMaterialStock',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Material Inventory Query Resolvers
    if (props.listMaterialInventoryLambda) {
      const listMaterialInventoryDataSource = props.api.addLambdaDataSource(
        'ListMaterialInventoryDataSource',
        props.listMaterialInventoryLambda
      );

      listMaterialInventoryDataSource.createResolver('ListMaterialInventoryResolver', {
        typeName: 'Query',
        fieldName: 'listMaterialInventory',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getMaterialInventoryLambda) {
      const getMaterialInventoryDataSource = props.api.addLambdaDataSource(
        'GetMaterialInventoryDataSource',
        props.getMaterialInventoryLambda
      );

      getMaterialInventoryDataSource.createResolver('GetMaterialInventoryResolver', {
        typeName: 'Query',
        fieldName: 'getMaterialInventory',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getLowStockMaterialsLambda) {
      const getLowStockMaterialsDataSource = props.api.addLambdaDataSource(
        'GetLowStockMaterialsDataSource',
        props.getLowStockMaterialsLambda
      );

      getLowStockMaterialsDataSource.createResolver('GetLowStockMaterialsResolver', {
        typeName: 'Query',
        fieldName: 'getLowStockMaterials',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Stock Movement Resolvers
    if (props.recordStockMovementLambda) {
      const recordStockMovementDataSource = props.api.addLambdaDataSource(
        'RecordStockMovementDataSource',
        props.recordStockMovementLambda
      );

      recordStockMovementDataSource.createResolver('RecordStockMovementResolver', {
        typeName: 'Mutation',
        fieldName: 'recordStockMovement',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getStockMovementsLambda) {
      const getStockMovementsDataSource = props.api.addLambdaDataSource(
        'GetStockMovementsDataSource',
        props.getStockMovementsLambda
      );

      getStockMovementsDataSource.createResolver('GetStockMovementsResolver', {
        typeName: 'Query',
        fieldName: 'getStockMovements',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    // Supplier Resolvers
    if (props.addSupplierLambda) {
      const addSupplierDataSource = props.api.addLambdaDataSource(
        'AddSupplierDataSource',
        props.addSupplierLambda
      );

      addSupplierDataSource.createResolver('AddSupplierResolver', {
        typeName: 'Mutation',
        fieldName: 'addSupplier',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.updateSupplierLambda) {
      const updateSupplierDataSource = props.api.addLambdaDataSource(
        'UpdateSupplierDataSource',
        props.updateSupplierLambda
      );

      updateSupplierDataSource.createResolver('UpdateSupplierResolver', {
        typeName: 'Mutation',
        fieldName: 'updateSupplier',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.listSuppliersLambda) {
      const listSuppliersDataSource = props.api.addLambdaDataSource(
        'ListSuppliersDataSource',
        props.listSuppliersLambda
      );

      listSuppliersDataSource.createResolver('ListSuppliersResolver', {
        typeName: 'Query',
        fieldName: 'listSuppliers',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.getSupplierLambda) {
      const getSupplierDataSource = props.api.addLambdaDataSource(
        'GetSupplierDataSource',
        props.getSupplierLambda
      );

      getSupplierDataSource.createResolver('GetSupplierResolver', {
        typeName: 'Query',
        fieldName: 'getSupplier',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.removeSupplierLambda) {
      const removeSupplierDataSource = props.api.addLambdaDataSource(
        'RemoveSupplierDataSource',
        props.removeSupplierLambda
      );

      removeSupplierDataSource.createResolver('RemoveSupplierResolver', {
        typeName: 'Mutation',
        fieldName: 'removeSupplier',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }

    if (props.createWaitlistEntryLambda) {
      const createWaitlistEntryDataSource = props.api.addLambdaDataSource(
        'CreateWaitlistEntryDataSource',
        props.createWaitlistEntryLambda
      );

      createWaitlistEntryDataSource.createResolver('CreateWaitlistEntryResolver', {
        typeName: 'Mutation',
        fieldName: 'createWaitlistEntry',
        requestMappingTemplate: appsync.MappingTemplate.lambdaRequest(),
        responseMappingTemplate: appsync.MappingTemplate.lambdaResult(),
      });
    }
  }
}
