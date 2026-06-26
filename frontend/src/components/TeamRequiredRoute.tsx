import { Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import { useTeam } from '../contexts/TeamContext';

export default function TeamRequiredRoute({ children }: { children: React.ReactNode }) {
  const { currentTeam, loading } = useTeam();

  if (loading) {
    return (
      <div className="route-loading">
        <Spin />
      </div>
    );
  }

  if (!currentTeam) {
    return <Navigate to="/teams/new" replace />;
  }

  return <>{children}</>;
}
