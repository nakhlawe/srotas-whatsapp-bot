'use client';

import React, { useEffect, useState } from 'react';
import { getBlacklist, addBlacklist, removeBlacklist, importBlacklist } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Trash2, Plus, Upload, Search, Ban, Download } from 'lucide-react';
import { toast } from 'sonner';

export function Blacklist() {
    const [entries, setEntries] = useState<any[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [isImportOpen, setIsImportOpen] = useState(false);
    const [newEntry, setNewEntry] = useState({ phone: '', reason: '' });
    const [importPhones, setImportPhones] = useState('');
    const [importReason, setImportReason] = useState('');

    useEffect(() => { fetchEntries(); }, []);

    const fetchEntries = async (search?: string) => {
        try {
            const data = await getBlacklist(search);
            setEntries(data);
        } catch (e) { console.error(e); }
    };

    const handleAdd = async () => {
        if (!newEntry.phone.trim()) return toast.error('Phone number is required');
        try {
            await addBlacklist(newEntry.phone, newEntry.reason);
            toast.success('Number blacklisted');
            setIsAddOpen(false);
            setNewEntry({ phone: '', reason: '' });
            fetchEntries();
        } catch (e) { toast.error('Failed to add to blacklist'); }
    };

    const handleRemove = async (id: string) => {
        if (!confirm('Remove this number from blacklist?')) return;
        try {
            await removeBlacklist(id);
            toast.success('Removed from blacklist');
            fetchEntries();
        } catch (e) { toast.error('Failed to remove'); }
    };

    const handleImport = async () => {
        const phones = importPhones.split(/[\n,;]+/).map(p => p.trim()).filter(Boolean);
        if (!phones.length) return toast.error('Enter at least one phone number');
        try {
            const result = await importBlacklist(phones, importReason);
            toast.success(`Added ${result.added} numbers to blacklist`);
            setIsImportOpen(false);
            setImportPhones('');
            setImportReason('');
            fetchEntries();
        } catch (e) { toast.error('Failed to import'); }
    };

    const handleSearch = () => {
        fetchEntries(searchQuery || undefined);
    };

    return (
        <div className="p-6 xl:p-10 max-w-[1600px] mx-auto space-y-6 w-full">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Blacklist</h1>
                    <p className="text-muted-foreground mt-1">Block numbers from receiving auto-replies and bulk messages</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setIsImportOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" /> Import
                    </Button>
                    <Button onClick={() => setIsAddOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" /> Add Number
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex gap-2 mb-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by phone or reason..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                                className="pl-9"
                            />
                        </div>
                        <Button variant="outline" onClick={handleSearch}>Search</Button>
                    </div>

                    {entries.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Ban className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No blacklisted numbers</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {entries.map((entry) => (
                                <div key={entry.id} className="flex items-center justify-between p-3 rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary/50 transition-colors">
                                    <div className="flex-1 min-w-0">
                                        <p className="font-mono text-sm font-medium">{entry.phone}</p>
                                        {entry.reason && <p className="text-xs text-muted-foreground mt-0.5">{entry.reason}</p>}
                                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">{entry.source} · {new Date(entry.created_at).toLocaleDateString()}</p>
                                    </div>
                                    <Button variant="ghost" size="sm" onClick={() => handleRemove(entry.id)} className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}
                        </div>
                    )}
                    {entries.length > 0 && (
                        <p className="text-xs text-muted-foreground mt-4 text-right">{entries.length} number(s) blacklisted</p>
                    )}
                </CardContent>
            </Card>

            {/* Add Dialog */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add to Blacklist</DialogTitle>
                        <DialogDescription>This number will be blocked from all auto-replies and bulk sends</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Phone Number</Label>
                            <Input placeholder="e.g. 919876543210" value={newEntry.phone} onChange={(e) => setNewEntry({ ...newEntry, phone: e.target.value })} />
                        </div>
                        <div>
                            <Label>Reason (optional)</Label>
                            <Input placeholder="e.g. Reported spam" value={newEntry.reason} onChange={(e) => setNewEntry({ ...newEntry, reason: e.target.value })} />
                        </div>
                        <Button onClick={handleAdd} className="w-full">Block Number</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import Dialog */}
            <Dialog open={isImportOpen} onOpenChange={setIsImportOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Import Numbers</DialogTitle>
                        <DialogDescription>Paste phone numbers separated by commas or new lines</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Phone Numbers</Label>
                            <Textarea placeholder={"919876543210\n919876543211\n919876543212"} rows={5} value={importPhones} onChange={(e) => setImportPhones(e.target.value)} />
                        </div>
                        <div>
                            <Label>Reason (optional)</Label>
                            <Input placeholder="Bulk import" value={importReason} onChange={(e) => setImportReason(e.target.value)} />
                        </div>
                        <Button onClick={handleImport} className="w-full">Import & Block</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
