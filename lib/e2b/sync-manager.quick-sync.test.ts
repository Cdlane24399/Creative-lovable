import * as syncManagerModule from "./sync-manager";
import type { SyncResult } from "./delta-sync";

describe("sync-manager quick sync", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("quickSyncToDatabase performs one-shot sync without initialize()", async () => {
    const syncResult: SyncResult = {
      success: true,
      filesWritten: 2,
      filesDeleted: 0,
      bytesTransferred: 100,
      duration: 12,
      errors: [],
    };

    const syncSpy = jest
      .spyOn(syncManagerModule.SyncManager.prototype, "syncToDatabase")
      .mockResolvedValue(syncResult);
    const stopSpy = jest
      .spyOn(syncManagerModule.SyncManager.prototype, "stop")
      .mockImplementation(() => undefined);
    const initializeSpy = jest
      .spyOn(syncManagerModule.SyncManager.prototype, "initialize")
      .mockResolvedValue(undefined);

    const result = await syncManagerModule.quickSyncToDatabase(
      {} as never,
      "project-1",
      "/tmp/project",
    );

    expect(result).toEqual(syncResult);
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(initializeSpy).not.toHaveBeenCalled();
  });

  it("quickSyncToDatabaseWithRetry treats success with zero files as terminal success", async () => {
    const syncSpy = jest
      .spyOn(syncManagerModule.SyncManager.prototype, "syncToDatabase")
      .mockResolvedValue({
        success: true,
        filesWritten: 0,
        filesDeleted: 0,
        bytesTransferred: 0,
        duration: 5,
        errors: [],
      });
    jest
      .spyOn(syncManagerModule.SyncManager.prototype, "stop")
      .mockImplementation(() => undefined);

    const result = await syncManagerModule.quickSyncToDatabaseWithRetry(
      {} as never,
      "project-2",
      "/tmp/project",
      3,
    );

    expect(result.success).toBe(true);
    expect(result.filesWritten).toBe(0);
    expect(result.retryCount).toBe(0);
    expect(syncSpy).toHaveBeenCalledTimes(1);
  });
});
