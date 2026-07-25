export interface SyncAdapter {
  push(profileId: string): Promise<void>;
  pull(profileId: string): Promise<void>;
}

export class NoopSyncAdapter implements SyncAdapter {
  async push(): Promise<void> {}
  async pull(): Promise<void> {}
}
