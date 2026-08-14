import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/hooks/use-toast';
import { database } from '@/services/firebase';
import { ref, set, get } from 'firebase/database';

export default function FinanceMaster() {
  const [expenseTypes, setExpenseTypes] = useState<string[]>([]);
  const [paymentModes, setPaymentModes] = useState<string[]>([]);
  const [newItem, setNewItem] = useState('');
  const [editingCategory, setEditingCategory] = useState<string | null>(null);

  useEffect(() => {
    loadMasterData();
  }, []);

  const loadMasterData = async () => {
    const mastersRef = ref(database, 'masters/finance');
    const snapshot = await get(mastersRef);
    if (snapshot.exists()) {
      const data = snapshot.val();
      setExpenseTypes(data.expenseTypes || []);
      setPaymentModes(data.paymentModes || []);
    }
  };

  const addItem = async (category: string) => {
    if (!newItem.trim()) {
      toast({ title: 'Please enter a value', variant: 'destructive' });
      return;
    }

    const list = category === 'expenseTypes' ? expenseTypes : paymentModes;
    const isDuplicate = list.some(item => item.trim().toLowerCase() === newItem.trim().toLowerCase());
    if (isDuplicate) {
      toast({ title: 'Duplicate entries are not allowed. Record already exists.', variant: 'destructive' });
      return;
    }

    const updatedList = [...list, newItem.trim()];
    if (category === 'expenseTypes') {
      setExpenseTypes(updatedList);
    } else {
      setPaymentModes(updatedList);
    }

    await set(ref(database, `masters/finance/${category}`), updatedList);
    setNewItem('');
    setEditingCategory(null);
    toast({ title: 'Item added successfully' });
  };

  const removeItem = async (category: string, index: number) => {
    let list: string[] = [];
    if (category === 'expenseTypes') {
      list = expenseTypes.filter((_, i) => i !== index);
      setExpenseTypes(list);
    } else {
      list = paymentModes.filter((_, i) => i !== index);
      setPaymentModes(list);
    }

    await set(ref(database, `masters/finance/${category}`), list);
    toast({ title: 'Item removed successfully' });
  };

  const renderList = (title: string, items: string[], category: string) => (
    <Card className="h-[250px] flex flex-col justify-between">
      <CardHeader className="p-4 pb-2 shrink-0">
        <CardTitle className="text-lg flex items-center justify-between font-bold">
          {title}
          <Button
            size="sm"
            onClick={() => { setEditingCategory(category); setNewItem(''); }}
            className="bg-primary hover:bg-primary/90 h-8"
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 pt-1 flex-grow overflow-y-auto max-h-[170px] pr-1">
        {editingCategory === category && (
          <div className="flex gap-2 mb-3 shrink-0">
            <Input
              placeholder="Enter value"
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addItem(category)}
              className="h-8 text-xs"
              autoFocus
            />
            <Button size="sm" onClick={() => addItem(category)} className="h-8">Add</Button>
            <Button size="sm" variant="outline" onClick={() => { setEditingCategory(null); setNewItem(''); }} className="h-8">
              Cancel
            </Button>
          </div>
        )}
        <div className="flex flex-wrap gap-2">
          {items.length === 0 ? (
            <p className="text-muted-foreground text-xs">No items added</p>
          ) : (
            items.map((item, index) => (
              <Badge key={index} variant="secondary" className="text-xs px-2 py-1">
                {item}
                <button
                  onClick={() => removeItem(category, index)}
                  className="ml-1.5 hover:text-destructive"
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderList('Expense Types', expenseTypes, 'expenseTypes')}
        {renderList('Payment Modes', paymentModes, 'paymentModes')}
      </div>
    </div>
  );
}
