import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Descriptions, Empty, Spin, Table, Tag, Typography } from 'antd';
import { LeftOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { getChangeSet } from '../api/changesets';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const severityColors: Record<string, string> = {
  info: 'green',
  warning: 'orange',
  breaking: 'red',
};

function parseArray(value?: string) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ChangeSetDetail() {
  const navigate = useNavigate();
  const { changeSetId } = useParams();
  const { currentTeam, currentTeamId } = useTeam();
  const [changeSet, setChangeSet] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      if (!currentTeamId || !changeSetId) return;
      setLoading(true);
      try {
        setChangeSet(await getChangeSet(currentTeamId, changeSetId));
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentTeamId, changeSetId]);

  const changes = useMemo(() => parseArray(changeSet?.changes_json), [changeSet]);
  const affected = useMemo(() => parseArray(changeSet?.affected_json), [changeSet]);

  if (loading) return <div className="route-loading"><Spin /></div>;
  if (!changeSet) return <Empty description="变更记录不存在" />;

  return (
    <div className="project-page">
      <header className="page-header">
        <Button type="text" icon={<LeftOutlined />} onClick={() => navigate('/changesets')}>返回变更记录</Button>
        <div className="page-title-row">
          <h1>{changeSet.service_name}</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">从 {changeSet.old_version || '-'} 到 {changeSet.new_version || '-'}</Text>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <Descriptions column={2} size="small">
          <Descriptions.Item label="级别">
            <Tag color={severityColors[changeSet.severity] || 'default'}>{changeSet.severity}</Tag>
          </Descriptions.Item>
          <Descriptions.Item label="所属项目">{changeSet.project?.name || changeSet.project_id}</Descriptions.Item>
          <Descriptions.Item label="旧版本">{changeSet.old_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="新版本">{changeSet.new_version || '-'}</Descriptions.Item>
          <Descriptions.Item label="变更数">{changes.length}</Descriptions.Item>
          <Descriptions.Item label="影响项目数">{affected.length}</Descriptions.Item>
          <Descriptions.Item label="检测时间">{changeSet.created_at ? new Date(changeSet.created_at).toLocaleString() : '-'}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card title="变更明细" style={{ marginBottom: 16 }}>
        <Table
          rowKey={(_, index) => String(index)}
          dataSource={changes}
          columns={[
            { title: '实体', dataIndex: 'entity_name', width: 180 },
            { title: '类型', dataIndex: 'change_type', width: 180 },
            { title: '路径', dataIndex: 'path', render: (v: string) => <code>{v}</code> },
            { title: '级别', dataIndex: 'severity', width: 110, render: (v: string) => <Tag color={severityColors[v] || 'default'}>{v}</Tag> },
            { title: '旧值', dataIndex: 'old_value', ellipsis: true, render: (v: string) => v || '-' },
            { title: '新值', dataIndex: 'new_value', ellipsis: true, render: (v: string) => v || '-' },
          ]}
          pagination={{ pageSize: 10 }}
          size="small"
        />
      </Card>

      <Card title="影响项目">
        {affected.length > 0 ? (
          affected.map((item: string) => <Tag key={item}>{item}</Tag>)
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无影响项目" />
        )}
      </Card>
    </div>
  );
}
