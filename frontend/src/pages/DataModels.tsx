import { useEffect, useState } from 'react';
import { App as AntApp, Button, Form, Input, Modal, Popconfirm, Space, Table, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, HistoryOutlined, PlusOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { createModel, deleteModel, listModels, listModelVersions, updateModel } from '../api/models';
import { getProject } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

export default function DataModels() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [project, setProject] = useState<any>(null);
  const [entities, setEntities] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [versionModal, setVersionModal] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [form] = Form.useForm();

  const load = async () => {
    if (!currentTeamId || !projectId) return;
    setLoading(true);
    try {
      const [projectResp, modelResp] = await Promise.all([
        getProject(currentTeamId, projectId),
        listModels(currentTeamId, projectId),
      ]);
      setProject(projectResp);
      setEntities(modelResp);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentTeamId, projectId]);

  const handleSave = async () => {
    if (!currentTeamId || !projectId) return;
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateModel(currentTeamId, projectId, editing.id, values);
        message.success('更新成功');
      } else {
        await createModel(currentTeamId, projectId, values);
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
    if (!currentTeamId || !projectId) return;
    await deleteModel(currentTeamId, projectId, id);
    message.success('删除成功');
    load();
  };

  const showVersions = async (entityId: string) => {
    if (!currentTeamId || !projectId) return;
    try {
      const items = await listModelVersions(currentTeamId, projectId, entityId);
      setVersions(items);
      setVersionModal(true);
    } catch {
      message.error('获取版本历史失败');
    }
  };

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>数据模型</h1>
          <span className="owner-badge">{project?.name || currentTeam?.name || '当前项目'}</span>
        </div>
        <Text type="secondary">维护当前项目的数据模型。</Text>
      </header>

      <div className="filter-panel">
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => {
            setEditing(null);
            form.resetFields();
            setModalOpen(true);
          }}
        >
          新建模型
        </Button>
      </div>

      <Table
        rowKey="id"
        loading={loading}
        dataSource={entities}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            render: (value: string, record: any) => (
              <Button type="link" className="table-link" onClick={() => navigate(`/projects/${projectId}/models/${record.id}`)}>{value}</Button>
            ),
          },
          { title: '版本', dataIndex: 'current_version', width: 100 },
          { title: '描述', dataIndex: 'description', ellipsis: true },
          {
            title: '操作',
            width: 240,
            render: (_: any, record: any) => (
              <Space>
                <Button type="link" icon={<HistoryOutlined />} onClick={() => showVersions(record.id)}>版本</Button>
                <Button
                  type="link"
                  icon={<EditOutlined />}
                  onClick={() => {
                    setEditing(record);
                    form.setFieldsValue(record);
                    setModalOpen(true);
                  }}
                >
                  编辑
                </Button>
                <Popconfirm title="确定删除？" onConfirm={() => handleDelete(record.id)}>
                  <Button type="link" danger icon={<DeleteOutlined />}>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
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
            { title: '说明', dataIndex: 'change_summary' },
            { title: '时间', dataIndex: 'created_at', render: (value: string) => new Date(value).toLocaleString() },
          ]}
          pagination={false}
          size="small"
        />
      </Modal>
    </div>
  );
}
