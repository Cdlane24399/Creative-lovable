import type { Sandbox } from "e2b";

// Re-declare the CodeInterpreterSandbox type locally to avoid pulling in the full module
type CodeInterpreterSandbox = import("@e2b/code-interpreter").Sandbox;

// Progress callback for streaming operations
export type ProgressCallback = (
  phase: string,
  message: string,
  detail?: string,
) => void;

/**
 * Convert Buffer to ArrayBuffer for E2B SDK compatibility.
 * Helper function to ensure proper type conversion.
 */
export function convertToE2BData(
  content: string | Buffer,
): string | ArrayBuffer {
  if (content instanceof Buffer) {
    const arrayBuffer = content.buffer.slice(
      content.byteOffset,
      content.byteOffset + content.byteLength,
    );
    return arrayBuffer as ArrayBuffer;
  }
  return content as string | ArrayBuffer;
}

/**
 * Write file to sandbox filesystem with improved error handling.
 * E2B SDK v2 best practice: Use sandbox.files.write() for file operations.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to write to
 * @param content - File content (string or Buffer)
 */
export async function writeFile(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string,
  content: string | Buffer,
) {
  try {
    await sandbox.files.write(path, convertToE2BData(content));
    return { success: true, path };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`E2B write file failed: "${path}"`, { error: errorMessage });
    throw new Error(`Failed to write ${path}: ${errorMessage}`);
  }
}

/**
 * Options for batch file write operations.
 */
export interface WriteFilesOptions {
  /** Use E2B's native batch write API (may be faster but less error detail) */
  useNativeApi?: boolean;
  /** Progress callback for streaming status updates */
  onProgress?: ProgressCallback;
  /** Number of concurrent writes (default: 5) */
  concurrency?: number;
}

/**
 * Write multiple files to sandbox filesystem efficiently.
 * E2B SDK v2 best practice: Batch file writes when possible.
 *
 * @param sandbox - The E2B sandbox instance
 * @param files - Array of {path, content} objects
 * @param options - Optional configuration
 * @returns Result object with success status and counts
 *
 * @example
 * // Use native API for better performance
 * await writeFiles(sandbox, files, { useNativeApi: true })
 *
 * @example
 * // With progress tracking
 * await writeFiles(sandbox, files, {
 *   onProgress: (phase, msg, detail) => console.log(`${phase}: ${msg}`)
 * })
 */
export async function writeFiles(
  sandbox: Sandbox | CodeInterpreterSandbox,
  files: Array<{ path: string; content: string | Buffer }>,
  options?: WriteFilesOptions,
) {
  const { useNativeApi, onProgress, concurrency = 5 } = options || {};

  onProgress?.(
    "init",
    `Writing ${files.length} files`,
    `concurrency: ${concurrency}`,
  );

  // Try native API if requested (fastest)
  if (useNativeApi) {
    try {
      onProgress?.("batch", "Using native batch write API");
      await sandbox.files.write(
        files.map(({ path, content }) => ({
          path,
          data: convertToE2BData(content),
        })),
      );
      onProgress?.("complete", `Successfully wrote ${files.length} files`);
      return {
        success: true,
        succeeded: files.length,
        failed: 0,
        paths: files.map((f) => f.path),
      };
    } catch (error) {
      onProgress?.(
        "fallback",
        "Native batch write failed, using individual writes",
      );
      console.warn(
        "Native batch write failed, falling back to individual writes:",
        error,
      );
      // Fall through to detailed error tracking implementation
    }
  }

  // Chunked writes with concurrency control for better performance
  try {
    const results: Array<{ path: string; success: boolean; error?: string }> =
      [];
    const chunks = chunkArray(files, concurrency);
    let processed = 0;

    for (const chunk of chunks) {
      const chunkResults = await Promise.allSettled(
        chunk.map(async ({ path, content }) => {
          await sandbox.files.write(path, convertToE2BData(content));
          return path;
        }),
      );

      for (let i = 0; i < chunkResults.length; i++) {
        const result = chunkResults[i];
        const file = chunk[i];
        processed++;

        if (result.status === "fulfilled") {
          results.push({ path: file.path, success: true });
          onProgress?.(
            "write",
            `Written: ${file.path}`,
            `${processed}/${files.length}`,
          );
        } else {
          const errorMsg =
            result.reason instanceof Error
              ? result.reason.message
              : "Unknown error";
          results.push({ path: file.path, success: false, error: errorMsg });
          onProgress?.("error", `Failed: ${file.path}`, errorMsg);
        }
      }
    }

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    if (failed.length > 0) {
      console.warn(
        `E2B batch write: ${succeeded} succeeded, ${failed.length} failed`,
      );
    }

    onProgress?.(
      "complete",
      `Completed: ${succeeded} succeeded, ${failed.length} failed`,
    );

    return {
      success: failed.length === 0,
      succeeded,
      failed: failed.length,
      paths: files.map((f) => f.path),
      errors: failed.map((f) => ({ path: f.path, error: f.error })),
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    onProgress?.("error", "Batch write failed", errorMsg);
    throw new Error(`Batch file write failed: ${errorMsg}`);
  }
}

/**
 * Helper function to chunk an array into smaller arrays.
 */
function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Read file from sandbox filesystem with improved error handling.
 *
 * @param sandbox - The E2B sandbox instance
 * @param path - Absolute path to read from
 */
export async function readFile(
  sandbox: Sandbox | CodeInterpreterSandbox,
  path: string,
) {
  try {
    const content = await sandbox.files.read(path);
    return { content, path, success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`E2B read file failed: "${path}"`, { error: errorMessage });
    throw new Error(`Failed to read ${path}: ${errorMessage}`);
  }
}

/**
 * List files in a directory within the sandbox.
 */
export async function listFiles(sandbox: Sandbox, path: string = "/home/user") {
  try {
    const entries = await sandbox.files.list(path);
    return {
      files: entries,
      error: undefined,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`E2B list files failed: "${path}"`, { error: errorMessage });
    return {
      files: [],
      error: errorMessage,
    };
  }
}
