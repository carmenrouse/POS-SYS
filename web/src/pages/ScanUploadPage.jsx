import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { Button, Card, ErrorText, Field } from '../components/ui';

export default function ScanUploadPage() {
  const navigate = useNavigate();
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState('');
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    client.get('/suppliers').then(({ data }) => setSuppliers(data));
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (supplierId) formData.append('supplierId', supplierId);
      const { data } = await client.post('/scan/purchase-order', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      navigate(`/import-jobs/${data.id}`);
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <h1>Import a scanned PO or invoice</h1>
      <p className="help-text">
        Upload a photo or PDF of a paper purchase order or supplier invoice. We'll run OCR to extract the line
        items, then take you straight to the same review screen used for CSV imports — check every line before
        approving anything.
      </p>
      <ErrorText text={error} />
      <Card>
        <form onSubmit={onSubmit}>
          <Field label="Supplier (optional — we'll try to match it from the document if not set)">
            <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">Try to detect automatically</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Image or PDF">
            <input type="file" accept="image/jpeg,image/png,image/heic,application/pdf" onChange={(e) => setFile(e.target.files[0])} />
          </Field>
          <Button type="submit" loading={uploading} disabled={!file}>
            Run OCR &amp; review
          </Button>
        </form>
      </Card>
    </div>
  );
}
