import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Button, Card, ErrorText, Field } from '../components/ui';

export default function SuppliersPage() {
  const { hasRole } = useAuth();
  const [suppliers, setSuppliers] = useState([]);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function load() {
    client
      .get('/suppliers')
      .then(({ data }) => setSuppliers(data))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  async function onCreate(e) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      await client.post('/suppliers', { name, email: email || undefined, phone: phone || undefined });
      setName('');
      setEmail('');
      setPhone('');
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1>Suppliers</h1>
      <ErrorText text={error} />

      {hasRole('MANAGER') && (
        <Card title="Add a supplier">
          <form onSubmit={onCreate}>
            <div className="row">
              <Field label="Name">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} required />
              </Field>
              <Field label="Email">
                <input className="input" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label="Phone">
                <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} />
              </Field>
            </div>
            <Button type="submit" loading={saving} disabled={!name}>
              Add supplier
            </Button>
          </form>
        </Card>
      )}

      <Card title="All suppliers">
        {suppliers.length === 0 ? (
          <p className="help-text">No suppliers yet.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact</th>
                <th>Saved mapping</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id}>
                  <td>{s.name}</td>
                  <td>{s.email || s.phone || '—'}</td>
                  <td>{s.fieldMapping ? `${Object.keys(s.fieldMapping.mapping).length} columns` : 'None yet'}</td>
                  <td>
                    <Link to={`/suppliers/${s.id}`}>Manage</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
