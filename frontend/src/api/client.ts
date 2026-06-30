import axios from 'axios';

const apiClient = axios.create({
  baseURL: localStorage.getItem('synkord_api_base') || '/api',
  timeout: 10000,
});

if (window.synkord) {
  window.synkord.getAPIBase().then((baseURL) => {
    if (!localStorage.getItem('synkord_api_base')) {
      apiClient.defaults.baseURL = baseURL;
    }
  });
}

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('synkord_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // 401 拦截：清空所有上下文，跳到 /login?redirect= 保留当前路径
      const currentPath = window.location.pathname + window.location.search;
      localStorage.removeItem('synkord_token');
      localStorage.removeItem('synkord_user');
      localStorage.removeItem('synkord_current_team_id');
      localStorage.removeItem('synkord_current_project_id');
      const redirect = currentPath && currentPath !== '/login' && currentPath !== '/'
        ? `?redirect=${encodeURIComponent(currentPath)}`
        : '';
      // Electron 通知主进程清空当前激活 MCP 项目
      window.synkord?.mcpSetActiveProject?.(null).catch(() => undefined);
      window.location.href = `/login${redirect}`;
    }
    return Promise.reject(error);
  }
);

export default apiClient;
