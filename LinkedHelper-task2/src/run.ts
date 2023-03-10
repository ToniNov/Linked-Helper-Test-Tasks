import { IExecutor } from './Executor';
import ITask from './Task';

export default async function run(executor: IExecutor, queue: AsyncIterable<ITask>, maxThreads = 0) {
    maxThreads = Math.max(0, maxThreads);

    // Можно импортировать такой тип присутствует ITaskExt.ts
    // You can import this type from ITaskExt.ts
    // type ITaskExt = ITask & { running?: true, completed?: true, acquired?: true };
    interface ITaskBody {
        [key: string]: ITask & { running?: true, completed?: true, acquired?: true };
    }

    const cleanDate = JSON.parse(JSON.stringify(queue)).q.length === 0;
    const tasksArr: ITask[] = [];
    const taskBody: ITaskBody = {} ;
    let runningTask: Array<Promise<void>> = [];
    let queueIndex: number = 0;

    for await (const item of queue) {
        tasksArr.push(item);
        queueIndex++;
        if (cleanDate && queueIndex === maxThreads) {
            break;
        }
    }

    const itemsCount = JSON.parse(JSON.stringify(queue)).q.length;

    while (tasksArr.length > 0) {
        let taskIndex = 0;
        while (tasksArr.length > taskIndex) {

            const task = tasksArr[taskIndex];

            if (runningTask.length >= maxThreads && maxThreads > 0) {
                break;
            }
            if (taskBody[task.targetId]) {
                taskIndex++;
            } else {
                tasksArr.splice(taskIndex, 1);
                taskBody[task.targetId] = task;
                const runTask = executor.executeTask(task)
                    .then(async () => {
                    delete taskBody[task.targetId];
                    runningTask = runningTask.filter(item => item !== runTask);
                    if (itemsCount !== JSON.parse(JSON.stringify(queue)).q.length && !cleanDate) {
                        for await (const item of queue) {
                            tasksArr.push(item);
                        }
                    }
                    if (cleanDate) {
                        for await (const item of queue) {
                            tasksArr.push(item);
                            break;
                        }
                    }
                });
                runningTask.push(runTask);
            }
        }
        await Promise.race(runningTask);
    }
    await Promise.all(runningTask);
}
