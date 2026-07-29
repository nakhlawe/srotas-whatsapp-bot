'use client';

import React, { useEffect, useState, useRef } from 'react';
import {
    getContacts, getGroups, addGroup, deleteGroup, renameGroup,
    addContact, updateContact, deleteContact, bulkDeleteContacts, importContacts, uploadContactsCsv, importContactsMapped,
    syncWhatsAppContacts, getWhatsAppGroups, grabGroupContacts, moveToGroup, getSessions
} from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Search, Plus, Upload, Download, RefreshCw, Trash2, FolderPlus, FolderOpen, Smartphone, ChevronDown, Pencil, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export function Contacts() {
    const [contacts, setContacts] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const limit = 50;

    const [search, setSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<string>('all');
    const [selectedContacts, setSelectedContacts] = useState<string[]>([]);

    const [isAddContactOpen, setIsAddContactOpen] = useState(false);
    const [newContact, setNewContact] = useState({ phone: '', name: '', company: '', group: 'default' });

    const [isEditContactOpen, setIsEditContactOpen] = useState(false);
    const [editingContact, setEditingContact] = useState<any>(null);
    const [editForm, setEditForm] = useState({ phone: '', name: '', company: '', group_name: '' });

    const [isMoveGroupOpen, setIsMoveGroupOpen] = useState(false);
    const [moveTargetGroup, setMoveTargetGroup] = useState('');
    const [movingContactIds, setMovingContactIds] = useState<string[]>([]);

    const [isAddGroupOpen, setIsAddGroupOpen] = useState(false);
    const [isRenameGroupOpen, setIsRenameGroupOpen] = useState(false);
    const [newGroupName, setNewGroupName] = useState('');

    const [isImportOpen, setIsImportOpen] = useState(false);
    const [importFile, setImportFile] = useState<File | null>(null);
    const [importTargetGroup, setImportTargetGroup] = useState('default');
    const [importUploading, setImportUploading] = useState(false);
    const [importSubmitting, setImportSubmitting] = useState(false);
    const [importPreview, setImportPreview] = useState<{ uploadId: string; columns: string[]; totalRows: number } | null>(null);
    const [columnMappings, setColumnMappings] = useState<Array<{ column: string; role: 'phone' | 'name' | 'company' | 'custom' | 'skip'; key: string }>>([]);

    const [isSyncOpen, setIsSyncOpen] = useState(false);
    const [syncTab, setSyncTab] = useState<'personal' | 'groups'>('personal');
    const [syncSession, setSyncSession] = useState('');
    const [syncTargetGroup, setSyncTargetGroup] = useState('default');
    const [waGroups, setWaGroups] = useState<any[]>([]);
    const [selectedWaGroup, setSelectedWaGroup] = useState('');
    const [loadingWaGroups, setLoadingWaGroups] = useState(false);
    const [syncing, setSyncing] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const timer = setTimeout(() => {
            setPage(1);
            fetchData(1, search);
        }, 300);
        return () => clearTimeout(timer);
    }, [selectedGroup, search]);

    const fetchData = async (currentPage = 1, currentSearch = search) => {
        setLoading(true);
        try {
            const [g, cData, s] = await Promise.all([
                getGroups(),
                getContacts(selectedGroup === 'all' ? undefined : selectedGroup, currentSearch, currentPage, limit),
                getSessions()
            ]);
            setGroups(g);

            const contactsList = cData.contacts || (Array.isArray(cData) ? cData : []);
            const totalCount = cData.total !== undefined ? cData.total : contactsList.length;

            setContacts(contactsList);
            setTotal(totalCount);
            setPage(currentPage);
            setHasMore(contactsList.length < totalCount && contactsList.length > 0);
            setSessions(s);

            if (!g.some((gr: any) => gr.name === newContact.group)) {
                setNewContact(prev => ({ ...prev, group: g[0]?.name || 'default' }));
            }
        } catch (error) {
            toast.error('Failed to load data');
        } finally {
            setLoading(false);
        }
    };

    const loadMore = async () => {
        if (!hasMore || loadingMore || loading) return;
        setLoadingMore(true);
        const nextPage = page + 1;
        try {
            const cData = await getContacts(selectedGroup === 'all' ? undefined : selectedGroup, search, nextPage, limit);
            const contactsList = cData.contacts || (Array.isArray(cData) ? cData : []);
            const totalCount = cData.total !== undefined ? cData.total : (contacts.length + contactsList.length);

            setContacts(prev => {
                const existingIds = new Set(prev.map(c => c.id));
                const uniqueNew = contactsList.filter((c: any) => !existingIds.has(c.id));
                const updated = [...prev, ...uniqueNew];
                setHasMore(updated.length < totalCount && contactsList.length > 0);
                return updated;
            });
            setPage(nextPage);
            setTotal(totalCount);
        } catch (error) {
            console.error('Failed to load more contacts:', error);
        } finally {
            setLoadingMore(false);
        }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
        const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
        if (scrollHeight - scrollTop <= clientHeight + 150 && hasMore && !loading && !loadingMore) {
            loadMore();
        }
    };

    const handleSearch = async () => {
        setPage(1);
        fetchData(1, search);
    };

    const handleAddContact = async () => {
        if (!newContact.phone.trim()) return toast.error('Phone is required');
        try {
            await addContact(newContact);
            toast.success('Contact added');
            setIsAddContactOpen(false);
            setNewContact({ phone: '', name: '', company: '', group: groups[0]?.name || 'default' });
            fetchData();
        } catch (error) {
            toast.error('Failed to add contact');
        }
    };

    const handleAddGroup = async () => {
        if (!newGroupName.trim()) return toast.error('Group name required');
        try {
            await addGroup(newGroupName);
            toast.success('Group created');

            // If contacts were selected, move them to the new group
            if (selectedContacts.length > 0) {
                await moveToGroup(selectedContacts, newGroupName, false);
                toast.success(`Moved ${selectedContacts.length} contacts to ${newGroupName}`);
                setSelectedContacts([]);
            }

            setIsAddGroupOpen(false);
            setNewGroupName('');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to create group');
        }
    };

    const handleRenameGroup = async () => {
        if (!newGroupName.trim()) return toast.error('New name required');
        const g = groups.find(g => g.name === selectedGroup);
        if (!g) return;

        try {
            await renameGroup(g.id.toString(), newGroupName);
            toast.success('Group renamed');
            setSelectedGroup(newGroupName);
            setIsRenameGroupOpen(false);
            setNewGroupName('');
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to rename group');
        }
    };

    const handleDeleteGroup = async () => {
        if (selectedGroup === 'all') return;
        const g = groups.find(g => g.name === selectedGroup);
        if (!g) return;

        if (!confirm(`Are you sure you want to delete the GROUP "${selectedGroup}" and all contacts inside it?`)) return;
        try {
            await deleteGroup(g.id);
            toast.success(`Group "${selectedGroup}" deleted`);
            setSelectedGroup('all');
            fetchData();
        } catch (error) {
            toast.error('Failed to delete group');
        }
    };

    const handleEditContact = async () => {
        if (!editingContact) return;
        if (!editForm.phone.trim()) return toast.error('Phone is required');
        try {
            await updateContact(editingContact.id, editForm);
            toast.success('Contact updated');
            setIsEditContactOpen(false);
            setEditingContact(null);
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to update contact');
        }
    };

    const openEditDialog = (contact: any) => {
        setEditingContact(contact);
        setEditForm({
            phone: contact.phone || '',
            name: contact.name || '',
            company: contact.company || '',
            group_name: contact.group_name || '',
        });
        setIsEditContactOpen(true);
    };

    const handleMoveToGroup = async () => {
        if (!moveTargetGroup || movingContactIds.length === 0) return;
        try {
            await moveToGroup(movingContactIds, moveTargetGroup, false);
            toast.success(`Moved ${movingContactIds.length} contact(s) to ${moveTargetGroup}`);
            setIsMoveGroupOpen(false);
            setMoveTargetGroup('');
            setMovingContactIds([]);
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to move contacts');
        }
    };

    const openMoveDialog = (contactId: string) => {
        setMovingContactIds([contactId]);
        setIsMoveGroupOpen(true);
    };

    const handleBulkDeleteContacts = async () => {
        if (selectedContacts.length === 0) return;
        if (!confirm(`Are you sure you want to permanently delete ${selectedContacts.length} selected contact(s)?`)) return;
        try {
            await bulkDeleteContacts(selectedContacts);
            toast.success(`Deleted ${selectedContacts.length} contact(s)`);
            setSelectedContacts([]);
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to delete selected contacts');
        }
    };

    const handleDeleteContact = async (id: string) => {
        if (!confirm('Delete this contact?')) return;
        try {
            await deleteContact(id);
            toast.success('Contact deleted');
            fetchData();
        } catch (error) {
            toast.error('Failed to delete contact');
        }
    };

    const toggleSelectAll = async (checked: boolean) => {
        if (checked) {
            if (hasMore || total > contacts.length) {
                try {
                    const cData = await getContacts(selectedGroup === 'all' ? undefined : selectedGroup, search, 1, 1000000);
                    const allList = cData.contacts || (Array.isArray(cData) ? cData : []);
                    setContacts(allList);
                    setSelectedContacts(allList.map((c: any) => c.id));
                    setHasMore(false);
                    toast.success(`Loaded and selected all ${allList.length} contacts`);
                } catch (error) {
                    toast.error('Failed to load all contacts for selection');
                    setSelectedContacts(contacts.map(c => c.id));
                }
            } else {
                setSelectedContacts(contacts.map(c => c.id));
            }
        } else {
            setSelectedContacts([]);
        }
    };

    const toggleSelect = (id: string, checked: boolean) => {
        if (checked) {
            setSelectedContacts(prev => [...prev, id]);
        } else {
            setSelectedContacts(prev => prev.filter(c => c !== id));
        }
    };

    const closeImportDialog = () => {
        setIsImportOpen(false);
        setImportFile(null);
        setImportPreview(null);
        setColumnMappings([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        setImportFile(file);
        setIsImportOpen(true);
        setImportUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await uploadContactsCsv(formData);
            if (!res.columns || !res.columns.length) {
                toast.error('No columns detected in file');
                closeImportDialog();
                return;
            }
            setImportPreview({ uploadId: res.uploadId, columns: res.columns, totalRows: res.totalRows });
            setColumnMappings(res.columns.map((col: string) => {
                let role: 'phone' | 'name' | 'company' | 'custom' = 'custom';
                if (col === res.detected?.phone) role = 'phone';
                else if (col === res.detected?.name) role = 'name';
                else if (col === res.detected?.company) role = 'company';
                return { column: col, role, key: res.suggestedKeys?.[col] || col.toLowerCase() };
            }));
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to parse file');
            closeImportDialog();
        } finally {
            setImportUploading(false);
        }
    };

    // Phone/Name/Company are single-select roles — picking one for a column
    // demotes whichever column previously held it back to a custom field.
    const handleRoleChange = (index: number, newRole: 'phone' | 'name' | 'company' | 'custom' | 'skip') => {
        setColumnMappings(prev => prev.map((m, i) => {
            if (i === index) return { ...m, role: newRole };
            if ((newRole === 'phone' || newRole === 'name' || newRole === 'company') && m.role === newRole) {
                return { ...m, role: 'custom' };
            }
            return m;
        }));
    };

    const handleKeyChange = (index: number, key: string) => {
        setColumnMappings(prev => prev.map((m, i) => i === index ? { ...m, key } : m));
    };

    const confirmImport = async () => {
        if (!importPreview) return;
        const phoneMapping = columnMappings.find(m => m.role === 'phone');
        if (!phoneMapping) return toast.error('Select which column contains the phone number');

        const nameMapping = columnMappings.find(m => m.role === 'name');
        const companyMapping = columnMappings.find(m => m.role === 'company');
        const customFields: Record<string, string> = {};
        for (const m of columnMappings) {
            if (m.role === 'custom' && m.key.trim()) customFields[m.column] = m.key.trim();
        }

        setImportSubmitting(true);
        try {
            const res = await importContactsMapped(importPreview.uploadId, importTargetGroup, {
                phone: phoneMapping.column,
                name: nameMapping?.column,
                company: companyMapping?.column,
                customFields,
            });
            toast.success(`Imported ${res.count} contacts successfully`);
            closeImportDialog();
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to import contacts');
        } finally {
            setImportSubmitting(false);
        }
    };

    const handleSyncWhatsApp = async () => {
        if (!syncSession) return toast.error('Select a session');
        if (syncing) return;
        setSyncing(true);
        try {
            if (syncTab === 'personal') {
                const waContacts = await syncWhatsAppContacts(syncSession);
                if (!waContacts || !Array.isArray(waContacts) || waContacts.length === 0) {
                    return toast.error('No WhatsApp contacts found to sync. Try messaging someone first.');
                }
                const formatted = waContacts
                    .map((c: any) => {
                        const rawPhone = String(c.phone || (c.id && c.id._serialized ? c.id._serialized.split('@')[0] : '') || '');
                        const phone = rawPhone.replace(/[^0-9]/g, '');
                        if (!phone || phone.length < 5) return null;
                        const rawName = c.name || '';
                        const isNumberName = /^[0-9+]+$/.test(rawName) || rawName === phone;
                        const validName = !isNumberName && rawName ? rawName : (c.notify || c.pushname || c.verifiedName || c.pushName || '');
                        return {
                            phone,
                            name: validName,
                            company: c.company || '',
                            custom_fields: {}
                        };
                    })
                    .filter(Boolean);
                if (formatted.length === 0) {
                    return toast.error('Could not extract valid phone numbers from WhatsApp contacts.');
                }
                await importContacts(formatted, syncTargetGroup);
                toast.success(`Synced ${formatted.length} WhatsApp contacts successfully`);
            } else {
                if (!selectedWaGroup) return toast.error('Select a WhatsApp group to grab from');
                const groupContacts = await grabGroupContacts(syncSession, selectedWaGroup);
                if (!groupContacts || !Array.isArray(groupContacts) || groupContacts.length === 0) {
                    return toast.error('No members found in this WhatsApp group.');
                }
                const formattedGroup = groupContacts
                    .map((c: any) => {
                        const rawPhone = String(c.phone || c.id || '');
                        const phone = rawPhone.replace(/[^0-9]/g, '');
                        if (!phone || phone.length < 5) return null;
                        const rawName = c.name || '';
                        const isNumberName = /^[0-9+]+$/.test(rawName) || rawName === phone;
                        const validName = !isNumberName && rawName ? rawName : (c.notify || c.pushname || c.verifiedName || c.pushName || '');
                        return {
                            phone,
                            name: validName,
                            company: c.company || '',
                            custom_fields: {}
                        };
                    })
                    .filter(Boolean);
                if (formattedGroup.length === 0) {
                    return toast.error('Could not extract valid phone numbers from group members.');
                }
                await importContacts(formattedGroup, syncTargetGroup);
                toast.success(`Grabbed ${formattedGroup.length} group members successfully`);
            }
            setIsSyncOpen(false);
            fetchData();
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Sync failed');
        } finally {
            setSyncing(false);
        }
    };

    const loadWaGroups = async () => {
        if (!syncSession) return toast.error('Select a session first');
        setLoadingWaGroups(true);
        try {
            const grps = await getWhatsAppGroups(syncSession);
            setWaGroups(grps);
            if (grps.length > 0) setSelectedWaGroup(grps[0].id);
        } catch (error: any) {
            toast.error('Failed to load WhatsApp groups');
        } finally {
            setLoadingWaGroups(false);
        }
    };

    const exportCsv = () => {
        if (total === 0) return toast.error('No contacts to export');
        const qs = selectedGroup === 'all' ? '' : `?group=${encodeURIComponent(selectedGroup)}`;
        window.open(`/api/contacts/export-csv${qs}`, '_blank');
    };

    return (
        <div className="p-6 xl:p-10 max-w-[1600px] mx-auto space-y-6 flex flex-col h-full w-full">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
                    <p className="text-muted-foreground">Manage your audience and lists</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="relative">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Search..."
                            className="pl-9 w-64"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        />
                    </div>
                    <Button onClick={() => setIsAddContactOpen(true)} className="gap-2">
                        <Plus className="w-4 h-4" /> Add
                    </Button>
                    <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="gap-2">
                        <Upload className="w-4 h-4" /> Import CSV
                    </Button>
                    <input type="file" accept=".csv,.xlsx" ref={fileInputRef} className="hidden" onChange={handleImportFile} />

                    <Button onClick={() => setIsSyncOpen(true)} variant="secondary" className="gap-2">
                        <Smartphone className="w-4 h-4" /> Sync WA
                    </Button>
                </div>
            </div>

            <Card className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <CardHeader className="py-4 px-6 border-b border-border bg-secondary/10 flex flex-row items-center justify-between space-y-0">
                    <div className="flex items-center gap-3">
                        <Select value={selectedGroup} onValueChange={(v) => setSelectedGroup(v || 'all')}>
                            <SelectTrigger className="w-[200px]">
                                <SelectValue placeholder="All Groups">
                                    {(value: string | null) => (!value || value === 'all') ? 'All Groups' : value}
                                </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Groups</SelectItem>
                                {groups.map(g => (
                                    <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Button size="sm" variant="outline" onClick={() => setIsAddGroupOpen(true)} className="gap-1.5">
                            <FolderPlus className="w-3.5 h-3.5 text-primary" /> New Group
                        </Button>
                        {selectedGroup !== 'all' && (
                            <>
                                <Button size="icon" variant="ghost" onClick={() => { setNewGroupName(selectedGroup); setIsRenameGroupOpen(true); }} title="Rename Group">
                                    <span className="text-xs font-semibold px-2">✏️</span>
                                </Button>
                                <Button size="sm" variant="ghost" onClick={handleDeleteGroup} className="gap-1 text-xs text-destructive hover:bg-destructive/10" title="Delete entire Group and all its contacts">
                                    <Trash2 className="w-3.5 h-3.5" /> Delete Group
                                </Button>
                            </>
                        )}
                    </div>

                    <div className="flex items-center gap-3 text-sm">
                        {selectedContacts.length > 0 ? (
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold bg-primary/15 text-primary border border-primary/30 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-sm">
                                    {selectedContacts.length === contacts.length && contacts.length > 0
                                        ? `All ${contacts.length} selected`
                                        : `${selectedContacts.length} of ${contacts.length} selected`}
                                    <button
                                        onClick={() => setSelectedContacts([])}
                                        className="ml-1 text-primary/70 hover:text-foreground font-bold leading-none transition-colors"
                                        title="Clear selection"
                                    >×</button>
                                </span>
                                <Button size="sm" variant="outline" onClick={() => setIsAddGroupOpen(true)} className="gap-1.5 text-xs h-8 border-primary/40 hover:bg-primary/10">
                                    <FolderOpen className="w-3.5 h-3.5 text-primary" /> Group Selected
                                </Button>
                                <Button size="sm" variant="destructive" onClick={handleBulkDeleteContacts} className="gap-1.5 text-xs h-8 shadow-sm">
                                    <Trash2 className="w-3.5 h-3.5" /> Delete Selected ({selectedContacts.length})
                                </Button>
                            </div>
                        ) : (
                            <span className="text-xs font-medium text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded-md border border-border/50">
                                {total > contacts.length
                                    ? `Showing ${contacts.length} of ${total} contacts`
                                    : `${contacts.length} ${contacts.length === 1 ? 'contact' : 'contacts'}`}
                            </span>
                        )}
                        <Button size="sm" variant="outline" onClick={exportCsv} className="gap-1.5 text-xs h-8">
                            <Download className="w-3.5 h-3.5" /> Export
                        </Button>
                    </div>
                </CardHeader>

                <CardContent className="p-0 flex-1 overflow-auto" onScroll={handleScroll}>
                    <Table>
                        <TableHeader className="bg-secondary/30 sticky top-0 z-10 backdrop-blur-sm">
                            <TableRow>
                                <TableHead className="w-[50px] text-center">
                                    <Checkbox
                                        checked={contacts.length > 0 && selectedContacts.length === contacts.length}
                                        onCheckedChange={(c) => toggleSelectAll(!!c)}
                                    />
                                </TableHead>
                                <TableHead>Name</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Company</TableHead>
                                <TableHead>Group</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center">
                                        <RefreshCw className="w-6 h-6 animate-spin mx-auto text-primary" />
                                    </TableCell>
                                </TableRow>
                            ) : contacts.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                                        No contacts found.
                                    </TableCell>
                                </TableRow>
                            ) : (
                                contacts.map(c => {
                                    const isSelected = selectedContacts.includes(c.id);
                                    return (
                                        <TableRow
                                            key={c.id}
                                            onClick={(e) => {
                                                if (selectedContacts.length > 0 || e.ctrlKey || e.metaKey || e.shiftKey) {
                                                    if (e.target instanceof HTMLElement && (e.target.closest('button') || e.target.closest('[role="checkbox"]'))) return;
                                                    toggleSelect(c.id, !isSelected);
                                                }
                                            }}
                                            className={`transition-colors ${selectedContacts.length > 0 ? 'cursor-pointer' : ''} ${isSelected ? 'bg-primary/10 hover:bg-primary/15 font-medium' : 'hover:bg-secondary/50'}`}
                                        >
                                            <TableCell className="text-center" onClick={(e) => e.stopPropagation()}>
                                                <Checkbox
                                                    checked={isSelected}
                                                    onCheckedChange={(checked) => toggleSelect(c.id, !!checked)}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">
                                                {(!c.name || /^[0-9+]+$/.test(c.name) || c.name === c.phone) ? (c.notify || c.pushname || '—') : c.name}
                                            </TableCell>
                                            <TableCell>+{c.phone}</TableCell>
                                            <TableCell>{c.company || '—'}</TableCell>
                                            <TableCell>
                                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                                    {c.group_name}
                                                </span>
                                            </TableCell>
                                            <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                    <Button variant="ghost" size="icon" onClick={() => openMoveDialog(c.id)} className="hover:bg-primary/10" title="Move to group">
                                                        <ArrowRight className="w-4 h-4 text-primary" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => openEditDialog(c)} className="hover:bg-amber-500/10" title="Edit contact">
                                                        <Pencil className="w-4 h-4 text-amber-500" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" onClick={() => handleDeleteContact(c.id)} className="text-destructive hover:bg-destructive/10">
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    );
                                })
                            )}
                        </TableBody>
                    </Table>
                    {loadingMore && (
                        <div className="p-4 flex items-center justify-center gap-2 text-sm text-muted-foreground border-t border-border bg-secondary/5">
                            <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                            Loading more contacts...
                        </div>
                    )}
                </CardContent>

                {/* Status & Load More Footer */}
                {total > 0 && (
                    <div className="flex items-center justify-between p-3 px-4 border-t border-border bg-secondary/10 text-sm text-muted-foreground">
                        <div>
                            Showing <span className="font-medium text-foreground">{contacts.length}</span> of <span className="font-medium text-foreground">{total}</span> contacts
                        </div>
                        {contacts.length < total && !loadingMore && (
                            <Button variant="ghost" size="sm" onClick={loadMore} className="text-xs h-7 gap-1 hover:bg-secondary/20">
                                Load More <ChevronDown className="w-3.5 h-3.5" />
                            </Button>
                        )}
                    </div>
                )}
            </Card>

            {/* Add Contact Modal */}
            <Dialog open={isAddContactOpen} onOpenChange={setIsAddContactOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Add Contact</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Phone (with country code)</Label>
                            <Input placeholder="919876543210" value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value.replace(/\D/g, '') })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input placeholder="John Doe" value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Company</Label>
                            <Input placeholder="Acme Inc" value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Group</Label>
                            <Select value={newContact.group} onValueChange={(v) => setNewContact({ ...newContact, group: v || '' })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {groups.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={handleAddContact}>Save Contact</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Edit Contact Modal */}
            <Dialog open={isEditContactOpen} onOpenChange={setIsEditContactOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Contact</DialogTitle>
                        {editingContact && <DialogDescription>Editing: {editingContact.name || editingContact.phone}</DialogDescription>}
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Phone (with country code)</Label>
                            <Input placeholder="919876543210" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value.replace(/\D/g, '') })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Name</Label>
                            <Input placeholder="John Doe" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Company</Label>
                            <Input placeholder="Acme Inc" value={editForm.company} onChange={(e) => setEditForm({ ...editForm, company: e.target.value })} />
                        </div>
                        <div className="space-y-2">
                            <Label>Group</Label>
                            <Select value={editForm.group_name} onValueChange={(v) => setEditForm({ ...editForm, group_name: v || '' })}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {groups.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" onClick={handleEditContact}>Update Contact</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Move to Group Modal */}
            <Dialog open={isMoveGroupOpen} onOpenChange={setIsMoveGroupOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Move Contact to Group</DialogTitle>
                        <DialogDescription>{movingContactIds.length} contact(s) selected</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Target Group</Label>
                            <Select value={moveTargetGroup} onValueChange={(v) => setMoveTargetGroup(v || '')}>
                                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                                <SelectContent>
                                    {groups.filter(g => g.name !== selectedGroup || selectedGroup === 'all').map(g => (
                                        <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full gap-2" onClick={handleMoveToGroup} disabled={!moveTargetGroup}>
                            <ArrowRight className="w-4 h-4" /> Move to {moveTargetGroup || '...'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Add Group Modal */}
            <Dialog open={isAddGroupOpen} onOpenChange={setIsAddGroupOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create Group</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Group Name</Label>
                            <Input placeholder="e.g. leads, partners" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddGroup()} />
                        </div>
                        <Button className="w-full" onClick={handleAddGroup}>Create Group</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Rename Group Modal */}
            <Dialog open={isRenameGroupOpen} onOpenChange={setIsRenameGroupOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Rename Group</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>New Group Name</Label>
                            <Input placeholder="e.g. active-leads" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleRenameGroup()} />
                        </div>
                        <Button className="w-full" onClick={handleRenameGroup}>Rename Group</Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Import CSV Modal */}
            <Dialog open={isImportOpen} onOpenChange={(open) => { if (!open) closeImportDialog(); }}>
                <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Import Contacts</DialogTitle>
                        <DialogDescription>Review how each column should be imported.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="p-4 border rounded-lg bg-secondary/20 flex items-center gap-3">
                            <div className="p-2 bg-primary/20 text-primary rounded-md"><FileTextIcon className="w-5 h-5" /></div>
                            <div className="overflow-hidden">
                                <p className="font-medium truncate">{importFile?.name}</p>
                                <p className="text-xs text-muted-foreground">
                                    {importUploading ? 'Parsing...' : importPreview ? `${importPreview.totalRows} rows detected` : ''}
                                </p>
                            </div>
                        </div>

                        {importPreview && (
                            <>
                                <div className="space-y-2">
                                    <Label>Import to Group</Label>
                                    <Select value={importTargetGroup} onValueChange={(v) => setImportTargetGroup(v || '')}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {groups.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-2">
                                    <Label>Column Mapping</Label>
                                    <div className="border rounded-lg divide-y max-h-72 overflow-y-auto">
                                        {columnMappings.map((m, i) => (
                                            <div key={m.column} className="p-2.5 flex items-center gap-2">
                                                <p className="text-sm font-medium truncate flex-1 min-w-0">{m.column}</p>
                                                <Select value={m.role} onValueChange={(v) => handleRoleChange(i, v as any)}>
                                                    <SelectTrigger className="w-[130px] h-8 text-xs shrink-0"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="phone">Phone</SelectItem>
                                                        <SelectItem value="name">Name</SelectItem>
                                                        <SelectItem value="company">Company</SelectItem>
                                                        <SelectItem value="custom">Custom Field</SelectItem>
                                                        <SelectItem value="skip">Skip</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                {m.role === 'custom' ? (
                                                    <div className="flex items-center gap-1 w-[160px] shrink-0">
                                                        <span className="text-xs text-muted-foreground">{'{{'}</span>
                                                        <Input value={m.key} onChange={(e) => handleKeyChange(i, e.target.value)} className="h-8 text-xs px-1.5" />
                                                        <span className="text-xs text-muted-foreground">{'}}'}</span>
                                                    </div>
                                                ) : <div className="w-[160px] shrink-0" />}
                                            </div>
                                        ))}
                                    </div>
                                    <p className="text-xs text-muted-foreground">
                                        Custom field placeholders can be used in message templates, e.g. {'{{'}<span className="font-mono">key</span>{'}}'}
                                    </p>
                                </div>
                            </>
                        )}

                        <Button className="w-full" onClick={confirmImport} disabled={!importPreview || importSubmitting}>
                            {importSubmitting ? 'Importing...' : 'Confirm Import'}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Sync WhatsApp Modal */}
            <Dialog open={isSyncOpen} onOpenChange={setIsSyncOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Sync WhatsApp Contacts</DialogTitle>
                        <DialogDescription>Fetch your contacts from WhatsApp.</DialogDescription>
                    </DialogHeader>
                    <div className="flex gap-2 border-b border-border pb-2">
                        <Button variant={syncTab === 'personal' ? 'default' : 'ghost'} size="sm" onClick={() => setSyncTab('personal')}>
                            Personal Contacts
                        </Button>
                        <Button variant={syncTab === 'groups' ? 'default' : 'ghost'} size="sm" onClick={() => setSyncTab('groups')}>
                            Group Members
                        </Button>
                    </div>
                    <div className="space-y-4 pt-2">
                        <div className="space-y-2">
                            <Label>From Device</Label>
                            <Select value={syncSession} onValueChange={(v) => setSyncSession(v || '')}>
                                <SelectTrigger>
                                    <span className="truncate">
                                        {syncSession ? (sessions.find(s => s.id.toString() === syncSession)?.name || syncSession) : "Select active device"}
                                    </span>
                                </SelectTrigger>
                                <SelectContent>
                                    {sessions.filter(s => s.status === 'ready').map(s => <SelectItem key={s.id} value={s.id.toString()}>{s.name} ({s.phone})</SelectItem>)}
                                    {sessions.filter(s => s.status === 'ready').length === 0 && <SelectItem value="none" disabled>No connected devices</SelectItem>}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Import to Group</Label>
                            <Select value={syncTargetGroup} onValueChange={(v) => setSyncTargetGroup(v || '')}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {groups.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>

                        {syncTab === 'groups' && (
                            <div className="space-y-2">
                                <Label>WhatsApp Group</Label>
                                <div className="flex gap-2">
                                    <Select value={selectedWaGroup} onValueChange={(v) => setSelectedWaGroup(v || '')}>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder="Click Load Groups &rarr;" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {waGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name} ({g.participantCount})</SelectItem>)}
                                            {waGroups.length === 0 && <SelectItem value="none" disabled>No groups loaded</SelectItem>}
                                        </SelectContent>
                                    </Select>
                                    <Button variant="secondary" onClick={loadWaGroups} disabled={loadingWaGroups || !syncSession || syncSession === 'none'}>
                                        {loadingWaGroups ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'Load Groups'}
                                    </Button>
                                </div>
                            </div>
                        )}

                        <Button className="w-full gap-2" onClick={handleSyncWhatsApp} disabled={syncing || !syncSession || syncSession === 'none'}>
                            {syncing ? <RefreshCw className="w-4 h-4 animate-spin" /> : null}
                            {syncing ? 'Syncing...' : (syncTab === 'personal' ? '📲 Fetch Contacts' : '👥 Grab Members')}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function FileTextIcon(props: any) {
    return (
        <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="16" x2="8" y1="13" y2="13" />
            <line x1="16" x2="8" y1="17" y2="17" />
            <line x1="10" x2="8" y1="9" y2="9" />
        </svg>
    );
}
