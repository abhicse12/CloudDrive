/**
 * Shows an API error on the form fields it belongs to.
 *
 * The API reports field problems as `details: [{ field, message }]` (validation) or
 * via known error codes (e.g. EMAIL_TAKEN). Errors for fields that exist in this form
 * are attached to them with React Hook Form's setError; everything else is returned
 * as a message for a form-level <Alert>.
 *
 * @param {object} apiError       { status, code, message, details } from toApiError()
 * @param {Function} setError     React Hook Form's setError
 * @param {object} options
 * @param {string[]} options.fields     field names present in this form
 * @param {Record<string,string>} [options.codeToField]  e.g. { EMAIL_TAKEN: 'email' }
 * @returns {string|null} message for the form-level alert, or null if fully handled
 */
export function applyApiError(apiError, setError, { fields, codeToField = {} }) {
  const field = codeToField[apiError.code];
  if (field) {
    setError(field, { type: 'server', message: apiError.message }, { shouldFocus: true });
    return null;
  }

  const fieldDetails = (apiError.details ?? []).filter((detail) => fields.includes(detail.field));
  fieldDetails.forEach((detail, index) =>
    setError(
      detail.field,
      { type: 'server', message: detail.message },
      { shouldFocus: index === 0 },
    ),
  );

  if (fieldDetails.length > 0 && fieldDetails.length === (apiError.details ?? []).length) {
    return null;
  }
  return apiError.message;
}
