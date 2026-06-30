import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { App as AntApp, Button, Form, Input, Skeleton, Space } from 'antd';
import { ArrowLeftOutlined, SaveOutlined } from '@ant-design/icons';
import { getTeam, updateTeam } from '../api/teams';
import { useTeam } from '../contexts/TeamContext';
import type { Team } from '../types/team';

export default function TeamInfo() {
  const { teamId } = useParams<{ teamId: string }>();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();
  const { currentTeamId, refreshTeams } = useTeam();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [team, setTeam] = useState<Team | null>(null);
  const [form] = Form.useForm<{ name: string; description?: string }>();

  // URL 中的 teamId 必须与 currentTeamId 一致（防止用户粘贴其他团队的 URL）
  useEffect(() => {
    if (teamId && currentTeamId && teamId !== currentTeamId) {
      // 跨团队跳转：跳回当前团队
      navigate(`/teams/${currentTeamId}`, { replace: true });
    }
  }, [teamId, currentTeamId, navigate]);

  useEffect(() => {
    if (!teamId) return;
    setLoading(true);
    getTeam(teamId)
      .then((data) => {
        setTeam(data);
        form.setFieldsValue({ name: data.name, description: data.description });
      })
      .catch((err) => {
        message.error('加载团队信息失败：' + (err?.response?.data?.detail || err.message));
      })
      .finally(() => setLoading(false));
  }, [teamId, form, message]);

  const handleSave = async () => {
    if (!teamId) return;
    const values = await form.validateFields();
    setSaving(true);
    try {
      const updated = await updateTeam(teamId, values);
      setTeam(updated);
      await refreshTeams();
      message.success('团队信息已更新');
    } catch (err: any) {
      message.error('保存失败：' + (err?.response?.data?.detail || err.message));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton active paragraph={{ rows: 4 }} />;
  }

  if (!team) {
    return (
      <div className="empty-state">
        <p>团队不存在或您没有访问权限</p>
        <Button onClick={() => navigate('/projects')}>返回项目列表</Button>
      </div>
    );
  }

  return (
    <div className="page-team-info">
      <div className="page-header">
        <Button type="text" icon={<ArrowLeftOutlined />} onClick={() => navigate('/projects')}>
          返回项目列表
        </Button>
        <h2>团队信息</h2>
      </div>

      <div style={{ maxWidth: 600, marginTop: 16 }}>
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="团队名称"
            rules={[
              { required: true, message: '请输入团队名称' },
              { min: 2, max: 64, message: '团队名称长度为 2-64 字符' },
            ]}
          >
            <Input placeholder="例如：核心业务组" />
          </Form.Item>
          <Form.Item name="description" label="团队描述" rules={[{ max: 512 }]}>
            <Input.TextArea rows={4} placeholder="团队用途、目标等" />
          </Form.Item>
          <Form.Item label="所有者">
            <Input value={team.owner?.username || team.owner_id} disabled />
          </Form.Item>
          <Form.Item label="创建时间">
            <Input value={new Date(team.created_at).toLocaleString()} disabled />
          </Form.Item>
          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<SaveOutlined />}
                onClick={handleSave}
                loading={saving}
              >
                保存
              </Button>
              <Button onClick={() => navigate('/projects')}>取消</Button>
            </Space>
          </Form.Item>
        </Form>
      </div>
    </div>
  );
}
