import { Redirect, Stack, usePathname } from 'expo-router';
import { useApp } from '@/lib/store';

export default function AuthLayout() {
  const { profile } = useApp();
  const pathname = usePathname();
  const onResetPassword = pathname.includes('reset-password');
  if (profile && !onResetPassword) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
