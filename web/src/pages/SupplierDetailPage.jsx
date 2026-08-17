import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, ErrorText } from '../components/ui';
import { INTERNAL_FIELD_LABELS, jobStatusTone, formatDateTime } from '../utils';

const INTERNAL_FIELDS = Object.keys(INTERNAL_FIELD_LABELS);

export default function SupplierDetailPage() {
  const { id } = useParams();
  const [supplier, setSupplier] = useState(null);
  const [mappingRows, setMappingRows] = useState([]); // [{header, field}]
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    client
      .get(`/suppliers/${id}`)
      .then(({ data }) => {
        setSupplier(data);
        if (data.fieldMapping) {
          setMappingRows(Object.entries(data.fieldMapping.mapping).map(([header, field]) => ({ header, field })));
        }
      })
      .catch((err) => setError(apiErrorMessage(err)));
    client
      .get('/import-jobs', { params: { supplierId: id } })
      .then(({ data }) => setJobs(data))
      .catch(() => {});
  }

  useEffect(load, [id]);

  function updateRow(i, field, value) {
    setMappingRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }
  function addRow() {
    setMappingRows((prev) => [...prev, { header: '', field: 'name' }]);
  }
  function removeRow(i) {
    setMappingRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function saveMapping() {
    setError('');
    setSaving(true);
    try {
      const mapping = {};
      for (const row of mappingRows) {
        if (row.header) mapping[row.header] = row.field;
      }
      await client.put(`/suppliers/${id}/mapping`, { mapping });
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!supplier) return <ErrorText text={error} />;

  return (
    <div>
      <h1>{supplier.name}</h1>
      <ErrorText text={error} />

      <Card
        title="Saved column mapping"
        actions={
          <Link to={`/upload?supplierId=${id}`} className="btn secondary small">
            Upload a file
          </Link>
        }
      >
        <p className="help-text">
          Applied automatically the next time you upload a file from this supplier, if the headers still match.
        </p>
        {mappingRows.map((row, i) => (
          <div className="row" key={i} style={{ marginBottom: 8, alignItems: 'center' }}>
            <input
              className="input"
              placeholder="Incoming column header, e.g. Item#"
              value={row.header}
              onChange={(e) => updateRow(i, 'header', e.target.value)}
            />
            <select value={row.field} onChange={(e) => updateRow(i, 'field', e.target.value)}>
              {INTERNAL_FIELDS.map((f) => (
                <option key={f} value={f}>
                  {INTERNAL_FIELD_LABELS[f]}
                </option>
              ))}
            </select>
            <button className="btn danger small" style={{ flex: '0 0 auto' }} onClick={() => removeRow(i)}>
              Remove
            </button>
          </div>
        ))}
        <Button variant="secondary" onClick={addRow} style={{ marginRight: 8 }}>
          + Add mapping
        </Button>
        <Button onClick={saveMapping} loading={saving}>
          Save mapping
        </Button>
      </Card>

      <Card title="Import history">
        {jobs.length === 0 ? (
          <p className="help-text">No imports from this supplier yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>File</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/import-jobs/${job.id}`}>{job.originalFileName}</Link>
                  </td>
                  <td>
                    <Badge text={job.status.replace('_', ' ')} tone={jobStatusTone(job.status)} />
                  </td>
                  <td>{formatDateTime(job.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
