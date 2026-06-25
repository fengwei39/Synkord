import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Space, Tag, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

const { Title } = Typography;

const typeColors: Record<string, string> = { backend: 'blue', web: 'green', app: 'orange' };
const typeLabels: Record<string, string> = { backend: '后端', web: 'Web', app: 'App' };

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

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'project_type', key: 'type',
      render: (t: string) => <Tag color={typeColors[t]}>{typeLabels[t] || t}</Tag>,
    },
    { title: '描述', dataIndex: 'description', key: 'desc', ellipsis: true },
    {
      title: '操作', key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<EditOutlined />} onClick={() => {
            setEditing(record);
            form.setFieldsValue(record);
            setModalOpen(true);
          }}>编辑</Button>
          <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
            <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>项目管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditing(null);
          form.resetFields();
          setModalOpen(true);
        }}>新建项目</Button>
      </div>

      <Table columns={columns} dataSource={projects} rowKey="id" loading={loading} />

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
          <Form.Item name="openapi_spec" label="OpenAPI 规范 (JSON/YAML)">
            <Input.TextArea rows={6} placeholder="粘贴 OpenAPI 规范内容..." />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
