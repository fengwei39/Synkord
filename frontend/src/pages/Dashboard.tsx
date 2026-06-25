import { useState, useEffect } from 'react';
import { Row, Col, Card, Statistic, Typography } from 'antd';
import {
  ProjectOutlined,
  ApartmentOutlined,
  NodeIndexOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import apiClient from '../api/client';

const { Title } = Typography;

export default function Dashboard() {
  const [stats, setStats] = useState({ projects: 0, entities: 0, dependencies: 0, breakingChanges: 0 });

  useEffect(() => {
    async function load() {
      try {
        const [projResp, entResp, depResp] = await Promise.all([
          apiClient.get('/projects?limit=1'),
          apiClient.get('/entities?limit=1'),
          apiClient.get('/dependencies/graph'),
        ]);
        setStats({
          projects: projResp.data.total || 0,
          entities: entResp.data.total || 0,
          dependencies: depResp.data.edges?.length || 0,
          breakingChanges: 0,
        });
      } catch {}
    }
    load();
  }, []);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 24 }}>概览</Title>
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="项目数" value={stats.projects} prefix={<ProjectOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="实体数" value={stats.entities} prefix={<ApartmentOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="依赖关系" value={stats.dependencies} prefix={<NodeIndexOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card>
            <Statistic title="破坏性变更" value={stats.breakingChanges} prefix={<WarningOutlined />} valueStyle={{ color: stats.breakingChanges > 0 ? '#cf1322' : undefined }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
