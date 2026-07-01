/**
 * mcp-tools/get_entity_dependencies.cjs
 */
'use strict';

const { codeError, CODES } = require('../mcp-core/errors.cjs');

const definition = {
  name: 'get_entity_dependencies',
  description: '查询指定数据模型被哪些项目引用（依赖关系）。传入 model_name（实体名，如 "UserDTO"）。',
  inputSchema: {
    type: 'object',
    properties: {
      model_name: {
        type: 'string',
        description: '数据模型名称（如 "UserDTO"）。必填。',
        minLength: 1,
      },
    },
    required: ['model_name'],
  },
};

async function handler(args, context) {
  const modelName = (args.model_name || '').trim();
  if (!modelName) {
    throw codeError(CODES.INVALID_ARGS, 'model_name is required');
  }

  const resp = await context.callBackend({
    tool: 'get_entity_dependencies',
    args: { model_name: modelName },
  });
  const data = resp?.result || resp || {};
  const referencedBy = data.referenced_by || [];

  const text = JSON.stringify({
    project: {
      team_id: context.context.team_id,
      project_id: context.context.project_id,
    },
    model_name: modelName,
    referenced_count: referencedBy.length,
    referenced_by: referencedBy,
  }, null, 2);

  return {
    content: [{ type: 'text', text }],
  };
}

module.exports = { definition, handler };
