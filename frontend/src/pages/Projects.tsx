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
import apiClient from '../api/client';

const { Text } = Typography;

const typeLabels: Record<string, string> = { backend: 'HTTP', web: 'WEB', app: 'APP' };

export default function Projects() {
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get('/projects?limit=200');
      setProjects(resp.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await apiClient.put('/projects/' + editing.id, values);
        message.success('更新成功');
      } else {
        await apiClient.post('/projects', values);
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
    await apiClient.delete('/projects/' + id);
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
          <h1>默认工作空间</h1>
          <span className="owner-badge">自托管实例</span>
        </div>
        <div className="page-tabs">
          <button className="page-tab active">项目</button>
          <button className="page-tab">API 规范</button>
          <button className="page-tab">实体模型</button>
          <button className="page-tab">依赖关系</button>
          <button className="page-tab">变更记录</button>
          <button className="page-tab">访问控制</button>
        </div>
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
          <Button icon={<ImportOutlined />}>导入 OpenAPI</Button>
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
          <Text type="secondary">OpenAPI 文档建议在 API 管理中导入。</Text>
        </Form>
      </Modal>
    </div>
  );
}
