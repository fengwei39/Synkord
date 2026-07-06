// Synkord Postman Collection Parser
// 解析 Postman Collection v2.1 格式
// 详见 docs/ui-spec.md §八

import type { ApiDefinition } from '../api/apis'

interface ParseResult {
  apis: Array<Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>>
  entities: never[]  // Postman 不包含数据模型定义
  warnings: string[]
}

interface PostmanItem {
  name?: string
  request?: {
    method?: string
    header?: Array<{ key: string; value: string }>
    url?: string | { raw?: string; path?: string[] }
    body?: { mode?: string; raw?: string }
    description?: string
  }
  item?: PostmanItem[]
}

/**
 * 解析 Postman Collection v2.1
 */
export function parsePostman(content: string): ParseResult {
  let doc: any
  try {
    doc = JSON.parse(content)
  } catch (e: any) {
    throw new Error(`Postman JSON 解析失败：${e.message}`)
  }

  if (!doc.info?.schema?.includes('v2.1')) {
    throw new Error('仅支持 Postman Collection v2.1 格式')
  }

  const apis: ParseResult['apis'] = []
  const warnings: string[] = []

  const traverse = (items: PostmanItem[] | undefined, folderTags: string[] = []) => {
    if (!items) return
    for (const item of items) {
      const currentTags = item.name ? [...folderTags, item.name] : folderTags
      if (item.item) {
        traverse(item.item, currentTags)
        continue
      }
      if (!item.request) continue
      const api = parsePostmanItem(item, currentTags)
      if (api) apis.push(api)
    }
  }

  traverse(doc.item)

  return { apis, entities: [], warnings }
}

function parsePostmanItem(
  item: PostmanItem,
  tags: string[],
): Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'> | null {
  const req = item.request
  if (!req) return null

  const method = (req.method || 'GET').toUpperCase()

  // 解析 URL
  let path = ''
  if (typeof req.url === 'string') {
    path = extractPathFromUrl(req.url)
  } else if (req.url && typeof req.url === 'object') {
    if (req.url.raw) {
      path = extractPathFromUrl(req.url.raw)
    } else if (Array.isArray(req.url.path)) {
      path = '/' + req.url.path.join('/')
    }
  }

  if (!path) return null

  // 解析 query 参数
  const parameters: any[] = []
  if (req.url && typeof req.url === 'object' && 'query' in req.url) {
    const queryArr = (req.url as any).query
    if (Array.isArray(queryArr)) {
      for (const q of queryArr) {
        parameters.push({
          name: q.key,
          in: 'query',
          required: false,
          schema: { type: 'string' },
          description: q.description,
        })
      }
    }
  }

  // 解析 headers
  if (Array.isArray(req.header)) {
    for (const h of req.header) {
      parameters.push({
        name: h.key,
        in: 'header',
        required: false,
        schema: { type: 'string' },
        description: undefined,
      })
    }
  }

  // 解析 body
  let requestBody: any = undefined
  if (req.body?.mode === 'raw' && req.body.raw) {
    try {
      const parsed = JSON.parse(req.body.raw)
      requestBody = {
        required: true,
        schema: parsed,
        description: undefined,
      }
    } catch {
      requestBody = {
        required: true,
        schema: { type: 'string', example: req.body.raw },
        description: 'Raw body (not valid JSON)',
      }
    }
  }

  return {
    path,
    method: method as any,
    summary: item.name || `${method} ${path}`,
    description: req.description,
    tags,
    deprecated: false,
    parameters,
    request_body: requestBody,
    responses: {},
  }
}

function extractPathFromUrl(url: string): string {
  try {
    if (url.startsWith('http')) {
      const u = new URL(url)
      return u.pathname
    }
    // 相对路径 /api/foo
    const qIdx = url.indexOf('?')
    const hIdx = url.indexOf('#')
    let end = url.length
    if (qIdx !== -1) end = Math.min(end, qIdx)
    if (hIdx !== -1) end = Math.min(end, hIdx)
    return url.slice(0, end)
  } catch {
    return ''
  }
}

export { shouldExcludeByDefault } from './openapi-parser'