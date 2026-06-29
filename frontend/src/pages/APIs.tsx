import { useEffect, useState } from 'react';
import { App as AntApp, Button, Card, Form, Input, Radio, Select, Space, Table, Tag, Typography } from 'antd';
import { CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { importAPISpec, listAPIs } from '../api/apis';
import { listProjects } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { TextArea } = Input;

export default function APIs() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [apis, setApis] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const importFormat = Form.useWatch('format', form) || 'openapi';

  const loadProjects = async () => {
    if (!currentTeamId) return;
    const items = await listProjects(currentTeamId);
    setProjects(items.filter((item: any) => item.project_type === 'backend'));
  };

  const loadAPIs = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const values = filterForm.getFieldsValue();
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (values.project_id) params.set('project_id', values.project_id);
      if (values.q) params.set('q', values.q);
      const items = await listAPIs(currentTeamId, params);
      setApis(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProjects();
    const projectID = searchParams.get('project_id');
    if (projectID) {
      filterForm.setFieldValue('project_id', projectID);
    }
    loadAPIs();
  }, [currentTeamId]);

  const handleImport = async () => {
    const values = await form.validateFields();
    try {
      const result = await importAPISpec(currentTeamId!, values);
      message.success(`导入完成：${result.api_count} 个 API，${result.dependency_count} 条依赖`);
      form.resetFields(['spec']);
      filterForm.setFieldValue('project_id', values.project_id);
      loadAPIs();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '导入失败');
    }
  };

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>接口管理</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Typography.Text type="secondary">导入和查询当前团队后端项目的 Swagger / OpenAPI 或 Postman 接口规范。</Typography.Text>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" initialValues={{ format: 'openapi' }}>
          <Form.Item name="format" label="导入格式">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'openapi', label: 'Swagger / OpenAPI' },
                { value: 'postman', label: 'Postman Collection' },
              ]}
            />
          </Form.Item>
          <Form.Item name="project_id" label="后端项目" rules={[{ required: true }]}>
            <Select
              placeholder="选择后端项目"
              options={projects.map((p) => ({ value: p.id, label: p.name }))}
            />
          </Form.Item>
          <Form.Item
            name="spec"
            label={importFormat === 'postman' ? 'Postman Collection JSON' : 'OpenAPI 3.x JSON/YAML'}
            rules={[{ required: true }]}
          >
            <TextArea
              rows={8}
              placeholder={importFormat === 'postman' ? '粘贴 Postman Collection v2.1 JSON...' : '粘贴 OpenAPI 3.x 文档...'}
            />
          </Form.Item>
          <Button type="primary" icon={<CloudUploadOutlined />} onClick={handleImport}>
            导入规范
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
            {
              title: '路径',
              dataIndex: 'path',
              render: (v: string, record: any) => (
                <Button type="link" className="table-link" onClick={() => navigate(`/apis/${record.id}`)}>
                  <code>{v}</code>
                </Button>
              ),
            },
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
