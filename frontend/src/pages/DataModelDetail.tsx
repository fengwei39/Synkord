import { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Empty, Spin, Table, Tag, Typography } from 'antd';
import { LeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getModel, listModelVersions } from '../api/models';
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

export default function DataModelDetail() {
  const navigate = useNavigate();
  const { modelId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const [model, setModel] = useState<any>(null);
  const [versions, setVersions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!currentTeamId || !modelId) return;
      setLoading(true);
      try {
        const [modelDetail, versionItems] = await Promise.all([
          getModel(currentTeamId, modelId),
          listModelVersions(currentTeamId, modelId),
        ]);
        setModel(modelDetail);
        setVersions(versionItems);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentTeamId, modelId]);

  if (loading) return <div className="route-loading"><Spin /></div>;
  if (!model) return <Empty description="数据模型不存在" />;

  return (
    <div className="project-page">
      <header className="page-header">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/models')}>返回模型</Button>
        <div className="page-title-row">
          <h1>{model.name}</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">{model.description || '暂无模型描述'}</Text>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="范围">
            <Tag color={model.is_global ? 'purple' : 'blue'}>{model.is_global ? '团队模型' : '项目模型'}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="当前版本">{model.current_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="版本数">{model.version_count || versions.length || 0}</Descriptions.Item>
          <Descriptions.Item label="所属项目">{model.project?.name || model.project_id || '-'}</Descriptions.Item>
          <Descriptions.Item label="创建时间">{model.created_at ? new Date(model.created_at).toLocaleString() : '-'}</Descriptions.Item>
          <Descriptions.Item label="更新时间">{model.updated_at ? new Date(model.updated_at).toLocaleString() : '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="Schema 定义" style={{ marginBottom: 16 }}>
        <pre className="json-preview">{formatJSON(model.schema_content)}</pre>
      </Card>

      <Card title="版本历史">
        <Table
          rowKey="id"
          dataSource={versions}
          columns={[
            { title: '版本', dataIndex: 'version_number', width: 120 },
            { title: '变更说明', dataIndex: 'change_summary', render: (v: string) => v || '-' },
            { title: '时间', dataIndex: 'created_at', width: 220, render: (v: string) => new Date(v).toLocaleString() },
          ]}
          pagination={false}
          size="small"
        />
      </Card>
    </div>
  );
}
