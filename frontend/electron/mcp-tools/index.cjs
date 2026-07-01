/**
 * mcp-tools/index.cjs
 *
 * 工具统一注册入口
 * 启动时调用一次，将 5 个内置工具注册到全局注册表
 */
'use strict';

const { globalRegistry } = require('../mcp-core/tool-registry.cjs');

const { definition: getProjectEntitiesDef, handler: getProjectEntitiesHandler } = require('./get_project_entities.cjs');
const { definition: getProjectApisDef, handler: getProjectApisHandler } = require('./get_project_apis.cjs');
const { definition: getEntityDepsDef, handler: getEntityDepsHandler } = require('./get_entity_dependencies.cjs');
const { definition: getApiDepsDef, handler: getApiDepsHandler } = require('./get_api_dependencies.cjs');
const { definition: validateEntityUsageDef, handler: validateEntityUsageHandler } = require('./validate_entity_usage.cjs');

/**
 * 注册所有内置工具
 * 幂等：重复调用不会重复注册
 */
function registerBuiltinTools() {
  const tools = [
    [getProjectEntitiesDef, getProjectEntitiesHandler],
    [getProjectApisDef, getProjectApisHandler],
    [getEntityDepsDef, getEntityDepsHandler],
    [getApiDepsDef, getApiDepsHandler],
    [validateEntityUsageDef, validateEntityUsageHandler],
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
