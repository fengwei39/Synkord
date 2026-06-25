import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, Select, Space, Table, Tag, Typography, message } from 'antd';
import { CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

const { Title } = Typography;
const { TextArea } = Input;

export default function APIs() {
  const [apis, setApis] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();

  const loadProjects = async () => {
    const resp = await apiClient.get('/projects?limit=200&project_type=backend');
    setProjects(resp.data.items || []);
  };

  const loadAPIs = async () => {
    setLoading(true);
    try {
      const values = filterForm.getFieldsValue();
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (values.project_id) params.set('project_id', values.project_id);
      if (values.q) params.set('q', values.q);
      const resp = await apiClient.get('/apis?' + params.toString());
      setApis(resp.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    loadAPIs();
  }, []);

  const handleImport = async () => {
    const values = await form.validateFields();
    try {
      const resp = await apiClient.post('/apis/import', values);
      message.success(`导入完成：${resp.data.api_count} 个 API，${resp.data.dependency_count} 条依赖`);
      form.resetFields(['spec']);
      filterForm.setFieldValue('project_id', values.project_id);
      loadAPIs();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '导入失败');
    }
  };

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>API 管理</Title>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item name="project_id" label="后端项目" rules={[{ required: true }]}>
            <Select
              placeholder="选择后端项目"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="spec" label="OpenAPI 3.x JSON/YAML" rules={[{ required: true }]}>
            <TextArea rows={8} placeholder="粘贴 OpenAPI 3.x 文档..." />
          </Form.Item>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport}>
            导入 OpenAPI
          </Button>
        </Form>
      </Card>

      <Card>
        <Form form={filterForm} layout="inline" style={{ marginBottom: 16 }}>
          <Form.Item name="project_id">
            <Select
              allowClear
              placeholder="项目"
              style={{ width: 220 }}
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item name="q">
            <Input placeholder="路径 / 标签 / 摘要" style={{ width: 240 }} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" onClick={loadAPIs}>搜索</Button>
              <Button icon={<ReloadOutlined />} onClick={() => { filterForm.resetFields(); loadAPIs(); }} />
            </Space>
          </Form.Item>
        </Form>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={apis}
          columns={[
            { title: '方法', dataIndex: 'method', width: 96, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: '路径', dataIndex: 'path', render: (v: string) => <code>{v}</code> },
            { title: '标签', dataIndex: 'tag', width: 140 },
            { title: '摘要', dataIndex: 'summary' },
            { title: '版本', dataIndex: 'version', width: 120 },
            { title: '状态', dataIndex: 'deprecated', width: 100, render: (v: boolean) => v ? <Tag color="orange">Deprecated</Tag> : <Tag color="green">Active</Tag> },
          ]}
        />
      </Card>
    </div>
  );
}
