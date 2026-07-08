/**
 * mcp-tools/list_contracts.cjs
 *
 * 工具：跨契约集发现
 * 详见 docs/mcp-spec.md §二.8
 */
'use strict';

const definition = {
  name: 'list_contracts',
  description:
    '列出当前用户有权限访问的所有契约集（含 my_role 与计数）。支持 keyword / include_archived / limit / offset。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '按名称模糊匹配' },
      include_archived: { type: 'boolean', description: '是否包含已归档契约集，默认 false' },
      limit: { type: 'number', description: '最大返回数量，默认 50' },
      offset: { type: 'number', description: '跳过数量，默认 0' },
    },
    required: [],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'list_contracts',
    args: {
      keyword: (args.keyword || '').toString(),
      include_archived: args.include_archived === true,
      limit: args.limit || 50,
      offset: args.offset || 0,
    },
  });
  const data = resp?.result || resp || {};
  const items = data.items || [];
  const total = data.total ?? items.length;

  const text = JSON.stringify(
    {
      total,
      items,
    },
    null,
    2,
  );

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
