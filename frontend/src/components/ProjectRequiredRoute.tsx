import { useEffect, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { Spin } from 'antd';
import TeamRequiredRoute from './TeamRequiredRoute';
import { useProject } from '../contexts/ProjectContext';
import { useTeam } from '../contexts/TeamContext';
import { getProject } from '../api/projects';

/**
 * 项目路由守卫：
 * 1. 把 URL :projectId 写入 ProjectContext（前端状态）
 * 2. 把当前团队 + 项目推到主进程 activeProject（MCP Server 的"内存最高优先级"上下文）
 *    - 进入项目路由 → 调用 mcpSetActiveProject({ teamId, projectId, projectName })
 *    - 离开项目路由 → 调用 mcpSetActiveProject(null)
 */
export default function ProjectRequiredRoute({ children }: { children: React.ReactNode }) {
  const { projectId } = useParams<{ projectId: string }>();
  const { setCurrentProjectId, clearCurrentProject } = useProject();
  const { currentTeamId } = useTeam();
  const [synced, setSynced] = useState(false);

  // 同步 URL 项目 ID 到前端 ProjectContext
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

  // 同步当前项目到主进程 MCP Server 的 activeProject
  // 团队 / 项目任一变化时重新拉一次项目详情，拿到 projectName 再推送
  useEffect(() => {
    if (!projectId || !currentTeamId) {
      // 不在项目路由 / 还未选团队：清空主进程 activeProject
      window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
      return;
    }
    let cancelled = false;
    getProject(currentTeamId, projectId)
      .then((project) => {
        if (cancelled) return;
        const projectName = project?.name || '';
        window.synkord
          ?.mcpSetActiveProject?.({
            teamId: currentTeamId,
            projectId,
            projectName,
          })
          .catch(() => undefined);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      // 切换 / 离开项目路由时清空主进程 activeProject
      // （下一个 effect 会立刻覆盖，所以此处只防"用户离开 /projects/:id/* 的全部子树"）
      window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
    };
  }, [currentTeamId, projectId]);

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