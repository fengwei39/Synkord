// Synkord OpenAPI / Swagger Parser
// 解析 OpenAPI 3.0 / Swagger 2.0 / JSON / YAML 格式
// 详见 docs/ui-spec.md §八

import type { ApiDefinition, ApiParameter } from '../api/apis'
import type { EntityDefinition } from '../api/entities'

// YAML 解析：使用简单的内联实现（避免引入额外依赖）
// 注：生产环境建议使用 js-yaml 库替换，这里先做基础支持

interface ParseResult {
  apis: Array<Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>>
  entities: Array<Pick<EntityDefinition, 'name' | 'description' | 'schema_content'>>
  warnings: string[]
}

/**
 * 解析 OpenAPI / Swagger 内容
 */
export function parseOpenAPI(content: string): ParseResult {
  const trimmed = content.trim()
  let doc: any

  try {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      doc = JSON.parse(trimmed)
    } else {
      // YAML - 简单的 line-based parser（支持 OpenAPI 常用结构）
      doc = parseSimpleYAML(trimmed)
    }
  } catch (e: any) {
    throw new Error(`解析失败：${e.message}`)
  }

  if (!doc || typeof doc !== 'object') {
    throw new Error('文档格式无效：根节点必须是对象')
  }

  // 检测版本
  const isOpenApi3 = typeof doc.openapi === 'string' && doc.openapi.startsWith('3.')
  const isSwagger2 = typeof doc.swagger === 'string' && doc.swagger.startsWith('2.')

  if (!isOpenApi3 && !isSwagger2) {
    throw new Error('文档格式无效：仅支持 OpenAPI 3.0+ 或 Swagger 2.0')
  }

  const apis: ParseResult['apis'] = []
  const entities: ParseResult['entities'] = []
  const warnings: string[] = []

  // 解析 entities (从 components.schemas 或 definitions)
  const schemas = isOpenApi3
    ? doc.components?.schemas
    : doc.definitions

  if (schemas && typeof schemas === 'object') {
    for (const [name, schema] of Object.entries(schemas)) {
      const entity = parseEntity(name, schema as any, schemas)
      if (entity) entities.push(entity)
    }
  }

  // 解析 APIs
  const paths = doc.paths
  if (paths && typeof paths === 'object') {
    for (const [pathStr, pathItem] of Object.entries(paths)) {
      if (!pathItem || typeof pathItem !== 'object') continue
      const methods = ['get', 'post', 'put', 'delete', 'patch', 'head', 'options']
      for (const method of methods) {
        const op = (pathItem as any)[method]
        if (!op) continue
        const api = parseApi(method.toUpperCase(), pathStr, op, schemas, warnings)
        if (api) apis.push(api)
      }
    }
  }

  return { apis, entities, warnings }
}

function parseApi(
  method: string,
  path: string,
  op: any,
  schemas: any,
  warnings: string[],
): Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'> | null {
  if (!op || typeof op !== 'object') return null

  const summary = (op.summary as string) || `${method} ${path}`
  const description = op.description
  const tags = Array.isArray(op.tags) ? op.tags : []
  const deprecated = Boolean(op.deprecated)

  const parameters: ApiParameter[] = []
  if (Array.isArray(op.parameters)) {
    for (const p of op.parameters) {
      if (!p || typeof p !== 'object') continue
      parameters.push({
        name: String(p.name || ''),
        in: (p.in as any) || 'query',
        required: Boolean(p.required),
        schema: (p.schema as Record<string, unknown>) || {},
        description: p.description,
      })
    }
  }

  const requestBody = op.requestBody?.content?.['application/json']?.schema
    ? {
        required: Boolean(op.requestBody.required),
        schema: op.requestBody.content['application/json'].schema,
        description: op.requestBody.description,
      }
    : undefined

  const responses: Record<string, any> = {}
  if (op.responses && typeof op.responses === 'object') {
    for (const [code, resp] of Object.entries(op.responses)) {
      if (!resp || typeof resp !== 'object') continue
      responses[code] = {
        description: (resp as any).description || '',
        schema: (resp as any).content?.['application/json']?.schema,
      }
    }
  }

  return {
    path,
    method: method as any,
    summary,
    description,
    tags,
    deprecated,
    parameters,
    request_body: requestBody,
    responses,
  }
}

function parseEntity(
  name: string,
  schema: any,
  _allSchemas: any,
): Omit<EntityDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'> | null {
  if (!schema || typeof schema !== 'object') return null

  // v1.2：直接保存原始 JSON Schema 字符串，不再前端推断 fields
  return {
    name,
    description: schema.description,
    schema_content: JSON.stringify(schema, null, 2),
    current_version: '1.0.0',
    version_count: 1,
  } as any
}

function extractRefName(ref: string): string | undefined {
  if (typeof ref !== 'string') return undefined
  const parts = ref.split('/')
  return parts[parts.length - 1]
}

/**
 * 简单的 YAML 解析器（支持基础 key-value 结构、列表、嵌套）
 * 仅用于解析 OpenAPI YAML；不支持复杂 YAML 特性
 */
function parseSimpleYAML(text: string): any {
  const lines = text.split('\n')
  const root: any = {}
  const stack: Array<{ indent: number; obj: any }> = [{ indent: -1, obj: root }]

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmedLine = line.replace(/\s+$/, '')
    if (!trimmedLine || trimmedLine.startsWith('#')) continue

    const indent = line.length - line.trimStart().length
    const content = line.trimStart()

    // 弹出栈直到找到更浅的缩进
    while (stack.length > 1 && stack[stack.length - 1].indent >= indent) {
      stack.pop()
    }
    const current = stack[stack.length - 1].obj

    if (content.startsWith('- ')) {
      // 列表项
      const value = content.slice(2).trim()
      const keyMatch = value.match(/^([^:]+):\s*(.*)$/)
      if (keyMatch) {
        // 对象项
        const newObj: any = {}
        if (keyMatch[2]) {
          newObj[keyMatch[1].trim()] = parseValue(keyMatch[2])
        }
        if (!Array.isArray(current)) {
          // 父级应该已经是数组
        }
        const arr = Array.isArray(current) ? current : (current[Object.keys(current).pop()!] = [])
        arr.push(newObj)
        stack.push({ indent, obj: newObj })
      } else {
        // 简单值
        const arr = Array.isArray(current) ? current : (current[Object.keys(current).pop()!] = [])
        arr.push(parseValue(value))
      }
    } else {
      const colonIdx = content.indexOf(':')
      if (colonIdx === -1) continue
      const key = content.slice(0, colonIdx).trim()
      const value = content.slice(colonIdx + 1).trim()

      if (!value) {
        // 嵌套对象开始
        const newObj: any = {}
        current[key] = newObj
        stack.push({ indent, obj: newObj })
      } else {
        current[key] = parseValue(value)
      }
    }
  }

  return root
}

function parseValue(raw: string): any {
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null') return null
  if (/^-?\d+$/.test(raw)) return parseInt(raw, 10)
  if (/^-?\d+\.\d+$/.test(raw)) return parseFloat(raw)
  // 去掉引号
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    return raw.slice(1, -1)
  }
  return raw
}

/**
 * 智能默认排除规则
 * 路径含以下关键词的 API 默认不勾选
 */
export const DEFAULT_EXCLUDE_KEYWORDS = ['internal', 'debug', 'test', '_']

export function shouldExcludeByDefault(path: string): boolean {
  const lower = path.toLowerCase()
  return DEFAULT_EXCLUDE_KEYWORDS.some((kw) => lower.includes(`/${kw}`) || lower.includes(`/${kw}/`))
}