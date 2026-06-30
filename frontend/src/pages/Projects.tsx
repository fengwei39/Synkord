import { useState, useEffect, useMemo } from 'react';
import { App as AntApp, Alert, Button, Empty, Modal, Form, Input, Select, Space, Table, Typography, Popconfirm, Skeleton } from 'antd';
import {
  AppstoreOutlined,
  BarsOutlined,
  DeleteOutlined,
  EditOutlined,
  ImportOutlined,
  PlusOutlined,
  ProjectOutlined,
  ReloadOutlined,
  SearchOutlined,
  SortAscendingOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { createProject, deleteProject, listProjects, updateProject } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const typeLabels: Record<string, string> = { backend: 'HTTP', web: 'WEB', app: 'APP' };

export default function Projects() {
  const navigate = useNavigate();
  const { currentTeam, currentTeamId } = useTeam();
  const { message, modal } = AntApp.useApp();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [keyword, setKeyword] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | undefined>();
  const [form] = Form.useForm();

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const items = await listProjects(currentTeamId);
      setProjects(items);
    } catch (e: any) {
      setError(e?.response?.data?.detail || e?.message || '加载项目列表失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [currentTeamId]);

  const filtered = useMemo(() => {
    return projects.filter((p) => {
      if (typeFilter && p.project_type !== typeFilter) return false;
      if (keyword) {
        const k = keyword.toLowerCase();
        if (!(p.name?.toLowerCase().includes(k) || p.description?.toLowerCase().includes(k))) {
          return false;
        }
      }
      return true;
    });
  }, [projects, keyword, typeFilter]);

  const handleSave = async () => {
    const values = await form.validateFields();
    try {
      if (editing) {
        await updateProject(currentTeamId!, editing.id, values);
        message.success('更新成功');
        setModalOpen(false);
        setEditing(null);
        form.resetFields();
        load();
      } else {
        const created = await createProject(currentTeamId!, values);
        message.success('创建成功');
        setModalOpen(false);
        form.resetFields();
        // 创建成功后跳到新项目详情
        navigate(`/projects/${created.id}`);
      }
    } catch (e: any) {
      message.error(e?.response?.data?.detail || '操作失败');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    modal.confirm({
      title: '确定删除项目？',
      content: `项目 "${name}" 及其接口、模型、依赖、MCP 配置都将被删除，且不可恢复。`,
      okText: '删除',
      okType: 'danger',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteProject(currentTeamId!, id);
          message.success('已删除');
          load();
        } catch (e: any) {
          message.error(e?.response?.data?.detail || '删除失败');
        }
      },
    });
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
          <Input
            prefix={<SearchOutlined />}
            placeholder="搜索项目名或描述"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            allowClear
            style={{ width: 240 }}
          />
          <Select
            placeholder="类型筛选"
            value={typeFilter}
            onChange={(v) => setTypeFilter(v)}
            allowClear
            style={{ width: 140 }}
            options={[
              { value: 'backend', label: '后端服务' },
              { value: 'web', label: 'Web 前端' },
              { value: 'app', label: 'App 移动端' },
            ]}
          />
          <div className="segmented-icon">
            <button className={view === 'grid' ? 'active' : ''} aria-label="网格视图" onClick={() => setView('grid')}><AppstoreOutlined /></button>
            <button className={view === 'list' ? 'active' : ''} aria-label="列表视图" onClick={() => setView('list')}><BarsOutlined /></button>
          </div>
        </div>
        <div className="toolbar-right">
          <Button icon={<ReloadOutlined />} onClick={load}>刷新</Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button>
        </div>
      </div>

      {error && (
        <Alert
          type="error"
          showIcon
          message="加载失败"
          description={error}
          action={<Button onClick={load}>重试</Button>}
          style={{ marginBottom: 16 }}
        />
      )}

      {loading && projects.length === 0 ? (
        <Skeleton active paragraph={{ rows: 4 }} />
      ) : projects.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={`${currentTeam?.name || '当前团队'} 暂无项目，点击下方按钮创建第一个项目`}
        >
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新建项目</Button>
        </Empty>
      ) : filtered.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="未找到匹配项目"
        >
          <Button onClick={() => { setKeyword(''); setTypeFilter(undefined); }}>清空筛选</Button>
        </Empty>
      ) : view === 'grid' ? (
        <div className="project-grid">
          {filtered.map((project) => (
            <article
              className="project-card clickable-card"
              key={project.id}
              onClick={() => navigate(`/projects/${project.id}`)}
            >
              <div className="project-icon"><ProjectOutlined /></div>
              <button
                className="detail-link project-name"
                onClick={(event) => {
                  event.stopPropagation();
                  navigate(`/projects/${project.id}`);
                }}
              >
                {project.name}
              </button>
              <div className="project-desc">{project.description || '暂无描述'}</div>
              <div className="project-card-footer">
                <Space style={{ width: '100%', justifyContent: 'space-between' }}>
                  <span className="type-pill">{typeLabels[project.project_type] || project.project_type}</span>
                  <Space size={4}>
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        openEdit(project);
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleDelete(project.id, project.name);
                      }}
                    />
                  </Space>
                </Space>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <Table
          rowKey="id"
          loading={loading}
          dataSource={filtered}
          columns={[
            {
              title: '名称',
              dataIndex: 'name',
              render: (v, record) => (
                <Button
                  type="link"
                  className="table-link"
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/projects/${record.id}`);
                  }}
                >
                  {v}
                </Button>
              ),
            },
            { title: '类型', dataIndex: 'project_type', width: 100, render: (v) => <span className="type-pill">{typeLabels[v] || v}</span> },
            { title: '描述', dataIndex: 'description', ellipsis: true },
            { title: '负责人', dataIndex: 'owner', width: 120, render: (v) => v || '-' },
            {
              title: '仓库',
              dataIndex: 'repo_url',
              ellipsis: true,
              render: (v) => v || '-',
            },
            {
              title: '操作',
              width: 140,
              render: (_, record) => (
                <Space>
                  <Button
                    size="small"
                    icon={<EditOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      openEdit(record);
                    }}
                  >
                    编辑
                  </Button>
                  <Button
                    size="small"
                    danger
                    icon={<DeleteOutlined />}
                    onClick={(event) => {
                      event.stopPropagation();
                      handleDelete(record.id, record.name);
                    }}
                  >
                    删除
                  </Button>
                </Space>
              ),
            },
          ]}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 个项目` }}
          onRow={(record) => ({
            onClick: () => navigate(`/projects/${record.id}`),
            style: { cursor: 'pointer' },
          })}
        />
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
          <Form.Item
            noStyle
            shouldUpdate={(prev, next) => prev.project_type !== next.project_type}
          >
            {({ getFieldValue }) => getFieldValue('project_type') === 'backend' ? (
              <Form.Item
                name="swagger_url"
                label="Swagger / OpenAPI 地址"
                tooltip="例如 http://127.0.0.1:8080/v3/api-docs 或 http://127.0.0.1:8000/openapi.json"
                rules={[{ type: 'url', message: '请输入有效的 HTTP/HTTPS 地址' }]}
              >
                <Input placeholder="http://127.0.0.1:8080/v3/api-docs" />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Text type="secondary">后端项目配置 Swagger 地址后，可在接口管理中一键拉取并导入。</Text>
        </Form>
      </Modal>
    </div>
  );
}
