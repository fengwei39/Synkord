// Synkord JSON Schema parser
// 把后端 DataModel.schema_content (JSON Schema 字符串) 解析为前端字段视图
// 详见 docs/requirements.md §四.5

import type { EntityField } from '../api/entities'

interface JsonSchemaProperty {
  type?: string | string[]
  description?: string
  items?: { $ref?: string; type?: string } | null
  $ref?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
  enum?: unknown[]
}

interface JsonSchema {
  type?: string
  properties?: Record<string, JsonSchemaProperty>
  required?: string[]
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function lastSegment(ref: string | undefined): string | undefined {
  if (!ref) return undefined
  const parts = ref.split('/')
  return parts[parts.length - 1] || undefined
}

/**
 * 从 JSON Schema 字符串解析顶层 properties 为 EntityField[]
 * 解析失败返回空数组（前端展示兜底）
 */
export function parseSchemaFields(schemaContent: string): EntityField[] {
  if (!schemaContent || !schemaContent.trim()) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(schemaContent)
  } catch {
    return []
  }
  if (!isObject(parsed)) return []
  const doc = parsed as JsonSchema
  const requiredSet = new Set<string>(Array.isArray(doc.required) ? doc.required : [])
  const rawProps = isObject(doc.properties) ? doc.properties : {}
  const fields: EntityField[] = []
  for (const [name, prop] of Object.entries(rawProps)) {
    if (!isObject(prop)) continue
    const p = prop as JsonSchemaProperty
    const typeStr = typeof p.type === 'string' ? p.type : Array.isArray(p.type) ? p.type.join('|') : 'any'
    const field: EntityField = {
      name,
      type: typeStr,
      required: requiredSet.has(name),
    }
    if (typeof p.description === 'string') field.description = p.description
    const directRef = lastSegment(p.$ref)
    if (directRef) field.ref_entity_id = directRef
    if (p.type === 'array' && p.items) {
      field.is_array = true
      const itemRef = lastSegment(p.items.$ref)
      if (itemRef) field.ref_entity_id = itemRef
    }
    fields.push(field)
  }
  return fields
}

/**
 * 构造一个空 JSON Schema 字符串（用于编辑器初始化）
 */
export function emptySchemaContent(): string {
  return JSON.stringify({ type: 'object', properties: {}, required: [] }, null, 2)
}
