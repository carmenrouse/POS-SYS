export function jobStatusTone(status) {
  switch (status) {
    case 'PROCESSING':
      return 'default';
    case 'NEEDS_REVIEW':
      return 'warning';
    case 'APPROVED':
      return 'info';
    case 'PUSHED':
      return 'success';
    case 'PARTIALLY_PUSHED':
      return 'warning';
    case 'FAILED':
      return 'danger';
    default:
      return 'default';
  }
}

export function rowStatusTone(status) {
  if (status === 'CLEAN') return 'success';
  if (status === 'NEEDS_REVIEW') return 'warning';
  if (status === 'ERROR') return 'danger';
  return 'default';
}

export function formatMoney(value) {
  if (value === null || value === undefined || value === '') return '—';
  return `$${Number(value).toFixed(2)}`;
}

export function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value).toLocaleString();
}
