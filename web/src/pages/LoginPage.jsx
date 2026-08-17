import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { Button, ErrorText, Field } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await login(email.trim(), password);
    setLoading(false);
    if (result.ok) navigate('/');
    else setError(result.error);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>PO/Inventory Sync</h1>
        <p className="subtitle">Normalize supplier data, push it to your POS.</p>
        <ErrorText text={error} />
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        </Field>
        <Field label="Password">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" loading={loading} disabled={!email || !password} style={{ width: '100%' }}>
          Log in
        </Button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/register">Create a new business account</Link>
        </p>
      </form>
    </div>
  );
}
