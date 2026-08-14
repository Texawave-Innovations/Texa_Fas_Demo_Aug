import React, { useState } from 'react';
import {
    addSubTask,
    updateSubTask,
    deleteSubTask
} from '../../services/todoService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, Plus } from 'lucide-react';

interface SubTaskListProps {
    task: any;
    basePath: string;
}

export const SubTaskList: React.FC<SubTaskListProps> = ({ task, basePath }) => {
    const [newSubTitle, setNewSubTitle] = useState('');

    async function handleAddSub(e: React.FormEvent) {
        e.preventDefault();
        if (!newSubTitle.trim()) return;
        await addSubTask(basePath, task.id, { title: newSubTitle.trim() });
        setNewSubTitle('');
    }

    async function handleToggleSub(subId: string, currentCompleted: boolean) {
        await updateSubTask(basePath, task.id, subId, { completed: !currentCompleted });
    }

    async function handleDeleteSub(subId: string) {
        await deleteSubTask(basePath, task.id, subId);
    }

    const subtasks = task.subtasks || [];
    const completedCount = subtasks.filter((s: any) => s.completed).length;

    return (
        <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-muted-foreground">
                    Subtasks {subtasks.length > 0 && `(${completedCount}/${subtasks.length})`}
                </span>
            </div>

            {subtasks.length > 0 && (
                <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
                    <div
                        className="h-full bg-primary transition-all duration-300"
                        style={{
                            width: `${(completedCount / subtasks.length) * 100}%`
                        }}
                    />
                </div>
            )}

            <ul className="space-y-2">
                {subtasks.map((sub: any) => (
                    <li key={sub.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors">
                        <Checkbox
                            checked={sub.completed}
                            onCheckedChange={() => handleToggleSub(sub.id, sub.completed)}
                        />
                        <span className={`flex-1 text-sm ${sub.completed ? 'line-through text-muted-foreground' : ''}`}>
                            {sub.title}
                        </span>
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => handleDeleteSub(sub.id)}
                        >
                            <Trash2 className="h-4 w-4" />
                        </Button>
                    </li>
                ))}
            </ul>

            <form className="flex gap-2" onSubmit={handleAddSub}>
                <Input
                    size={30}
                    placeholder="Add a subtask..."
                    value={newSubTitle}
                    onChange={(e) => setNewSubTitle(e.target.value)}
                    className="h-9 flex-1"
                />
                <Button type="submit" size="icon" className="h-9 w-9" disabled={!newSubTitle.trim()}>
                    <Plus className="h-4 w-4" />
                </Button>
            </form>
        </div>
    );
};
