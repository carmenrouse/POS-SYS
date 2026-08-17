import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import client, { apiErrorMessage, UPLOADS_BASE_URL } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, ErrorText, Input, Screen } from '../components/ui';
import PickerModal from '../components/PickerModal';
import { colors, spacing } from '../theme';
import { formatDateTime, jobStatusTone, rowStatusTone } from '../utils/status';

function RowCard({ row, canEdit, onSave, onApprove }) {
  const [form, setForm] = useState({
    sku: row.mappedData.sku || '',
    name: row.mappedData.name || '',
    quantity: String(row.mappedData.quantity ?? ''),
    unitCost: String(row.mappedData.unitCost ?? ''),
    category: row.mappedData.category || '',
  });
  const [saving, setSaving] = useState(false);
  const dirty =
    form.sku !== (row.mappedData.sku || '') ||
    form.name !== (row.mappedData.name || '') ||
    form.quantity !== String(row.mappedData.quantity ?? '') ||
    form.unitCost !== String(row.mappedData.unitCost ?? '') ||
    form.category !== (row.mappedData.category || '');

  async function save() {
    setSaving(true);
    await onSave(row.id, form);
    setSaving(false);
  }

  return (
    <Card>
      <View style={styles.rowHeader}>
        <Badge text={row.validationStatus.replace('_', ' ')} tone={rowStatusTone(row.validationStatus)} />
        <View style={styles.approveRow}>
          <Text style={styles.approveLabel}>Approved</Text>
          <Switch
            value={row.approved}
            disabled={!canEdit || (row.validationStatus === 'ERROR' && !row.approved)}
            onValueChange={(v) => onApprove(row.id, v)}
          />
        </View>
      </View>
      {row.validationMessages.length > 0 && (
        <View style={{ marginBottom: spacing.sm }}>
          {row.validationMessages.map((m, i) => (
            <Text key={i} style={styles.messageText}>
              • {m}
            </Text>
          ))}
        </View>
      )}

      <Input label="Name" value={form.name} editable={canEdit} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} />
      <View style={styles.fieldRow}>
        <Input label="SKU" style={{ flex: 1 }} value={form.sku} editable={canEdit} onChangeText={(v) => setForm((f) => ({ ...f, sku: v }))} />
        <View style={{ width: spacing.sm }} />
        <Input
          label="Category"
          style={{ flex: 1 }}
          value={form.category}
          editable={canEdit}
          onChangeText={(v) => setForm((f) => ({ ...f, category: v }))}
        />
      </View>
      <View style={styles.fieldRow}>
        <Input
          label="Quantity"
          style={{ flex: 1 }}
          keyboardType="number-pad"
          value={form.quantity}
          editable={canEdit}
          onChangeText={(v) => setForm((f) => ({ ...f, quantity: v }))}
        />
        <View style={{ width: spacing.sm }} />
        <Input
          label="Unit cost"
          style={{ flex: 1 }}
          keyboardType="decimal-pad"
          value={form.unitCost}
          editable={canEdit}
          onChangeText={(v) => setForm((f) => ({ ...f, unitCost: v }))}
        />
      </View>

      {row.matchedProduct ? (
        <Text style={styles.matchText}>
          Matched: {row.matchedProduct.name} ({Math.round(row.confidence * 100)}% confidence)
        </Text>
      ) : (
        <Text style={styles.noMatchText}>No product match — will need confirmation to create as new</Text>
      )}

      {canEdit && dirty && <Button title="Save changes" variant="secondary" onPress={save} loading={saving} style={{ marginTop: spacing.sm }} />}
    </Card>
  );
}

