export function getActionSubmitValidationTarget(
  formFieldKeys: string[],
): string[] | null {
  return formFieldKeys.length > 0 ? formFieldKeys : null;
}
