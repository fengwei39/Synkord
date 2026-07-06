/**
 * mcp-tools/get_contract_entities.cjs
 *
 * 工具：查询当前活跃契约集的所有数据模型（实体）列表
 * 详见 docs/mcp-spec.md §二.2
 */
'use strict';

const definition = {
  name: 'get_contract_entities',
  description:
    '查询当前活跃契约集的所有数据模型（实体）。支持 keyword 模糊匹配名称或描述。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '按实体名称或描述模糊匹配' },
    },
    required: [],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'get_contract_entities',
    args: {
      keyword: args.keyword || '',
    },
  });
  const data = resp?.result || resp || {};
  const items = data.items || [];
  const total = data.total ?? items.length;

  const text = JSON.stringify({
    contract: {
      contract_id: context.context.contract_id,
      contract_name: context.context.contract_name,
    },
    filter: { keyword: args.keyword || '' },
    total,
    items,
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
