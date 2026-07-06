/**
 * mcp-tools/get_api_dependencies.cjs
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const definition = {
  name: 'get_api_dependencies',
  description: '查询指定 API 端点被哪些项目引用。传入 api_path（必填）和 api_method（可选，如 GET/POST）。',
  inputSchema: {
    type: 'object',
    properties: {
      api_path: {
        type: 'string',
        description: 'API 路径（如 "/users/{id}"）。必填。',
        minLength: 1,
      },
      api_method: {
        type: 'string',
        description: 'HTTP 方法（GET/POST/PUT/DELETE/PATCH），不区分大小写。可选。',
        enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      },
    },
    required: ['api_path'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const apiPath = (args.api_path || '').trim();
  if (!apiPath) {
    throw codeError(CODES.INVALID_ARGS, 'api_path is required');
  }

  const apiMethod = args.api_method ? String(args.api_method).toUpperCase() : undefined;

  const resp = await context.callBackend({
    tool: 'get_api_dependencies',
    args: {
      api_path: apiPath,
      ...(apiMethod ? { api_method: apiMethod } : {}),
    },
  });
  const data = resp?.result || resp || {};
  const referencedBy = data.referenced_by || [];

  const text = JSON.stringify({
    contract: {
      contract_id: context.context.contract_id,
      contract_name: context.context.contract_name,
    },
    api_path: apiPath,
    api_method: apiMethod,
    referenced_count: referencedBy.length,
    referenced_by: referencedBy,
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
