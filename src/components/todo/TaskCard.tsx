import React, { useState } from 'react';
import { SubTaskList } from './SubTaskList';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
    Clock, 
    Calendar, 
    ChevronDown, 
    ChevronUp, 
    Edit2, 
    Trash2,
    CheckCircle2
} from 'lucide-react';

interface TaskCardProps {
    task: any;
    basePath: string;
    onToggle: (id: string, completed: boolean) => void;
    onEdit: (task: any) => void;
    onDelete: (id: string) => void;
}

function formatDate(isoString: string) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString('en-IN', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    }) + ' ' + d.toLocaleTimeString('en-IN', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
    });
}

function getRemainingTime(deadline: string) {
    if (!deadline) return null;
    const now = new Date();
    const dl = new Date(deadline);
    const diffMs = dl.getTime() - now.getTime();

    if (diffMs <= 0) return { text: 'Overdue', variant: 'destructive' as const };

    const diffHours = diffMs / (1000 * 60 * 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 24) {
        const hours = Math.ceil(diffHours);
        return { text: `${hours}h remaining`, variant: 'destructive' as const };
    }
    if (diffDays <= 3) {
        return { text: `${diffDays}d remaining`, variant: 'warning' as const };
    }
    return { text: `${diffDays}d remaining`, variant: 'secondary' as const };
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, basePath, onToggle, onEdit, onDelete }) => {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const remaining = getRemainingTime(task.deadline);
    const subtasks = task.subtasks || [];
    const subtaskCount = subtasks.length;
    const subtaskDone = subtasks.filter((s: any) => s.completed).length;

    function handleDelete() {
        if (confirmDelete) {
            onDelete(task.id);
        } else {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
        }
    }

    return (
        <div className={`p-4 rounded-xl border transition-all duration-300 ${
            task.completed ? 'bg-muted/30 border-muted opacity-80' : 'bg-card border-border hover:border-primary/50 hover:shadow-md'
        }`}>
            <div className="flex items-start gap-4">
                <Checkbox
                    checked={task.completed}
                    onCheckedChange={() => onToggle(task.id, task.completed)}
                    className="mt-1"
                />
                <div className="flex-1 min-w-0">
                    <h3 className={`text-base font-semibold truncate ${task.completed ? 'line-through text-muted-foreground' : ''}`}>
                        {task.title}
                    </h3>
                    {task.description && (
                        <p className={`text-sm text-muted-foreground line-clamp-2 mt-1 ${task.completed ? 'line-through' : ''}`}>
                            {task.description}
                        </p>
                    )}
                    
                    <div className="flex flex-wrap gap-2 mt-3">
                        {task.deadline && (
                            <Badge variant={remaining?.variant} className="flex items-center gap-1 py-1">
                                <Calendar className="h-3 w-3" />
                                {formatDate(task.deadline)}
                            </Badge>
                        )}
                        {remaining && !task.completed && (
                            <Badge variant="outline" className="flex items-center gap-1 py-1">
                                <Clock className="h-3 w-3" />
                                {remaining.text}
                            </Badge>
                        )}
                        {subtaskCount > 0 && (
                            <Badge variant="secondary" className="flex items-center gap-1 py-1">
                                <CheckCircle2 className="h-3 w-3" />
                                {subtaskDone}/{subtaskCount} subtasks
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="flex gap-1 ml-2">
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setExpanded(!expanded)}
                    >
                        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-primary hover:text-primary hover:bg-primary/10"
                        onClick={() => onEdit(task)}
                    >
                        <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        className={`h-8 w-8 ${confirmDelete ? 'text-white bg-destructive hover:bg-destructive/90' : 'text-destructive hover:text-destructive hover:bg-destructive/10'}`}
                        onClick={handleDelete}
                    >
                        <Trash2 className="h-4 w-4" />
                    </Button>
                </div>
            </div>

            {expanded && (
                <div className="mt-4 pt-4 border-t animate-in slide-in-from-top-2 duration-200">
                    {task.notes && (
                        <div className="mb-4 p-3 bg-muted/50 rounded-lg border border-dashed">
                            <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notes</span>
                            <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{task.notes}</p>
                        </div>
                    )}
                    <SubTaskList task={task} basePath={basePath} />
                </div>
            )}
        </div>
    );
};
