import { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography } from 'antd';
import { listChangeSets } from '../api/changesets';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

const severityColors: Record<string, string> = {
  info: 'green',
  warning: 'orange',
  breaking: 'red',
};

export default function ChangeSets() {
  const { currentTeam, currentTeamId } = useTeam();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    try {
      const data = await listChangeSets(currentTeamId);
      setItems(data);
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
            { title: '服务', dataIndex: 'service_name' },
            { title: '旧版本', dataIndex: 'old_version', width: 100 },
            { title: '新版本', dataIndex: 'new_version', width: 100 },
            {
              title: '级别',
              dataIndex: 'severity',
              width: 110,
              render: (v: string) => <Tag color={severityColors[v] || 'default'}>{v}</Tag>,
            },
            {
              title: '变更数',
              dataIndex: 'changes_json',
              width: 100,
              render: (v: string) => {
                try {
                  return JSON.parse(v || '[]').length;
                } catch {
                  return 0;
                }
              },
            },
            { title: '时间', dataIndex: 'created_at', render: (v: string) => new Date(v).toLocaleString() },
          ]}
        />
      </Card>
    </div>
  );
}
