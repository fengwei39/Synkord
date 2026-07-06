/**
 * mcp-tools/get_project_entities.cjs
 *
 * 工具：查询当前项目的数据模型列表
 * 对应设计文档 §6 工具集
 */
'use strict';

const definition = {
  name: 'get_project_entities',
  description: '查询当前激活项目的数据模型列表（实体定义、字段、版本等）。返回项目的所有数据模型。',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
    additionalProperties: false,
  },
};

async function handler(args, context) {
  // callBackend 返回 { result: { items, total } }
  const resp = await context.callBackend({
    tool: 'get_project_entities',
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
