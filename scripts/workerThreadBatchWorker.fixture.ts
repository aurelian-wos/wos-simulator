import { installWorkerThreadBatchHandler } from "./workerThreadBatchWorker";

installWorkerThreadBatchHandler<number, number, number>((tasks, onProgress) => {
  onProgress(tasks.length);
  return tasks.map((task) => task * 2);
});
