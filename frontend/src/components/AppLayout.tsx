import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Avatar, Button, Dropdown, Popover, Tooltip } from 'antd';
import {
  ApiOutlined,
  ApartmentOutlined,
  ArrowRightOutlined,
  BorderOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloseOutlined,
  CopyOutlined,
  DatabaseOutlined,
  DownOutlined,
  ExclamationCircleFilled,
  InfoCircleOutlined,
  KeyOutlined,
  LeftOutlined,
  LoadingOutlined,
  MinusOutlined,
  PauseCircleFilled,
  PlusOutlined,
  ProjectOutlined,
  PushpinOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
  TeamOutlined
} from '@ant-design/icons';
import { useAuth } from '../api/auth';
import { useTeam } from '../contexts/TeamContext';
import { useProject } from '../contexts/ProjectContext';
import { getProject } from '../api/projects';
import { buildIdeConfig } from '../utils/mcpConfig';

type ChipState = 'enabled' | 'disabled' | 'not_configured';

const deriveChipState = (status: MCPStatus | null): ChipState => {
  if (!status) return 'not_configured';
  if (status.state === 'running') return 'enabled';
  if (status.activeProject) return 'disabled';
  return 'not_configured';
};

// MCP 状态色板：与 MCP.tsx 的 STATE_PALETTE 对齐（按用户视角压缩到 chip 用色）
const CHIP_PALETTE: Record<MCPStatus['state'], { color: string; bg: string; border: string }> = {
  idle:       { color: '#8c8c8c', bg: '#fafafa', border: '#d9d9d9' },
  starting:   { color: '#1677ff', bg: '#e6f4ff', border: '#91caff' },
  running:    { color: '#047857', bg: '#f0fdf4', border: '#bbf7d0' },
  stopped:    { color: '#595959', bg: '#f5f5f5', border: '#d9d9d9' },
  failed:     { color: '#ff4d4f', bg: '#fff1f0', border: '#ffccc7' },
  restarting: { color: '#faad14', bg: '#fffbe6', border: '#ffe58f' }
};

