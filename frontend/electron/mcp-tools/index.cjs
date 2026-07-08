/**
 * mcp-tools/index.cjs
 *
 * 工具统一注册入口（v1.2：11 个工具，全部对齐后端 naming）
 * 启动时调用一次，将所有内置工具注册到全局注册表
 */
'use strict';

const { globalRegistry } = require('../mcp-core/tool-registry.cjs');

// v1.2 命名：与后端 services/mcp.go 的 DefaultMCPToolRegistry 对齐
const { definition: getContractApisDef, handler: getContractApisHandler } = require('./get_contract_apis.cjs');
const { definition: getContractEntitiesDef, handler: getContractEntitiesHandler } = require('./get_contract_entities.cjs');
const { definition: getApiDetailDef, handler: getApiDetailHandler } = require('./get_api_detail.cjs');
const { definition: getEntityDetailDef, handler: getEntityDetailHandler } = require('./get_entity_detail.cjs');
const { definition: getApiDepsDef, handler: getApiDepsHandler } = require('./get_api_dependencies.cjs');
const { definition: getEntityDepsDef, handler: getEntityDepsHandler } = require('./get_entity_dependencies.cjs');
const {
  definition: validateCodeDef,
  handler: validateCodeHandler,
} = require('./validate_code_against_contract.cjs');
const { definition: listContractsDef, handler: listContractsHandler } = require('./list_contracts.cjs');
const { definition: findContractDef, handler: findContractHandler } = require('./find_contract.cjs');
const {
  definition: searchApisAcrossContractsDef,
  handler: searchApisAcrossContractsHandler,
} = require('./search_apis_across_contracts.cjs');
const {
  definition: searchEntitiesAcrossContractsDef,
  handler: searchEntitiesAcrossContractsHandler,
} = require('./search_entities_across_contracts.cjs');

/**
 * 注册所有内置工具
 * 幂等：重复调用不会重复注册
 */
function registerBuiltinTools() {
  const tools = [
    [getContractApisDef, getContractApisHandler],
    [getContractEntitiesDef, getContractEntitiesHandler],
    [getApiDetailDef, getApiDetailHandler],
    [getEntityDetailDef, getEntityDetailHandler],
    [getApiDepsDef, getApiDepsHandler],
    [getEntityDepsDef, getEntityDepsHandler],
    [validateCodeDef, validateCodeHandler],
    [listContractsDef, listContractsHandler],
    [findContractDef, findContractHandler],
    [searchApisAcrossContractsDef, searchApisAcrossContractsHandler],
    [searchEntitiesAcrossContractsDef, searchEntitiesAcrossContractsHandler],
  ];

  for (const [def, handler] of tools) {
    if (globalRegistry.get(def.name)) {
      // 已注册（重复调用）
      continue;
    }
    globalRegistry.register(def, handler, { caller: 'local-mcp' });
  }

  return globalRegistry.size();
}

module.exports = {
  registerBuiltinTools,
};
