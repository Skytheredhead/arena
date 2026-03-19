export const identityToString = (
  value: string | { toHexString(): string } | null | undefined
): string => {
  if (!value) {
    return '';
  }

  return typeof value === 'string' ? value : value.toHexString();
};
