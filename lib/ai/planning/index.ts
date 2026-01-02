/**
 * Planning System Exports
 *
 * Unified exports for the enhanced planning system with task graphs,
 * dependency management, execution, and recovery.
 */

// Types
export * from "./types"

// Task Graph
export {
  generateTaskId,
  generateGraphId,
  createTask,
  createTaskGraph,
  createEmptyTaskGraph,
  addTask,
  removeTask,
  addDependency,
  removeDependency,
  updateTaskStatus,
  incrementRetryCount,
  resetTask,
  analyzeExecution,
  getNextExecutableTasks,
  validateTaskGraph,
  wouldCreateCycle,
  getTaskDependencyInfo,
  getTaskGraphStats,
  cloneTaskGraph,
} from "./task-graph"

// Task Executor
export {
  type TaskExecutor,
  type TaskExecutionContext,
  type RunOptions,
  type RunResult,
  runTaskGraph,
  restoreFromCheckpoint,
  createSimpleExecutor,
  runSingleTask,
  dryRun,
} from "./task-executor"

// Recovery Strategies
export {
  matchErrorToStrategy,
  selectRecoveryStrategy,
  executeRecovery,
  calculateRetryDelay,
  isTransientError,
  isPermanentError,
  RecoveryStrategyBuilder,
  createDefaultRecoveryBuilder,
} from "./recovery-strategies"

// Backtracking
export {
  type BacktrackPoint,
  type BacktrackOptions,
  type BacktrackHistory,
  type BacktrackRecoveryResult,
  createBacktrackPoint,
  createBacktrackHistory,
  addBacktrackPoint,
  getLatestBacktrackPoint,
  findBacktrackPoint,
  backtrackTo,
  backtrackOnce,
  backtrackSteps,
  backtrackToStart,
  attemptBacktrackRecovery,
  resetTaskAndDependents,
  resetTasksFrom,
  checkpointToBacktrackPoint,
  analyzeBacktrackHistory,
  getMostBacktrackedTasks,
} from "./backtrack"
