export const WORKFLOW_TIMEZONE = 'Asia/Kolkata';

export const formatWorkflowDateTime = (value, fallback = '-') => {
  if (!value) return fallback;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return new Intl.DateTimeFormat('en-IN', {
    timeZone: WORKFLOW_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(parsed);
};
