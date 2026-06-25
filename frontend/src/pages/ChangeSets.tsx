import { useEffect, useState } from 'react';
import { Card, Table, Tag, Typography } from 'antd';
import apiClient from '../api/client';

const { Title } = Typography;

const severityColors: Record<string, string> = {
  info: 'green',
  warning: 'orange',
  breaking: 'red',
};

export default function ChangeSets() {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const resp = await apiClient.get('/diff/changesets?limit=200');
      setItems(resp.data.items || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>变更历史</Title>
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
