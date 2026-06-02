/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "../..",
  testRegex: "test/e2e/.*\\.e2e-spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^@test/(.*)$": "<rootDir>/test/$1",
  },
  // Keep compiled output out of the haste map so manual mocks
  // (e.g. __mocks__/anki-connect.client) aren't indexed twice.
  modulePathIgnorePatterns: [
    "<rootDir>/dist",
    "<rootDir>/dist-stdio",
    "<rootDir>/dist-http",
  ],
  // E2E tests need longer timeouts
  testTimeout: 60000,
  // Run sequentially to avoid race conditions
  maxWorkers: 1,
  // Verbose output for debugging
  verbose: true,
};
