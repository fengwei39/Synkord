/**
 * mcp-tools/get_project_apis.cjs
 *
 * 工具：查询当前项目的 API 端点列表
 */
'use strict';

const definition = {
  name: 'get_project_apis',
  description: '查询当前激活项目的所有 API 端点列表（path、method、请求/响应 schema 等）。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'get_project_apis',
    args: {},
  });
  const data = resp?.result || resp || {};
  const items = data.items || [];
  const total = data.total ?? items.length;

  const text = JSON.stringify({
    contract: {
      contract_id: context.context.contract_id,
      contract_name: context.context.contract_name,
    },
    total,
    items,
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
