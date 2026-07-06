/**
 * mcp-tools/validate_code_against_contract.cjs
 *
 * 工具：校验代码片段是否与契约集匹配
 * 详见 docs/mcp-spec.md §二.7
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const MAX_SNIPPET_LEN = 100 * 1024;

const definition = {
  name: 'validate_code_against_contract',
  description:
    '校验代码片段（HTTP 调用 + 字段引用）是否符合当前契约集。' +
    '返回 valid + issues 列表，每条 issue 含 severity / line / field / message / suggestion。',
  inputSchema: {
    type: 'object',
    properties: {
      code_snippet: {
        type: 'string',
        description: '待校验的代码片段。必填。',
        minLength: 1,
      },
      language: {
        type: 'string',
        enum: ['typescript', 'javascript', 'python', 'go', 'java', 'plain'],
        description: '代码语言（用于优化正则匹配）。可省略，默认 plain。',
      },
    },
    required: ['code_snippet'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const codeSnippet = (args.code_snippet || '').toString();
  const language = (args.language || 'plain').toString();

  if (!codeSnippet.trim()) {
    throw codeError(CODES.INVALID_ARGS, 'code_snippet is required');
  }
  if (codeSnippet.length > MAX_SNIPPET_LEN) {
    throw codeError(
      CODES.INVALID_ARGS,
      `code_snippet too large: ${codeSnippet.length} > ${MAX_SNIPPET_LEN}`,
    );
  }

  const resp = await context.callBackend({
    tool: 'validate_code_against_contract',
    args: {
      code_snippet: codeSnippet,
      language: language,
    },
  });
  const data = resp?.result || resp || {};

  const text = JSON.stringify({
    contract: {
      contract_id: context.context.contract_id,
      contract_name: context.context.contract_name,
    },
    snippet_length: codeSnippet.length,
    language,
    valid: data.valid === true,
    issues: data.issues || [],
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
