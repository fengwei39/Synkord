/**
 * mcp-tools/search_apis_across_contracts.cjs
 *
 * 工具：跨契约集搜索 API。
 */
'use strict';

const definition = {
  name: 'search_apis_across_contracts',
  description:
    '跨当前用户可访问的契约集搜索 API。支持 keyword / contract_id / method / limit 过滤。' +
    '返回精简 ApiSummary：每项含 { contract_id, contract_name, api: { api_id, path, method, summary } }，' +
    '不含 schema_content / parameters 等大字段。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '搜索关键词', minLength: 1 },
      contract_id: { type: 'string', description: '可选，限定单个契约集' },
      method: { type: 'string', description: '可选，HTTP 方法过滤' },
      limit: { type: 'number', description: '最大返回数量，默认 30' },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'search_apis_across_contracts',
    args: {
      keyword: args.keyword,
      contract_id: args.contract_id || '',
      method: args.method || '',
      limit: args.limit || 30,
    },
  });
  const data = resp?.result || resp || [];

  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  };
}

module.exports = { definition, handler };
