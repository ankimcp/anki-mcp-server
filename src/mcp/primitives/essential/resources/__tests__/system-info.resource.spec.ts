import { SystemInfoResource } from "../system-info.resource";

describe("SystemInfoResource", () => {
  let resource: SystemInfoResource;

  beforeEach(() => {
    resource = new SystemInfoResource();
  });

  describe("getSystemInfo", () => {
    it("should return formatted system information", () => {
      const uri = "system://info";
      const result = resource.getSystemInfo({ uri });

      expect(result).toHaveProperty("contents");
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0]).toHaveProperty("uri");
      expect(result.contents[0].uri).toBe(uri);
      expect(result.contents[0]).toHaveProperty("mimeType");
      expect(result.contents[0].mimeType).toBe("application/json");
      expect(result.contents[0]).toHaveProperty("text");
    });

    it("should return valid JSON", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const text = result.contents[0].text;

      expect(() => JSON.parse(text)).not.toThrow();
    });

    it("should include all required system information fields", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data).toHaveProperty("platform");
      expect(data).toHaveProperty("release");
      expect(data).toHaveProperty("type");
      expect(data).toHaveProperty("arch");
      expect(data).toHaveProperty("cpus");
      expect(data).toHaveProperty("totalMemory");
      expect(data).toHaveProperty("freeMemory");
      expect(data).toHaveProperty("uptime");
      expect(data).toHaveProperty("hostname");
      expect(data).toHaveProperty("nodeVersion");
      expect(data).toHaveProperty("env");
    });

    it("should format memory as GB", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.totalMemory).toMatch(/^\d+ GB$/);
      expect(data.freeMemory).toMatch(/^\d+ GB$/);
    });

    it("should format uptime as hours", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.uptime).toMatch(/^\d+ hours$/);
    });

    it("should include CPU count as number", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(typeof data.cpus).toBe("number");
      expect(data.cpus).toBeGreaterThan(0);
    });

    it("should include NODE_ENV in environment", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.env).toHaveProperty("NODE_ENV");
      expect(typeof data.env.NODE_ENV).toBe("string");
    });

    it("should default NODE_ENV to development when not set", () => {
      const originalEnv = process.env.NODE_ENV;
      delete process.env.NODE_ENV;

      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.env.NODE_ENV).toBe("development");

      // Restore
      if (originalEnv !== undefined) {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it("should include Node.js version", () => {
      const result = resource.getSystemInfo({ uri: "system://info" });
      const data = JSON.parse(result.contents[0].text);

      expect(data.nodeVersion).toBe(process.version);
      expect(data.nodeVersion).toMatch(/^v\d+\.\d+\.\d+/);
    });

    it("should handle different URI values", () => {
      const uri1 = "system://info";
      const uri2 = "custom://path";

      const result1 = resource.getSystemInfo({ uri: uri1 });
      const result2 = resource.getSystemInfo({ uri: uri2 });

      expect(result1.contents[0].uri).toBe(uri1);
      expect(result2.contents[0].uri).toBe(uri2);
    });
  });
});
