import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

interface TaskFormProps {
    onSubmit: (data: any) => void;
    initialData?: any;
    onCancel?: () => void;
}

export const TaskForm: React.FC<TaskFormProps> = ({ onSubmit, initialData, onCancel }) => {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [notes, setNotes] = useState('');
    const [deadlineDate, setDeadlineDate] = useState('');
    const [deadlineTime, setDeadlineTime] = useState('');

    const isEditing = !!initialData;

    useEffect(() => {
        if (initialData) {
            setTitle(initialData.title || '');
            setDescription(initialData.description || '');
            setNotes(initialData.notes || '');
            if (initialData.deadline) {
                const [datePart, timePart] = initialData.deadline.split('T');
                setDeadlineDate(datePart || '');
                setDeadlineTime(timePart || '');
            } else {
                setDeadlineDate('');
                setDeadlineTime('');
            }
        } else {
            setTitle('');
            setDescription('');
            setNotes('');
            setDeadlineDate('');
            setDeadlineTime('');
        }
    }, [initialData]);

    function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim()) return;

        let deadline = null;
        if (deadlineDate) {
            deadline = deadlineTime
                ? `${deadlineDate}T${deadlineTime}`
                : `${deadlineDate}T23:59`;
        }

        onSubmit({
            title: title.trim(),
            description: description.trim(),
            notes: notes.trim(),
            deadline
        });

        if (!isEditing) {
            setTitle('');
            setDescription('');
            setNotes('');
            setDeadlineDate('');
            setDeadlineTime('');
        }
    }

    return (
        <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="task-title">Title</Label>
                    <Input
                        id="task-title"
                        placeholder="Task title..."
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        required
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="task-desc">Description (optional)</Label>
                    <Input
                        id="task-desc"
                        placeholder="Short summary..."
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                    />
                </div>
            </div>

            <div className="space-y-2">
                <Label htmlFor="task-notes">Notes (optional)</Label>
                <Textarea
                    id="task-notes"
                    placeholder="Detailed notes here..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label htmlFor="task-deadline-date">Deadline Date</Label>
                    <Input
                        id="task-deadline-date"
                        type="date"
                        value={deadlineDate}
                        onChange={(e) => setDeadlineDate(e.target.value)}
                    />
                </div>
                <div className="space-y-2">
                    <Label htmlFor="task-deadline-time">Deadline Time</Label>
                    <Input
                        id="task-deadline-time"
                        type="time"
                        value={deadlineTime}
                        onChange={(e) => setDeadlineTime(e.target.value)}
                    />
                </div>
            </div>

            <div className="flex gap-2 justify-end">
                {isEditing && (
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancel
                    </Button>
                )}
                <Button type="submit" className="px-8">
                    {isEditing ? 'Save Changes' : 'Create Task'}
                </Button>
            </div>
        </form>
    );
};
