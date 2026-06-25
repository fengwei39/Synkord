import { useState, useEffect, useRef } from 'react';
import { Typography, Card, Spin } from 'antd';
import { G6 } from '@antv/g6';
import apiClient from '../api/client';

const { Title } = Typography;

export default function DependencyGraph() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const graphRef = useRef<any>(null);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const resp = await apiClient.get('/dependencies/graph');
        const { nodes, edges } = resp.data;

        if (containerRef.current) {
          if (graphRef.current) {
            graphRef.current.destroy();
          }

          const colors: Record<string, string> = { backend: '#1677ff', web: '#52c41a', app: '#fa8c16' };

          const graph = new G6.Graph({
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
  }, []);

  return (
    <div>
      <Title level={4} style={{ marginBottom: 16 }}>依赖拓扑</Title>
      <Card>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 100 }}><Spin size="large" /></div>
        ) : (
          <div ref={containerRef} style={{ width: '100%', height: 500 }} />
        )}
      </Card>
    </div>
  );
}
