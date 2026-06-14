import axios, { AxiosInstance, AxiosError } from 'axios';
import toast from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';

// In production (Vercel): /api routes to the serverless NestJS function on the same domain.
// Locally: proxy in vite.config.ts strips /api and forwards to localhost:3001.
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - attach JWT
apiClient.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().accessToken;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

// Response interceptor - handle 401 and errors
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ message: string; statusCode: number }>) => {
    const originalRequest = error.config as any;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = useAuthStore.getState().refreshToken;

      // Only attempt refresh if we actually have a refresh token (= user was logged in)
      if (refreshToken) {
        try {
          const response = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken });
          const { accessToken } = response.data.data || response.data;
          useAuthStore.getState().setAccessToken(accessToken);
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return apiClient(originalRequest);
        } catch {
          useAuthStore.getState().logout();
          window.location.href = '/login';
          return Promise.reject(error);
        }
      }
      // No refresh token = not logged in, just reject — let the component handle it
      return Promise.reject(error);
    }

    // Only show global toast for server errors with a response (not 401, not network errors)
    if (error.response && error.response.status !== 401) {
      const message = error.response.data?.message || 'Une erreur est survenue';
      toast.error(message);
    }

    return Promise.reject(error);
  },
);
