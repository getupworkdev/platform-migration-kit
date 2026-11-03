/**
 * What the migration needs from the destination. The real one is Supabase
 * (admin API + tables); the tests use an in-memory one with the same contract,
 * so the migration logic is tested without a project or a network.
 */
export type ImportedUser = { id: string; email: string };

export interface MigrationTarget {
  /** Existing mapping legacy user id → new auth user id (from a previous run). */
  getUserMap(): Promise<Map<string, string>>;
  findUserByEmail(email: string): Promise<ImportedUser | null>;
  /** Create an auth user with no password; email is pre-confirmed so a login link works at once. */
  createUser(u: { email: string; displayName: string | null; legacyId: string; legacyCreatedAt: string }): Promise<ImportedUser>;
  rememberUserMap(legacyId: string, userId: string): Promise<void>;

  /** Existing legacy content ids already imported. */
  getImportedContentIds(): Promise<Set<string>>;
  insertContent(item: {
    legacyId: string;
    kind: string;
    slug: string;
    title: string;
    body: string;
    authorId: string | null;
    publishedAt: string | null;
    raw: unknown;               // the legacy record, untouched
  }): Promise<void>;

  upsertRedirect(fromPath: string, toPath: string): Promise<void>;
}

/** In-memory target: used by the tests and by `--dry-run`. */
export class MemoryTarget implements MigrationTarget {
  users: (ImportedUser & { displayName: string | null; legacyId: string })[] = [];
  userMap = new Map<string, string>();
  content: Parameters<MigrationTarget['insertContent']>[0][] = [];
  redirects = new Map<string, string>();

  async getUserMap() { return new Map(this.userMap); }
  async findUserByEmail(email: string) { return this.users.find((u) => u.email === email) ?? null; }
  async createUser(u: { email: string; displayName: string | null; legacyId: string }) {
    const created = { id: crypto.randomUUID(), email: u.email, displayName: u.displayName, legacyId: u.legacyId };
    this.users.push(created);
    return created;
  }
  async rememberUserMap(legacyId: string, userId: string) { this.userMap.set(legacyId, userId); }
  async getImportedContentIds() { return new Set(this.content.map((c) => c.legacyId)); }
  async insertContent(item: Parameters<MigrationTarget['insertContent']>[0]) { this.content.push(item); }
  async upsertRedirect(from: string, to: string) { this.redirects.set(from, to); }
}
