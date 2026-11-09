import { Redirect, Tabs } from 'expo-router';
import { Home, Ticket, UserRound } from 'lucide-react-native';
import { StyleSheet } from 'react-native';
import { useApp } from '@/lib/store';
import { colors, fonts } from '@/lib/theme';

export default function TabsLayout() {
  const { profile } = useApp();
  if (!profile) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: '#7D8F84',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size - 2} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarIcon: ({ color, size }) => <Ticket color={color} size={size - 2} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => <UserRound color={color} size={size - 2} strokeWidth={2.2} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: colors.night,
    borderTopWidth: 0,
    height: 76,
    paddingTop: 8,
    paddingBottom: 10,
    elevation: 0,
    position: 'absolute',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
  },
  tabLabel: {
    fontFamily: fonts.medium,
    fontSize: 10,
    letterSpacing: 0.2,
  },
  tabItem: { paddingVertical: 2 },
});
