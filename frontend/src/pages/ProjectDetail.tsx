import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { App as AntApp, Button, Card, Descriptions, Empty, Form, Input, Modal, Select, Space, Spin, Tag, Typography } from 'antd';
import { EditOutlined } from '@ant-design/icons';
import { useParams } from 'react-router-dom';
import { getProject, updateProject } from '../api/projects';
import type { ProjectPayload } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

type EditableProjectField = 'name' | 'description' | 'project_type' | 'owner' | 'repo_url' | 'swagger_url';

const projectTypeOptions = [
  { value: 'backend', label: '后端服务' },
  { value: 'web', label: 'Web 前端' },
  { value: 'app', label: 'App 移动端' },
];

const typeLabels: Record<string, string> = projectTypeOptions.reduce((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {} as Record<string, string>);

const fieldLabels: Record<EditableProjectField, string> = {
  name: '项目名称',
  description: '项目描述',
  project_type: '项目类型',
  owner: '负责人',
  repo_url: '仓库地址',
  swagger_url: 'Swagger / OpenAPI 地址',
};

export default function ProjectDetail() {
  const { projectId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<EditableProjectField | null>(null);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const loadProject = useCallback(async () => {
    if (!currentTeamId || !projectId) return;
    setLoading(true);
    try {
      setProject(await getProject(currentTeamId, projectId));
    } finally {
      setLoading(false);
    }
  }, [currentTeamId, projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  const buildProjectPayload = (patch: Partial<ProjectPayload>): ProjectPayload => ({
    name: project.name,
    description: project.description || '',
    project_type: project.project_type,
    owner: project.owner || '',
    repo_url: project.repo_url || '',
    swagger_url: project.swagger_url || '',
    ...patch,
  });

  const openFieldEditor = (field: EditableProjectField) => {
    form.setFieldsValue({ [field]: project?.[field] ?? undefined });
    setEditingField(field);
  };

  const closeFieldEditor = () => {
    setEditingField(null);
    form.resetFields();
  };

  const submitFieldEdit = async () => {
    if (!editingField || !currentTeamId || !projectId || !project) return;
    const values = await form.validateFields();
    const patch = { [editingField]: values[editingField] } as Partial<ProjectPayload>;
    setSaving(true);
    try {
      const updated = await updateProject(currentTeamId, projectId, buildProjectPayload(patch));
      setProject(updated || { ...project, ...patch });
      closeFieldEditor();
      message.success('更新成功');
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '更新失败');
    } finally {
      setSaving(false);
    }
  };

  const renderEditButton = (field: EditableProjectField) => (
    <Button
      className="field-edit-button"
      type="text"
      size="small"
      icon={<EditOutlined />}
      aria-label={`编辑${fieldLabels[field]}`}
      onClick={() => openFieldEditor(field)}
    />
  );

  const renderEditableValue = (field: EditableProjectField, content: ReactNode) => (
    <div className="project-editable-value">
      <span className="project-field-content">{content}</span>
      {renderEditButton(field)}
    </div>
  );

  const renderFieldEditor = () => {
    if (!editingField) return null;

    if (editingField === 'description') {
      return (
        <Form.Item name="description" label={fieldLabels.description}>
          <Input.TextArea rows={3} placeholder="请输入项目描述" />
        </Form.Item>
      );
    }

    if (editingField === 'project_type') {
      return (
        <Form.Item name="project_type" label={fieldLabels.project_type} rules={[{ required: true, message: '请选择项目类型' }]}>
          <Select options={projectTypeOptions} />
        </Form.Item>
      );
    }

    if (editingField === 'repo_url') {
      return (
        <Form.Item name="repo_url" label={fieldLabels.repo_url} rules={[{ type: 'url', message: '请输入有效的 HTTP/HTTPS 地址' }]}>
          <Input placeholder="https://github.com/example/repo" />
        </Form.Item>
      );
    }

    if (editingField === 'swagger_url') {
      return (
        <Form.Item
          name="swagger_url"
          label={fieldLabels.swagger_url}
          tooltip="例如 http://127.0.0.1:8080/v3/api-docs 或 http://127.0.0.1:8000/openapi.json"
          rules={[{ type: 'url', message: '请输入有效的 HTTP/HTTPS 地址' }]}
        >
          <Input placeholder="http://127.0.0.1:8080/v3/api-docs" />
        </Form.Item>
      );
    }

    return (
      <Form.Item
        name={editingField}
        label={fieldLabels[editingField]}
        rules={editingField === 'name' ? [{ required: true, message: '请输入项目名称' }] : undefined}
      >
        <Input placeholder={`请输入${fieldLabels[editingField]}`} />
      </Form.Item>
    );
  };

  if (loading) {
    return <div className="route-loading"><Spin /></div>;
  }

  if (!project) {
    return <Empty description="项目不存在" />;
  }

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row project-title-row">
          <h1>{project.name}</h1>
          {renderEditButton('name')}
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <div className="project-header-description">
          <Text type="secondary">{project.description || '暂无项目描述'}</Text>
          {renderEditButton('description')}
        </div>
      </header>

      <Card className="project-info-card" style={{ marginBottom: 16 }} title="项目信息">
        <Descriptions className="project-info-descriptions" column={1} size="middle" colon={false}>
          <Descriptions.Item label="项目名称">
            {renderEditableValue('name', project.name || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="项目类型">
            {renderEditableValue('project_type', <Tag color="blue">{typeLabels[project.project_type] || project.project_type}</Tag>)}
          </Descriptions.Item>
          <Descriptions.Item label="负责人">
            {renderEditableValue('owner', project.owner || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="仓库地址">
            {renderEditableValue('repo_url', project.repo_url ? <a href={project.repo_url} target="_blank" rel="noreferrer">{project.repo_url}</a> : '-')}
          </Descriptions.Item>
          <Descriptions.Item label="OpenAPI 版本">{project.openapi_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="Swagger 地址">
            {renderEditableValue('swagger_url', project.swagger_url || '-')}
          </Descriptions.Item>
          <Descriptions.Item label="创建时间">{project.created_at ? new Date(project.created_at).toLocaleString() : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}</Descriptions.Item>
          <Descriptions.Item label="项目描述">
            {renderEditableValue('description', project.description || '-')}
          </Descriptions.Item>
        </Descriptions>
      </Card>

      <Modal
        title={editingField ? `编辑${fieldLabels[editingField]}` : ''}
        open={!!editingField}
        onOk={submitFieldEdit}
        onCancel={closeFieldEditor}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical">
          {renderFieldEditor()}
        </Form>
      </Modal>
    </div>
  );
}
