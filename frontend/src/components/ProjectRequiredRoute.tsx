import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Spin } from 'antd';
import TeamRequiredRoute from './TeamRequiredRoute';
import { useProject } from '../contexts/ProjectContext';

export default function ProjectRequiredRoute({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { setCurrentProjectId, clearCurrentProject } = useProject();
  const [synced, setSynced] = useState(false);

  useEffect(() => {
    if (!projectId) {
      clearCurrentProject();
      setSynced(true);
      return;
    }
    setCurrentProjectId(projectId);
    setSynced(true);
    return () => {
      clearCurrentProject();
    };
  }, [clearCurrentProject, projectId, setCurrentProjectId]);

  if (!projectId) {
    return <Navigate to="/projects" replace />;
  }

  if (!synced) {
    return (
      <div className="route-loading">
        <Spin />
      </div>
    );
  }

  return <TeamRequiredRoute>{children}</TeamRequiredRoute>;
}