export default function AppLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const { teams, currentTeam, currentTeamId, switchTeam } = useTeam();
  const { currentProjectId, clearCurrentProject } = useProject();

  // 全量 MCP 状态：悬浮窗需要完整数据（端口/URL/activeProject/reason）
  const [mcpFull, setMcpFull] = useState<MCPStatus | null>(null);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [projectInSidebar, setProjectInSidebar] = useState<any>(null);

  const projectMatch = location.pathname.match(/^\/projects\/([^/]+)/);
  const routeProjectId = projectMatch?.[1] || null;
  const inProjectContext = Boolean(routeProjectId);

  // 派生三态：仅用于 chip 配色，与悬浮窗独立（悬浮窗按全量 state 分支）
  const chipState: ChipState = deriveChipState(mcpFull);

  // 拉一次 status + 订阅事件，让 chip 与悬浮窗实时跟随 MCP 状态机
  useEffect(() => {
    let cancelled = false;
    window.synkord?.mcpGetStatus?.()
      .then((status) => { if (!cancelled) setMcpFull(status || null); })
      .catch(() => { if (!cancelled) setMcpFull(null); });

    if (!window.synkord?.onMcpEvent) return;
    const unsubscribe = window.synkord.onMcpEvent((event: MCPEvent) => {
      setMcpFull((prev) => {
        const base: MCPStatus = prev ?? {
          state: 'idle', port: null, url: null, pid: null,
          activeProject: null, restartCount: 0
        };
        // 事件 payload 只携带发生变化的字段；可空字段（port/url/pid/activeProject）需
        // 兼容"事件没带" vs "事件显式置空"两种语义，这里保守采用 patch ?? prev。
        return {
          ...base,
          state: event.state ?? base.state,
          port: event.port ?? base.port,
          url: event.url ?? base.url,
          pid: event.pid ?? base.pid,
          reason: event.reason ?? base.reason,
          activeProject: 'activeProject' in event
            ? (event as any).activeProject
            : base.activeProject,
          restartCount: event.restartCount ?? base.restartCount
        };
      });
    });
    return () => { cancelled = true; unsubscribe?.(); };
  }, []);

  // 路由切换时关闭悬浮窗
  useEffect(() => {
    setPopoverOpen(false);
  }, [location.pathname]);

  // 侧栏项目信息：进入项目路由时拉一次项目详情
  useEffect(() => {
    let cancelled = false;
    if (!currentTeamId || !routeProjectId) {
      setProjectInSidebar(null);
      return;
    }
    getProject(currentTeamId, routeProjectId)
      .then((project) => {
        if (!cancelled) setProjectInSidebar(project);
      })
      .catch(() => {
        if (!cancelled) setProjectInSidebar(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentTeamId, routeProjectId]);

  const handleWindow = (action: 'minimize' | 'maximize' | 'close') => {
    window.synkord?.windowControl(action);
  };

  const handleSwitchTeam = (teamId: string) => {
    switchTeam(teamId);
    clearCurrentProject();
    window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
    navigate('/projects');
  };

  const handleLogout = () => {
    clearCurrentProject();
    window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="synkord-shell">
      <header className="synkord-titlebar">
        <div
          className="synkord-brand"
          onClick={() => navigate('/projects')}
          style={{ cursor: 'pointer' }}
        >
          <div className="synkord-logo-mark">S</div>
          <span>Synkord</span>
        </div>

        <Dropdown
          trigger={['click']}
          menu={{
            items: [
              ...teams.map((team) => ({
                key: `team:${team.id}`,
                label: team.name,
              })),
              { type: 'divider' as const },
              { key: 'create-team', icon: <PlusOutlined />, label: '创建团队' },
            ],
            onClick: ({ key }) => {
              if (key === 'create-team') {
                navigate('/teams/new');
                return;
              }
              if (key.startsWith('team:')) {
                handleSwitchTeam(key.slice('team:'.length));
              }
            },
          }}
        >
          <button className="top-team-switcher">
            <TeamOutlined />
            <span>{currentTeam?.name || '选择团队'}</span>
            <DownOutlined />
          </button>
        </Dropdown>

        <div className="synkord-title-actions" style={{ marginLeft: 'auto' }}>
          <Tooltip title="当前激活项目（只读）">
            <span className="active-project-chip">
              {currentProjectId ? `项目 ${currentProjectId.slice(0, 6)}` : '未激活项目'}
            </span>
          </Tooltip>

          <Popover
            trigger="click"
            open={popoverOpen}
            onOpenChange={setPopoverOpen}
            placement="bottomRight"
            arrow={{ pointAtCenter: true }}
            destroyTooltipOnHide
            content={
              <McpQuickPanel
                status={mcpFull}
                onJumpToProject={(projectId) => navigate(`/projects/${projectId}/mcp`)}
                onJumpToProjects={() => navigate('/projects')}
                onJumpToTeams={() => navigate('/teams/new')}
              />
            }
          >
            <Tooltip
              title={
                mcpFull?.activeProject?.projectName
                  ? `${mcpStatusLabel[mcpFull.state]} · 激活 ${mcpFull.activeProject.projectName}`
                  : mcpStatusLabel[mcpFull?.state ?? 'idle']
              }
            >
              <button
                className="mcp-status-chip"
                style={chipStyle(chipState)}
              >
                <SafetyCertificateOutlined />
                {mcpStatusLabel[mcpFull?.state ?? 'idle']}
              </button>
            </Tooltip>
          </Popover>

          <Tooltip title="刷新">
            <Button type="text" icon={<SyncOutlined />} onClick={() => window.location.reload()} />
          </Tooltip>
          <Dropdown
            menu={{
              items: [
                { key: 'user', label: user?.username || '当前用户', disabled: true },
                { key: 'profile', label: '个人信息' },
                { type: 'divider' },
                { key: 'logout', label: '退出登录', danger: true },
              ],
              onClick: ({ key }) => {
                if (key === 'logout') handleLogout();
              },
            }}
            trigger={['click']}
          >
            <Avatar size={24} className="synkord-user-avatar">{user?.username?.[0]?.toUpperCase() || 'S'}</Avatar>
          </Dropdown>
          <Tooltip title="置顶">
            <Button type="text" icon={<PushpinOutlined />} />
          </Tooltip>
          <Button type="text" className="window-button" icon={<MinusOutlined />} onClick={() => handleWindow('minimize')} />
          <Button type="text" className="window-button" icon={<BorderOutlined />} onClick={() => handleWindow('maximize')} />
          <Button type="text" className="window-button close" icon={<CloseOutlined />} onClick={() => handleWindow('close')} />
        </div>
      </header>

      <div className="synkord-body">
        <aside className="synkord-sidebar">
          {inProjectContext && routeProjectId ? (
            <ProjectSidebar
              projectId={routeProjectId}
              project={projectInSidebar}
              locationPath={location.pathname}
              onNavigate={navigate}
            />
          ) : (
            <TeamSidebar
              currentTeamName={currentTeam?.name || '当前团队'}
              currentTeamId={currentTeamId}
              locationPath={location.pathname}
              onNavigate={navigate}
            />
          )}
        </aside>

        <main className="synkord-main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

// 团队/项目侧栏保持原样，下面省略 — 见下方原文件保留
function TeamSidebar({
  currentTeamName,
  currentTeamId,
  locationPath,
  onNavigate,
}: {
  currentTeamName: string;
  currentTeamId: string | null;
  locationPath: string;
  onNavigate: (path: string) => void;
}) {
  const projectMgmtActive = locationPath === '/projects';
  const teamMgmtActive = locationPath.startsWith('/members') || locationPath.startsWith('/teams/');

  return (
    <section className="workspace-section">
      <div className="workspace-title">
        <span><TeamOutlined /> {currentTeamName}</span>
      </div>
      <button
        className={projectMgmtActive ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate('/projects')}
      >
        <ProjectOutlined />
        <span>项目管理</span>
      </button>
      <button
        className={teamMgmtActive ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate('/members')}
      >
        <TeamOutlined />
        <span>团队管理</span>
      </button>
      {teamMgmtActive && (
        <div className="submenu">
          <button
            className={locationPath.startsWith('/teams/') ? 'submenu-item active' : 'submenu-item'}
            onClick={() => currentTeamId && onNavigate(`/teams/${currentTeamId}`)}
            disabled={!currentTeamId}
          >
            团队信息
          </button>
          <button
            className={locationPath === '/members' ? 'submenu-item active' : 'submenu-item'}
            onClick={() => onNavigate('/members')}
          >
            成员与权限
          </button>
        </div>
      )}
    </section>
  );
}

function ProjectSidebar({
  projectId,
  project,
  locationPath,
  onNavigate,
}: {
  projectId: string;
  project: any;
  locationPath: string;
  onNavigate: (path: string) => void;
}) {
  const isActive = (section: 'info' | 'apis' | 'models' | 'dependencies' | 'mcp') => {
    if (section === 'info') return locationPath === `/projects/${projectId}`;
    return locationPath.startsWith(`/projects/${projectId}/${section}`);
  };

  return (
    <section className="workspace-section project-sidebar-section">
      <button className="project-back-link" onClick={() => onNavigate('/projects')}>
        <LeftOutlined /> 返回项目列表
      </button>

      <div className="project-sidebar-header">
        <div className="project-sidebar-title">{project?.name || '当前项目'}</div>
        <div className="project-sidebar-meta">{projectTypeLabels[project?.project_type] || project?.project_type || '项目'}</div>
      </div>

      <button
        className={isActive('info') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}`)}
      >
        <InfoCircleOutlined />
        <span>项目信息</span>
      </button>
      <button
        className={isActive('apis') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/apis`)}
      >
        <ApiOutlined />
        <span>接口管理</span>
      </button>
      <button
        className={isActive('models') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/models`)}
      >
        <DatabaseOutlined />
        <span>数据模型</span>
      </button>
      <button
        className={isActive('dependencies') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/dependencies`)}
      >
        <ApartmentOutlined />
        <span>依赖拓扑</span>
      </button>
      <button
        className={isActive('mcp') ? 'workspace-link active' : 'workspace-link'}
        onClick={() => onNavigate(`/projects/${projectId}/mcp`)}
      >
        <KeyOutlined />
        <span>MCP</span>
      </button>
    </section>
  );
}

// ============================================================================
// MCP 快捷面板（顶栏 chip 点击后的下出卡片）
// ============================================================================
//
// 设计原则：
// - 按 MCP 状态分支渲染，不是字段罗列
// - 主 CTA（按状态）置顶，复制反馈在按钮内闭环
// - 不展示 PID/端口独立字段、运行时长（URL 已含端口）
// - 失败态专属"重试启动"大按钮；stopped/idle 给"启动"；未激活项目给"去激活"
// - "打开完整管理页"恒置底（文字链接），不弱化
// ============================================================================

function McpQuickPanel({
  status,
  onJumpToProject,
  onJumpToProjects,
  onJumpToTeams
}: {
  status: MCPStatus | null;
  onJumpToProject: (projectId: string) => void;
  onJumpToProjects: () => void;
  onJumpToTeams: () => void;
}) {
  const state: MCPStatus['state'] = status?.state ?? 'idle';
  const palette = CHIP_PALETTE[state];
  const activeProject = status?.activeProject ?? null;

  // 不同状态的头部：图标 + 标题 + 副标题
  const head = renderHead(state, palette, status, activeProject, onJumpToProject);

  // 不同状态的主体操作
  const body = renderBody(state, status, onJumpToProjects, onJumpToTeams);

  return (
    <div className="mcp-quick-panel">
      {head}
      <div className="mcp-quick-divider" />
      {body}
      <div className="mcp-quick-divider" />
      <button
        className="mcp-quick-link"
        onClick={() => activeProject ? onJumpToProject(activeProject.projectId) : onJumpToProjects()}
      >
        打开完整管理页 <ArrowRightOutlined />
      </button>
    </div>
  );
}

function renderHead(
  state: MCPStatus['state'],
  palette: typeof CHIP_PALETTE[MCPStatus['state']],
  status: MCPStatus | null,
  activeProject: MCPStatus['activeProject'],
  onJumpToProject: (projectId: string) => void
) {
  // 未配置态（无 activeProject 且非 running）：引导激活，不展示激活项目
  if (!activeProject && state !== 'running') {
    return (
      <div className="mcp-quick-head">
        <div className="mcp-quick-title">
          <PauseCircleFilled style={{ color: palette.color }} />
          <span>{state === 'failed' ? '启动失败' : '尚未激活项目'}</span>
        </div>
        <div className="mcp-quick-sub">
          激活项目后，IDE 才能调用此项目接口
        </div>
      </div>
    );
  }

  // failed 态：标题显示失败，但下面单独显示 reason
  if (state === 'failed') {
    return (
      <div className="mcp-quick-head">
        <div className="mcp-quick-title">
          <ExclamationCircleFilled style={{ color: palette.color }} />
          <span>启动失败</span>
        </div>
        <div className="mcp-quick-sub">{status?.reason || '未知原因'}</div>
      </div>
    );
  }

  // starting / restarting：动态文案
  if (state === 'starting') {
    return (
      <div className="mcp-quick-head">
        <div className="mcp-quick-title">
          <LoadingOutlined style={{ color: palette.color }} />
          <span>正在启动…</span>
        </div>
        <div className="mcp-quick-sub">启动完成后可复制接入地址</div>
      </div>
    );
  }
  if (state === 'restarting') {
    return (
      <div className="mcp-quick-head">
        <div className="mcp-quick-title">
          <ReloadOutlined spin style={{ color: palette.color }} />
          <span>正在重启…</span>
        </div>
        <div className="mcp-quick-sub">
          {activeProject ? `激活项目：${activeProject.projectName}` : '启动完成后可复制接入地址'}
        </div>
      </div>
    );
  }

  // stopped / idle：服务未启动
  if (state === 'stopped' || state === 'idle') {
    return (
      <div className="mcp-quick-head">
        <div className="mcp-quick-title">
          <PauseCircleFilled style={{ color: palette.color }} />
          <span>MCP 已停止</span>
        </div>
        <div className="mcp-quick-sub">
          {activeProject ? `激活项目：${activeProject.projectName}` : '尚未激活项目'}
        </div>
      </div>
    );
  }

  // running：核心态
  return (
    <div className="mcp-quick-head">
      <div className="mcp-quick-title">
        <CheckCircleFilled style={{ color: palette.color }} />
        <span>运行中</span>
      </div>
      <div className="mcp-quick-sub-row">
        <span className="mcp-quick-sub">
          接的是：<strong>{activeProject?.projectName ?? '未知项目'}</strong>
        </span>
        <button
          className="mcp-quick-jump"
          onClick={() => activeProject && onJumpToProject(activeProject.projectId)}
          disabled={!activeProject}
          title="跳转到该项目 MCP 页"
        >
          <ArrowRightOutlined />
        </button>
      </div>
    </div>
  );
}

function renderBody(
  state: MCPStatus['state'],
  status: MCPStatus | null,
  onJumpToProjects: () => void,
  onJumpToTeams: () => void
) {
  const url = status?.url || '';

  // 无激活项目：单一引导按钮
  if (!status?.activeProject && state !== 'running') {
    return (
      <div className="mcp-quick-body">
        <PrimaryButton
          icon={<ArrowRightOutlined />}
          onClick={onJumpToTeams}
          tone="primary"
        >
          去激活项目
        </PrimaryButton>
      </div>
    );
  }

  // failed：重试启动为主
  if (state === 'failed') {
    return (
      <div className="mcp-quick-body">
        <PrimaryButton
          icon={<ReloadOutlined />}
          onClick={() => window.synkord?.mcpRestart?.()}
          tone="primary"
        >
          重试启动
        </PrimaryButton>
        <CopyConfigButton
          disabled
          disabledHint="启动后可复制"
        />
      </div>
    );
  }

  // starting / restarting：复制 URL 不可用
  if (state === 'starting' || state === 'restarting') {
    return (
      <div className="mcp-quick-body">
        <CopyUrlButton url={url} disabled />
        <CopyConfigButton
          disabled
          disabledHint="启动后可复制"
        />
      </div>
    );
  }

  // stopped / idle：单一启动按钮
  if (state === 'stopped' || state === 'idle') {
    return (
      <div className="mcp-quick-body">
        <PrimaryButton
          icon={<SafetyCertificateOutlined />}
          onClick={() => window.synkord?.mcpStart?.()}
          tone="primary"
        >
          启动 MCP
        </PrimaryButton>
      </div>
    );
  }

  // running：复制 URL（主）+ 复制配置（二级菜单）
  return (
    <div className="mcp-quick-body">
      <CopyUrlButton url={url} />
      <CopyConfigButton stdioArgs={[window.synkord?.mcpServicePath || '', 'stdio']} url={url} />
    </div>
  );
}

// 复制反馈：按钮内 1.5s 显示"已复制 ✓"，不弹 toast、不持久化
function useCopyFeedback(): [boolean, (text: string) => Promise<void>] {
  const [copied, setCopied] = useState(false);
  const copy = async (text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // 静默：clipboard API 在权限缺失时静默失败比 toast 友好
    }
  };
  return [copied, copy];
}

