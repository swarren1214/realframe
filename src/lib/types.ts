export type Role = "owner" | "editor" | "commenter" | "viewer" | "public" | "guest";
export type AccessMode = "invite" | "public" | "password";

export type Project = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  access_mode: AccessMode;
  published: boolean;
  live_version_id: string | null;
  has_password?: boolean;
  guest_comments?: boolean;
  created_at: string;
  updated_at: string;
};

export type VersionMeta = {
  id: string;
  number: number;
  summary: string | null;
  prompt: string | null;
  source: "ai" | "restore" | "edit" | "variant" | "import" | "github";
  kind: "html" | "bundle";
  bundle_files?: number | null;
  commit_sha?: string | null;
  commit_author?: string | null;
  created_at: string;
};

export type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  version_id: string | null;
  created_at: string;
};

export type Member = {
  email: string;
  role: "viewer" | "commenter" | "editor";
  user_id: string | null;
  created_at: string;
};

export type Comment = {
  id: string;
  thread_id: string;
  author_email: string;
  author_name: string | null;
  is_guest?: boolean;
  body: string;
  created_at: string;
};

export type Thread = {
  id: string;
  version_id: string;
  x: number;
  y: number;
  status: "open" | "resolved";
  created_at: string;
  guest_name?: string | null;
  comments: Comment[];
};

export function canBuild(role: Role | null) {
  return role === "owner" || role === "editor";
}

export function canComment(role: Role | null) {
  return role === "owner" || role === "editor" || role === "commenter";
}

export function authorLabel(c: { author_name: string | null; author_email: string }) {
  return c.author_name?.trim() || c.author_email.split("@")[0];
}

export type Variant = {
  id: string;
  group_id: string;
  position: number;
  prompt: string;
  summary: string | null;
  html: string;
  created_at: string;
};
