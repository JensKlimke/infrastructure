import { readFileSync } from 'fs';
import { join } from 'path';

export function renderTemplate(templateName: string, data: Record<string, string> = {}): string {
  const templatePath = join(__dirname, '../../views', `${templateName}.html`);
  let template = readFileSync(templatePath, 'utf-8');

  // Replace placeholders with data
  Object.entries(data).forEach(([key, value]) => {
    template = template.replace(new RegExp(`{{${key}}}`, 'g'), value);
  });

  return template;
}
