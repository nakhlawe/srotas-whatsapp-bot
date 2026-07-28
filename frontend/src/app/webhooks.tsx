'use client';

import React, { useEffect, useState } from 'react';
import { getWebhooks, addWebhook, updateWebhook, deleteWebhook, testWebhook, getWebhookEvents } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Trash2, Plus, TestTube, Globe, Clock, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

export function Webhooks() {
    const [hooks, setHooks] = useState<any[]>([]);
    const [eventTypes, setEventTypes] = useState<any[]>([]);
    const [isAddOpen, setIsAddOpen] = useState(false);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [newHook, setNewHook] = useState({ url: '', name: '', secret: '', events: ['message.received'] });
    const [testingId, setTestingId] = useState<number | null>(null);

    useEffect(() => { fetchHooks(); fetchEvents(); }, []);

    const fetchHooks = async () => {
        try { setHooks(await getWebhooks()); } catch (e) { console.error(e); }
    };
    const fetchEvents = async () => {
        try { setEventTypes(await getWebhookEvents()); } catch (e) { console.error(e); }
    };

    const handleAddOrEdit = async () => {
        if (!newHook.url.trim()) return toast.error('Webhook URL is required');
        try {
            if (editingId) {
                await updateWebhook(String(editingId), newHook);
                toast.success('Webhook updated');
            } else {
                await addWebhook(newHook);
                toast.success('Webhook created');
            }
            setIsAddOpen(false);
            setEditingId(null);
            setNewHook({ url: '', name: '', secret: '', events: ['message.received'] });
            fetchHooks();
        } catch (e: any) { toast.error(e?.response?.data?.error || 'Failed'); }
    };

    const handleDelete = async (id: number) => {
        if (!confirm('Delete this webhook?')) return;
        try {
            await deleteWebhook(String(id));
            toast.success('Webhook deleted');
            fetchHooks();
        } catch (e) { toast.error('Failed to delete'); }
    };

    const handleToggle = async (id: number, enabled: boolean) => {
        try {
            await updateWebhook(String(id), { enabled: enabled ? 1 : 0 });
            setHooks(prev => prev.map(h => h.id === id ? { ...h, enabled: enabled ? 1 : 0 } : h));
        } catch (e) { toast.error('Failed to toggle'); }
    };

    const handleTest = async (id: number) => {
        setTestingId(id);
        try {
            const result = await testWebhook(String(id));
            if (result.success) {
                toast.success(`Test successful (HTTP ${result.status})`);
            } else {
                toast.error(`Test failed (HTTP ${result.status || 'timeout'})`);
            }
        } catch (e) { toast.error('Test failed'); }
        setTestingId(null);
    };

    const openEditModal = (hook: any) => {
        setEditingId(hook.id);
        let events = ['message.received'];
        try { events = JSON.parse(hook.events); } catch (e) {}
        setNewHook({ url: hook.url, name: hook.name || '', secret: hook.secret || '', events });
        setIsAddOpen(true);
    };

    const toggleEvent = (eventKey: string) => {
        setNewHook(prev => {
            const events = prev.events.includes(eventKey)
                ? prev.events.filter(e => e !== eventKey)
                : [...prev.events, eventKey];
            return { ...prev, events };
        });
    };

    return (
        <div className="p-6 xl:p-10 max-w-[1600px] mx-auto space-y-6 w-full">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Webhooks</h1>
                    <p className="text-muted-foreground mt-1">Receive HTTP notifications when events occur</p>
                </div>
                <Button onClick={() => { setEditingId(null); setNewHook({ url: '', name: '', secret: '', events: ['message.received'] }); setIsAddOpen(true); }}>
                    <Plus className="w-4 h-4 mr-2" /> Add Webhook
                </Button>
            </div>

            {hooks.length === 0 ? (
                <Card>
                    <CardContent className="pt-12 pb-12">
                        <div className="text-center text-muted-foreground">
                            <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="text-sm">No webhooks configured</p>
                            <p className="text-xs mt-1">Add a webhook URL to receive event notifications</p>
                        </div>
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {hooks.map((hook) => (
                        <Card key={hook.id}>
                            <CardContent className="pt-4 pb-4">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-sm">{hook.name || hook.url}</p>
                                            {hook.enabled ? (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-medium">Active</span>
                                            ) : (
                                                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-500/10 text-neutral-400 font-medium">Disabled</span>
                                            )}
                                        </div>
                                        <p className="text-xs text-muted-foreground font-mono mt-1 truncate">{hook.url}</p>
                                        {hook.last_triggered_at && (
                                            <div className="flex items-center gap-1 mt-2 text-[10px] text-muted-foreground">
                                                <Clock className="w-3 h-3" />
                                                Last: {new Date(hook.last_triggered_at).toLocaleString()}
                                                {hook.last_status ? (
                                                    hook.last_status >= 200 && hook.last_status < 300
                                                        ? <CheckCircle className="w-3 h-3 text-emerald-500" />
                                                        : <XCircle className="w-3 h-3 text-red-500" />
                                                ) : null}
                                                {hook.last_status ? ` (${hook.last_status})` : ''}
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                        <Button variant="ghost" size="sm" onClick={() => handleTest(hook.id)} disabled={testingId === hook.id} title="Send test event">
                                            <TestTube className="w-4 h-4" />
                                        </Button>
                                        <Switch checked={!!hook.enabled} onCheckedChange={(v) => handleToggle(hook.id, v)} />
                                        <Button variant="ghost" size="sm" onClick={() => openEditModal(hook)}>
                                            Edit
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => handleDelete(hook.id)} className="text-red-500 hover:text-red-600">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            )}

            {/* Add/Edit Dialog */}
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>{editingId ? 'Edit Webhook' : 'Add Webhook'}</DialogTitle>
                        <DialogDescription>Configure the endpoint to receive event notifications</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Name (optional)</Label>
                            <Input placeholder="My webhook" value={newHook.name} onChange={(e) => setNewHook({ ...newHook, name: e.target.value })} />
                        </div>
                        <div>
                            <Label>URL</Label>
                            <Input placeholder="https://example.com/webhook" value={newHook.url} onChange={(e) => setNewHook({ ...newHook, url: e.target.value })} />
                        </div>
                        <div>
                            <Label>Secret (optional)</Label>
                            <Input placeholder="Shared secret for signature verification" value={newHook.secret} onChange={(e) => setNewHook({ ...newHook, secret: e.target.value })} />
                        </div>
                        <div>
                            <Label>Events</Label>
                            <div className="space-y-2 mt-2">
                                {eventTypes.map((evt) => (
                                    <label key={evt.key} className="flex items-center gap-3 p-2 rounded-lg border border-border/50 hover:bg-secondary/30 cursor-pointer transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={newHook.events.includes(evt.key)}
                                            onChange={() => toggleEvent(evt.key)}
                                            className="rounded"
                                        />
                                        <span className="text-sm">{evt.label}</span>
                                        <span className="text-[10px] text-muted-foreground font-mono ml-auto">{evt.key}</span>
                                    </label>
                                ))}
                            </div>
                        </div>
                        <Button onClick={handleAddOrEdit} className="w-full">{editingId ? 'Update' : 'Create'} Webhook</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
