import { useState } from 'react';
import { App as AntApp, Button, Form, Input } from 'antd';
import { PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../contexts/TeamContext';

export default function CreateTeam() {
  const [loading, setLoading] = useState(false);
  const { createTeam, teams } = useTeam();
  const navigate = useNavigate();
  const { message } = AntApp.useApp();

  const handleSubmit = async (values: { name: string; description?: string }) => {
    setLoading(true);
    try {
      await createTeam(values);
      message.success('团队已创建');
      navigate('/team', { replace: true });
    } catch (error: any) {
      message.error(error?.response?.data?.detail || '创建团队失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="workspace-home">
      <div className="team-create-panel">
        <div className="workspace-empty-icon">
          <TeamOutlined />
        </div>
        <h2>{teams.length > 0 ? '新建团队' : '创建你的第一个团队'}</h2>
        <p>团队是 Synkord 的最高业务容器，项目、接口、数据模型、MCP Token 和变更记录都会归属到当前团队。</p>
        <Form layout="vertical" onFinish={handleSubmit} className="team-create-form">
          <Form.Item
            name="name"
            label="团队名称"
            rules={[
              { required: true, message: '请输入团队名称' },
              { min: 2, message: '团队名称至少 2 个字符' },
              { max: 32, message: '团队名称最多 32 个字符' },
            ]}
          >
            <Input placeholder="例如：Synkord Core Team" />
          </Form.Item>
          <Form.Item name="description" label="团队描述" rules={[{ max: 200, message: '团队描述最多 200 字' }]}>
            <Input.TextArea rows={4} placeholder="描述这个团队维护的项目或规范范围" />
          </Form.Item>
          <Button type="primary" htmlType="submit" icon={<PlusOutlined />} loading={loading}>
            创建团队
          </Button>
        </Form>
      </div>
    </div>
  );
}
