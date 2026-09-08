/**
 * Copies text, falling back to a hidden textarea where the async clipboard is
 * unavailable — it needs a secure context, and this app is reached over plain
 * HTTP on the office network, where `navigator.clipboard` is simply undefined.
 *
 * Resolves to whether the text actually made it, so the caller can say so
 * rather than claiming a copy that never happened.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission refused or a non-secure context — fall through.
    }
  }

  try {
    const el = document.createElement('textarea');
    el.value = text;
    // Kept off-screen rather than hidden: display:none cannot hold a selection.
    el.style.position = 'fixed';
    el.style.left = '-9999px';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}
