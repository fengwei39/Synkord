import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface ProjectContextType {
  /** 当前激活项目 ID。null 表示未激活。 */
  currentProjectId: string | null;
  /**
   * 显式设置当前激活项目。
   * 应在进入 `/projects/:projectId/...` 任一子路由时由路由守卫或页面调用。
   * 离开项目详情（包括切换 Tab、跳到团队级页面、切换团队、退出登录）时调用 clearCurrentProject。
   */
  setCurrentProjectId: (id: string | null) => void;
  /**
   * 清空当前激活项目。
   */
  clearCurrentProject: () => void;
  /**
   * 带跨项目确认的跳转：
   * - 同项目（sourceProjectId === null || === urlProjectId）直接跳转
   * - 跨项目需要 confirm 确认；确认后 setCurrentProjectId 并跳转，取消则保留来源项目上下文
   * 返回值：true=已执行跳转，false=被取消或未执行
   */
  navigateToProject: (urlProjectId: string, doNavigate: () => void, options?: { sourceProjectId?: string | null }) => boolean;
}

const ProjectContext = createContext<ProjectContextType>({
  currentProjectId: null,
  setCurrentProjectId: () => {},
  clearCurrentProject: () => {},
  navigateToProject: () => false,
});

export function ProjectProvider({ children }: { children: React.ReactNode }) {
  const [currentProjectId, setCurrentProjectIdState] = useState<string | null>(null);

  const setCurrentProjectId = useCallback((id: string | null) => {
    setCurrentProjectIdState(id);
    if (id) {
      window.localStorage.setItem('synkord_current_project_id', id);
    } else {
      window.localStorage.removeItem('synkord_current_project_id');
    }
  }, []);

  const clearCurrentProject = useCallback(() => {
    setCurrentProjectId(null);
  }, [setCurrentProjectId]);

  const navigateToProject = useCallback(
    (urlProjectId: string, doNavigate: () => void, options?: { sourceProjectId?: string | null }) => {
      const source = options?.sourceProjectId ?? null;
      // 同项目或无来源项目：直接跳转
      if (source === null || source === urlProjectId) {
        setCurrentProjectId(urlProjectId);
        doNavigate();
        return true;
      }
      // 跨项目：需要二次确认
      // 注意：confirm 在浏览器/Electron 渲染进程都可用
      const confirmed = typeof window !== 'undefined' && window.confirm(
        `当前激活项目是 ${source.slice(0, 8)}，即将跳转到项目 ${urlProjectId.slice(0, 8)}。是否切换？`
      );
      if (confirmed) {
        setCurrentProjectId(urlProjectId);
        doNavigate();
        return true;
      }
      return false;
    },
    [setCurrentProjectId],
  );

  const value = useMemo(
    () => ({ currentProjectId, setCurrentProjectId, clearCurrentProject, navigateToProject }),
    [currentProjectId, setCurrentProjectId, clearCurrentProject, navigateToProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject() {
  return useContext(ProjectContext);
}
