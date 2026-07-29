'use client';

import React, { useEffect, useState } from 'react';
import { getSessions, getWaGroups, getWaGroupParticipantsDetailed, addWaGroupMembers, removeWaGroupMembers, createWaGroup, renameWaGroup, leaveWaGroup, getWaGroupInvite, getWaGroupCategories, createWaGroupCategory, renameWaGroupCategory, deleteWaGroupCategory, getWaGroupCategoryMembers, addGroupToCategory, removeGroupCategoryMember, bulkAddToCategoryGroups, bulkRemoveFromCategoryGroups } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Users, Plus, RefreshCw, Crown, Link, LogOut, UserPlus, UserMinus, Settings, Search, Loader2, Copy, Shield, Phone, Building2, FolderTree, FolderPlus, Tag, Check, X, Trash2, Layers, Send } from 'lucide-react';
import { toast } from 'sonner';

export function GroupController() {
    const [sessions, setSessions] = useState<any[]>([]);
    const [selectedSession, setSelectedSession] = useState('');
    const [groups, setGroups] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [members, setMembers] = useState<any[]>([]);
    const [loadingMembers, setLoadingMembers] = useState(false);
    const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

    const [searchGroup, setSearchGroup] = useState('');

    // Categories
    const [categories, setCategories] = useState<any[]>([]);
    const [selectedCategory, setSelectedCategory] = useState<any>(null);
    const [categoryMembers, setCategoryMembers] = useState<any[]>([]);

    // Dialogs
    const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);
    const [isRemoveMemberOpen, setIsRemoveMemberOpen] = useState(false);
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [isRenameOpen, setIsRenameOpen] = useState(false);
    const [isInviteOpen, setIsInviteOpen] = useState(false);
    const [isCategoryCreateOpen, setIsCategoryCreateOpen] = useState(false);
    const [isCategoryRenameOpen, setIsCategoryRenameOpen] = useState(false);
    const [isAssignCategoryOpen, setIsAssignCategoryOpen] = useState(false);
    const [isBulkAddOpen, setIsBulkAddOpen] = useState(false);
    const [isBulkRemoveOpen, setIsBulkRemoveOpen] = useState(false);
    const [activeTab, setActiveTab] = useState('groups');

    // Form states
    const [addPhone, setAddPhone] = useState('');
    const [removePhone, setRemovePhone] = useState('');
    const [createName, setCreateName] = useState('');
    const [createPhones, setCreatePhones] = useState('');
    const [renameName, setRenameName] = useState('');
    const [inviteLink, setInviteLink] = useState('');
    const [searchMembers, setSearchMembers] = useState('');
    const [categoryName, setCategoryName] = useState('');
    const [categoryDesc, setCategoryDesc] = useState('');
    const [selectedCategoryAssign, setSelectedCategoryAssign] = useState('');
    const [bulkPhones, setBulkPhones] = useState('');

    useEffect(() => {
        getSessions().then(s => {
            setSessions(s);
            const ready = s.find((ss: any) => ss.status === 'ready');
            if (ready) {
                setSelectedSession(ready.id);
                fetchGroups(ready.id);
            }
        }).catch(console.error);
        fetchCategories();
    }, []);

    const fetchCategories = async () => {
        try {
            const data = await getWaGroupCategories();
            setCategories(data || []);
        } catch (e) {
            console.error('Failed to load categories');
        }
    };

    const fetchGroups = async (sessionId: string) => {
        setLoading(true);
        try {
            const data = await getWaGroups(sessionId);
            setGroups(Array.isArray(data) ? data : (data.value || []));
        } catch (e) {
            toast.error('Failed to load groups');
        }
        setLoading(false);
    };

    const fetchCategoryMembers = async (cat: any) => {
        setSelectedCategory(cat);
        try {
            const data = await getWaGroupCategoryMembers(cat.id);
            setCategoryMembers(data || []);
        } catch (e) {
            toast.error('Failed to load category groups');
        }
    };

    const fetchMembers = async (group: any) => {
        setSelectedGroup(group);
        setSelectedMembers(new Set());
        setLoadingMembers(true);
        try {
            const data = await getWaGroupParticipantsDetailed(group.id, selectedSession);
            setMembers(Array.isArray(data) ? data : []);
        } catch (e) {
            toast.error('Failed to load members');
        }
        setLoadingMembers(false);
    };

    const toggleMember = (phone: string) => {
        setSelectedMembers(prev => {
            const next = new Set(prev);
            if (next.has(phone)) next.delete(phone);
            else next.add(phone);
            return next;
        });
    };

    const selectAll = () => {
        const nonAdmins = filteredMembers.filter(m => !m.isAdmin).map(m => m.phone);
        setSelectedMembers(new Set(nonAdmins));
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

    const handleRemoveSelected = async () => {
        if (selectedMembers.size === 0) return toast.error('Select members first');
        const phones = Array.from(selectedMembers);
        if (!confirm(`Remove ${phones.length} member(s) from ${selectedGroup.name}?`)) return;
        try {
            await removeWaGroupMembers(selectedGroup.id, selectedSession, phones);
            toast.success(`${phones.length} member(s) removed`);
            setSelectedMembers(new Set());
            fetchMembers(selectedGroup);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to remove members');
        }
    };

    const handleRemoveSingle = async (phone: string) => {
        if (!confirm(`Remove ${phone} from ${selectedGroup.name}?`)) return;
        try {
            await removeWaGroupMembers(selectedGroup.id, selectedSession, [phone]);
            toast.success(`${phone} removed`);
            fetchMembers(selectedGroup);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to remove');
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
            toast.error(e?.response?.data?.error || 'Failed to get invite');
        }
    };

    const copyInviteLink = () => {
        navigator.clipboard.writeText(inviteLink);
        toast.success('Link copied!');
    };

    const handleCreateCategory = async () => {
        if (!categoryName.trim()) return toast.error('Category name required');
        try {
            await createWaGroupCategory(categoryName.trim(), categoryDesc.trim());
            toast.success(`Category "${categoryName}" created`);
            setIsCategoryCreateOpen(false);
            setCategoryName('');
            setCategoryDesc('');
            fetchCategories();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to create category');
        }
    };

    const handleRenameCategory = async () => {
        if (!categoryName.trim() || !selectedCategory) return;
        try {
            await renameWaGroupCategory(selectedCategory.id, categoryName.trim());
            toast.success('Category renamed');
            setIsCategoryRenameOpen(false);
            setCategoryName('');
            fetchCategories();
            setSelectedCategory({ ...selectedCategory, name: categoryName.trim() });
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to rename');
        }
    };

    const handleDeleteCategory = async (cat: any) => {
        if (!confirm(`Delete category "${cat.name}"? Groups in it will not be affected.`)) return;
        try {
            await deleteWaGroupCategory(cat.id);
            toast.success('Category deleted');
            if (selectedCategory?.id === cat.id) {
                setSelectedCategory(null);
                setCategoryMembers([]);
            }
            fetchCategories();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to delete');
        }
    };

    const handleAssignGroup = async () => {
        if (!selectedCategoryAssign || !selectedGroup) return toast.error('Select a category');
        try {
            await addGroupToCategory(parseInt(selectedCategoryAssign), selectedSession, selectedGroup.id, selectedGroup.name);
            toast.success(`"${selectedGroup.name}" added to category`);
            setIsAssignCategoryOpen(false);
            setSelectedCategoryAssign('');
            if (selectedCategory?.id === parseInt(selectedCategoryAssign)) {
                fetchCategoryMembers(selectedCategory);
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to assign');
        }
    };

    const handleRemoveGroupFromCategory = async (memberId: number) => {
        try {
            await removeGroupCategoryMember(memberId);
            toast.success('Group removed from category');
            fetchCategoryMembers(selectedCategory);
        } catch (e: any) {
            toast.error('Failed to remove from category');
        }
    };

    const handleBulkAdd = async () => {
        if (!bulkPhones.trim() || !selectedCategory) return toast.error('Phone numbers required');
        const phones = bulkPhones.split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean);
        if (!phones.length) return toast.error('No valid phone numbers');
        if (!confirm(`Add ${phones.length} number(s) to all ${categoryMembers.length} group(s) in "${selectedCategory.name}"?`)) return;
        try {
            const result = await bulkAddToCategoryGroups(selectedCategory.id, selectedSession, phones);
            const ok = result.results.filter((r: any) => r.status === 'ok').length;
            const err = result.results.filter((r: any) => r.status === 'error').length;
            toast.success(`Added to ${ok} group(s)${err ? `, ${err} failed` : ''}`);
            setIsBulkAddOpen(false);
            setBulkPhones('');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Bulk add failed');
        }
    };

    const handleBulkRemove = async () => {
        if (!bulkPhones.trim() || !selectedCategory) return toast.error('Phone numbers required');
        const phones = bulkPhones.split(',').map(p => p.replace(/[^0-9]/g, '')).filter(Boolean);
        if (!phones.length) return toast.error('No valid phone numbers');
        if (!confirm(`Remove ${phones.length} number(s) from all ${categoryMembers.length} group(s) in "${selectedCategory.name}"?`)) return;
        try {
            const result = await bulkRemoveFromCategoryGroups(selectedCategory.id, selectedSession, phones);
            const ok = result.results.filter((r: any) => r.status === 'ok').length;
            const err = result.results.filter((r: any) => r.status === 'error').length;
            toast.success(`Removed from ${ok} group(s)${err ? `, ${err} failed` : ''}`);
            setIsBulkRemoveOpen(false);
            setBulkPhones('');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Bulk remove failed');
        }
    };

    const filteredGroups = groups.filter(g =>
        !searchGroup ||
        g.name?.toLowerCase().includes(searchGroup.toLowerCase()) ||
        g.id?.includes(searchGroup)
    );

    const filteredMembers = members.filter(m =>
        !searchMembers ||
        (m.name && m.name.toLowerCase().includes(searchMembers.toLowerCase())) ||
        (m.dbName && m.dbName.toLowerCase().includes(searchMembers.toLowerCase())) ||
        m.phone?.includes(searchMembers)
    );

    const adminCount = members.filter(m => m.isAdmin).length;
    const regularCount = members.filter(m => !m.isAdmin).length;

    // ─── Shared group list ───
    const GroupList = () => (
        <div className="space-y-2 max-h-[500px] overflow-y-auto">
            {filteredGroups.map((g) => (
                <Card
                    key={g.id}
                    className={`cursor-pointer transition-all hover:shadow-md ${selectedGroup?.id === g.id ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border/50'}`}
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
            ))}
        </div>
    );

    return (
        <div className="p-6 xl:p-10 max-w-[1600px] mx-auto space-y-6 w-full">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Group Controller</h1>
                    <p className="text-muted-foreground mt-1">Manage WhatsApp groups, categories, and bulk actions</p>
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

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="grid w-[400px] grid-cols-2">
                    <TabsTrigger value="groups" className="gap-2"><Users className="w-4 h-4" /> All Groups</TabsTrigger>
                    <TabsTrigger value="categories" className="gap-2"><FolderTree className="w-4 h-4" /> Categories</TabsTrigger>
                </TabsList>

                {/* ─── ALL GROUPS TAB ─── */}
                <TabsContent value="groups" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Groups List */}
                        <div className="lg:col-span-1 space-y-3">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search groups by name..."
                                    value={searchGroup}
                                    onChange={(e) => setSearchGroup(e.target.value)}
                                    className="pl-9"
                                />
                            </div>
                            {loading ? (
                                <Card><CardContent className="pt-6 text-center text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" /> Loading...</CardContent></Card>
                            ) : filteredGroups.length === 0 ? (
                                <Card><CardContent className="pt-6 text-center text-muted-foreground">No groups found</CardContent></Card>
                            ) : (
                                <GroupList />
                            )}
                        </div>

                        {/* Group Detail / Members */}
                        <div className="lg:col-span-2">
                            {selectedGroup ? (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <CardTitle className="text-lg flex items-center gap-2">{selectedGroup.name}</CardTitle>
                                                <div className="flex items-center gap-4 mt-1">
                                                    <CardDescription>{members.length} members</CardDescription>
                                                    {adminCount > 0 && <span className="text-xs text-amber-500 flex items-center gap-1"><Crown className="w-3 h-3" /> {adminCount} admin(s)</span>}
                                                    {selectedMembers.size > 0 && <span className="text-xs text-primary">{selectedMembers.size} selected</span>}
                                                </div>
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap justify-end">
                                                <Button variant="outline" size="sm" onClick={() => setIsAssignCategoryOpen(true)}>
                                                    <Tag className="w-3.5 h-3.5 mr-1" /> Categorize
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setIsAddMemberOpen(true)}>
                                                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                                                </Button>
                                                {selectedMembers.size > 0 ? (
                                                    <Button size="sm" onClick={handleRemoveSelected} className="bg-red-600 hover:bg-red-700">
                                                        <UserMinus className="w-3.5 h-3.5 mr-1" /> Remove ({selectedMembers.size})
                                                    </Button>
                                                ) : (
                                                    <Button variant="outline" size="sm" onClick={() => { setRemovePhone(''); setIsRemoveMemberOpen(true); }}>
                                                        <UserMinus className="w-3.5 h-3.5 mr-1" /> Remove
                                                    </Button>
                                                )}
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
                                                            placeholder="Search by name or phone..."
                                                            value={searchMembers}
                                                            onChange={(e) => setSearchMembers(e.target.value)}
                                                            className="pl-9"
                                                        />
                                                    </div>
                                                    {selectedMembers.size === 0 && (
                                                        <Button variant="outline" size="sm" onClick={selectAll} className="whitespace-nowrap">
                                                            Select Non-Admins
                                                        </Button>
                                                    )}
                                                    {selectedMembers.size > 0 && (
                                                        <Button variant="outline" size="sm" onClick={() => setSelectedMembers(new Set())} className="whitespace-nowrap">
                                                            Clear
                                                        </Button>
                                                    )}
                                                </div>
                                                <div className="max-h-[500px] overflow-y-auto space-y-1">
                                                    {filteredMembers.length === 0 ? (
                                                        <p className="text-center text-muted-foreground py-8 text-sm">No members found</p>
                                                    ) : (
                                                        filteredMembers.map((m) => {
                                                            const displayName = m.dbName || m.name || 'Unknown';
                                                            const isSelected = selectedMembers.has(m.phone);
                                                            return (
                                                                <div
                                                                    key={m.phone}
                                                                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors cursor-pointer ${
                                                                        isSelected ? 'bg-primary/10 border border-primary/30' : 'hover:bg-secondary/50 border border-transparent'
                                                                    }`}
                                                                    onClick={() => toggleMember(m.phone)}
                                                                >
                                                                    <div className="flex items-center gap-3 min-w-0 flex-1">
                                                                        <input
                                                                            type="checkbox"
                                                                            checked={isSelected}
                                                                            onChange={() => toggleMember(m.phone)}
                                                                            className="rounded flex-shrink-0"
                                                                            onClick={(e) => e.stopPropagation()}
                                                                        />
                                                                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                                                                            m.isAdmin ? 'bg-amber-500/20 text-amber-600' : 'bg-secondary text-muted-foreground'
                                                                        }`}>
                                                                            {m.isAdmin ? <Crown className="w-4 h-4" /> : displayName[0]?.toUpperCase() || '?'}
                                                                        </div>
                                                                        <div className="min-w-0">
                                                                            <div className="flex items-center gap-2">
                                                                                <p className="text-sm font-medium truncate">{displayName}</p>
                                                                                {m.isAdmin && (
                                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 font-medium whitespace-nowrap">
                                                                                        {m.admin === 'superadmin' ? 'Owner' : 'Admin'}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                            <div className="flex items-center gap-2 mt-0.5">
                                                                                <span className="text-xs text-muted-foreground font-mono">{m.phone}</span>
                                                                                {m.dbName && m.name && m.dbName !== m.name && (
                                                                                    <span className="text-[10px] text-muted-foreground/60">WA: {m.name}</span>
                                                                                )}
                                                                                {m.dbCompany && (
                                                                                    <span className="text-[10px] text-muted-foreground/60 flex items-center gap-0.5">
                                                                                        <Building2 className="w-2.5 h-2.5" /> {m.dbCompany}
                                                                                    </span>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                    <Button
                                                                        variant="ghost"
                                                                        size="sm"
                                                                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10 flex-shrink-0"
                                                                        onClick={(e) => { e.stopPropagation(); handleRemoveSingle(m.phone); }}
                                                                        title="Remove from group"
                                                                    >
                                                                        <UserMinus className="w-3.5 h-3.5" />
                                                                    </Button>
                                                                </div>
                                                            );
                                                        })
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
                </TabsContent>

                {/* ─── CATEGORIES TAB ─── */}
                <TabsContent value="categories" className="mt-4">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Categories List */}
                        <div className="lg:col-span-1 space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-sm font-semibold text-muted-foreground">Group Categories</h3>
                                <Button size="sm" variant="outline" onClick={() => { setCategoryName(''); setCategoryDesc(''); setIsCategoryCreateOpen(true); }}>
                                    <FolderPlus className="w-3.5 h-3.5 mr-1" /> New
                                </Button>
                            </div>
                            {categories.length === 0 ? (
                                <Card><CardContent className="pt-6 text-center text-muted-foreground text-sm">No categories yet. Create one to organize your groups.</CardContent></Card>
                            ) : (
                                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                                    {categories.map((cat) => (
                                        <Card
                                            key={cat.id}
                                            className={`cursor-pointer transition-all hover:shadow-md ${selectedCategory?.id === cat.id ? 'border-primary shadow-md ring-1 ring-primary/20' : 'border-border/50'}`}
                                            onClick={() => fetchCategoryMembers(cat)}
                                        >
                                            <CardContent className="pt-3 pb-3">
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        <FolderTree className="w-4 h-4 text-primary flex-shrink-0" />
                                                        <div className="min-w-0">
                                                            <p className="font-medium text-sm truncate">{cat.name}</p>
                                                            <p className="text-xs text-muted-foreground">{cat.group_count || 0} groups</p>
                                                        </div>
                                                    </div>
                                                    <Button
                                                        variant="ghost" size="sm"
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-500/10 flex-shrink-0 w-7 h-7 p-0"
                                                        onClick={(e) => { e.stopPropagation(); handleDeleteCategory(cat); }}
                                                    >
                                                        <Trash2 className="w-3.5 h-3.5" />
                                                    </Button>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Category Detail */}
                        <div className="lg:col-span-2">
                            {selectedCategory ? (
                                <Card>
                                    <CardHeader className="pb-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <CardTitle className="text-lg flex items-center gap-2">
                                                    <FolderTree className="w-5 h-5 text-primary" />
                                                    {selectedCategory.name}
                                                </CardTitle>
                                                <CardDescription>{categoryMembers.length} group(s) in this category</CardDescription>
                                            </div>
                                            <div className="flex gap-1.5 flex-wrap justify-end">
                                                <Button variant="outline" size="sm" onClick={() => { setCategoryName(selectedCategory.name); setIsCategoryRenameOpen(true); }}>
                                                    <Settings className="w-3.5 h-3.5 mr-1" /> Rename
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setIsBulkAddOpen(true)} disabled={categoryMembers.length === 0}>
                                                    <UserPlus className="w-3.5 h-3.5 mr-1" /> Bulk Add
                                                </Button>
                                                <Button variant="outline" size="sm" onClick={() => setIsBulkRemoveOpen(true)} disabled={categoryMembers.length === 0}>
                                                    <UserMinus className="w-3.5 h-3.5 mr-1" /> Bulk Remove
                                                </Button>
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent>
                                        {categoryMembers.length === 0 ? (
                                            <div className="text-center py-8 text-muted-foreground">
                                                <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                                <p className="text-sm">No groups assigned. Select a group in the Groups tab and click "Categorize" to add it here.</p>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                {categoryMembers.map((m) => (
                                                    <div key={m.id} className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-secondary/30 border border-border/50">
                                                        <div className="flex items-center gap-2 min-w-0 flex-1">
                                                            <Users className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                            <span className="text-sm font-medium truncate">{m.group_name || m.group_id}</span>
                                                        </div>
                                                        <Button
                                                            variant="ghost" size="sm"
                                                            className="text-red-500 hover:text-red-600 hover:bg-red-500/10 flex-shrink-0 w-7 h-7 p-0"
                                                            onClick={() => handleRemoveGroupFromCategory(m.id)}
                                                        >
                                                            <X className="w-3.5 h-3.5" />
                                                        </Button>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ) : (
                                <Card>
                                    <CardContent className="pt-12 pb-12 text-center text-muted-foreground">
                                        <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                        <p className="text-sm">Select a category to manage</p>
                                    </CardContent>
                                </Card>
                            )}
                        </div>
                    </div>
                </TabsContent>
            </Tabs>

            {/* ─── DIALOGS ─── */}

            {/* Add Member */}
            <Dialog open={isAddMemberOpen} onOpenChange={setIsAddMemberOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Add Member to {selectedGroup?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>Phone Number</Label><Input placeholder="919876543210" value={addPhone} onChange={(e) => setAddPhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddMember()} /></div>
                        <Button onClick={handleAddMember} className="w-full">Add Member</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Remove Member */}
            <Dialog open={isRemoveMemberOpen} onOpenChange={setIsRemoveMemberOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Remove Member from {selectedGroup?.name}</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>Phone Number</Label><Input placeholder="919876543210" value={removePhone} onChange={(e) => setRemovePhone(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRemoveSingle(removePhone)} /></div>
                        <Button onClick={() => { handleRemoveSingle(removePhone); setIsRemoveMemberOpen(false); }} className="w-full bg-red-600 hover:bg-red-700">Remove Member</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Group */}
            <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create New Group</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>Group Name</Label><Input placeholder="My New Group" value={createName} onChange={(e) => setCreateName(e.target.value)} /></div>
                        <div><Label>Members (comma separated)</Label><Textarea placeholder={"919876543210, 919876543211"} rows={4} value={createPhones} onChange={(e) => setCreatePhones(e.target.value)} /></div>
                        <Button onClick={handleCreateGroup} className="w-full">Create Group</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rename Group */}
            <Dialog open={isRenameOpen} onOpenChange={setIsRenameOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Rename Group</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>New Name</Label><Input value={renameName} onChange={(e) => setRenameName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRename()} /></div>
                        <Button onClick={handleRename} className="w-full">Rename</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Invite Link */}
            <Dialog open={isInviteOpen} onOpenChange={setIsInviteOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Invite Link</DialogTitle><DialogDescription>{selectedGroup?.name}</DialogDescription></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div className="flex gap-2"><Input value={inviteLink} readOnly className="font-mono text-xs" /><Button variant="outline" onClick={copyInviteLink}><Copy className="w-4 h-4" /></Button></div>
                        <Button variant="outline" className="w-full" onClick={() => window.open(inviteLink, '_blank')}>Open in WhatsApp</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Create Category */}
            <Dialog open={isCategoryCreateOpen} onOpenChange={setIsCategoryCreateOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Create Group Category</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>Category Name</Label><Input placeholder="VIP Clients" value={categoryName} onChange={(e) => setCategoryName(e.target.value)} /></div>
                        <div><Label>Description (optional)</Label><Input placeholder="For VIP client groups" value={categoryDesc} onChange={(e) => setCategoryDesc(e.target.value)} /></div>
                        <Button onClick={handleCreateCategory} className="w-full">Create Category</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rename Category */}
            <Dialog open={isCategoryRenameOpen} onOpenChange={setIsCategoryRenameOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Rename Category</DialogTitle></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>New Name</Label><Input value={categoryName} onChange={(e) => setCategoryName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameCategory()} /></div>
                        <Button onClick={handleRenameCategory} className="w-full">Rename</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Assign Group to Category */}
            <Dialog open={isAssignCategoryOpen} onOpenChange={setIsAssignCategoryOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Assign to Category</DialogTitle><DialogDescription>{selectedGroup?.name}</DialogDescription></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div>
                            <Label>Category</Label>
                            <Select value={selectedCategoryAssign} onValueChange={(v) => v && setSelectedCategoryAssign(v)}>
                                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                                <SelectContent>
                                    {categories.map((cat) => (
                                        <SelectItem key={cat.id} value={String(cat.id)}>{cat.name} ({cat.group_count || 0} groups)</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button onClick={handleAssignGroup} className="w-full" disabled={!selectedCategoryAssign}>
                            <Check className="w-4 h-4 mr-2" /> Assign
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Bulk Add to Category */}
            <Dialog open={isBulkAddOpen} onOpenChange={setIsBulkAddOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Bulk Add Members</DialogTitle><DialogDescription>Add numbers to all groups in "{selectedCategory?.name}"</DialogDescription></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>Phone Numbers (comma separated)</Label><Textarea placeholder="919876543210, 919876543211" rows={4} value={bulkPhones} onChange={(e) => setBulkPhones(e.target.value)} /></div>
                        <Button onClick={handleBulkAdd} className="w-full"><UserPlus className="w-4 h-4 mr-2" /> Add to {categoryMembers.length} Group(s)</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Bulk Remove from Category */}
            <Dialog open={isBulkRemoveOpen} onOpenChange={setIsBulkRemoveOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Bulk Remove Members</DialogTitle><DialogDescription>Remove numbers from all groups in "{selectedCategory?.name}"</DialogDescription></DialogHeader>
                    <div className="space-y-4 mt-4">
                        <div><Label>Phone Numbers (comma separated)</Label><Textarea placeholder="919876543210, 919876543211" rows={4} value={bulkPhones} onChange={(e) => setBulkPhones(e.target.value)} /></div>
                        <Button onClick={handleBulkRemove} className="w-full bg-red-600 hover:bg-red-700"><UserMinus className="w-4 h-4 mr-2" /> Remove from {categoryMembers.length} Group(s)</Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
