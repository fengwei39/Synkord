import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Empty, Space, Spin, Tag, Typography } from 'antd';
import { DownloadOutlined, LeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getAPI } from '../api/apis';
import apiClient from '../api/client';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

function formatJSON(value?: string) {
  if (!value) return '-';
  try {
    return JSON.stringify(JSON.parse(value), null, 2);
  } catch {
    return value;
  }
}

export default function APIDetail() {
  const navigate = useNavigate();
  const { projectId, apiId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const [api, setApi] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!currentTeamId || !projectId || !apiId) return;
      setLoading(true);
      try {
        setApi(await getAPI(currentTeamId, projectId, apiId));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentTeamId, projectId, apiId]);

  const handleExport = async () => {
    if (!currentTeamId || !projectId || !apiId) return;
    try {
      const resp = await apiClient.get(
        `/teams/${currentTeamId}/projects/${projectId}/apis/${apiId}/export`,
        { responseType: 'blob' },
      );
      const url = URL.createObjectURL(new Blob([resp.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(api?.path || 'openapi').replace(/[^A-Za-z0-9._-]+/g, '-')}-openapi.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // 静默失败
    }
  };

  if (loading) return <div className="route-loading"><Spin /></div>;
  if (!api) return <Empty description="接口不存在" />;

  return (
    <div className="project-page">
      <header className="page-header">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate(`/projects/${projectId}/apis`)}>返回接口</Button>
        <div className="page-title-row">
          <h1>接口详情</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Space>
          <Text type="secondary"><Tag color="blue">{api.method}</Tag><code>{api.path}</code></Text>
          <Button icon={<DownloadOutlined />} onClick={handleExport}>导出项目 OpenAPI</Button>
        </Space>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="标签">{api.tag || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本">{api.version || '-'}</Descriptions.Item>
          <Descriptions.Item label="摘要">{api.summary || '-'}</Descriptions.Item>
          <Descriptions.Item label="状态">{api.deprecated ? <Tag color="orange">Deprecated</Tag> : <Tag color="green">Active</Tag>}</Descriptions.Item>
          <Descriptions.Item label="描述" span={2}>{api.description || '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="请求参数" style={{ marginBottom: 16 }}>
        <pre className="json-preview">{formatJSON(api.parameters_json)}</pre>
      </Card>
      <Card title="请求体" style={{ marginBottom: 16 }}>
        <pre className="json-preview">{formatJSON(api.request_body_json)}</pre>
      </Card>
      <Card title="响应" style={{ marginBottom: 16 }}>
        <pre className="json-preview">{formatJSON(api.responses_json)}</pre>
      </Card>
      <Card title="安全配置">
        <pre className="json-preview">{formatJSON(api.security_json)}</pre>
      </Card>
    </div>
  );
}
