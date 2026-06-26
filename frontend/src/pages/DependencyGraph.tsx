import { useState, useEffect, useRef } from 'react';
import { Typography, Card, Empty, Spin } from 'antd';
import { Graph } from '@antv/g6';
import { getDependencyGraph } from '../api/dependencies';
import { useTeam } from '../contexts/TeamContext';

const { Text } = Typography;

export default function DependencyGraph() {
  const { currentTeam, currentTeamId } = useTeam();
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  const [stats, setStats] = useState<{ nodes: number; edges: number }>({ nodes: 0, edges: 0 });
  const graphRef = useRef<any>(null);

  useEffect(() => {
    async function load() {
      if (!currentTeamId) return;
      setLoading(true);
      try {
        const { nodes, edges } = await getDependencyGraph(currentTeamId);
        setStats({ nodes: nodes?.length || 0, edges: edges?.length || 0 });
        setEmpty(!(nodes?.length || edges?.length));

        if (containerRef.current && nodes?.length) {
          if (graphRef.current) {
            graphRef.current.destroy();
          }

          const colors: Record<string, string> = { backend: '#1677ff', web: '#52c41a', app: '#fa8c16' };

          const graph = new Graph({
            container: containerRef.current,
            width: containerRef.current.clientWidth,
            height: 500,
            layout: {
              type: 'force',
              preventOverlap: true,
              linkDistance: 200,
            },
            data: {
              nodes: nodes.map((n: any) => ({
                id: n.id,
                label: n.name,
                style: { fill: colors[n.project_type] || '#1677ff' },
              })),
              edges: edges.map((e: any) => ({
                source: e.source,
                target: e.target,
                label: e.entity_name,
              })),
            },
            node: {
              style: {
                size: 40,
                labelText: (d: any) => d.label,
                labelPlacement: 'bottom',
                labelOffsetY: 8,
              },
            },
            edge: {
              style: {
                stroke: '#bbb',
                labelText: (d: any) => d.label,
                labelBackground: true,
              },
            },
            behaviors: ['drag-canvas', 'zoom-canvas', 'drag-element'],
          });

          graph.render();
          graphRef.current = graph;
        }
      } finally {
        setLoading(false);
      }
    }
    load();

    return () => {
      if (graphRef.current) {
        graphRef.current.destroy();
      }
    };
  }, [currentTeamId]);

  return (
    <div className="project-page">
      <header className="page-header">
        <div className="page-title-row">
          <h1>依赖拓扑</h1>
          <span className="owner-badge">{currentTeam?.name || '当前团队'}</span>
        </div>
        <Text type="secondary">查看当前团队内项目、接口和数据模型之间的依赖关系。</Text>
      </header>
      <Card
        title={(
          <div className="mcp-status-row">
            <div>
              <strong>依赖关系</strong>
              <div style={{ color: '#64748b', fontSize: 12 }}>项目 {stats.nodes} · 依赖 {stats.edges}</div>
            </div>
          </div>
        )}
      >
        {loading ? (
          <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
        ) : empty ? (
          <Empty description="当前团队暂无项目依赖关系" />
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: 500 }} />
        )}
      </Card>
    </div>
  );
}
