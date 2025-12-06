export function useWebVersion() {
  // Update banner disabled - was showing too frequently and causing poor UX
  return {
    updateAvailable: false,
    currentVersion: '',
    updateMode: 'soft' as const,
    handleRefresh: () => location.reload(),
    dismissUpdate: () => {}
  };
}
