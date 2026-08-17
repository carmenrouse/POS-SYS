import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { useAuth } from '../context/AuthContext';
import { Button, ErrorText, Field } from '../components/ui';

export default function RegisterBusinessPage() {
  const { registerBusiness } = useAuth();
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const canSubmit = businessName && ownerName && email && password.length >= 8;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const result = await registerBusiness({ businessName, ownerName, email: email.trim(), password });
    setLoading(false);
    if (result.ok) navigate('/');
    else setError(result.error);
  }

  return (
    <div className="auth-shell">
      <form className="auth-card" onSubmit={onSubmit}>
        <h1>Set up your business</h1>
        <p className="subtitle">You'll be the Owner and can add staff later.</p>
        <ErrorText text={error} />
        <Field label="Business name">
          <input className="input" value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
        </Field>
        <Field label="Your name">
          <input className="input" value={ownerName} onChange={(e) => setOwnerName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
        <Field label="Password (min 8 characters)">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" loading={loading} disabled={!canSubmit} style={{ width: '100%' }}>
          Create business
        </Button>
        <p style={{ textAlign: 'center', marginTop: 16 }}>
          <Link to="/login">Back to login</Link>
        </p>
      </form>
    </div>
  );
}
