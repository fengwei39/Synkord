/**
 * Minimal MCP-compatible JSON-RPC server for Synkord.
 * Implements the MCP protocol (JSON-RPC 2.0) over HTTP POST /mcp.
 * Compatible with Cursor's mcpServers config:
 *   { "synkord": { "url": "http://localhost:3742/mcp" } }
 */

import http from 'http'
import type { IncomingMessage, ServerResponse } from 'http'

const MCP_PORT = 3742

let authToken = ''
let baseURL = 'http://localhost:8080'
let mcpServer: http.Server | null = null

// ─── Helpers ─────────────────────────────────────────────────────────────────

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c: Buffer) => chunks.push(c))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

async function apiFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${baseURL}${path}`, {
    headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
  })
  if (!res.ok) throw new Error(`API ${path} → ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'list_packs',
    description:
      '列出指定组织下所有契约包的名称、版本和类型。契约包可以是任意文本（Markdown、YAML、JSON、TypeScript 接口、Go 结构体、SQL 等）。',
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: '组织 ID' },
      },
      required: ['org_id'],
    },
  },
  {
    name: 'get_pack',
    description:
      '获取某契约包的完整原始内容。内容可以是任意文本格式（md/yaml/json/ts/go/sql…），请根据 contentType 字段判断格式后使用。',
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string', description: '组织 ID' },
        pack_name: { type: 'string', description: '契约包名称' },
      },
      required: ['org_id', 'pack_name'],
    },
  },
  {
    name: 'search_pack',
    description: '在指定契约包的原始内容中全文搜索关键字，返回匹配的行及行号。',
    inputSchema: {
      type: 'object',
      properties: {
        org_id: { type: 'string' },
        pack_name: { type: 'string', description: '契约包名称' },
        query: { type: 'string', description: '搜索关键词（大小写不敏感）' },
      },
      required: ['org_id', 'pack_name', 'query'],
    },
  },
]

// ─── Tool handlers ────────────────────────────────────────────────────────────

interface PackListItem { name: string; version: string; contentType: string }
interface PackDetail { name: string; version: string; contentType: string; content: string }

async function callTool(name: string, args: Record<string, string>): Promise<string> {
  switch (name) {
    case 'list_packs': {
      const packs = await apiFetch<PackListItem[]>(`/api/orgs/${args.org_id}/packs`)
      const summary = packs.map((p) => `- ${p.name}  v${p.version}  [${p.contentType}]`).join('\n')
      return `组织 ${args.org_id} 共 ${packs.length} 个契约包：\n\n${summary}`
    }
    case 'get_pack': {
      const detail = await apiFetch<PackDetail>(`/api/orgs/${args.org_id}/packs/${args.pack_name}`)
      return [
        `# ${detail.name}  v${detail.version}  (${detail.contentType})`,
        '',
        detail.content,
      ].join('\n')
    }
    case 'search_pack': {
      const detail = await apiFetch<PackDetail>(`/api/orgs/${args.org_id}/packs/${args.pack_name}`)
      const q = args.query.toLowerCase()
      const lines = detail.content.split('\n')
      const hits = lines
        .map((line, i) => ({ num: i + 1, line }))
        .filter(({ line }) => line.toLowerCase().includes(q))
        .slice(0, 30)

      if (hits.length === 0) return `在 ${args.pack_name} 中未找到 "${args.query}"`
      return hits.map(({ num, line }) => `L${num}: ${line}`).join('\n')
    }
    default:
      throw new Error(`未知工具: ${name}`)
  }
}

// ─── HTTP handler ─────────────────────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Content-Type', 'application/json')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  if (req.method !== 'POST') {
    res.writeHead(405)
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  let rpc: { jsonrpc: string; id: unknown; method: string; params?: Record<string, unknown> }
  try {
    rpc = JSON.parse(await readBody(req))
  } catch {
    res.writeHead(400)
    res.end(JSON.stringify({ error: 'Invalid JSON' }))
    return
  }

  const respond = (result: unknown) => {
    res.writeHead(200)
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, result }))
  }

  const respondError = (code: number, message: string) => {
    res.writeHead(200)
    res.end(JSON.stringify({ jsonrpc: '2.0', id: rpc.id, error: { code, message } }))
  }

  try {
    switch (rpc.method) {
      case 'initialize':
        respond({
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'synkord', version: '1.0.0' },
        })
        break

      case 'notifications/initialized':
        respond({})
        break

      case 'tools/list':
        respond({ tools: TOOLS })
        break

      case 'tools/call': {
        const { name, arguments: toolArgs } = rpc.params as { name: string; arguments: Record<string, string> }
        const text = await callTool(name, toolArgs ?? {})
        respond({ content: [{ type: 'text', text }] })
        break
      }

      default:
        respondError(-32601, `Method not found: ${rpc.method}`)
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    respondError(-32000, msg)
  }
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export function startMCPServer(apiBaseURL: string): void {
  baseURL = apiBaseURL
  mcpServer = http.createServer((req, res) => {
    handleRequest(req, res).catch((err) => {
      res.writeHead(500)
      res.end(JSON.stringify({ error: String(err) }))
    })
  })
  mcpServer.listen(MCP_PORT, '127.0.0.1', () => {
    console.log(`[mcp] listening on http://127.0.0.1:${MCP_PORT}/mcp`)
  })
}

export function setMCPToken(token: string): void {
  authToken = token
}

export function stopMCPServer(): void {
  mcpServer?.close()
  mcpServer = null
}
