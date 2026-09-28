export function redact(value) {
  const key = process.env.DEEPSEEK_API_KEY;
  return key ? String(value).split(key).join("[REDACTED]") : String(value);
}
