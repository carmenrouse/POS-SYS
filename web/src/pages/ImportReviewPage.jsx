import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge, Button, Card, ErrorText, Field } from '../components/ui';
import { jobStatusTone, rowStatusTone, formatDateTime, formatMoney } from '../utils';

function RowEditor({ row, canEdit, onSave, onApprove }) {
  const [form, setForm] = useState({
    sku: row.mappedData.sku || '',
    name: row.mappedData.name || '',
    description: row.mappedData.description || '',
    quantity: row.mappedData.quantity ?? '',
    unitCost: row.mappedData.unitCost ?? '',
    category: row.mappedData.category || '',
  });
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify({
    sku: row.mappedData.sku || '',
    name: row.mappedData.name || '',
    description: row.mappedData.description || '',
    quantity: row.mappedData.quantity ?? '',
    unitCost: row.mappedData.unitCost ?? '',
    category: row.mappedData.category || '',
  });

  async function save() {
    setSaving(true);
    await onSave(row.id, form);
    setSaving(false);
  }

  return (
    <tr className={row.validationStatus === 'ERROR' ? 'row-error' : row.validationStatus === 'NEEDS_REVIEW' ? 'row-needs-review' : ''}>
      <td>
        <Badge text={row.validationStatus.replace('_', ' ')} tone={rowStatusTone(row.validationStatus)} />
        {row.validationMessages.length > 0 && (
          <ul style={{ margin: '6px 0 0', paddingLeft: 16, fontSize: 12, color: '#6b7280' }}>
            {row.validationMessages.map((m, i) => (
              <li key={i}>{m}</li>
            ))}
          </ul>
        )}
      </td>
      <td>
        <input className="input" disabled={!canEdit} value={form.sku} onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))} style={{ minWidth: 90 }} />
      </td>
      <td>
        <input className="input" disabled={!canEdit} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} style={{ minWidth: 140 }} />
      </td>
      <td>
        <input className="input" disabled={!canEdit} value={form.quantity} onChange={(e) => setForm((f) => ({ ...f, quantity: e.target.value }))} style={{ width: 70 }} />
      </td>
      <td>
        <input className="input" disabled={!canEdit} value={form.unitCost} onChange={(e) => setForm((f) => ({ ...f, unitCost: e.target.value }))} style={{ width: 80 }} />
      </td>
      <td>
        <input className="input" disabled={!canEdit} value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} style={{ width: 100 }} />
      </td>
      <td style={{ fontSize: 12 }}>
        {row.matchedProduct ? (
          <span>
            {row.matchedProduct.name} <span className="help-text">({Math.round(row.confidence * 100)}%)</span>
          </span>
        ) : (
          <span className="help-text">No match — will create new</span>
        )}
      </td>
      <td>
        {canEdit && dirty && (
          <Button variant="secondary" onClick={save} loading={saving} style={{ marginBottom: 4 }}>
            Save
          </Button>
        )}
        <br />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 400, fontSize: 12 }}>
          <input
            type="checkbox"
            checked={row.approved}
            disabled={!canEdit || (row.validationStatus === 'ERROR' && !row.approved)}
            onChange={(e) => onApprove(row.id, e.target.checked)}
          />
          Approved
        </label>
      </td>
    </tr>
  );
}

