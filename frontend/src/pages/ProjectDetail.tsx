import { useCallback, useEffect, useState } from 'react';
import { Button, Card, Descriptions, Empty, Space, Spin, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  DatabaseOutlined,
  KeyOutlined,
  LeftOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getProject } from '../api/projects';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const typeLabels: Record<string, string> = { backend: '后端服务', web: 'Web 前端', app: 'App 移动端' };

export default function ProjectDetail() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const [project, setProject] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const loadProject = useCallback(async () => {
    if (!currentTeamId || !projectId) return;
    setLoading(true);
    try {
      setProject(await getProject(currentTeamId, projectId));
    } finally {
      setLoading(false);
    }
  }, [currentTeamId, projectId]);

  useEffect(() => {
    loadProject();
  }, [loadProject]);

  if (loading) {
    return <div className="route-loading"><Spin /></div>;
  }

  if (!project) {
    return <Empty description="项目不存在" />;
  }

  return (
    <div className="project-page">
      <header className="page-header">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/projects')}>返回项目</Button>
        <div className="page-title-row">
          <h1>{project.name}</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">{project.description || '暂无项目描述'}</Text>
      </header>

      <Card style={{ marginBottom: 16 }} title="项目信息">
        <Descriptions column={2} size="small">
          <Descriptions.Item label="项目类型">
            <Tag color="blue">{typeLabels[project.project_type] || project.project_type}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="负责人">{project.owner || '-'}</Descriptions.Item>
          <Descriptions.Item label="仓库地址">
            {project.repo_url ? <a href={project.repo_url} target="_blank" rel="noreferrer">{project.repo_url}</a> : '-'}
          </Descriptions.Item>
          <Descriptions.Item label="OpenAPI 版本">{project.openapi_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="Swagger 地址">{project.swagger_url || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{project.created_at ? new Date(project.created_at).toLocaleString() : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{project.updated_at ? new Date(project.updated_at).toLocaleString() : '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="项目资产入口">
        <Space wrap>
          <Button icon={<ApiOutlined />} onClick={() => navigate(`/projects/${project.id}/apis`)}>接口管理</Button>
          <Button icon={<DatabaseOutlined />} onClick={() => navigate(`/projects/${project.id}/models`)}>数据模型</Button>
          <Button icon={<ApartmentOutlined />} onClick={() => navigate(`/projects/${project.id}/dependencies`)}>依赖拓扑</Button>
          <Button icon={<KeyOutlined />} onClick={() => navigate(`/projects/${project.id}/mcp`)}>MCP 管理</Button>
        </Space>
      </Card>
    </div>
  );
}
