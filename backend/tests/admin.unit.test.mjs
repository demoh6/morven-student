import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { updateRoleSchema } from "../dist/services/admin.service.js";

describe("admin role validation", () => {
  it("accepts ADMIN", () => {
    const parsed = updateRoleSchema.safeParse({ role: "ADMIN" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.role, "ADMIN");
  });

  it("accepts SUB_ADMIN", () => {
    const parsed = updateRoleSchema.safeParse({ role: "SUB_ADMIN" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.role, "SUB_ADMIN");
  });

  it("accepts USER", () => {
    const parsed = updateRoleSchema.safeParse({ role: "USER" });
    assert.equal(parsed.success, true);
    if (parsed.success) assert.equal(parsed.data.role, "USER");
  });

  it("rejects invalid roles", () => {
    const parsed = updateRoleSchema.safeParse({ role: "OWNER" });
    assert.equal(parsed.success, false);
  });

  it("rejects a missing role", () => {
    const parsed = updateRoleSchema.safeParse({});
    assert.equal(parsed.success, false);
  });

  it("rejects non-string role types", () => {
    const parsed = updateRoleSchema.safeParse({ role: 123 });
    assert.equal(parsed.success, false);
  });
});
