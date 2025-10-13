import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Escape HTML to prevent XSS attacks
 */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function renderTemplate(templateName: string, data: Record<string, string> = {}): string {
  const templatePath = join(__dirname, '../../views', `${templateName}.html`);
  let template = readFileSync(templatePath, 'utf-8');

  // Replace placeholders with data
  // Keys ending with _RAW are not escaped (use with caution!)
  Object.entries(data).forEach(([key, value]) => {
    const shouldEscape = !key.endsWith('_RAW');
    const actualKey = key.endsWith('_RAW') ? key.slice(0, -4) : key;
    const safeValue = shouldEscape ? escapeHtml(value) : value;
    template = template.replace(new RegExp(`{{${actualKey}}}`, 'g'), safeValue);
  });

  return template;
}
