import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { Badge, Card, ErrorText } from '../components/ui';
import { jobStatusTone, formatDateTime } from '../utils';

export default function DashboardPage() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/import-jobs')
      .then(({ data }) => setJobs(data.slice(0, 5)))
      .catch((err) => setError(apiErrorMessage(err)));
  }, []);

  const needsReviewCount = jobs.filter((j) => j.status === 'NEEDS_REVIEW').length;

  return (
    <div>
      <h1>Welcome, {user?.name}</h1>
      <ErrorText text={error} />

      <div className="row">
        <Card title="Imports needing review">
          <div style={{ fontSize: 28, fontWeight: 800 }}>{needsReviewCount}</div>
        </Card>
        <Card title="Quick actions">
          <Link to="/upload" className="btn" style={{ marginRight: 8 }}>
            Upload a file
          </Link>
          <Link to="/import-jobs" className="btn secondary">
            View all imports
          </Link>
        </Card>
      </div>

      <Card title="Recent import jobs">
        {jobs.length === 0 ? (
          <p className="help-text">No imports yet. Upload a supplier CSV/XLSX to get started.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>File</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>
                    <Link to={`/import-jobs/${job.id}`}>{job.supplier?.name || '—'}</Link>
                  </td>
                  <td>{job.originalFileName}</td>
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
