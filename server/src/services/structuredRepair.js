import { ScanError } from '../errors.js';

function parseStructuredContent(content) {
  if (typeof content !== 'string' || !content.trim()) {
    throw new ScanError(422, 'INVALID_AI_EDIT_PLAN', 'The model returned no edit plan.');
  }
  const trimmed = content.trim();
  const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  const json = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(json);
  } catch (error) {
    throw new ScanError(422, 'INVALID_AI_EDIT_PLAN', 'The model did not return valid JSON edits.', { cause: error });
  }
}

export function applyStructuredRepairEdits(source, content) {
  const plan = parseStructuredContent(content);
  if (!plan || !Array.isArray(plan.edits) || plan.edits.length < 1 || plan.edits.length > 8) {
    throw new ScanError(422, 'INVALID_AI_EDIT_PLAN', 'The model edit plan must contain between one and eight edits.');
  }
  let result = source;
  for (const edit of plan.edits) {
    if (!edit || typeof edit.find !== 'string' || !edit.find || typeof edit.replace !== 'string') {
      throw new ScanError(422, 'INVALID_AI_EDIT_PLAN', 'Each model edit must contain exact string find and replace values.');
    }
    const first = result.indexOf(edit.find);
    if (first < 0 || first !== result.lastIndexOf(edit.find)) {
      throw new ScanError(422, 'INVALID_AI_EDIT_PLAN', 'Each model edit must match exactly one source fragment.');
    }
    result = `${result.slice(0, first)}${edit.replace}${result.slice(first + edit.find.length)}`;
  }
  return result;
}
