import { readFileSync } from "fs";
import { join } from "path";

function getPackageJson() {
  try {
    return JSON.parse(
      readFileSync(join(__dirname, "../package.json"), "utf-8"),
    );
  } catch {
    return { version: "0.0.0", name: "ankimcp" };
  }
}

export function getVersion(): string {
  return getPackageJson().version;
}

export function getPackageName(): string {
  return getPackageJson().name;
}
