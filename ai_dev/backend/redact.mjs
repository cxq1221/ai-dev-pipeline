export function redact(value) {
  let text = String(value);
  for (const key of [process.env.DEEPSEEK_API_KEY, process.env.DATABASE_URL])
    if (key) text = text.split(key).join("[REDACTED]");
  return text;
}
