'use client';

import React, { useEffect, useState } from 'react';
import { getSessions, getWaGroups, getWaGroupParticipants, addWaGroupMembers, removeWaGroupMembers, createWaGroup, renameWaGroup, leaveWaGroup, getWaGroupInvite } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, Plus, Trash2, RefreshCw, Crown, Link, LogOut, UserPlus, UserMinus, Settings, Search, Loader2, Copy } from 'lucide-react';
import { toast } from 'sonner';

export function GroupController() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [selectedSession, setSelectedSession] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);

    // Dialogs
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [isRemoveMemberOpen, setIsRemoveMemberOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);

    // Form states
    const [addPhone, setAddPhone] = useState('');
    const [removePhone, setRemovePhone] = useState('');
    const [createName, setCreateName] = useState('');
    const [createPhones, setCreatePhones] = useState('');
    const [renameName, setRenameName] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [searchMembers, setSearchMembers] = useState('');

    useEffect(() => {
        getSessions().then(s => {
            setSessions(s);
            const ready = s.find((ss: any) => ss.status === 'ready');
            if (ready) {
                setSelectedSession(ready.id);
                fetchGroups(ready.id);
            }
        }).catch(console.error);
    }, []);

    const fetchGroups = async (sessionId: string) => {
        setLoading(true);
        try {
            const data = await getWaGroups(sessionId);
            setGroups(data.value || data || []);
        } catch (e) {
            toast.error('Failed to load groups');
        }
        setLoading(false);
    };

    const fetchMembers = async (group: any) => {
        setSelectedGroup(group);
        setLoadingMembers(true);
        try {
            const data = await getWaGroupParticipants(selectedSession, group.id);
            setMembers(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error('Failed to load members');
        }
        setLoadingMembers(false);
    };

    const handleAddMember = async () => {
        if (!addPhone.trim()) return toast.error('Phone number required');
        try {
            const phone = addPhone.replace(/[^0-9]/g, '');
            await addWaGroupMembers(selectedGroup.id, selectedSession, [phone]);
            toast.success(`${phone} added to ${selectedGroup.name}`);
            setIsAddMemberOpen(false);
            setAddPhone('');
            fetchMembers(selectedGroup);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to add member');
        }
    };

    const handleRemoveMember = async () => {
        if (!removePhone.trim()) return toast.error('Phone number required');
        try {
            const phone = removePhone.replace(/[^0-9]/g, '');
            await removeWaGroupMembers(selectedGroup.id, selectedSession, [phone]);
            toast.success(`${phone} removed from ${selectedGroup.name}`);
            setIsRemoveMemberOpen(false);
            setRemovePhone('');
            fetchMembers(selectedGroup);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to remove member');
        }
    };

    const handleCreateGroup = async () => {
        if (!createName.trim() || !createPhones.trim()) return toast.error('Name and phones required');
        try {
            const phones = createPhones.split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean);
            await createWaGroup(selectedSession, createName, phones);
            toast.success(`Group "${createName}" created!`);
            setIsCreateOpen(false);
            setCreateName('');
            setCreatePhones('');
            fetchGroups(selectedSession);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to create group');
        }
    };

    const handleRename = async () => {
        if (!renameName.trim()) return toast.error('New name required');
        try {
            await renameWaGroup(selectedGroup.id, selectedSession, renameName);
            toast.success(`Group renamed to "${renameName}"`);
            setIsRenameOpen(false);
            setRenameName('');
            fetchGroups(selectedSession);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to rename');
        }
    };

    const handleLeave = async () => {
        if (!confirm(`Leave "${selectedGroup.name}"? This cannot be undone.`)) return;
        try {
            await leaveWaGroup(selectedGroup.id, selectedSession);
            toast.success(`Left "${selectedGroup.name}"`);
            setSelectedGroup(null);
            setMembers([]);
            fetchGroups(selectedSession);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to leave');
        }
    };

    const handleGetInvite = async () => {
        try {
            const data = await getWaGroupInvite(selectedGroup.id, selectedSession);
            setInviteLink(data.inviteLink);
            setIsInviteOpen(true);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to get invite link');
        }
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(inviteLink);
        toast.success('Link copied!');
    };

    const filteredMembers = members.filter(m =>
        !searchMembers || (m.name && m.name.toLowerCase().includes(searchMembers.toLowerCase())) || m.phone?.includes(searchMembers)
    );

    return (
        <div className="p-6 xl:p-10 max-w-[1600px] mx-auto space-y-6 w-full">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Group Controller</h1>
                    <p className="text-muted-foreground mt-1">Manage WhatsApp groups — add/remove members, create groups, get invite links</p>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => fetchGroups(selectedSession)} disabled={!selectedSession || loading}>
                        <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    <Button onClick={() => setIsCreateOpen(true)} disabled={!selectedSession}>
                        <Plus className="w-4 h-4 mr-2" /> Create Group
                    </Button>
                </div>
            </div>

            {/* Session Selector */}
            <Card>
                <CardContent className="pt-4 pb-4">
                    <div className="flex items-center gap-4">
                        <Label className="text-sm font-medium whitespace-nowrap">Device:</Label>
                        <Select value={selectedSession} onValueChange={(v) => { if (v) { setSelectedSession(v); fetchGroups(v); } }}>
                            <SelectTrigger className="w-[300px]">
                                <SelectValue placeholder="Select a session" />
                            </SelectTrigger>
                            <SelectContent>
                                {sessions.filter((s: any) => s.status === 'ready').map((s: any) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name} ({s.phone || s.id})</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <span className="text-xs text-muted-foreground">{groups.length} groups</span>
                    </div>
                </CardContent>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Groups List */}
                <div className="lg:col-span-1 space-y-3">
                    <h3 className="text-sm font-semibold text-muted-foreground">WhatsApp Groups</h3>
                    {loading ? (
                        <Card><CardContent className="pt-6 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading...</CardContent></Card>
                    ) : groups.length === 0 ? (
                        <Card><CardContent className="pt-6 text-center text-muted-foreground">No groups found</CardContent></Card>
                    ) : (
                        groups.map((g) => (
                            <Card
                                key={g.id}
                                className={`cursor-pointer transition-all hover:shadow-md ${selectedGroup?.id === g.id ? 'border-primary shadow-md' : 'border-border/50'}`}
                                onClick={() => fetchMembers(g)}
                            >
                                <CardContent className="pt-3 pb-3">
                                    <div className="flex items-center justify-between">
                                        <div className="min-w-0 flex-1">
                                            <p className="font-medium text-sm truncate">{g.name}</p>
                                            <p className="text-xs text-muted-foreground">{g.participantCount} members</p>
                                        </div>
                                        {selectedGroup?.id === g.id && (
                                            <div className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>

                {/* Group Detail / Members */}
                <div className="lg:col-span-2">
                    {selectedGroup ? (
                        <Card>
                            <CardHeader className="pb-3">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <CardTitle className="text-lg">{selectedGroup.name}</CardTitle>
                                        <CardDescription>{members.length} members loaded</CardDescription>
                                    </div>
                                    <div className="flex gap-1.5 flex-wrap justify-end">
                                        <Button variant="outline" size="sm" onClick={() => setIsAddMemberOpen(true)}>
                                            <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => setIsRemoveMemberOpen(true)}>
                                            <UserMinus className="w-3.5 h-3.5 mr-1" /> Remove
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleGetInvite}>
                                            <Link className="w-3.5 h-3.5 mr-1" /> Invite
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={() => { setRenameName(selectedGroup.name); setIsRenameOpen(true); }}>
                                            <Settings className="w-3.5 h-3.5 mr-1" /> Rename
                                        </Button>
                                        <Button variant="outline" size="sm" onClick={handleLeave} className="text-red-500 hover:text-red-600 hover:bg-red-500/10">
                                            <LogOut className="w-3.5 h-3.5 mr-1" /> Leave
                                        </Button>
                                    </div>
                                </div>
                            </CardHeader>
                            <CardContent>
                                {loadingMembers ? (
                                    <div className="text-center py-8 text-muted-foreground">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading members...
                                    </div>
                                ) : (
                                    <>
                                        <div className="flex gap-2 mb-4">
                                            <div className="relative flex-1">
                                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                                <Input
                                                    placeholder="Search members..."
                                                    value={searchMembers}
                                                    onChange={(e) => setSearchMembers(e.target.value)}
                                                    className="pl-9"
                                                />
                                            </div>
                                        </div>
                                        <div className="max-h-[500px] overflow-y-auto space-y-1">
                                            {filteredMembers.length === 0 ? (
                                                <p className="text-center text-muted-foreground py-8 text-sm">No members found</p>
                                            ) : (
                                                filteredMembers.map((m, i) => (
                                                    <div key={m.phone || i} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-secondary/50 transition-colors">
                                                        <div className="flex items-center gap-3 min-w-0">
                                                            <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center text-xs font-bold text-muted-foreground flex-shrink-0">
                                                                {(m.name || m.phone || '?')[0].toUpperCase()}
                                                            </div>
                                                            <div className="min-w-0">
                                                                <p className="text-sm font-medium truncate">{m.name || m.pushname || 'Unknown'}</p>
                                                                <p className="text-xs text-muted-foreground font-mono">{m.phone}</p>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </>
                                )}
                            </CardContent>
                        </Card>
                    ) : (
                        <Card>
                            <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                                <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="text-sm">Select a group to manage</p>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            {/* Add Member Dialog */}
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Member to {selectedGroup?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Phone Number</Label>
                            <Input placeholder="919876543210" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddMember()} />
                        </div>
                        <Button onClick={handleAddMember} className="w-full">Add Member</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Remove Member Dialog */}
            <Dialog open={isRemoveMemberOpen} onOpenChange={setIsRemoveMemberOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Remove Member from {selectedGroup?.name}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Phone Number</Label>
                            <Input placeholder="919876543210" value={removePhone} onChange={(e) => setRemovePhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRemoveMember()} />
                        </div>
                        <Button onClick={handleRemoveMember} className="w-full bg-red-600 hover:bg-red-700">Remove Member</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Group Dialog */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create New Group</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Group Name</Label>
                            <Input placeholder="My New Group" value={createName} onChange={(e) => setCreateName(e.target.value)} />
                        </div>
                        <div>
                            <Label>Members (comma separated phones)</Label>
                            <Textarea placeholder={"919876543210\n919876543211\n919876543212"} rows={4} value={createPhones} onChange={(e) => setCreatePhones(e.target.value)} />
                        </div>
                        <Button onClick={handleCreateGroup} className="w-full">Create Group</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rename Dialog */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Group</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>New Name</Label>
                            <Input value={renameName} onChange={(e) => setRenameName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename()} />
                        </div>
                        <Button onClick={handleRename} className="w-full">Rename</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Invite Link Dialog */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Invite Link</DialogTitle>
                        <DialogDescription>{selectedGroup?.name}</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="flex gap-2">
                            <Input value={inviteLink} readOnly className="font-mono text-xs" />
                            <Button variant="outline" onClick={copyInviteLink}>
                                <Copy className="w-4 h-4" />
                            </Button>
                        </div>
                        <Button variant="outline" className="w-full" onClick={() => window.open(inviteLink, '_blank')}>Open in WhatsApp</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
