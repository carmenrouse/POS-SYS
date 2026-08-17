import React from 'react';

export function Button({ children, variant, loading, ...props }) {
  return (
    <button className={`btn ${variant || ''}`} disabled={loading || props.disabled} {...props}>
      {loading ? 'Working…' : children}
    </button>
  );
}

export function Field({ label, children }) {
  return (
    <div className="field">
      {label ? <label>{label}</label> : null}
      {children}
    </div>
  );
}

export function ErrorText({ text }) {
  if (!text) return null;
  return <div className="error-text">{text}</div>;
}

export function Badge({ text, tone }) {
  return <span className={`badge ${tone || ''}`}>{text}</span>;
}

export function Card({ title, children, actions }) {
  return (
    <div className="card">
      {(title || actions) && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          {title ? <h2>{title}</h2> : <div />}
          {actions}
        </div>
      )}
      {children}
    </div>
  );
}

export function EmptyState({ text }) {
  return <div className="empty-state">{text}</div>;
}
