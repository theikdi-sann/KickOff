import { Redirect, Stack } from 'expo-router';

import { useApp } from '@/lib/store';

export default function AuthLayout() {
  const { profile } = useApp();
  if (profile) return <Redirect href="/" />;
  return <Stack screenOptions={{ headerShown: false, animation: 'fade' }} />;
}
