import { Redirect, Tabs } from 'expo-router';
import { Home, Ticket, UserRound } from 'lucide-react-native';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useApp } from '@/lib/store';
import { colors, fonts } from '@/lib/theme';

const BASE_TAB_BAR_HEIGHT = 68;
/** Labels grow with the system font scale; the bar grows with them. */
const MAX_FONT_SCALE = 1.8;

export default function TabsLayout() {
  const { profile } = useApp();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();

  const scale = Math.min(Math.max(fontScale, 1), MAX_FONT_SCALE);
  const tabBarHeight = Math.round(BASE_TAB_BAR_HEIGHT + (scale - 1) * 28 + insets.bottom);

  if (!profile) return <Redirect href="/welcome" />;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: '#7D8F84',
        tabBarStyle: [
          styles.tabBar,
          { height: tabBarHeight, paddingBottom: Math.max(insets.bottom, 10) },
        ],
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: styles.tabItem,
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarAccessibilityLabel: 'Home tab',
          tabBarButtonTestID: 'tab-home',
          tabBarIcon: ({ color, size }) => <Home color={color} size={size - 2} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="tickets"
        options={{
          title: 'Tickets',
          tabBarAccessibilityLabel: 'Tickets tab',
          tabBarButtonTestID: 'tab-tickets',
          tabBarIcon: ({ color, size }) => <Ticket color={color} size={size - 2} strokeWidth={2.2} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarAccessibilityLabel: 'Profile tab',
          tabBarButtonTestID: 'tab-profile',
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
    paddingTop: 8,
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
  tabItem: { paddingVertical: 2, minHeight: 48, minWidth: 48 },
});
