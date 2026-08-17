import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';

import { useAuth } from '../context/AuthContext';
import { colors } from '../theme';

import LoginScreen from '../screens/LoginScreen';
import RegisterBusinessScreen from '../screens/RegisterBusinessScreen';
import DashboardScreen from '../screens/DashboardScreen';
import ImportJobsScreen from '../screens/ImportJobsScreen';
import ImportReviewScreen from '../screens/ImportReviewScreen';
import ScanCaptureScreen from '../screens/ScanCaptureScreen';

const AuthStackNav = createNativeStackNavigator();
const RootStackNav = createNativeStackNavigator();
const Tabs = createBottomTabNavigator();

const screenOptions = {
  headerStyle: { backgroundColor: colors.primary },
  headerTintColor: '#fff',
  headerTitleStyle: { fontWeight: '700' },
};

function AuthStack() {
  return (
    <AuthStackNav.Navigator screenOptions={{ headerShown: false }}>
      <AuthStackNav.Screen name="Login" component={LoginScreen} />
      <AuthStackNav.Screen name="RegisterBusiness" component={RegisterBusinessScreen} />
    </AuthStackNav.Navigator>
  );
}

function DashboardStack() {
  return (
    <RootStackNav.Navigator screenOptions={screenOptions}>
      <RootStackNav.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'PO/Inventory Sync' }} />
      <RootStackNav.Screen name="ImportReview" component={ImportReviewScreen} options={{ title: 'Review Import' }} />
    </RootStackNav.Navigator>
  );
}

function ScanStack() {
  return (
    <RootStackNav.Navigator screenOptions={screenOptions}>
      <RootStackNav.Screen name="ScanCapture" component={ScanCaptureScreen} options={{ title: 'Scan Document' }} />
      <RootStackNav.Screen name="ImportReview" component={ImportReviewScreen} options={{ title: 'Review Import' }} />
    </RootStackNav.Navigator>
  );
}

function ImportsStack() {
  return (
    <RootStackNav.Navigator screenOptions={screenOptions}>
      <RootStackNav.Screen name="ImportJobsList" component={ImportJobsScreen} options={{ title: 'Import Jobs' }} />
      <RootStackNav.Screen name="ImportReview" component={ImportReviewScreen} options={{ title: 'Review Import' }} />
    </RootStackNav.Navigator>
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary }}>
      <Tabs.Screen name="DashboardTab" component={DashboardStack} options={{ title: 'Home' }} />
      <Tabs.Screen name="ScanTab" component={ScanStack} options={{ title: 'Scan' }} />
      <Tabs.Screen name="ImportsTab" component={ImportsStack} options={{ title: 'Imports' }} />
    </Tabs.Navigator>
  );
}

export default function RootNavigator() {
  const { user, booting } = useAuth();

  if (booting) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return <NavigationContainer>{user ? <MainTabs /> : <AuthStack />}</NavigationContainer>;
}
