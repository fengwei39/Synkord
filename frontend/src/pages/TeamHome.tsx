import { useEffect, useState } from 'react';
import { Card, Col, Empty, Row, Space, Statistic, Tag, Typography } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  ProjectOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { getTeamSummary, type TeamSummary } from '../api/teams';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const modules = [
  { title: '项目管理', desc: '后端服务、Web、App 项目和仓库元数据', path: '/projects', icon: <ProjectOutlined /> },
  { title: '接口管理', desc: 'Swagger/OpenAPI 与 Postman Collection', path: '/apis', icon: <ApiOutlined /> },
  { title: '数据模型', desc: 'DTO、VO、枚举、分页模型、统一返回体', path: '/models', icon: <ApartmentOutlined /> },
  { title: 'MCP 管理', desc: '团队 Token、工具范围、IDE 配置和调用审计', path: '/mcp', icon: <SafetyCertificateOutlined /> },
];

export default function TeamHome() {
  const navigate = useNavigate();
  const { currentTeam, currentTeamId } = useTeam();
  const [summary, setSummary] = useState<TeamSummary | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentTeamId) return;
    setLoading(true);
    getTeamSummary(currentTeamId)
      .then(setSummary)
      .finally(() => setLoading(false));
  }, [currentTeamId]);

  return (
    <div className="team-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>{currentTeam?.name || '当前团队'}</h1>
          <span className="owner-badge">团队资产独立</span>
        </div>
        <Text type="secondary">项目、接口、数据模型、MCP 配置和变更记录均按团队隔离。</Text>
      </header>

      <Row gutter={[16, 16]} className="metric-row">
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="项目" value={summary?.project_count || 0} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="接口" value={summary?.api_count || 0} prefix={<ApiOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="数据模型" value={summary?.model_count || 0} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card loading={loading}>
            <Statistic title="Breaking 风险" value={summary?.breaking_risk_count || 0} styles={{ content: { color: '#cf1322' } }} />
          </Card>
        </Col>
      </Row>

      <div className="module-grid">
        {modules.map((item) => (
          <button className="module-card" key={item.path} onClick={() => navigate(item.path)}>
            <span className="module-icon">{item.icon}</span>
            <span className="module-content">
              <strong>{item.title}</strong>
              <small>{item.desc}</small>
            </span>
          </button>
        ))}
      </div>

      <Row gutter={[16, 16]}>
        <Col span={14}>
          <Card title="最近变更" extra={<a onClick={() => navigate('/changesets')}>查看全部</a>}>
            {summary?.recent_changesets?.length ? (
              <Space orientation="vertical" size={12} style={{ width: '100%' }}>
                {summary.recent_changesets.map((item) => (
                  <div className="activity-row" key={item.id}>
                    <Tag color={severityColor[item.severity]}>{item.severity}</Tag>
                    <span>{item.service_name}</span>
                    <Text type="secondary">
                      {item.old_version || '-'} → {item.new_version || '-'}
                    </Text>
                  </div>
                ))}
              </Space>
            ) : (
              <Empty description="暂无变更记录" />
            )}
          </Card>
        </Col>
        <Col span={10}>
          <Card title="快捷入口">
            <Space orientation="vertical" size={10}>
              <a onClick={() => navigate('/apis')}>导入 Swagger / Postman</a>
              <a onClick={() => navigate('/mcp')}>生成 MCP Token</a>
              <a onClick={() => navigate('/dependencies')}>查看依赖拓扑</a>
              <a onClick={() => navigate('/diff')}>执行变更检测</a>
            </Space>
          </Card>
        </Col>
      </Row>
    </div>
  );
}

const severityColor = {
  info: 'green',
  warning: 'orange',
  breaking: 'red',
};
