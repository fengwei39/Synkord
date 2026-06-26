import { useEffect, useMemo, useState } from 'react';
import type { Key } from 'react';
import { App as AntApp, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined, SearchOutlined } from '@ant-design/icons';
import {
  createTeamMember,
  deleteTeamMember,
  deleteTeamMembers,
  listTeamMembers,
  updateTeamMember,
} from '../api/teams';
import { useTeam } from '../contexts/TeamContext';
import type { TeamMember, TeamRole } from '../types/team';

const { Text } = Typography;

const roleLabels: Record<TeamRole, string> = { team_admin: '管理员', editor: '编辑者', viewer: '只读者' };
const roleColors: Record<TeamRole, string> = { team_admin: 'red', editor: 'blue', viewer: 'default' };

export default function Members() {
  const { currentTeam, currentTeamId } = useTeam();
  const { message } = AntApp.useApp();
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<Key[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [filters, setFilters] = useState<{ keyword?: string; role?: TeamRole; status?: string }>({});
  const [filterForm] = Form.useForm();
  const [memberForm] = Form.useForm();

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      setMembers(await listTeamMembers(currentTeamId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [currentTeamId]);

  const filteredMembers = useMemo(() => {
    return members.filter((member) => {
      const keyword = filters.keyword?.trim().toLowerCase();
      const keywordMatched = !keyword ||
        member.username.toLowerCase().includes(keyword) ||
        (member.email || '').toLowerCase().includes(keyword);
      const roleMatched = !filters.role || member.role === filters.role;
      const statusMatched = !filters.status || member.status === filters.status;
      return keywordMatched && roleMatched && statusMatched;
    });
  }, [filters, members]);

  const openCreate = () => {
    setEditing(null);
    memberForm.resetFields();
    memberForm.setFieldsValue({ status: true, role: 'viewer' });
    setModalOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    setEditing(member);
    memberForm.setFieldsValue({
      username: member.username,
      email: member.email,
      role: member.role,
      status: member.status === 'active',
      remark: member.remark,
    });
    setModalOpen(true);
  };

  const saveMember = async () => {
    if (!currentTeamId) return;
    const values = await memberForm.validateFields();
    const payload = {
      username: values.username,
      email: values.email,
      role: values.role,
      status: values.status ? 'active' as const : 'disabled' as const,
      remark: values.remark,
    };
    try {
      if (editing) {
        await updateTeamMember(currentTeamId, editing.id, payload);
        message.success('成员已更新');
      } else {
        await createTeamMember(currentTeamId, { ...payload, password: values.password });
        message.success('成员已新增');
      }
      setModalOpen(false);
      setEditing(null);
      memberForm.resetFields();
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '操作失败');
    }
  };

  const removeMembers = async (ids: Key[]) => {
    if (!currentTeamId) return;
    try {
      const memberIDs = ids.map(String);
      if (memberIDs.length === 1) {
        await deleteTeamMember(currentTeamId, memberIDs[0]);
      } else {
        await deleteTeamMembers(currentTeamId, memberIDs);
      }
      setSelectedRowKeys([]);
      message.success('删除成功');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '删除失败');
    }
  };

  const toggleStatus = async (member: TeamMember) => {
    if (!currentTeamId) return;
    try {
      await updateTeamMember(currentTeamId, member.id, {
        username: member.username,
        email: member.email,
        role: member.role,
        status: member.status === 'active' ? 'disabled' : 'active',
        remark: member.remark,
      });
      message.success(member.status === 'active' ? '成员已禁用' : '成员已启用');
      await load();
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '操作失败');
    }
  };

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>团队成员与权限</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">管理当前团队成员、角色权限和访问状态。</Text>
      </header>

      <div className="filter-panel">
        <Form form={filterForm} layout="inline" onFinish={setFilters}>
          <Form.Item name="keyword">
            <Input prefix={<SearchOutlined />} placeholder="用户名 / 邮箱" style={{ width: 220 }} />
          </Form.Item>
          <Form.Item name="role">
            <Select allowClear placeholder="角色" style={{ width: 140 }} options={[
              { value: 'team_admin', label: '管理员' },
              { value: 'editor', label: '编辑者' },
              { value: 'viewer', label: '只读者' },
            ]} />
          </Form.Item>
          <Form.Item name="status">
            <Select allowClear placeholder="状态" style={{ width: 140 }} options={[
              { value: 'active', label: '启用' },
              { value: 'disabled', label: '禁用' },
            ]} />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button type="primary" htmlType="submit">查询</Button>
              <Button onClick={() => { filterForm.resetFields(); setFilters({}); }}>重置</Button>
            </Space>
          </Form.Item>
        </Form>
        <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>新增成员</Button>
      </div>

      {selectedRowKeys.length > 0 && (
        <div className="batch-bar">
          <span>已选择 {selectedRowKeys.length} 项</span>
          <Popconfirm title="确定批量删除选中成员？" onConfirm={() => removeMembers(selectedRowKeys)}>
            <Button danger icon={<DeleteOutlined />}>批量删除</Button>
          </Popconfirm>
          <Button type="text" onClick={() => setSelectedRowKeys([])}>清空选择</Button>
        </div>
      )}

      <Table
        loading={loading}
        rowKey="id"
        dataSource={filteredMembers}
        rowSelection={{ selectedRowKeys, onChange: setSelectedRowKeys }}
        pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 人` }}
        columns={[
          { title: '用户名', dataIndex: 'username' },
          { title: '邮箱', dataIndex: 'email', render: (value) => value || '-' },
          { title: '角色', dataIndex: 'role', render: (role: TeamRole) => <Tag color={roleColors[role]}>{roleLabels[role]}</Tag> },
          { title: '状态', dataIndex: 'status', render: (status) => status === 'active' ? <Tag color="green">启用</Tag> : <Tag color="red">禁用</Tag> },
          { title: '加入时间', dataIndex: 'joined_at', render: (value) => formatDate(value) },
          { title: '最近活跃', dataIndex: 'last_active_at', render: (value) => value ? formatDateTime(value) : '-' },
          {
            title: '操作',
            width: 220,
            render: (_, record: TeamMember) => (
              <Space>
                <Button size="small" icon={<EditOutlined />} onClick={() => openEdit(record)}>编辑</Button>
                <Popconfirm title={`确定${record.status === 'active' ? '禁用' : '启用'}该成员？`} onConfirm={() => toggleStatus(record)}>
                  <Button size="small">{record.status === 'active' ? '禁用' : '启用'}</Button>
                </Popconfirm>
                <Popconfirm title="确定删除该成员？" onConfirm={() => removeMembers([record.id])}>
                  <Button size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />

      <Modal
        title={editing ? '编辑成员' : '新增成员'}
        open={modalOpen}
        onOk={saveMember}
        onCancel={() => { setModalOpen(false); setEditing(null); memberForm.resetFields(); }}
      >
        <Form form={memberForm} layout="vertical">
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }, { min: 2, message: '至少 2 个字符' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="邮箱" rules={[{ type: 'email', message: '邮箱格式不正确' }]}>
            <Input />
          </Form.Item>
          {!editing && (
            <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }, { min: 8, message: '至少 8 位' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item name="role" label="角色" rules={[{ required: true, message: '请选择角色' }]}>
            <Select options={[
              { value: 'team_admin', label: '管理员' },
              { value: 'editor', label: '编辑者' },
              { value: 'viewer', label: '只读者' },
            ]} />
          </Form.Item>
          <Form.Item name="status" label="状态" valuePropName="checked">
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item name="remark" label="备注" rules={[{ max: 200, message: '最多 200 字' }]}>
            <Input.TextArea rows={3} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function formatDate(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString();
}

function formatDateTime(value?: string) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}
