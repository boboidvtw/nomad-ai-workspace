/**
 * @nomad/core - Prompt Template Variable Parser
 * Governed by Result Pattern & Zero-Exception Protocol.
 */

const { ok, err } = require('../result');

/**
 * @typedef {Object} TemplateVariable
 * @property {string} name
 * @property {string} defaultValue
 */

const VARIABLE_REGEX = /\{\{\s*([a-zA-Z0-9_\u4e00-\u9fa5]+)(?:\s*:\s*([^}]*))?\s*\}\}/g;

/**
 * Extracts all unique variable names and defaults from a prompt template.
 * @param {string} template 
 * @returns {import('../result').UnitResult<TemplateVariable[]>}
 */
function extractVariables(template) {
  if (typeof template !== 'string') {
    return err('CORE_TEMPLATE_INVALID_INPUT_001', 'Template must be a string');
  }

  const variables = [];
  const seen = new Set();
  let match;
  const regex = new RegExp(VARIABLE_REGEX.source, 'g');

  while ((match = regex.exec(template)) !== null) {
    const name = match[1].trim();
    const defaultValue = match[2] !== undefined ? match[2].trim() : '';
    if (!seen.has(name)) {
      seen.add(name);
      variables.push({ name, defaultValue });
    }
  }

  return ok(variables);
}

/**
 * Interpolates values into the template safely.
 * @param {string} template 
 * @param {Record<string, string>} values 
 * @returns {import('../result').UnitResult<{ rendered: string, unreplaced: string[] }>}
 */
function interpolate(template, values = {}) {
  if (typeof template !== 'string') {
    return err('CORE_TEMPLATE_INVALID_INPUT_001', 'Template must be a string');
  }

  /** @type {string[]} */
  const unreplaced = [];
  const rendered = template.replace(new RegExp(VARIABLE_REGEX.source, 'g'), (fullMatch, varName, defaultVal) => {
    const key = varName.trim();
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] !== undefined && values[key] !== '') {
      return String(values[key]);
    }
    if (defaultVal !== undefined && defaultVal !== '') {
      return defaultVal.trim();
    }
    unreplaced.push(key);
    return fullMatch;
  });

  return ok({ rendered, unreplaced });
}

module.exports = {
  extractVariables,
  interpolate
};
