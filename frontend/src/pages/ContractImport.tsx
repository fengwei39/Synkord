// Synkord ContractImport
// 导入 OpenAPI / Swagger / Postman
// 详见 docs/ui-spec.md §八

import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  App as AntApp,
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  Radio,
  Skeleton,
  Space,
  Steps,
  Tag,
  Typography,
  Upload,
} from 'antd'
import {
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloudDownloadOutlined,
  FileTextOutlined,
  InboxOutlined,
  SnippetsOutlined,
} from '@ant-design/icons'
import type { UploadFile } from 'antd'
import { parseOpenAPI, shouldExcludeByDefault } from '../utils/openapi-parser'
import { parsePostman } from '../utils/postman-parser'
import type { ApiDefinition } from '../api/apis'
import type { EntityDefinition } from '../api/entities'
import { parseSchemaFields } from '../utils/jsonSchema'

const { Title, Paragraph, Text } = Typography

type ImportSource = 'file' | 'url' | 'paste'
type ImportFormat = 'openapi' | 'postman'
type Step = 'select' | 'input' | 'parsing' | 'preview' | 'done'

interface ParseResult {
  apis: Array<Omit<ApiDefinition, 'id' | 'contract_id' | 'created_at' | 'updated_at'>>
  entities: Array<Pick<EntityDefinition, 'name' | 'description' | 'schema_content'>>
  warnings: string[]
}

// describeEntityFieldCount 计算预览中实体字段数量（前端解析）
function describeEntityFieldCount(entity: { schema_content?: string }): string {
  if (!entity.schema_content) return '? 字段'
  const n = parseSchemaFields(entity.schema_content).length
  return `${n} 字段`
}

const methodColor = (m: string): string => {
  const map: Record<string, string> = {
    GET: 'blue',
    POST: 'green',
    PUT: 'orange',
    DELETE: 'red',
    PATCH: 'purple',
  }
  return map[m] || 'default'
}

