import React from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/context/AuthContext';
import { I18nProvider, useI18n } from './src/i18n/I18nContext';
import LoginScreen from './src/screens/LoginScreen';
import HomeScreen from './src/screens/HomeScreen';
import NewRequestScreen from './src/screens/NewRequestScreen';
import MyRequestsScreen from './src/screens/MyRequestsScreen';
import AccountScreen from './src/screens/AccountScreen';
import JobStatusScreen from './src/screens/JobStatusScreen';
import QuoteApprovalScreen from './src/screens/QuoteApprovalScreen';
import { colors } from './src/theme';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: colors.cream, primary: colors.gold },
};

function TabIcon({ emoji, focused }) {
  return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{emoji}</Text>;
}

function MainTabs() {
  const { t } = useI18n();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.navy,
        tabBarInactiveTintColor: colors.gray,
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopColor: colors.line,
          height: 60,
          paddingBottom: 8,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarLabel: t('tab.home'), tabBarIcon: (p) => <TabIcon emoji="🏠" {...p} /> }}
      />
      <Tab.Screen
        name="NewRequest"
        component={NewRequestScreen}
        options={{ tabBarLabel: t('tab.newRequest'), tabBarIcon: (p) => <TabIcon emoji="📝" {...p} /> }}
      />
      <Tab.Screen
        name="Requests"
        component={MyRequestsScreen}
        options={{ tabBarLabel: t('tab.requests'), tabBarIcon: (p) => <TabIcon emoji="📄" {...p} /> }}
      />
      <Tab.Screen
        name="Account"
        component={AccountScreen}
        options={{ tabBarLabel: t('tab.account'), tabBarIcon: (p) => <TabIcon emoji="👤" {...p} /> }}
      />
    </Tab.Navigator>
  );
}

function RootNavigator() {
  const { user, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.navy }}>
        <ActivityIndicator color={colors.gold} size="large" />
      </View>
    );
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {user ? (
        <>
          <Stack.Screen name="MainTabs" component={MainTabs} />
          <Stack.Screen name="JobStatus" component={JobStatusScreen} />
          <Stack.Screen name="QuoteApproval" component={QuoteApprovalScreen} />
        </>
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <I18nProvider>
        <AuthProvider>
          <NavigationContainer theme={navTheme}>
            <StatusBar style="dark" />
            <RootNavigator />
          </NavigationContainer>
        </AuthProvider>
      </I18nProvider>
    </SafeAreaProvider>
  );
}
