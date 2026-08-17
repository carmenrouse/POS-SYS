import React, { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import client, { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';

export default function DashboardScreen({ navigation }) {
  const { user, logout } = useAuth();
  const [needsReviewCount, setNeedsReviewCount] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const { data } = await client.get('/import-jobs', { params: { status: 'NEEDS_REVIEW' } });
      setNeedsReviewCount(data.length);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.greeting}>Hi, {user?.name}</Text>
        <Text style={styles.role}>{user?.role}</Text>
        <ErrorText text={error} />

        {needsReviewCount !== null && (
          <Card>
            <Text style={styles.statValue}>{needsReviewCount}</Text>
            <Text style={styles.statLabel}>Imports needing review</Text>
          </Card>
        )}

        <Card>
          <Text style={styles.sectionTitle}>Quick actions</Text>
          <Button title="Scan a purchase order" onPress={() => navigation.navigate('ScanTab')} style={{ marginBottom: spacing.sm }} />
          <Button
            title="View import jobs"
            variant="secondary"
            onPress={() => navigation.navigate('ImportsTab')}
            style={{ marginBottom: spacing.sm }}
          />
          <Button title="Log out" variant="danger" onPress={logout} />
        </Card>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md },
  greeting: { fontSize: 24, fontWeight: '800', color: colors.text },
  role: { color: colors.textMuted, marginBottom: spacing.md },
  statValue: { fontSize: 28, fontWeight: '800', color: colors.primaryDark },
  statLabel: { color: colors.textMuted, marginTop: spacing.xs },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: spacing.md },
});