export default function ContractImport() {
  const { id: contractId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { message } = AntApp.useApp()

  const [step, setStep] = useState<Step>('select')
  const [source, setSource] = useState<ImportSource>('file')
  const [format, setFormat] = useState<ImportFormat>('openapi')
  const [content, setContent] = useState('')
  const [url, setUrl] = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [selectedApis, setSelectedApis] = useState<Set<string>>(new Set())
  const [selectedEntities, setSelectedEntities] = useState<Set<string>>(new Set())
  const [committing, setCommitting] = useState(false)

  const apiKey = (api: ApiDefinition): string =>
    `${api.method}::${api.path}`

  const handleNext = async () => {
    if (step === 'select') {
      setStep('input')
    } else if (step === 'input') {
      setStep('parsing')
      try {
        let rawContent = ''
        if (source === 'file') {
          rawContent = content
        } else if (source === 'url') {
          // 简化处理：直接 fetch URL（生产环境应由后端代理解决 CORS）
          const resp = await fetch(url)
          if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
          rawContent = await resp.text()
        } else {
          rawContent = content
        }

        const result =
          format === 'openapi'
            ? parseOpenAPI(rawContent)
            : parsePostman(rawContent)

        // 智能默认排除
        const defaultSelected = new Set<string>()
        for (const api of result.apis) {
          if (!shouldExcludeByDefault(api.path)) {
            defaultSelected.add(apiKey(api as ApiDefinition))
          }
        }
        setSelectedApis(defaultSelected)
        setSelectedEntities(new Set(result.entities.map((e) => e.name)))
        setParseResult(result)
        setStep('preview')
      } catch (e: any) {
        message.error(e.message || '解析失败')
        setStep('input')
      }
    } else if (step === 'preview') {
      if (!contractId) return
      if (!parseResult) return
      setCommitting(true)
      try {
        const apisToImport = parseResult.apis
          .filter((a) => selectedApis.has(apiKey(a as ApiDefinition)))
        const entitiesToImport = parseResult.entities
          .filter((e) => selectedEntities.has(e.name))
        const resp = await fetch(
          `${(localStorage.getItem('synkord_api_base') || '/api').replace(/\/$/, '')}/contracts/${contractId}/import/commit`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${localStorage.getItem('synkord_token') || ''}`,
            },
            body: JSON.stringify({
              apis: apisToImport,
              entities: entitiesToImport,
            }),
          },
        )
        if (!resp.ok) {
          let detail = `HTTP ${resp.status}`
          try {
            const data = await resp.json()
            detail = data?.detail || detail
          } catch {}
          throw new Error(detail)
        }
        await resp.json()
        message.success('导入完成')
        setStep('done')
      } catch (e: any) {
        message.error(e?.message || '提交导入失败')
      } finally {
        setCommitting(false)
      }
    }
  }

  const handleBack = () => {
    if (step === 'input') setStep('select')
    else if (step === 'preview') setStep('input')
    else navigate(`/contracts/${contractId}`)
  }

  const handleFileUpload = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      setContent(text)
      message.success(`文件已读取（${text.length} 字节）`)
    }
    reader.onerror = () => message.error('文件读取失败')
    reader.readAsText(file)
    return false  // 阻止 antd Upload 自动上传
  }

  const toggleApi = (key: string) => {
    const next = new Set(selectedApis)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    setSelectedApis(next)
  }

  const toggleAllApis = (select: boolean) => {
    if (!parseResult) return
    if (select) {
      setSelectedApis(new Set(parseResult.apis.map((a) => apiKey(a as ApiDefinition))))
    } else {
      setSelectedApis(new Set())
    }
  }

  const toggleEntity = (name: string) => {
    const next = new Set(selectedEntities)
    if (next.has(name)) next.delete(name)
    else next.add(name)
    setSelectedEntities(next)
  }

  return (
    <div className="page-content contract-import">
      <Space style={{ marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} type="text" onClick={handleBack}>
          返回
        </Button>
      </Space>

      <Title level={3}>导入 API 定义</Title>

      <Steps
        current={
          step === 'select' ? 0
          : step === 'input' ? 1
          : step === 'parsing' ? 1
          : step === 'preview' ? 2
          : 3
        }
        items={[
          { title: '选择来源' },
          { title: '输入内容' },
          { title: '预览' },
          { title: '完成' },
        ]}
        style={{ marginBottom: 24 }}
      />

      {/* Step 1: 选择来源 */}
      {step === 'select' && (
        <Card>
          <Form layout="vertical" style={{ maxWidth: 600 }}>
            <Form.Item label="选择来源">
              <Radio.Group
                value={source}
                onChange={(e) => setSource(e.target.value)}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
                <Radio value="file">
                  <Space>
                    <FileTextOutlined />
                    上传 OpenAPI / Swagger 文件
                    <Text type="secondary" style={{ fontSize: 12 }}>支持 JSON / YAML</Text>
                  </Space>
                </Radio>
                <Radio value="url">
                  <Space>
                    <CloudDownloadOutlined />
                    从 URL 拉取
                    <Text type="secondary" style={{ fontSize: 12 }}>例如 https://api.xxx.com/swagger</Text>
                  </Space>
                </Radio>
                <Radio value="paste">
                  <Space>
                    <SnippetsOutlined />
                    粘贴内容
                    <Text type="secondary" style={{ fontSize: 12 }}>直接粘贴 JSON / YAML</Text>
                  </Space>
                </Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item label="格式">
              <Radio.Group value={format} onChange={(e) => setFormat(e.target.value)}>
                <Radio value="openapi">OpenAPI 3.0 / Swagger 2.0</Radio>
                <Radio value="postman">Postman Collection v2.1</Radio>
              </Radio.Group>
            </Form.Item>

            <Form.Item>
              <Button type="primary" onClick={handleNext}>
                下一步
              </Button>
            </Form.Item>
          </Form>
        </Card>
      )}

      {/* Step 2: 输入内容 */}
      {step === 'input' && (
        <Card>
          {source === 'file' && (
            <div>
              <Upload.Dragger
                accept=".json,.yaml,.yml"
                beforeUpload={handleFileUpload}
                showUploadList={false}
                style={{ marginBottom: 16 }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined />
                </p>
                <p className="ant-upload-text">点击或拖拽文件到此区域</p>
                <p className="ant-upload-hint">支持 OpenAPI / Swagger JSON/YAML 文件</p>
              </Upload.Dragger>
              {content && (
                <Alert
                  type="success"
                  message={`已读取 ${content.length} 字节`}
                  showIcon
                />
              )}
            </div>
          )}

          {source === 'url' && (
            <Form layout="vertical">
              <Form.Item label="URL">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://api.example.com/swagger.json"
                  size="large"
                />
              </Form.Item>
              <Text type="secondary">
                注意：跨域 URL 可能需要后端代理。生产环境建议在 Synkord 配置中提供代理地址。
              </Text>
            </Form>
          )}

          {source === 'paste' && (
            <Input.TextArea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="粘贴 OpenAPI / Swagger JSON / YAML 内容..."
              autoSize={{ minRows: 12, maxRows: 24 }}
              style={{ fontFamily: 'monospace', fontSize: 12 }}
            />
          )}

          <Space style={{ marginTop: 24 }}>
            <Button onClick={handleBack}>上一步</Button>
            <Button
              type="primary"
              onClick={handleNext}
              disabled={
                (source === 'file' || source === 'paste') ? !content : !url
              }
            >
              下一步
            </Button>
          </Space>
        </Card>
      )}

      {/* Step 3: Parsing */}
      {step === 'parsing' && (
        <Card>
          <Skeleton active paragraph={{ rows: 6 }} />
        </Card>
      )}

      {/* Step 4: Preview */}
      {step === 'preview' && parseResult && (
        <>
          <Alert
            type="success"
            showIcon
            message={
              <span>
                解析成功：发现{' '}
                <Text strong>{parseResult.apis.length}</Text> 个 API，{' '}
                <Text strong>{parseResult.entities.length}</Text> 个数据模型
              </span>
            }
            style={{ marginBottom: 16 }}
          />

          {parseResult.warnings.length > 0 && (
            <Alert
              type="warning"
              showIcon
              message={`解析警告（${parseResult.warnings.length} 条）`}
              description={
                <ul style={{ marginBottom: 0, paddingLeft: 20 }}>
                  {parseResult.warnings.slice(0, 5).map((w, i) => (
                    <li key={i}>{w}</li>
                  ))}
                  {parseResult.warnings.length > 5 && (
                    <li>... 还有 {parseResult.warnings.length - 5} 条</li>
                  )}
                </ul>
              }
              style={{ marginBottom: 16 }}
            />
          )}

          <Card
            title={
              <Space>
                <Text>API 列表</Text>
                <Tag>共 {parseResult.apis.length} 个，已选 {selectedApis.size} 个</Tag>
              </Space>
            }
            extra={
              <Space>
                <Button size="small" onClick={() => toggleAllApis(true)}>全选</Button>
                <Button size="small" onClick={() => toggleAllApis(false)}>全不选</Button>
              </Space>
            }
            style={{ marginBottom: 16 }}
          >
            <Space orientation="vertical" size="small" style={{ width: '100%' }}>
              {parseResult.apis.map((api) => {
                const k = apiKey(api as ApiDefinition)
                const isExcludedDefault = shouldExcludeByDefault(api.path)
                return (
                  <div key={k} className="api-import-row">
                    <Checkbox
                      checked={selectedApis.has(k)}
                      onChange={() => toggleApi(k)}
                    >
                      <Space>
                        <Tag color={methodColor(api.method)} style={{ width: 60, textAlign: 'center' }}>
                          {api.method}
                        </Tag>
                        <Text code style={{ minWidth: 200 }}>{api.path}</Text>
                        <Text type="secondary" style={{ fontSize: 12 }}>{api.summary}</Text>
                        {isExcludedDefault && (
                          <Tag color="default" style={{ fontSize: 10 }}>默认排除</Tag>
                        )}
                      </Space>
                    </Checkbox>
                  </div>
                )
              })}
            </Space>
          </Card>

          {parseResult.entities.length > 0 && (
            <Card
              title={
                <Space>
                  <Text>数据模型</Text>
                  <Tag>共 {parseResult.entities.length} 个，已选 {selectedEntities.size} 个</Tag>
                </Space>
              }
              style={{ marginBottom: 16 }}
            >
              <Space wrap>
                {parseResult.entities.map((entity) => (
                  <Checkbox
                    key={entity.name}
                    checked={selectedEntities.has(entity.name)}
                    onChange={() => toggleEntity(entity.name)}
                  >
                    <Space>
                      <Text strong>{entity.name}</Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        ({describeEntityFieldCount(entity)})
                      </Text>
                    </Space>
                  </Checkbox>
                ))}
              </Space>
            </Card>
          )}

          <Card>
            <Space>
              <Button onClick={handleBack}>上一步</Button>
              <Button
                type="primary"
                loading={committing}
                onClick={handleNext}
                disabled={selectedApis.size === 0 && selectedEntities.size === 0}
              >
                导入选中的 {selectedApis.size + selectedEntities.size} 项
              </Button>
            </Space>
          </Card>
        </>
      )}

      {/* Step 5: Done */}
      {step === 'done' && (
        <Card>
          <Space orientation="vertical" size="large" style={{ textAlign: 'center', width: '100%', padding: 32 }}>
            <CheckCircleOutlined style={{ fontSize: 64, color: '#52c41a' }} />
            <Title level={4} style={{ margin: 0 }}>导入完成</Title>
            <Paragraph>
              共导入 <Text strong>{selectedApis.size}</Text> 个 API 和{' '}
              <Text strong>{selectedEntities.size}</Text> 个数据模型
            </Paragraph>
            <Space>
              <Button onClick={() => navigate(`/contracts/${contractId}`)}>
                返回契约集
              </Button>
              <Button type="primary" onClick={() => navigate('/mcp')}>
                启动 MCP
              </Button>
            </Space>
          </Space>
        </Card>
      )}
    </div>
  )
}