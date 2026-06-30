import { useEffect, useState } from 'react';
import { Alert, App as AntApp, Button, Card, Form, Input, Radio, Space, Table, Tag, Typography } from 'antd';
import { CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { importAPISpec, importAPISpecFromProject, listAPIs } from '../api/apis';
import { getProject } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { TextArea } = Input;

export default function APIs() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [apis, setApis] = useState<any[]>([]);
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();
  const [filterForm] = Form.useForm();
  const importMode = Form.useWatch('mode', form) || 'project';

  const loadProject = async () => {
    if (!currentTeamId || !projectId) return;
    setProject(await getProject(currentTeamId, projectId));
  };

  const loadAPIs = async () => {
    if (!currentTeamId || !projectId) return;
    setLoading(true);
    try {
      const values = filterForm.getFieldsValue();
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (values.q) params.set('q', values.q);
      const items = await listAPIs(currentTeamId, projectId, params);
      setApis(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
    loadAPIs();
  }, [currentTeamId, projectId]);

  const handleImport = async () => {
      const values = await form.validateFields();
      try {
        const result = values.mode === 'project'
        ? await importAPISpecFromProject(currentTeamId!, projectId!)
        : await importAPISpec(currentTeamId!, projectId!, {
          spec: values.spec,
          format: values.mode === 'postman' ? 'postman' : 'openapi',
        });
      message.success(`导入完成：${result.api_count} 个 API，${result.dependency_count} 条依赖`);
      form.resetFields(['spec']);
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
          <span className="owner-badge">{project?.name || currentTeam?.name || '当前项目'}</span>
        </div>
        <Typography.Text type="secondary">维护当前项目的 HTTP API，可从项目配置的 Swagger 地址拉取并导入接口规范。</Typography.Text>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <Form form={form} layout="vertical" initialValues={{ mode: 'project' }}>
          <Form.Item name="mode" label="导入来源">
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={[
                { value: 'project', label: '项目 Swagger 地址' },
                { value: 'openapi', label: '手动粘贴 OpenAPI' },
                { value: 'postman', label: '手动粘贴 Postman' },
              ]}
            />
          </Form.Item>
          {importMode === 'project' ? (
            <Alert
              style={{ marginBottom: 16 }}
              type={project?.swagger_url ? 'info' : 'warning'}
              showIcon
              message={project?.swagger_url || '当前项目尚未配置 Swagger 地址，请先到项目管理中编辑该项目。'}
            />
          ) : (
            <Form.Item
              name="spec"
              label={importMode === 'postman' ? 'Postman Collection JSON' : 'OpenAPI 3.x JSON/YAML'}
              rules={[{ required: true }]}
            >
              <TextArea
                rows={8}
                placeholder={importMode === 'postman' ? '粘贴 Postman Collection v2.1 JSON...' : '粘贴 OpenAPI 3.x 文档...'}
              />
            </Form.Item>
          )}
          <Button
            type="primary"
            icon={<CloudUploadOutlined />}
            onClick={handleImport}
            disabled={importMode === 'project' && !project?.swagger_url}
          >
            {importMode === 'project' ? '从项目 Swagger 导入' : '导入规范'}
          </Button>
        </Form>
      </Card>

      <Card>
        <Form form={filterForm} layout="inline" style={{ marginBottom: 16 }}>
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
                <Button type="link" className="table-link" onClick={() => navigate(`/projects/${projectId}/apis/${record.id}`)}>
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
