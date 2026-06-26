import { useState, useEffect } from 'react';
import { Button, Empty, Modal, Form, Input, Select, Space, Typography, message, Popconfirm } from 'antd';
import {
  AppstoreOutlined,
  BarsOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  ProjectOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { createProject, deleteProject, listProjects, updateProject } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const typeLabels: Record<string, string> = { backend: 'HTTP', web: 'WEB', app: 'APP' };

export default function Projects() {
  const { currentTeam, currentTeamId } = useTeam();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const items = await listProjects(currentTeamId);
      setProjects(items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentTeamId]);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateProject(currentTeamId!, editing.id, values);
        message.success('更新成功');
      } else {
        await createProject(currentTeamId!, values);
        message.success('创建成功');
      }
      setModalOpen(false);
      setEditing(null);
      form.resetFields();
      load();
    } catch (e: any) {
      message.error(e.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async (id: string) => {
    await deleteProject(currentTeamId!, id);
    message.success('删除成功');
    load();
  };

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (project: any) => {
    setEditing(project);
    form.setFieldsValue(project);
    setModalOpen(true);
  };

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>项目管理</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">维护当前团队下的后端服务、Web、App 项目和仓库元数据。</Text>
      </header>

      <div className="content-toolbar">
        <div className="toolbar-left">
          <div className="segmented-icon">
            <button className="active" aria-label="网格视图"><AppstoreOutlined /></button>
            <button aria-label="列表视图"><BarsOutlined /></button>
          </div>
          <Button type="text" icon={<SortAscendingOutlined />} />
        </div>
        <div className="toolbar-right">
          <Button icon={<ImportOutlined />}>导入 Swagger / Postman</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button>
        </div>
      </div>

      {projects.length === 0 && !loading ? (
        <Empty description="暂无项目">
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button>
        </Empty>
      ) : (
        <div className="project-grid">
          {projects.map((project) => (
            <article className="project-card" key={project.id}>
              <div className="project-icon"><ProjectOutlined /></div>
              <div className="project-name">{project.name}</div>
              <div className="project-desc">{project.description || '暂无描述'}</div>
              <div className="project-card-footer">
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span className="type-pill">{typeLabels[project.project_type] || project.project_type}</span>
                  <Space size={4}>
                    <Button type="text" size="small" icon={<EditOutlined />} onClick={() => openEdit(project)} />
                    <Popconfirm title="确定删除？" onConfirm={() => handleDelete(project.id)}>
                      <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                    </Popconfirm>
                  </Space>
                </Space>
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        title={editing ? '编辑项目' : '新建项目'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="project_type" label="类型" rules={[{ required: true }]}>
            <Select options={[
              { value: 'backend', label: '后端服务' },
              { value: 'web', label: 'Web 前端' },
              { value: 'app', label: 'App 移动端' },
            ]} />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input.TextArea rows={3} />
          </Form.Item>
          <Form.Item name="owner" label="负责人">
            <Input />
          </Form.Item>
          <Form.Item name="repo_url" label="仓库地址">
            <Input />
          </Form.Item>
          <Text type="secondary">Swagger/OpenAPI 与 Postman Collection 建议在团队资产页签中导入。</Text>
        </Form>
      </Modal>
    </div>
  );
}
