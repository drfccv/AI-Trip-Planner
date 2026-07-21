let checked = false;

export async function ensureSchema() {
  if (checked) return;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL_REQUIRED");
  checked = true;
}