export default function ImportReviewPage() {
  const { id } = useParams();
  const { hasRole } = useAuth();
  const canEdit = hasRole('MANAGER');
  const [job, setJob] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [connections, setConnections] = useState([]);
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [confirmedRowIds, setConfirmedRowIds] = useState(new Set());
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState(null);

  function load() {
    client
      .get(`/import-jobs/${id}`)
      .then(({ data }) => setJob(data))
      .catch((err) => setError(apiErrorMessage(err)));
  }
  useEffect(load, [id]);

  useEffect(() => {
    client
      .get('/pos-connections')
      .then(({ data }) => {
        const connected = data.filter((c) => c.status === 'CONNECTED');
        setConnections(connected);
        if (connected.length > 0) setSelectedConnectionId(connected[0].id);
      })
      .catch(() => {});
  }, []);

  async function saveRow(rowId, form) {
    setError('');
    try {
      await client.patch(`/import-jobs/${id}/rows/${rowId}`, form);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function approveRow(rowId, approved) {
    setError('');
    try {
      await client.post(`/import-jobs/${id}/rows/${rowId}/approve`, { approved });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    }
  }

  async function approveAllClean() {
    setBusy(true);
    try {
      await client.post(`/import-jobs/${id}/approve-all-clean`);
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
      await client.post(`/import-jobs/${id}/approve`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function exportFile(format) {
    setError('');
    try {
      // A plain link/window.open would issue an unauthenticated browser
      // navigation with no Authorization header, which the API rejects —
      // fetch it through the authenticated client and save the blob instead.
      const response = await client.get(`/import-jobs/${id}/export`, {
        params: { format },
        responseType: 'blob',
      });
      const blobUrl = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `import-${id}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      // With responseType: 'blob', error bodies arrive as a Blob too — parse
      // it back to JSON so the real API error message surfaces, not a generic one.
      if (err?.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          setError(JSON.parse(text).error || apiErrorMessage(err));
          return;
        } catch {
          // fall through to generic handling below
        }
      }
      setError(apiErrorMessage(err));
    }
  }

  function toggleConfirmedRow(rowId, checked) {
    setConfirmedRowIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(rowId);
      else next.delete(rowId);
      return next;
    });
  }

  async function pushToPos() {
    setError('');
    setPushing(true);
    setPushResult(null);
    try {
      const { data } = await client.post(`/import-jobs/${id}/push`, {
        posConnectionId: selectedConnectionId,
        confirmedNewProductRowIds: [...confirmedRowIds],
      });
      setPushResult(data.results);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPushing(false);
    }
  }

  if (!job) return <ErrorText text={error} />;

  const approvedCount = job.rows.filter((r) => r.approved).length;
  const cleanCount = job.rows.filter((r) => r.validationStatus === 'CLEAN').length;
  const unmatchedApprovedRows = job.rows.filter((r) => r.approved && !(r.matchedProduct && r.matchedProduct.externalId));

  return (
    <div>
      <h1>{job.originalFileName || `${job.sourceType} import`}</h1>
      <ErrorText text={error} />

      <Card>
        <div className="row">
          <div>
            <span className="help-text">Supplier</span>
            <div>{job.supplier?.name || '—'}</div>
          </div>
          <div>
            <span className="help-text">Status</span>
            <div>
              <Badge text={job.status.replace('_', ' ')} tone={jobStatusTone(job.status)} />
            </div>
          </div>
          <div>
            <span className="help-text">Uploaded</span>
            <div>{formatDateTime(job.createdAt)}</div>
          </div>
          <div>
            <span className="help-text">Rows</span>
            <div>
              {approvedCount} approved / {job.rows.length} total ({cleanCount} clean)
            </div>
          </div>
        </div>
      </Card>

      {canEdit && job.status === 'NEEDS_REVIEW' && (
        <Card>
          <Button variant="secondary" onClick={approveAllClean} loading={busy} style={{ marginRight: 8 }}>
            Approve all clean rows ({cleanCount})
          </Button>
          <Button onClick={approveJob} loading={busy}>
            Approve job
          </Button>
        </Card>
      )}

      {(job.status === 'APPROVED' || job.status === 'PUSHED' || job.status === 'PARTIALLY_PUSHED') && (
        <Card title="Output">
          <Button variant="secondary" onClick={() => exportFile('csv')} style={{ marginRight: 8 }}>
            Export approved rows (CSV)
          </Button>
          <Button variant="secondary" onClick={() => exportFile('xlsx')}>
            Export approved rows (XLSX)
          </Button>

          {connections.length === 0 ? (
            <p className="help-text" style={{ marginTop: 8 }}>
              No connected POS yet — connect one under POS Connections to push directly instead of exporting.
            </p>
          ) : (
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
              <h2 style={{ fontSize: 14 }}>Push to POS</h2>
              <Field label="Destination">
                <select value={selectedConnectionId} onChange={(e) => setSelectedConnectionId(e.target.value)}>
                  {connections.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.platform}
                    </option>
                  ))}
                </select>
              </Field>

              {unmatchedApprovedRows.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <p className="help-text">
                    These approved rows don't match an existing product in this POS. Confirm which ones should be
                    created as new products — unconfirmed rows are skipped.
                  </p>
                  {unmatchedApprovedRows.map((row) => (
                    <label key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, marginBottom: 4 }}>
                      <input
                        type="checkbox"
                        checked={confirmedRowIds.has(row.id)}
                        onChange={(e) => toggleConfirmedRow(row.id, e.target.checked)}
                      />
                      Create "{row.mappedData.name}" ({row.mappedData.sku}) as a new product
                    </label>
                  ))}
                </div>
              )}

              <Button onClick={pushToPos} loading={pushing}>
                Push {approvedCount} approved row{approvedCount === 1 ? '' : 's'}
              </Button>

              {pushResult && (
                <ul style={{ marginTop: 12, fontSize: 13 }}>
                  {pushResult.map((r) => (
                    <li key={r.importRowId} style={{ color: r.success ? 'var(--success)' : 'var(--danger)' }}>
                      {r.action} — {r.success ? 'OK' : r.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>
      )}

      <Card title="Rows">
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Status</th>
                <th>SKU</th>
                <th>Name</th>
                <th>Qty</th>
                <th>Unit cost</th>
                <th>Category</th>
                <th>Product match</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {job.rows.map((row) => (
                <RowEditor key={row.id} row={row} canEdit={canEdit} onSave={saveRow} onApprove={approveRow} />
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
