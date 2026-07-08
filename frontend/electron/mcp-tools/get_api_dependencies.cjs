/**
 * mcp-tools/get_api_dependencies.cjs
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const definition = {
  name: 'get_api_dependencies',
  description: '查询指定 API 端点使用哪些实体、以及同契约集内其他 API 引用情况。传入 api_id。',
  inputSchema: {
    type: 'object',
    properties: {
      api_id: {
        type: 'string',
        description: 'API 端点 ID。必填。',
        minLength: 1,
      },
      contract_id: { type: 'string', description: '契约集 ID。可选，默认活跃契约集。' },
    },
    required: ['api_id'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const apiId = (args.api_id || '').trim();
  if (!apiId) {
    throw codeError(CODES.INVALID_ARGS, 'api_id is required');
  }
  const contractID = (args.contract_id || '').toString().trim();

  const resp = await context.callBackend({
    tool: 'get_api_dependencies',
    args: {
      api_id: apiId,
      contract_id: contractID,
    },
  });
  const data = resp?.result || resp || {};

  const text = JSON.stringify({
    contract: {
      contract_id: contractID || context.context.contract_id,
      contract_name: context.context.contract_name,
    },
    api_id: apiId,
    uses_entities: data.uses_entities || [],
    used_by_apis: data.used_by_apis || [],
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
