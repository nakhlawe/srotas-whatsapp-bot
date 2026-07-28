'use client';

import React, { useEffect, useState } from 'react';
import { getFollowUps, getFollowUpStats, addFollowUp, deleteFollowUp, runFollowUp, getSessions } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Trash2, Plus, Play, Clock, CheckCircle, XCircle, Timer } from 'lucide-react';
import { toast } from 'sonner';

export function FollowUps() {
    const [items, setItems] = useState<any[]>([]);
    const [stats, setStats] = useState({ pending: 0, sent: 0, failed: 0, total: 0 });
    const [sessions, setSessions] = useState<any[]>([]);
    const [filter, setFilter] = useState('all');
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [newItem, setNewItem] = useState({ name: '', phone: '', sessionId: '', message: '', delayMinutes: 60 });

    useEffect(() => { fetchAll(); }, []);

    const fetchAll = async () => {
        try {
            const [data, s, sess] = await Promise.all([getFollowUps(), getFollowUpStats(), getSessions()]);
            setItems(data);
            setStats(s);
            setSessions(sess);
        } catch (e) { console.error(e); }
    };

    const handleAdd = async () => {
        if (!newItem.phone || !newItem.sessionId || !newItem.message) {
            return toast.error('Phone, session, and message are required');
        }
        try {
            await addFollowUp(newItem);
            toast.success('Follow-up scheduled');
            setIsAddOpen(false);
            setNewItem({ name: '', phone: '', sessionId: '', message: '', delayMinutes: 60 });
            fetchAll();
        } catch (e) { toast.error('Failed to schedule'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this follow-up?')) return;
        try {
            await deleteFollowUp(String(id));
            toast.success('Deleted');
            fetchAll();
        } catch (e) { toast.error('Failed to delete'); }
    };

    const handleRunNow = async (id: number) => {
        try {
            await runFollowUp(String(id));
            toast.success('Follow-up sent!');
            fetchAll();
        } catch (e) { toast.error('Failed to send'); }
    };

    const filtered = filter === 'all' ? items : items.filter(i => i.status === filter);

    const statusIcon = (status: string) => {
        if (status === 'sent') return <CheckCircle className="w-4 h-4 text-emerald-500" />;
        if (status === 'failed') return <XCircle className="w-4 h-4 text-red-500" />;
        return <Timer className="w-4 h-4 text-amber-500" />;
    };

    return (
        <div className="p-6 xl:p-10 max-w-[1600px] mx-auto space-y-6 w-full">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Follow-ups</h1>
                    <p className="text-muted-foreground mt-1">Schedule timed follow-up messages to contacts</p>
                </div>
                <Button onClick={() => setIsAddOpen(true)}>
                    <Plus className="w-4 h-4 mr-2" /> Schedule Follow-up
                </Button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { label: 'Total', value: stats.total, color: 'text-foreground' },
                    { label: 'Pending', value: stats.pending, color: 'text-amber-500' },
                    { label: 'Sent', value: stats.sent, color: 'text-emerald-500' },
                    { label: 'Failed', value: stats.failed, color: 'text-red-500' },
                ].map((s) => (
                    <Card key={s.label}>
                        <CardContent className="pt-4 pb-4">
                            <p className="text-xs text-muted-foreground">{s.label}</p>
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Filter Tabs */}
            <Tabs value={filter} onValueChange={setFilter}>
                <TabsList>
                    <TabsTrigger value="all">All</TabsTrigger>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="sent">Sent</TabsTrigger>
                    <TabsTrigger value="failed">Failed</TabsTrigger>
                </TabsList>
            </Tabs>

            {/* List */}
            {filtered.length === 0 ? (
                <Card>
                    <CardContent className="pt-12 pb-12">
                        <div className="text-center text-muted-foreground">
                            <Clock className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No follow-ups {filter !== 'all' ? `with status "${filter}"` : ''}</p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map((item) => (
                        <Card key={item.id}>
                            <CardContent className="pt-3 pb-3">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        {statusIcon(item.status)}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium text-sm">{item.name || 'Follow-up'}</p>
                                                <span className="text-[10px] text-muted-foreground font-mono">→ {item.phone}</span>
                                                {item.session_name && <span className="text-[10px] text-muted-foreground">via {item.session_name}</span>}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.message}</p>
                                            <div className="flex items-center gap-3 mt-2 text-[10px] text-muted-foreground">
                                                <span>Delay: {item.delay_minutes}m</span>
                                                {item.scheduled_for && <span>Scheduled: {new Date(item.scheduled_for).toLocaleString()}</span>}
                                                {item.sent_at && <span>Sent: {new Date(item.sent_at).toLocaleString()}</span>}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        {item.status === 'pending' && (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => handleRunNow(item.id)} title="Send now">
                                                    <Play className="w-4 h-4 text-emerald-500" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleDelete(item.id)} className="text-red-500 hover:text-red-600">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add Dialog */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Schedule Follow-up</DialogTitle>
                        <DialogDescription>Send a message after a delay</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Name (optional)</Label>
                            <Input placeholder="Follow-up after demo" value={newItem.name} onChange={(e) => setNewItem({ ...newItem, name: e.target.value })} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <Label>Phone Number</Label>
                                <Input placeholder="919876543210" value={newItem.phone} onChange={(e) => setNewItem({ ...newItem, phone: e.target.value })} />
                            </div>
                            <div>
                                <Label>Delay (minutes)</Label>
                                <Input type="number" min="1" value={newItem.delayMinutes} onChange={(e) => setNewItem({ ...newItem, delayMinutes: parseInt(e.target.value) || 60 })} />
                            </div>
                        </div>
                        <div>
                            <Label>Session</Label>
                            <Select value={newItem.sessionId} onValueChange={(v) => setNewItem({ ...newItem, sessionId: v || '' })}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a session" />
                                </SelectTrigger>
                                <SelectContent>
                                    {sessions.map((s: any) => (
                                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.phone || s.id})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label>Message</Label>
                            <Textarea placeholder="Hi! Just following up on our conversation..." rows={3} value={newItem.message} onChange={(e) => setNewItem({ ...newItem, message: e.target.value })} />
                        </div>
                        <Button onClick={handleAdd} className="w-full">Schedule Follow-up</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
