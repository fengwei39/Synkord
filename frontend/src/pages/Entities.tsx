import { useState, useEffect } from 'react';
import { App as AntApp, Table, Button, Modal, Form, Input, Select, Switch, Space, Tag, Typography, Popconfirm } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, HistoryOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { createModel, deleteModel, listModels, listModelVersions, updateModel } from '../api/models';
import { listProjects } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

export default function Entities() {
  const navigate = useNavigate();
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [entities, setEntities] = useState<any[]>([]);
  const [scopes, setScopes] = useState<'all' | 'team' | 'project'>('all');
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [versionModal, setVersionModal] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const items = await listModels(currentTeamId);
      setEntities(items);
    } finally {
      setLoading(false);
    }
  };

  const loadProjects = async () => {
    if (!currentTeamId) return;
    const items = await listProjects(currentTeamId);
    setProjects(items);
  };

  useEffect(() => {
    load();
    loadProjects();
  }, [currentTeamId]);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateModel(currentTeamId!, editing.id, values);
        message.success('更新成功');
      } else {
        await createModel(currentTeamId!, values);
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
    await deleteModel(currentTeamId!, id);
    message.success('删除成功');
    load();
  };

  const showVersions = async (entityId: string) => {
    try {
      const items = await listModelVersions(currentTeamId!, entityId);
      setVersions(items);
      setVersionModal(true);
    } catch {
      message.error('获取版本历史失败');
    }
  };

  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      render: (v: string, record: any) => (
        <Button type="link" className="table-link" onClick={() => navigate(`/models/${record.id}`)}>{v}</Button>
      ),
    },
    {
      title: '类型', dataIndex: 'is_global', key: 'type',
      render: (g: boolean) => <Tag color={g ? 'purple' : 'blue'}>{g ? '团队模型' : '项目模型'}</Tag>,
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
            form.setFieldsValue({ ...record, is_team_model: record.is_global });
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
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>数据模型</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">维护当前团队的团队模型和项目私有模型。</Text>
      </header>
      <div className="filter-panel">
        <Space>
          <span>范围：</span>
          <Select
            value={scopes}
            style={{ width: 140 }}
            onChange={setScopes}
            options={[
              { value: 'all', label: '全部模型' },
              { value: 'team', label: '团队模型' },
              { value: 'project', label: '项目模型' },
            ]}
          />
        </Space>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => {
          setEditing(null);
          form.resetFields();
          setModalOpen(true);
        }}>新建模型</Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={entities.filter((entity) => {
          if (scopes === 'team') return !!entity.is_global;
          if (scopes === 'project') return !entity.is_global;
          return true;
        })}
        columns={columns}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 个模型` }}
      />

      <Modal
        title={editing ? '编辑模型' : '新建模型'}
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
          <Form.Item name="is_team_model" label="团队模型" valuePropName="checked" initialValue={true}>
            <Switch />
          </Form.Item>
          <Form.Item name="project_id" label="所属项目">
            <Select
              allowClear
              placeholder="团队模型可不选择项目"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
            />
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