export default function ImportReviewScreen({ route }) {
  const { jobId } = route.params;
  const { hasRole } = useAuth();
  const canEdit = hasRole('MANAGER');

  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
  const [connections, setConnections] = useState([]);
  const [connectionPickerOpen, setConnectionPickerOpen] = useState(false);
  const [selectedConnection, setSelectedConnection] = useState(null);
  const [confirmedRowIds, setConfirmedRowIds] = useState(new Set());
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);
  const [pushLog, setPushLog] = useState([]);

  const load = useCallback(async () => {
    try {
      const { data } = await client.get(`/import-jobs/${jobId}`);
      setJob(data);
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }, [jobId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useEffect(() => {
    client.get('/suppliers').then(({ data }) => setSuppliers(data)).catch(() => {});
    client
      .get('/pos-connections')
      .then(({ data }) => setConnections(data.filter((c) => c.status === 'CONNECTED')))
      .catch(() => {});
    client
      .get(`/import-jobs/${jobId}/push-log`)
      .then(({ data }) => setPushLog(data))
      .catch(() => {});
  }, [jobId]);

  async function saveRow(rowId, form) {
    setError('');
    try {
      await client.patch(`/import-jobs/${jobId}/rows/${rowId}`, form);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function approveRow(rowId, approved) {
    try {
      await client.post(`/import-jobs/${jobId}/rows/${rowId}/approve`, { approved });
      load();
    } catch (err) {
      Alert.alert('Could not update approval', apiErrorMessage(err));
    }
  }

  async function approveAllClean() {
    setBusy(true);
    try {
      await client.post(`/import-jobs/${jobId}/approve-all-clean`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function approveJob() {
    setBusy(true);
    setError('');
    try {
      await client.post(`/import-jobs/${jobId}/approve`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function setSupplier(supplier) {
    setSupplierPickerOpen(false);
    try {
      await client.patch(`/import-jobs/${jobId}`, { supplierId: supplier.id });
      load();
    } catch (err) {
      Alert.alert('Could not set supplier', apiErrorMessage(err));
    }
  }

  function toggleConfirmedRow(rowId) {
    setConfirmedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  async function pushToPos() {
    if (!selectedConnection) return;
    setPushing(true);
    setError('');
    setPushResult(null);
    try {
      const { data } = await client.post(`/import-jobs/${jobId}/push`, {
        posConnectionId: selectedConnection.id,
        confirmedNewProductRowIds: [...confirmedRowIds],
      });
      setPushResult(data.results);
      load();
      client.get(`/import-jobs/${jobId}/push-log`).then(({ data: logs }) => setPushLog(logs));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPushing(false);
    }
  }

  if (!job) {
    return (
      <Screen style={{ padding: spacing.md }}>
        <ErrorText text={error} />
      </Screen>
    );
  }

  const approvedCount = job.rows.filter((r) => r.approved).length;
  const cleanCount = job.rows.filter((r) => r.validationStatus === 'CLEAN').length;
  const unmatchedApproved = job.rows.filter((r) => r.approved && !(r.matchedProduct && r.matchedProduct.externalId));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: spacing.md }}>
        <ErrorText text={error} />

        <Card>
          <View style={styles.headerRow}>
            <Text style={styles.title}>{job.supplier?.name || 'No supplier'}</Text>
            <Badge text={job.status.replace('_', ' ')} tone={jobStatusTone(job.status)} />
          </View>
          <Text style={styles.meta}>
            {job.sourceType.replace('_', ' ')} · {formatDateTime(job.createdAt)}
          </Text>
          <Text style={styles.meta}>
            {approvedCount} approved / {job.rows.length} total ({cleanCount} clean)
          </Text>
          {!job.supplierId && canEdit && (
            <Button title="Pick a supplier" variant="secondary" onPress={() => setSupplierPickerOpen(true)} style={{ marginTop: spacing.sm }} />
          )}
        </Card>

        {(job.sourceType === 'SCAN_IMAGE' || job.sourceType === 'SCAN_PDF') && job.originalFileUrl && job.sourceType === 'SCAN_IMAGE' && (
          <Card>
            <Text style={styles.sectionTitle}>Scanned document</Text>
            <Image source={{ uri: `${UPLOADS_BASE_URL}${job.originalFileUrl}` }} style={styles.scanImage} resizeMode="contain" />
          </Card>
        )}

        {canEdit && job.status === 'NEEDS_REVIEW' && (
          <Card>
            <Button title={`Approve all clean rows (${cleanCount})`} variant="secondary" onPress={approveAllClean} loading={busy} style={{ marginBottom: spacing.sm }} />
            <Button title="Approve job" onPress={approveJob} loading={busy} />
          </Card>
        )}

        {['APPROVED', 'PUSHED', 'PARTIALLY_PUSHED'].includes(job.status) && (
          <Card>
            <Text style={styles.sectionTitle}>Push to POS</Text>
            {connections.length === 0 ? (
              <Text style={styles.helpText}>No connected POS — connect one from the web app settings.</Text>
            ) : (
              <>
                <Button
                  title={selectedConnection ? selectedConnection.platform : 'Choose a destination'}
                  variant="secondary"
                  onPress={() => setConnectionPickerOpen(true)}
                  style={{ marginBottom: spacing.sm }}
                />
                {unmatchedApproved.length > 0 && (
                  <View style={{ marginBottom: spacing.sm }}>
                    <Text style={styles.helpText}>Confirm which unmatched rows should become new products:</Text>
                    {unmatchedApproved.map((row) => (
                      <View key={row.id} style={styles.confirmRow}>
                        <Switch value={confirmedRowIds.has(row.id)} onValueChange={() => toggleConfirmedRow(row.id)} />
                        <Text style={styles.confirmLabel}>{row.mappedData.name}</Text>
                      </View>
                    ))}
                  </View>
                )}
                <Button title={`Push ${approvedCount} approved rows`} onPress={pushToPos} loading={pushing} disabled={!selectedConnection} />
                {pushResult && (
                  <View style={{ marginTop: spacing.sm }}>
                    {pushResult.map((r) => (
                      <Text key={r.importRowId} style={{ color: r.success ? colors.success : colors.danger, fontSize: 13 }}>
                        {r.action}: {r.success ? 'OK' : r.error}
                      </Text>
                    ))}
                  </View>
                )}
              </>
            )}
          </Card>
        )}

        {pushLog.length > 0 && (
          <Card>
            <Text style={styles.sectionTitle}>Push history</Text>
            {pushLog.map((log) => (
              <View key={log.id} style={styles.logRow}>
                <Text style={{ color: log.success ? colors.success : colors.danger, fontSize: 13 }}>
                  {log.action.replace('_', ' ')} — {log.success ? 'OK' : log.errorMessage}
                </Text>
                <Text style={styles.logMeta}>
                  {log.posConnection.platform} · {log.pushedBy.name} · {formatDateTime(log.createdAt)}
                </Text>
              </View>
            ))}
          </Card>
        )}

        <Text style={styles.sectionTitle}>Rows</Text>
        {job.rows.map((row) => (
          <RowCard key={row.id} row={row} canEdit={canEdit} onSave={saveRow} onApprove={approveRow} />
        ))}
      </ScrollView>

      <PickerModal
        visible={supplierPickerOpen}
        title="Choose supplier"
        items={suppliers}
        onSelect={setSupplier}
        onClose={() => setSupplierPickerOpen(false)}
      />
      <PickerModal
        visible={connectionPickerOpen}
        title="Choose POS destination"
        items={connections}
        labelKey="platform"
        onSelect={(c) => {
          setSelectedConnection(c);
          setConnectionPickerOpen(false);
        }}
        onClose={() => setConnectionPickerOpen(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: colors.text },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  sectionTitle: { fontWeight: '700', fontSize: 15, marginBottom: spacing.sm },
  helpText: { color: colors.textMuted, fontSize: 13, marginBottom: spacing.sm },
  scanImage: { width: '100%', height: 260, borderRadius: 8, backgroundColor: '#eee' },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.sm },
  approveRow: { flexDirection: 'row', alignItems: 'center' },
  approveLabel: { marginRight: spacing.xs, color: colors.textMuted, fontSize: 12 },
  messageText: { color: colors.textMuted, fontSize: 12 },
  fieldRow: { flexDirection: 'row' },
  matchText: { color: colors.success, fontSize: 12, marginTop: spacing.xs },
  noMatchText: { color: colors.warning, fontSize: 12, marginTop: spacing.xs },
  confirmRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.xs },
  confirmLabel: { marginLeft: spacing.sm, color: colors.text },
  logRow: { paddingVertical: spacing.xs, borderBottomWidth: 1, borderBottomColor: colors.border },
  logMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
