import test from "node:test";
import assert from "node:assert/strict";
import { joinApiBase, resolveApiUrl, getApiBase } from "./base.js";

test("resolveApiUrl without VITE_API_BASE keeps relative path", () => {
  assert.equal(getApiBase(), "");
  assert.equal(resolveApiUrl("/api/v1/profile"), "/api/v1/profile");
});

test("joinApiBase prefixes origin", () => {
  assert.equal(joinApiBase("https://api.example.com", "/api/v1/plans"), "https://api.example.com/api/v1/plans");
  assert.equal(joinApiBase("https://api.example.com/", "/health"), "https://api.example.com/health");
});

test("joinApiBase leaves absolute URLs", () => {
  assert.equal(joinApiBase("https://api.example.com", "https://other/x"), "https://other/x");
});
