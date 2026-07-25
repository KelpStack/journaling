export function fieldRef(packId: string, fieldId: string): string {
  return `${packId}:${fieldId}`;
}

export function parseFieldRef(ref: string): { packId: string; fieldId: string } {
  const i = ref.indexOf(":");
  if (i <= 0) throw new Error(`Invalid fieldRef: ${ref}`);
  return { packId: ref.slice(0, i), fieldId: ref.slice(i + 1) };
}
