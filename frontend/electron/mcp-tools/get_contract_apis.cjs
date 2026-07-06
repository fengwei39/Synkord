/**
 * mcp-tools/get_contract_apis.cjs
 *
 * 工具：查询当前活跃契约集的所有 API 端点列表
 * 详见 docs/mcp-spec.md §二.1
 */
'use strict';

const definition = {
  name: 'get_contract_apis',
  description:
    '查询当前活跃契约集的所有 API 端点列表（path / method / 请求与响应 schema / tags 等）。' +
    '支持 keyword / method / tag / include_deprecated 过滤。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '按 path 或 summary 模糊匹配' },
      method: {
        type: 'string',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'],
        description: '按 HTTP 方法精确过滤',
      },
      tag: { type: 'string', description: '按 tag 过滤' },
      include_deprecated: { type: 'boolean', description: '是否包含已废弃接口', default: false },
    },
    required: [],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'get_contract_apis',
    args: {
      keyword: args.keyword || '',
      method: args.method || '',
      tag: args.tag || '',
      include_deprecated: args.include_deprecated === true,
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
    filter: {
      keyword: args.keyword || '',
      method: args.method || '',
      tag: args.tag || '',
      include_deprecated: args.include_deprecated === true,
    },
    total,
    items,
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
