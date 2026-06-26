import { Button, List, Tag } from 'antd';
import { ProjectOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useTeam } from '../contexts/TeamContext';

export default function WorkspaceHome() {
  const navigate = useNavigate();
  const { teams, currentTeam, switchTeam, loading } = useTeam();

  if (teams.length > 0) {
    return (
      <div className="workspace-home dashboard-surface">
        <div className="page-heading">
          <div>
            <h1>我的团队</h1>
            <p>选择一个团队进入团队空间，或创建新的团队。</p>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/teams/new')}>
            新建团队
          </Button>
        </div>
        <List
          loading={loading}
          className="team-list-panel"
          dataSource={teams}
          renderItem={(team) => (
            <List.Item
              actions={[
                <Button
                  key="enter"
                  type={currentTeam?.id === team.id ? 'primary' : 'default'}
                onClick={() => {
                  switchTeam(team.id);
                  navigate('/team');
                }}
              >
                  进入团队空间
                </Button>,
              ]}
            >
              <List.Item.Meta
                avatar={<div className="team-list-avatar"><TeamOutlined /></div>}
                title={<span>{team.name} {currentTeam?.id === team.id && <Tag color="blue">当前团队</Tag>}</span>}
                description={team.description || '暂无描述'}
              />
            </List.Item>
          )}
        />
      </div>
    );
  }

  return (
    <div className="workspace-home">
      <div className="workspace-empty">
        <div className="workspace-empty-icon">
          <ProjectOutlined />
        </div>
        <h2>还没有团队</h2>
        <p>团队是项目、接口、数据模型、MCP Token 和变更记录的业务边界。先创建团队，再开始维护规范资产。</p>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/teams/new')}>
          创建团队
        </Button>
      </div>
    </div>
  );
}
