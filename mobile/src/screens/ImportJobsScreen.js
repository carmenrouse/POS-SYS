import React, { useCallback, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import client, { apiErrorMessage } from '../api/client';
import { Badge, EmptyState, ErrorText, Screen } from '../components/ui';
import { colors, spacing } from '../theme';
import { formatDateTime, jobStatusTone } from '../utils/status';

const STATUS_FILTERS = ['ALL', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'PUSHED', 'PARTIALLY_PUSHED', 'FAILED'];

export default function ImportJobsScreen({ navigation }) {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('ALL');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (statusFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = statusFilter && statusFilter !== 'ALL' ? { status: statusFilter } : {};
      const { data } = await client.get('/import-jobs', { params });
      setJobs(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(status);
    }, [load, status])
  );

  return (
    <Screen style={{ padding: spacing.md }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filters}>
        {STATUS_FILTERS.map((s) => (
          <Pressable key={s} onPress={() => setStatus(s)} style={[styles.filterChip, status === s && styles.filterChipActive]}>
            <Text style={[styles.filterChipText, status === s && styles.filterChipTextActive]}>{s.replace('_', ' ')}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <ErrorText text={error} />
      <FlatList
        data={jobs}
        keyExtractor={(item) => item.id}
        refreshing={loading}
        onRefresh={() => load(status)}
        ListEmptyComponent={!loading ? <EmptyState text="No import jobs." /> : null}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => navigation.navigate('ImportReview', { jobId: item.id })}>
            <View style={{ flex: 1 }}>
              <Text style={styles.supplier}>{item.supplier?.name || 'No supplier'}</Text>
              <Text style={styles.meta}>
                {item.originalFileName || item.sourceType} · {formatDateTime(item.createdAt)} · {item._count?.rows ?? 0} rows
              </Text>
            </View>
            <Badge text={item.status.replace('_', ' ')} tone={jobStatusTone(item.status)} />
          </Pressable>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { marginBottom: spacing.md, maxHeight: 40 },
  filterChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: spacing.sm,
    backgroundColor: colors.surface,
  },
  filterChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  filterChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  supplier: { fontSize: 16, fontWeight: '600', color: colors.text },
  meta: { color: colors.textMuted, marginTop: 2, fontSize: 12 },
});
