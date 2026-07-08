/**
 * mcp-tools/search_entities_across_contracts.cjs
 *
 * 工具：跨契约集搜索数据模型。
 */
'use strict';

const definition = {
  name: 'search_entities_across_contracts',
  description:
    '跨当前用户可访问的契约集搜索数据模型。支持 keyword / contract_id / limit 过滤。' +
    '返回精简 EntitySummary：每项含 { contract_id, contract_name, entity: { entity_id, name, description } }，' +
    '不含 schema_content 全文。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词', minLength: 1 },
      contract_id: { type: 'string', description: '可选，限定单个契约集' },
      limit: { type: 'number', description: '最大返回数量，默认 30' },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'search_entities_across_contracts',
    args: {
      keyword: args.keyword,
      contract_id: args.contract_id || '',
      limit: args.limit || 30,
    },
  });
  const data = resp?.result || resp || [];

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

module.exports = { definition, handler };
