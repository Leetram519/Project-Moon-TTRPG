export function pmttrpgDialogClasses() {
  return ["projectmoonttrpg", "PMTTRPG-dialog"];
}

export function pmttrpgDialogPosition(extra = {}) {
  return { width: 400, ...extra };
}

export function pmWindowClasses(...extra) {
  return ["projectmoonttrpg", "pm-window", ...extra];
}
