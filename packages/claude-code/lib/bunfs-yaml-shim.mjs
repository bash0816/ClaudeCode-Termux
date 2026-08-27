function parseScalar(value) {
  const text = String(value ?? '').trim();
  if (text === '') return '';
  if (text === 'true') return true;
  if (text === 'false') return false;
  if (text === 'null' || text === '~') return null;
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(text)) return Number(text);
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

function parseInlineArray(value) {
  const inner = String(value ?? '').trim().slice(1, -1).trim();
  if (inner === '') return [];
  const items = [];
  let current = '';
  let quote = null;

  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
    if (quote) {
      if (ch === quote && inner[i - 1] !== '\\') quote = null;
      current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      items.push(parseScalar(current));
      current = '';
      continue;
    }
    current += ch;
  }

  if (current !== '') items.push(parseScalar(current));
  return items;
}

export function yamlParse(text) {
  const source = String(text ?? '');
  const result = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1).trim();
    if (!key) continue;
    result[key] = rawValue.startsWith('[') && rawValue.endsWith(']')
      ? parseInlineArray(rawValue)
      : parseScalar(rawValue);
  }
  return result;
}

export function yamlStringify(value) {
  if (!value || typeof value !== 'object') return String(value ?? '');
  const lines = [];
  for (const [key, raw] of Object.entries(value)) {
    if (Array.isArray(raw)) {
      lines.push(`${key}: [${raw.map(item => JSON.stringify(String(item))).join(', ')}]`);
    } else if (raw === null) {
      lines.push(`${key}: null`);
    } else if (typeof raw === 'string') {
      lines.push(`${key}: ${JSON.stringify(raw)}`);
    } else {
      lines.push(`${key}: ${String(raw)}`);
    }
  }
  return lines.join('\n');
}

export function createYamlShim() {
  const yaml = {
    parse: yamlParse,
    stringify: yamlStringify,
  };
  yaml.YAML = yaml;
  yaml.default = yaml;
  return yaml;
}