function CopyUrlButton({ url, disabled = false }: { url: string; disabled?: boolean }) {
  const [copied, copy] = useCopyFeedback();
  return (
    <div className="mcp-quick-copy-row">
      <code className="mcp-quick-url" title={url}>{url || '—'}</code>
      <button
        className="mcp-quick-btn primary"
        disabled={disabled || !url}
        onClick={() => copy(url)}
      >
        {copied ? <><CheckCircleFilled /> 已复制</> : <><CopyOutlined /> 复制地址</>}
      </button>
    </div>
  );
}

function CopyConfigButton({
  stdioArgs,
  url,
  disabled = false,
  disabledHint
}: {
  stdioArgs?: string[];
  url?: string;
  disabled?: boolean;
  disabledHint?: string;
}) {
  const [copied, copy] = useCopyFeedback();
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <button className="mcp-quick-btn ghost" disabled title={disabledHint}>
        <CopyOutlined /> 复制配置
      </button>
    );
  }

  const handleStdio = async () => {
    const { text } = buildIdeConfig({ transport: 'stdio', stdioArgs });
    await copy(text);
    setOpen(false);
  };
  const handleHttp = async () => {
    const { text } = buildIdeConfig({ transport: 'http', url });
    await copy(text);
    setOpen(false);
  };

  return (
    <div className="mcp-quick-config">
      <button
        className="mcp-quick-btn ghost"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <CopyOutlined /> {copied ? '已复制' : '复制配置'} <DownOutlined style={{ fontSize: 10 }} />
      </button>
      {open && (
        <div className="mcp-quick-menu" role="menu">
          <button className="mcp-quick-menu-item" onClick={handleStdio}>
            <span className="mcp-quick-menu-title">STDIO 配置</span>
            <span className="mcp-quick-menu-hint">Codex / Claude CLI</span>
          </button>
          <button className="mcp-quick-menu-item" onClick={handleHttp}>
            <span className="mcp-quick-menu-title">HTTP 地址</span>
            <span className="mcp-quick-menu-hint">Cursor / VS Code / JetBrains</span>
          </button>
        </div>
      )}
    </div>
  );
}

