import { useEffect } from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { router } from 'expo-router';
import { useAuth } from '@/context/AuthContext';
import { useThemeColors, ThemeColors } from '@/context/ThemeContext';

export default function IndexScreen() {
  const Colors = useThemeColors();
  const styles = makeStyles(Colors);
  const { user, isLoading, isOnboarded } = useAuth();

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      router.replace('/welcome');
    } else if (!isOnboarded) {
      router.replace('/onboarding');
    } else {
      router.replace('/(main)');
    }
  }, [user, isLoading, isOnboarded]);

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color={Colors.accent} />
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
});
