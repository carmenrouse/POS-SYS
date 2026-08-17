import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import client, { apiErrorMessage } from '../api/client';
import { Badge, Card, ErrorText } from '../components/ui';
import { jobStatusTone, formatDateTime } from '../utils';

const STATUSES = ['ALL', 'PROCESSING', 'NEEDS_REVIEW', 'APPROVED', 'PUSHED', 'PARTIALLY_PUSHED', 'FAILED'];

export default function ImportJobsPage() {
  const [jobs, setJobs] = useState([]);
  const [status, setStatus] = useState('ALL');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = status !== 'ALL' ? { status } : {};
    client
      .get('/import-jobs', { params })
      .then(({ data }) => setJobs(data))
      .catch((err) => setError(apiErrorMessage(err)));
  }, [status]);

  return (
    <div>
      <h1>Import Jobs</h1>
      <ErrorText text={error} />

      <div style={{ marginBottom: 16 }}>
        {STATUSES.map((s) => (
          <button
            key={s}
            className={`btn small ${s === status ? '' : 'secondary'}`}
            style={{ marginRight: 8, marginBottom: 8 }}
            onClick={() => setStatus(s)}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      <Card>
        {jobs.length === 0 ? (
          <p className="help-text">No import jobs match this filter.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Supplier</th>
                <th>File</th>
                <th>Source</th>
                <th>Rows</th>
                <th>Status</th>
                <th>Uploaded</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id}>
                  <td>{job.supplier?.name || '—'}</td>
                  <td>
                    <Link to={`/import-jobs/${job.id}`}>{job.originalFileName || job.sourceType}</Link>
                  </td>
                  <td>{job.sourceType}</td>
                  <td>{job._count?.rows ?? '—'}</td>
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
