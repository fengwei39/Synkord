/**
 * mcp-tools/get_entity_detail.cjs
 *
 * 工具：获取单个数据模型（实体）完整定义
 * 详见 docs/mcp-spec.md §二.4
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const definition = {
  name: 'get_entity_detail',
  description:
    '获取单个数据模型（实体）的完整定义：name / description / schema_content / current_version / version_count。' +
    '需要 entity_id；可选 contract_id 不指定则使用活跃契约集。',
  inputSchema: {
    type: 'object',
    properties: {
      entity_id: { type: 'string', description: '实体 ID。必填。', minLength: 1 },
      contract_id: { type: 'string', description: '契约集 ID。可选，默认活跃契约集。' },
    },
    required: ['entity_id'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const entityID = (args.entity_id || '').toString().trim();
  if (!entityID) {
    throw codeError(CODES.INVALID_ARGS, 'entity_id is required');
  }
  const contractID = (args.contract_id || '').toString().trim();

  const resp = await context.callBackend({
    tool: 'get_entity_detail',
    args: { entity_id: entityID, contract_id: contractID },
  });
  const data = resp?.result || resp || {};

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            contract: {
              contract_id: contractID || context.context.contract_id,
              contract_name: context.context.contract_name,
            },
            entity: data,
          },
          null,
          2,
        ),
      },
    ],
  };
}

module.exports = { definition, handler };
