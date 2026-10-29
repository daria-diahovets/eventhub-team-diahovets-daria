import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginRequest, RegisterRequest, User } from "@eventhub/contracts";
import { api } from "../../api/client";
import { setAccessToken } from "../../api/authToken";

export const authKeys = { me: ["auth", "me"] as const };

export function useCurrentUser() {
  return useQuery({
    queryKey: authKeys.me,
    queryFn: async (): Promise<User | null> => {
      const { data, error } = await api.GET("/auth/me");
      if (error) return null;
      return data;
    },
    retry: false,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: LoginRequest) => {
      const { data, error } = await api.POST("/auth/login", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.me, data.user);
    },
  });
}

export function useRegister() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (body: RegisterRequest) => {
      const { data, error } = await api.POST("/auth/register", { body });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      setAccessToken(data.accessToken);
      queryClient.setQueryData(authKeys.me, data.user);
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/auth/logout");
    },
    onSuccess: () => {
      setAccessToken(null);
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}

export function useLogoutAll() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.POST("/auth/logout-all", {});
    },
    onSuccess: () => {
      setAccessToken(null);
      queryClient.setQueryData(authKeys.me, null);
    },
  });
}
