export function stripInternal(text: string): { visible: string; internal?: string } {
  const [maybeInternal, after] = text.split(/##\s*END INTERNAL/i);

  if (after !== undefined) {
    // We had an internal block
    const internal = maybeInternal.replace(/##\s*🔒?\s*INTERNAL THOUGHTS[\s\S]*/i, '').trim();
    const visible = after.replace(/^FINAL ANSWER:/i, '').trim();
    return { visible, internal };
  }
  // No internal block present
  return { visible: text.trim() };
}