import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { loadProfile, updatePassword, updateProfile, type AppProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';

/** Signed-in user's profile row. RLS allows only the caller's row. */
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<AppProfile | null> => {
      const { data, error } = await supabase.auth.getUser();
      if (error) throw new Error(error.message);
      if (!data.user) return null;
      return loadProfile(data.user);
    },
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateProfile,
    onSuccess: (profile) => {
      queryClient.setQueryData(['profile'], profile);
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (password: string) => updatePassword(password),
  });
}
