import { describe, expect, it } from "vitest";
import {
  ROLE_LABEL,
  isBuilderRole,
  isTeamRole,
  roleWithArticle,
  teamLabel,
} from "@/lib/team-shared";

describe("team roles", () => {
  it("treats admins and members as builders and reviewers as free", () => {
    expect(isBuilderRole("admin")).toBe(true);
    expect(isBuilderRole("member")).toBe(true);
    expect(isBuilderRole("reviewer")).toBe(false);
    expect(isBuilderRole(null)).toBe(false);
  });
  it("labels members as builders in the UI", () => {
    expect(ROLE_LABEL).toEqual({ admin: "Admin", member: "Builder", reviewer: "Reviewer" });
    expect(roleWithArticle("admin")).toBe("an admin");
    expect(roleWithArticle("reviewer")).toBe("a reviewer");
  });
  it("only accepts known roles from forms", () => {
    expect(isTeamRole("reviewer")).toBe(true);
    expect(isTeamRole("owner")).toBe(false);
    expect(isTeamRole(undefined)).toBe(false);
  });
  it("names personal workspaces after their owner", () => {
    expect(teamLabel({ name: "Personal", personal: true }, "Steve Warren")).toBe("Steve's workspace");
    expect(teamLabel({ name: "Acme", personal: false })).toBe("Acme");
  });
});
