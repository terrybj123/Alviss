import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RELEASE_IDENTIFIER } from "./services/appUpdate";

/**
 * The update gate compares the running bundle's identifier with a constant. It
 * said "com.plainva.desktop" long after the rebrand, so every check returned
 * "no-release" and no build ever offered an update (2026-11-22). This pins the
 * constant to the bundle identifier the app is actually built with.
 */
describe("the release identifier", () => {
  it("is the identifier in tauri.conf.json", () => {
    const conf = JSON.parse(
      readFileSync(resolve(__dirname, "../src-tauri/tauri.conf.json"), "utf8"),
    ) as { identifier: string };
    expect(RELEASE_IDENTIFIER).toBe(conf.identifier);
  });
});
