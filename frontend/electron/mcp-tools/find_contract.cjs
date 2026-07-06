/**
 * mcp-tools/find_contract.cjs
 *
 * 工具：按名称查找契约集（按匹配度返回）
 * 详见 docs/mcp-spec.md §二.9
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const definition = {
  name: 'find_contract',
  description:
    '按名称查找契约集；返回 matches 数组，每项含 contract_id / contract_name / match_type（exact / prefix / contains）。',
  inputSchema: {
    type: 'object',
    properties: {
      keyword: { type: 'string', description: '匹配关键字。必填。', minLength: 1 },
    },
    required: ['keyword'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const keyword = (args.keyword || '').toString().trim();
  if (!keyword) {
    throw codeError(CODES.INVALID_ARGS, 'keyword is required');
  }

  const resp = await context.callBackend({
    tool: 'find_contract',
    args: { keyword },
  });

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ keyword, matches: resp?.result || resp || [] }, null, 2),
      },
    ],
  };
}

module.exports = { definition, handler };
