import { DateTime } from 'luxon';

export function formatTime(isoString) {
  return DateTime.fromISO(isoString).toFormat('h:mm a');
}