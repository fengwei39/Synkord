import { Button, Tag } from 'antd';
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
        <div className={loading ? 'team-list-panel loading' : 'team-list-panel'}>
          {teams.map((team) => (
            <div className="team-list-row" key={team.id}>
              <div className="team-list-meta">
                <div className="team-list-avatar"><TeamOutlined /></div>
                <div>
                  <div className="team-list-name">
                    {team.name} {currentTeam?.id === team.id && <Tag color="blue">当前团队</Tag>}
                  </div>
                  <div className="team-list-description">{team.description || '暂无描述'}</div>
                </div>
              </div>
              <Button
                type={currentTeam?.id === team.id ? 'primary' : 'default'}
                onClick={() => {
                  switchTeam(team.id);
                  navigate('/projects');
                }}
              >
                进入团队空间
              </Button>
            </div>
          ))}
        </div>
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
        <p>团队只负责项目管理和团队管理。进入具体项目后，再维护接口、数据模型、依赖拓扑和 MCP。</p>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/teams/new')}>
          创建团队
        </Button>
      </div>
    </div>
  );
}
