import { useState, useEffect } from 'react';
import { Table, Button, Modal, Form, Input, Select, Switch, Space, Tag, Typography, message, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import apiClient from '../api/client';

const { Title } = Typography;

export default function Entities() {
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [versionModal, setVersionModal] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get('/entities?limit=200');
      setEntities(resp.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await apiClient.put('/entities/' + editing.id, values);
        message.success('更新成功');
      } else {
        await apiClient.post('/entities', values);
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
    await apiClient.delete('/entities/' + id);
    message.success('删除成功');
    load();
  };

  const showVersions = async (entityId: string) => {
    try {
      const resp = await apiClient.get('/entities/' + entityId + '/versions');
      setVersions(resp.data || []);
      setVersionModal(true);
    } catch {
      message.error('获取版本历史失败');
    }
  };

  const columns = [
    { title: '名称', dataIndex: 'name', key: 'name' },
    {
      title: '类型', dataIndex: 'is_global', key: 'type',
      render: (g: boolean) => <Tag color={g ? 'purple' : 'blue'}>{g ? '全局' : '服务'}</Tag>,
    },
    { title: '版本', dataIndex: 'current_version', key: 'version', width: 100 },
    { title: '描述', dataIndex: 'description', key: 'desc', ellipsis: true },
    {
      title: '操作', key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button type="link" icon={<HistoryOutlined />} onClick={() => showVersions(record.id)}>版本</Button>
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
        <Title level={4} style={{ margin: 0 }}>实体管理</Title>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditing(null);
          form.resetFields();
          setModalOpen(true);
        }}>新建实体</Button>
      </div>

      <Table columns={columns} dataSource={entities} rowKey="id" loading={loading} />

      <Modal
        title={editing ? '编辑实体' : '新建实体'}
        open={modalOpen}
        onOk={handleSave}
        onCancel={() => { setModalOpen(false); setEditing(null); form.resetFields(); }}
        width={700}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="描述">
            <Input />
          </Form.Item>
          <Form.Item name="is_global" label="全局实体" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="project_id" label="所属项目">
            <Input placeholder="项目 ID（全局实体可不填）" />
          </Form.Item>
          <Form.Item name="schema_content" label="JSON Schema 定义" rules={[{ required: true }]}>
            <Input.TextArea rows={10} placeholder='{"type": "object", "properties": {...}}' />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="版本历史"
        open={versionModal}
        onCancel={() => setVersionModal(false)}
        footer={null}
        width={700}
      >
        <Table
          dataSource={versions}
          rowKey="id"
          columns={[
            { title: '版本', dataIndex: 'version_number', width: 100 },
            { title: '变更说明', dataIndex: 'change_summary' },
            { title: '时间', dataIndex: 'created_at', render: (t: string) => new Date(t).toLocaleString() },
          ]}
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
}
