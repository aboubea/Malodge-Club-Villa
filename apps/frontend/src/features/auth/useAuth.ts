import { useMutation } from '@tanstack/react-query';
import { useNavigate, useLocation } from 'react-router-dom';
import toast from 'react-hot-toast';
import { apiClient } from '../../lib/apiClient';
import { useAuthStore } from '../../store/authStore';
import { LoginResponseDto, LoginDto } from '@malodge/shared';
import { isDemoMode, DEMO_CREDENTIALS, DEMO_USER } from '../../lib/mockAuth';

export function useLogin() {
  const { setAuth } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as any)?.from?.pathname || '/';

  return useMutation({
    mutationFn: async (dto: LoginDto): Promise<LoginResponseDto> => {
      // Demo mode: bypass backend when VITE_DEMO_MODE=true
      if (isDemoMode) {
        if (dto.email === DEMO_CREDENTIALS.email && dto.password === DEMO_CREDENTIALS.password) {
          return DEMO_USER;
        }
        throw { response: { status: 401 } };
      }
      const response = await apiClient.post<{ data: LoginResponseDto }>('/auth/login', dto);
      return response.data.data || (response.data as any);
    },
    onSuccess: (data) => {
      setAuth(data.user, data.accessToken, data.refreshToken);
      toast.success('Connexion réussie');
      navigate(from, { replace: true });
    },
    onError: (error: unknown) => {
      const axiosError = error as { response?: { status?: number } };
      if (!axiosError.response) {
        toast.error('Impossible de contacter le serveur.');
      } else {
        toast.error('Email ou mot de passe incorrect');
      }
    },
  });
}

export function useLogout() {
  const { logout } = useAuthStore();
  const navigate = useNavigate();

  return () => {
    logout();
    navigate('/login', { replace: true });
  };
}

export function useCurrentUser() {
  return useAuthStore((state) => state.user);
}
