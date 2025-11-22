import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, writeFile, rm, mkdir } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { expandGlobPattern, uploadFile } from "./file-upload.ts";

describe("expandGlobPattern", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "mux-cli-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  test("expands simple glob pattern matching multiple files", async () => {
    await writeFile(join(tempDir, "video1.mp4"), "content1");
    await writeFile(join(tempDir, "video2.mp4"), "content2");
    await writeFile(join(tempDir, "video3.mp4"), "content3");
    await writeFile(join(tempDir, "other.txt"), "text");

    const pattern = join(tempDir, "*.mp4");
    const files = await expandGlobPattern(pattern);

    expect(files).toHaveLength(3);
    expect(files.map((f) => f.name).sort()).toEqual([
      "video1.mp4",
      "video2.mp4",
      "video3.mp4",
    ]);
  });

  test("returns single file when pattern matches one file", async () => {
    await writeFile(join(tempDir, "single.mp4"), "content");

    const pattern = join(tempDir, "single.mp4");
    const files = await expandGlobPattern(pattern);

    expect(files).toHaveLength(1);
    expect(files[0].name).toBe("single.mp4");
  });

  test("returns file info with size and path", async () => {
    const content = "a".repeat(1024); // 1KB
    const filePath = join(tempDir, "test.mp4");
    await writeFile(filePath, content);

    const files = await expandGlobPattern(filePath);

    expect(files[0]).toMatchObject({
      name: "test.mp4",
      path: filePath,
      size: 1024,
    });
  });

  test("expands nested directory glob patterns", async () => {
    const subDir = join(tempDir, "videos");
    await mkdir(subDir);
    await writeFile(join(subDir, "video1.mp4"), "content1");
    await writeFile(join(subDir, "video2.mp4"), "content2");

    const pattern = join(tempDir, "videos/*.mp4");
    const files = await expandGlobPattern(pattern);

    expect(files).toHaveLength(2);
  });

  test("returns empty array when no files match pattern", async () => {
    const pattern = join(tempDir, "*.mp4");
    const files = await expandGlobPattern(pattern);

    expect(files).toEqual([]);
  });

  test("throws error when pattern points to directory", async () => {
    const subDir = join(tempDir, "videos");
    await mkdir(subDir);

    expect(async () => {
      await expandGlobPattern(subDir);
    }).toThrow(/directory/i);
  });

  test("handles recursive glob patterns", async () => {
    await mkdir(join(tempDir, "dir1"));
    await mkdir(join(tempDir, "dir2"));
    await writeFile(join(tempDir, "dir1", "video1.mp4"), "content1");
    await writeFile(join(tempDir, "dir2", "video2.mp4"), "content2");

    const pattern = join(tempDir, "**/*.mp4");
    const files = await expandGlobPattern(pattern);

    expect(files).toHaveLength(2);
  });
});

describe("uploadFile", () => {
  test.todo("uploads file to direct upload URL and returns upload info");

  test.skip("uploads file to direct upload URL and returns upload info (needs mocking)", async () => {
    // Create a mock file
    const tempDir = await mkdtemp(join(tmpdir(), "mux-cli-test-"));
    const filePath = join(tempDir, "test.mp4");
    await writeFile(filePath, "mock video content");

    try {
      // Mock upload URL from Mux
      const mockUploadUrl = "https://storage.googleapis.com/mock-upload-url";
      const mockUploadId = "test-upload-id-123";

      // Note: This test will use a mock/stub of the actual upload
      // In the real implementation, we'll need to mock the fetch call
      const result = await uploadFile(
        filePath,
        mockUploadUrl,
        mockUploadId,
        () => {} // progress callback
      );

      expect(result).toMatchObject({
        uploadId: mockUploadId,
        success: true,
      });
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test.todo("calls progress callback during upload");

  test.skip("calls progress callback during upload (needs mocking)", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mux-cli-test-"));
    const filePath = join(tempDir, "test.mp4");
    await writeFile(filePath, "mock video content");

    try {
      const mockUploadUrl = "https://storage.googleapis.com/mock-upload-url";
      const mockUploadId = "test-upload-id-123";

      const progressUpdates: number[] = [];
      const progressCallback = (percent: number) => {
        progressUpdates.push(percent);
      };

      await uploadFile(filePath, mockUploadUrl, mockUploadId, progressCallback);

      // Should have received at least one progress update
      expect(progressUpdates.length).toBeGreaterThan(0);
      // Final progress should be 100
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  test("throws error when file does not exist", () => {
    const mockUploadUrl = "https://storage.googleapis.com/mock-upload-url";
    const mockUploadId = "test-upload-id-123";

    expect(async () => {
      await uploadFile(
        "/nonexistent/file.mp4",
        mockUploadUrl,
        mockUploadId,
        () => {}
      );
    }).toThrow(/file not found/i);
  });

  test("throws error when upload fails", async () => {
    const tempDir = await mkdtemp(join(tmpdir(), "mux-cli-test-"));
    const filePath = join(tempDir, "test.mp4");
    await writeFile(filePath, "mock video content");

    try {
      // Invalid upload URL should cause failure
      const invalidUploadUrl = "invalid-url";
      const mockUploadId = "test-upload-id-123";

      expect(async () => {
        await uploadFile(filePath, invalidUploadUrl, mockUploadId, () => {});
      }).toThrow(/upload failed/i);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
