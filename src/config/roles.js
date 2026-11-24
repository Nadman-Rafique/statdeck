export const TUTOR_EMAILS = [
  "nadmanrafique07@gmail.com"
];

export function isTutorEmail(email) {
  if (!email) return false;
  return TUTOR_EMAILS.some(
    (allowed) => allowed.trim().toLowerCase() === email.trim().toLowerCase()
  );
}