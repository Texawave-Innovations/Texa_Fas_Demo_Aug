import React, { useState, useEffect } from 'react';
import { 
    subscribeTasks, 
    addTask, 
    updateTask, 
    deleteTask 
} from '../../services/todoService';
import { TaskCard } from './TaskCard';
import { TaskForm } from './TaskForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ListTodo, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface TodoManagerProps {
    basePath: string;
    title: string;
}

export const TodoManager: React.FC<TodoManagerProps> = ({ basePath, title }) => {
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [editingTask, setEditingTask] = useState<any>(null);
    const [isAdding, setIsAdding] = useState(false);

    useEffect(() => {
        const unsubscribe = subscribeTasks(basePath, (tasksData) => {
            setTasks(tasksData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, [basePath]);

    const sortedTasks = [...tasks].sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    async function handleAddTask(taskData: any) {
        await addTask(basePath, taskData);
        setIsAdding(false);
    }

    async function handleToggle(taskId: string, currentCompleted: boolean) {
        await updateTask(basePath, taskId, { completed: !currentCompleted });
    }

    async function handleEditSubmit(taskData: any) {
        await updateTask(basePath, editingTask.id, taskData);
        setEditingTask(null);
    }

    async function handleDelete(taskId: string) {
        await deleteTask(basePath, taskId);
    }

    return (
        <Card className="w-full">
            <CardHeader className="flex flex-row items-center justify-between border-b pb-4">
                <div className="flex items-center gap-2">
                    <ListTodo className="h-5 w-5 text-primary" />
                    <CardTitle>{title}</CardTitle>
                    {tasks.length > 0 && (
                        <span className="text-xs font-medium bg-primary/10 text-primary px-2 py-0.5 rounded-full">
                            {tasks.filter(t => !t.completed).length} pending
                        </span>
                    )}
                </div>
                <Button 
                    variant={isAdding ? "outline" : "default"} 
                    size="sm" 
                    onClick={() => {
                        setIsAdding(!isAdding);
                        setEditingTask(null);
                    }}
                    className="gap-2"
                >
                    {isAdding ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                    {isAdding ? "Cancel" : "Add Task"}
                </Button>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
                {(isAdding || editingTask) && (
                    <div className="p-4 rounded-xl bg-muted/20 border-2 border-dashed border-muted animate-in fade-in zoom-in duration-200">
                        <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-4">
                            {editingTask ? 'Edit Task' : 'New Task'}
                        </h3>
                        <TaskForm
                            onSubmit={editingTask ? handleEditSubmit : handleAddTask}
                            initialData={editingTask}
                            onCancel={() => {
                                setEditingTask(null);
                                setIsAdding(false);
                            }}
                        />
                    </div>
                )}

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                        <Loader2 className="h-8 w-8 animate-spin mb-2" />
                        <p className="text-sm">Loading tasks...</p>
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
                        <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-4">
                            <ListTodo className="h-6 w-6 opacity-20" />
                        </div>
                        <h3 className="font-semibold text-foreground">No tasks yet</h3>
                        <p className="text-sm">Start by adding your first task above</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 gap-4 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar">
                        {sortedTasks.map((task) => (
                            <TaskCard
                                key={task.id}
                                task={task}
                                basePath={basePath}
                                onToggle={handleToggle}
                                onEdit={(t) => {
                                    setEditingTask(t);
                                    setIsAdding(false);
                                    window.scrollTo({ top: 0, behavior: 'smooth' }); // Optional scroll to top of card or form
                                }}
                                onDelete={handleDelete}
                            />
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
};
