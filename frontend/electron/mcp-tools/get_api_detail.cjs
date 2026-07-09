/**
 * mcp-tools/get_api_detail.cjs
 *
 * 工具：获取单个 API 端点完整定义
 * 详见 docs/mcp-spec.md §二.3
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const definition = {
  name: 'get_api_detail',
  description:
    '获取单个 API 端点的完整定义（请求参数、请求体、响应、安全、tags、deprecated 等）。' +
    '需要 api_id；可选 contract_id 不指定则使用活跃契约集。',
  inputSchema: {
    type: 'object',
    properties: {
      api_id: { type: 'string', description: 'API 端点 ID。必填。', minLength: 1 },
      contract_id: { type: 'string', description: '契约集 ID。可选，默认活跃契约集。' },
    },
    required: ['api_id'],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  const apiId = (args.api_id || '').toString().trim();
  if (!apiId) {
    throw codeError(CODES.INVALID_ARGS, 'api_id is required');
  }
  const contractID = (args.contract_id || '').toString().trim();

  const resp = await context.callBackend({
    tool: 'get_api_detail',
    args: { api_id: apiId, contract_id: contractID },
  });
  const data = resp?.result || resp || {};
  const api = normalizeApi(data);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            contract: {
              contract_id: contractID || context.context.contract_id,
              contract_name: context.context.contract_name,
            },
            api,
          },
          null,
          2,
        ),
      },
    ],
  };
}

function parseJSON(raw, fallback) {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function normalizeApi(api) {
  return {
    api_id: api.id,
    path: api.path,
    method: api.method,
    summary: api.summary,
    description: api.description,
    tags: parseJSON(api.tags, []),
    deprecated: api.deprecated === true,
    parameters: parseJSON(api.parameters_json ?? api.parameters, []),
    request_body: parseJSON(api.request_body_json ?? api.request_body, null),
    responses: parseJSON(api.responses_json ?? api.responses, {}),
  };
}

module.exports = { definition, handler };
