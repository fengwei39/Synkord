/**
 * mcp-tools/validate_entity_usage.cjs
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const MAX_SNIPPET_LEN = 100 * 1024;

const definition = {
  name: 'validate_entity_usage',
  description:
    '校验代码片段中数据模型（实体）的使用是否正确。' +
    '传入 model_name（实体名）和 code_snippet（待校验代码）。',
  inputSchema: {
    type: 'object',
    properties: {
      model_name: {
        type: 'string',
        description: '数据模型名称。必填。',
        minLength: 1,
      },
      code_snippet: {
        type: 'string',
        description: '待校验的代码片段。必填。',
        minLength: 1,
      },
    },
    required: ['model_name', 'code_snippet'],
  },
};

async function handler(args, context) {
  const modelName = (args.model_name || '').trim();
  const codeSnippet = args.code_snippet || '';

  if (!modelName) {
    throw codeError(CODES.INVALID_ARGS, 'model_name is required');
  }
  if (!codeSnippet || codeSnippet.trim().length === 0) {
    throw codeError(CODES.INVALID_ARGS, 'code_snippet is required');
  }
  if (codeSnippet.length > MAX_SNIPPET_LEN) {
    throw codeError(
      CODES.INVALID_ARGS,
      `code_snippet too large: ${codeSnippet.length} > ${MAX_SNIPPET_LEN}`
    );
  }

  const resp = await context.callBackend({
    tool: 'validate_entity_usage',
    args: {
      model_name: modelName,
      code_snippet: codeSnippet,
    },
  });
  const data = resp?.result || resp || {};

  const text = JSON.stringify({
    project: {
      team_id: context.context.team_id,
      project_id: context.context.project_id,
    },
    model_name: modelName,
    snippet_length: codeSnippet.length,
    valid: data.valid === true,
    entity: data.entity || null,
    reason: data.reason || null,
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
