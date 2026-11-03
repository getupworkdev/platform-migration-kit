/**
 * Shape of the export we receive from the legacy platform.
 * Field names are typical of app-builder exports; the real ones are mapped
 * in the assessment and only this file changes.
 */
export type LegacyUser = {
  _id: string;
  email: string;
  name?: string;
  createdAt: string;
  // password hashes may or may not be present; we do not depend on them
  passwordHash?: string;
};

export type LegacyContent = {
  _id: string;
  type: string;               // 'article' | 'page' | ... whatever the platform used
  slug?: string;
  headline?: string;
  bodyMarkdown?: string;
  author?: string;            // legacy user _id
  published?: string | null;
  // everything else: images, tags, AI metadata, unknown fields
  [key: string]: unknown;
};

export type LegacyExport = {
  exportedAt: string;
  users: LegacyUser[];
  content: LegacyContent[];
  /** URL paths the old site served, for the redirect map */
  routes?: { path: string; contentId: string }[];
};
