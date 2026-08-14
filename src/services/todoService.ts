import { database } from './firebase';
import {
    ref,
    push,
    set,
    update,
    remove,
    onValue
} from 'firebase/database';

// ── Task CRUD ──────────────────────────────────────────

export async function addTask(basePath: string, taskObj: { title: string, description: string, notes: string, deadline: string | null }) {
    const tasksRef = ref(database, basePath);
    const newTaskRef = push(tasksRef);
    return set(newTaskRef, {
        ...taskObj,
        completed: false,
        createdAt: new Date().toISOString()
    });
}

export async function updateTask(basePath: string, taskId: string, updates: any) {
    const taskRef = ref(database, `${basePath}/${taskId}`);
    return update(taskRef, updates);
}

export async function deleteTask(basePath: string, taskId: string) {
    const taskRef = ref(database, `${basePath}/${taskId}`);
    return remove(taskRef);
}

export function subscribeTasks(basePath: string, callback: (tasks: any[]) => void) {
    const tasksRef = ref(database, basePath);

    const unsubscribe = onValue(tasksRef, (snapshot) => {
        const data = snapshot.val();
        if (!data) {
            callback([]);
            return;
        }
        const tasks = Object.entries(data)
            .map(([id, task]: [string, any]) => {
                // Convert subtasks object to array
                const subtasks = task.subtasks
                    ? Object.entries(task.subtasks).map(([subId, sub]: [string, any]) => ({
                        id: subId,
                        ...sub
                    }))
                    : [];
                return { id, ...task, subtasks };
            })
            .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        callback(tasks);
    });

    return unsubscribe;
}

// ── Subtask CRUD ───────────────────────────────────────

export async function addSubTask(basePath: string, taskId: string, { title }: { title: string }) {
    const subtasksRef = ref(database, `${basePath}/${taskId}/subtasks`);
    const newRef = push(subtasksRef);
    return set(newRef, {
        title,
        completed: false,
        createdAt: new Date().toISOString()
    });
}

export async function updateSubTask(basePath: string, taskId: string, subtaskId: string, updates: any) {
    const subRef = ref(
        database,
        `${basePath}/${taskId}/subtasks/${subtaskId}`
    );
    return update(subRef, updates);
}

export async function deleteSubTask(basePath: string, taskId: string, subtaskId: string) {
    const subRef = ref(
        database,
        `${basePath}/${taskId}/subtasks/${subtaskId}`
    );
    return remove(subRef);
}
