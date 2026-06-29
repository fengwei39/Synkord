import { useEffect, useState } from 'react';
import { Button, Card, Table, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';
import { listChangeSets } from '../api/changesets';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const severityColors: Record<string, string> = {
  info: 'green',
  warning: 'orange',
  breaking: 'red',
};

type ChangeSetRow = {
  changes_json?: string;
  affected_json?: string;
};

export default function ChangeSets() {
  const navigate = useNavigate();
  const { currentTeam, currentTeamId } = useTeam();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const items = await listChangeSets(currentTeamId);
      setItems(items.map((item: ChangeSetRow) => ({
        ...item,
        _changeCount: (() => {
          try { return JSON.parse(item.changes_json || '[]').length; } catch { return 0; }
        })(),
        _affectedCount: (() => {
          try { return JSON.parse(item.affected_json || '[]').length; } catch { return 0; }
        })(),
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [currentTeamId]);

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>变更记录</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">查看当前团队的接口和数据模型变更检测记录。</Text>
      </header>
      <Card>
        <Table
          rowKey="id"
          loading={loading}
          dataSource={items}
          columns={[
            {
              title: '服务',
              dataIndex: 'service_name',
              render: (v: string, record: any) => (
                <Button type="link" className="table-link" onClick={() => navigate(`/changesets/${record.id}`)}>{v}</Button>
              ),
            },
            { title: '旧版本', dataIndex: 'old_version', width: 100 },
            { title: '新版本', dataIndex: 'new_version', width: 100 },
            {
              title: '级别',
              dataIndex: 'severity',
              width: 110,
              render: (v: string) => <Tag color={severityColors[v] || 'default'}>{v}</Tag>,
            },
            { title: '变更数', dataIndex: '_changeCount', width: 100 },
            { title: '影响项目数', dataIndex: '_affectedCount', width: 110 },
            { title: '时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
          ]}
          pagination={{ pageSize: 10, showSizeChanger: true, showTotal: (total) => `共 ${total} 条记录` }}
        />
      </Card>
    </div>
  );
}