function PrimaryButton({
  icon,
  onClick,
  tone,
  children
}: {
  icon: React.ReactNode;
  onClick: () => void;
  tone: 'primary' | 'ghost';
  children: React.ReactNode;
}) {
  return (
    <button className={`mcp-quick-btn ${tone} block`} onClick={onClick}>
      {icon} {children}
    </button>
  );
}

// chip 配色：直接用 style 注入，避免被旧 className 三态覆盖
function chipStyle(state: ChipState): React.CSSProperties {
  // 委托给 mcpFull.state 的真实色板；如果 mcpFull 还没拿到（null），退到 not_configured 灰
  // 注意：此处只用于 chip 本身，配色与悬浮窗 head 一致
  const colorMap: Record<ChipState, string> = {
    enabled: '#047857',
    disabled: '#b45309',
    not_configured: '#64748b'
  };
  const bgMap: Record<ChipState, string> = {
    enabled: '#f0fdf4',
    disabled: '#fffbeb',
    not_configured: '#fff'
  };
  const borderMap: Record<ChipState, string> = {
    enabled: '#bbf7d0',
    disabled: '#fde68a',
    not_configured: '#dde4ef'
  };
  return {
    color: colorMap[state],
    background: bgMap[state],
    borderColor: borderMap[state]
  };
}

const projectTypeLabels: Record<string, string> = {
  backend: '后端服务',
  web: 'Web 前端',
  app: 'App 移动端',
};

const mcpStatusLabel: Record<MCPStatus['state'], string> = {
  idle: 'MCP 未启动',
  starting: 'MCP 启动中',
  running: 'MCP 运行中',
  stopped: 'MCP 已停止',
  failed: 'MCP 启动失败',
  restarting: 'MCP 重启中'
};