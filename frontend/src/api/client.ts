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
      localStorage.removeItem('synkord_token');
      localStorage.removeItem('synkord_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default apiClient;
