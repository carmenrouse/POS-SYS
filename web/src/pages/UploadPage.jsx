import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { Button, Card, ErrorText, Field } from '../components/ui';
import { INTERNAL_FIELD_LABELS } from '../utils';

const INTERNAL_FIELDS = Object.keys(INTERNAL_FIELD_LABELS);

function confidenceColor(score) {
  if (score >= 0.9) return '#15803d';
  if (score >= 0.6) return '#b45309';
  return '#b91c1c';
}

export default function UploadPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState(searchParams.get('supplierId') || '');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  const [uploadResult, setUploadResult] = useState(null); // { importJobId, headers, previewRows, ... }
  const [mapping, setMapping] = useState({}); // header -> internalField|''
  const [saveAsDefault, setSaveAsDefault] = useState(true);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    client.get('/suppliers').then(({ data }) => setSuppliers(data));
  }, []);

  async function onUpload(e) {
    e.preventDefault();
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (supplierId) formData.append('supplierId', supplierId);
      const { data } = await client.post('/import-jobs/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setUploadResult(data);
      setMapping(Object.fromEntries(Object.entries(data.suggestedMapping).map(([h, f]) => [h, f || ''])));
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  async function onConfirm() {
    setError('');
    setConfirming(true);
    try {
      const cleanMapping = {};
      for (const [header, field] of Object.entries(mapping)) {
        if (field) cleanMapping[header] = field;
      }
      await client.post(`/import-jobs/${uploadResult.importJobId}/confirm-mapping`, {
        mapping: cleanMapping,
        saveAsSupplierDefault: saveAsDefault && !!supplierId,
      });
      navigate(`/import-jobs/${uploadResult.importJobId}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setConfirming(false);
    }
  }

  const requiredMapped = ['sku', 'name', 'quantity', 'unitCost'].every((f) => Object.values(mapping).includes(f));

  if (uploadResult) {
    return (
      <div>
        <h1>Map columns</h1>
        <ErrorText text={error} />
        {uploadResult.appliedSavedMapping && (
          <p className="help-text">Applied this supplier's saved mapping — review and adjust if the file format changed.</p>
        )}
        <Card title={`${uploadResult.rowCount} rows found`}>
          <table className="mapping-table">
            <thead>
              <tr>
                <th>Incoming column</th>
                <th>Sample value</th>
                <th>Maps to</th>
              </tr>
            </thead>
            <tbody>
              {uploadResult.headers.map((header) => (
                <tr key={header}>
                  <td>{header}</td>
                  <td className="help-text">{uploadResult.previewRows[0]?.[uploadResult.headers.indexOf(header)] || '—'}</td>
                  <td>
                    <span
                      className="confidence-dot"
                      style={{ background: confidenceColor(uploadResult.confidence[header] || 0) }}
                    />
                    <select
                      value={mapping[header] || ''}
                      onChange={(e) => setMapping((prev) => ({ ...prev, [header]: e.target.value }))}
                    >
                      <option value="">-- Ignore this column --</option>
                      {INTERNAL_FIELDS.map((f) => (
                        <option key={f} value={f}>
                          {INTERNAL_FIELD_LABELS[f]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!requiredMapped && <p className="error-text" style={{ marginTop: 12 }}>Map SKU, product name, quantity, and unit cost before continuing.</p>}
        </Card>

        {supplierId && (
          <Card>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
              <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
              Save this mapping as the default for this supplier
            </label>
          </Card>
        )}

        <Button onClick={onConfirm} loading={confirming} disabled={!requiredMapped}>
          Confirm mapping &amp; process rows
        </Button>
      </div>
    );
  }

  return (
    <div>
      <h1>Upload a supplier file</h1>
      <ErrorText text={error} />
      <Card>
        <form onSubmit={onUpload}>
          <Field label="Supplier (optional — enables saved mapping)">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">No supplier / one-off file</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="CSV or XLSX file">
            <input type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files[0])} />
          </Field>
          <Button type="submit" loading={uploading} disabled={!file}>
            Upload &amp; suggest mapping
          </Button>
        </form>
      </Card>
    </div>
  );
}
