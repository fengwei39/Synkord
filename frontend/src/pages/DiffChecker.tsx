import { useState } from 'react';
import { Typography, Card, Form, Input, Button, Table, Tag, Alert, message } from 'antd';
import { DiffOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

const { Title } = Typography;
const { TextArea } = Input;

export default function DiffChecker() {
  const [form] = Form.useForm();
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleDetect = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const resp = await apiClient.post('/diff/detect', values);
      setResult(resp.data.result || resp.data);
    } catch (e: any) {
      message.error(e.response?.data?.detail || '检测失败');
    } finally {
      setLoading(false);
    }
  };

  const changeTypeLabels: Record<string, string> = {
    field_removed: '字段删除',
    type_changed: '类型变更',
    enum_changed: '枚举变更',
    required_added: '新增必填',
    nested_changed: '嵌套变更',
    parse_error: '解析错误',
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>变更检测</Title>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="service_name" label="服务名称" rules={[{ required: true }]}>
            <Input placeholder="例如: user-service" />
          </Form.Item>
          <Form.Item name="project_id" label="项目 ID" rules={[{ required: true }]}>
            <Input placeholder="项目唯一标识" />
          </Form.Item>
          <Form.Item name="old_version" label="旧版本号">
            <Input placeholder="例如: 1.0.0" />
          </Form.Item>
          <Form.Item name="new_version" label="新版本号">
            <Input placeholder="例如: 2.0.0" />
          </Form.Item>
          <Form.Item name="old_spec" label="旧 JSON Schema" rules={[{ required: true }]}>
            <TextArea rows={6} placeholder='{"type": "object", "properties": {...}}' />
          </Form.Item>
          <Form.Item name="new_spec" label="新 JSON Schema" rules={[{ required: true }]}>
            <TextArea rows={6} placeholder='{"type": "object", "properties": {...}}' />
          </Form.Item>
          <Button type="primary" icon={<DiffOutlined />} onClick={handleDetect} loading={loading}>
            检测变更
          </Button>
        </Form>
      </Card>

      {result && (
        <Card title="检测结果">
          {result.is_breaking ? (
            <Alert type="error" message="检测到破坏性变更" style={{ marginBottom: 16 }} />
          ) : (
            <Alert type="success" message="未检测到破坏性变更" style={{ marginBottom: 16 }} />
          )}

          {result.affected_projects?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <strong>受影响项目：</strong>
              {result.affected_projects.map((p: string) => (
                <Tag key={p} style={{ marginLeft: 8 }}>{p}</Tag>
              ))}
            </div>
          )}

          <Table
            dataSource={result.changes || []}
            rowKey={(_record: any, index?: number) => String(index ?? 0)}
            columns={[
              { title: '变更类型', dataIndex: 'change_type', render: (t: string) => <Tag color="red">{changeTypeLabels[t] || t}</Tag> },
              { title: '实体', dataIndex: 'entity_name' },
              { title: '路径', dataIndex: 'path', render: (v: string) => <code>{v}</code> },
              { title: '旧值', dataIndex: 'old_value' },
              { title: '新值', dataIndex: 'new_value' },
              { title: '级别', dataIndex: 'severity', render: (v: string) => <Tag color={v === 'breaking' ? 'red' : 'orange'}>{v}</Tag> },
            ]}
            pagination={false}
            size="small"
          />
        </Card>
      )}
    </div>
  );
}
