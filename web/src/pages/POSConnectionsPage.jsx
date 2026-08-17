import React, { useEffect, useState } from 'react';

import client, { apiErrorMessage } from '../api/client';
import { Badge, Button, Card, ErrorText, Field } from '../components/ui';
import { formatDateTime } from '../utils';

const PLATFORMS = ['SQUARE', 'CLOVER', 'SHOPIFY', 'LIGHTSPEED'];

function statusTone(status) {
  if (status === 'CONNECTED') return 'success';
  if (status === 'ERROR') return 'danger';
  return 'default';
}

export default function POSConnectionsPage() {
  const [connections, setConnections] = useState([]);
  const [error, setError] = useState('');
  const [forms, setForms] = useState({}); // platform -> { accessToken, externalLocationId }
  const [busyPlatform, setBusyPlatform] = useState(null);

  function load() {
    client
      .get('/pos-connections')
      .then(({ data }) => setConnections(data))
      .catch((err) => setError(apiErrorMessage(err)));
  }

  useEffect(load, []);

  function byPlatform(platform) {
    return connections.find((c) => c.platform === platform);
  }
  function updateForm(platform, field, value) {
    setForms((prev) => ({ ...prev, [platform]: { ...prev[platform], [field]: value } }));
  }

  async function saveConnection(platform) {
    setError('');
    setBusyPlatform(platform);
    try {
      const form = forms[platform] || {};
      const payload = { accessToken: form.accessToken, externalLocationId: form.externalLocationId };
      if (platform === 'SHOPIFY') payload.config = { shopDomain: form.shopDomain };
      await client.put(`/pos-connections/${platform.toLowerCase()}`, payload);
      setForms((prev) => ({ ...prev, [platform]: {} }));
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyPlatform(null);
    }
  }

  async function testConnection(platform) {
    setError('');
    setBusyPlatform(platform);
    try {
      await client.post(`/pos-connections/${platform.toLowerCase()}/test`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyPlatform(null);
    }
  }

  async function disconnect(platform) {
    setBusyPlatform(platform);
    try {
      await client.delete(`/pos-connections/${platform.toLowerCase()}`);
      load();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusyPlatform(null);
    }
  }

  return (
    <div>
      <h1>POS Connections</h1>
      <p className="help-text">
        Connect the POS platform(s) your business already uses so approved imports can be pushed directly. Without a
        connection, imports still work — you'll just export a corrected file instead.
      </p>
      <ErrorText text={error} />

      {PLATFORMS.map((platform) => {
        const connection = byPlatform(platform);
        const form = forms[platform] || {};
        return (
          <Card
            key={platform}
            title={platform.charAt(0) + platform.slice(1).toLowerCase()}
            actions={connection ? <Badge text={connection.status} tone={statusTone(connection.status)} /> : null}
          >
            {connection?.lastError && <p className="error-text">{connection.lastError}</p>}
            {connection?.lastSyncedAt && (
              <p className="help-text">Last verified {formatDateTime(connection.lastSyncedAt)}</p>
            )}
            <div className="row">
              <Field label="Access token">
                <input
                  className="input"
                  type="password"
                  placeholder={connection?.accessToken ? 'Saved (enter a new value to replace)' : 'Paste access token'}
                  value={form.accessToken || ''}
                  onChange={(e) => updateForm(platform, 'accessToken', e.target.value)}
                />
              </Field>
              <Field label="Location / store ID (optional)">
                <input
                  className="input"
                  value={form.externalLocationId ?? connection?.externalLocationId ?? ''}
                  onChange={(e) => updateForm(platform, 'externalLocationId', e.target.value)}
                />
              </Field>
              {platform === 'SHOPIFY' && (
                <Field label="Shop domain">
                  <input
                    className="input"
                    placeholder="my-store.myshopify.com"
                    value={form.shopDomain ?? connection?.config?.shopDomain ?? ''}
                    onChange={(e) => updateForm(platform, 'shopDomain', e.target.value)}
                  />
                </Field>
              )}
            </div>
            <Button onClick={() => saveConnection(platform)} loading={busyPlatform === platform} style={{ marginRight: 8 }}>
              Save
            </Button>
            {connection && (
              <>
                <Button variant="secondary" onClick={() => testConnection(platform)} loading={busyPlatform === platform} style={{ marginRight: 8 }}>
                  Test connection
                </Button>
                <Button variant="danger" onClick={() => disconnect(platform)} loading={busyPlatform === platform}>
                  Disconnect
                </Button>
              </>
            )}
          </Card>
        );
      })}
    </div>
  );
}
