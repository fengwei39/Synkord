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
    '列出当前用户有权限访问的所有契约集（含 my_role 与计数）。可选 keyword 模糊过滤。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '按名称模糊匹配' },
    },
    required: [],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const resp = await context.callBackend({
    tool: 'list_contracts',
    args: { keyword: (args.keyword || '').toString() },
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
