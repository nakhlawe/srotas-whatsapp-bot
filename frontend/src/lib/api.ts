import axios from 'axios';

// Get base URL for API calls. In electron this is localhost + dynamic port.
// In Next.js dev it will proxy or just hit the same domain.
const API_BASE = '/api';

const api = axios.create({
    baseURL: API_BASE,
});

export const getLicenseStatus = () => api.get('/license-status').then((r) => r.data);
export const activateLicense = (key: string) => api.post('/activate', { key }).then((r) => r.data);
export const deactivateLicense = () => api.post('/deactivate').then((r) => r.data);

// Sessions
export const getSessions = () => api.get('/sessions').then((r) => r.data);
export const addSession = (name: string) => api.post('/sessions', { name }).then((r) => r.data);
export const deleteSession = (id: string) => api.delete(`/sessions/${id}`).then((r) => r.data);
export const restartSession = (id: string) => api.post(`/sessions/${id}/restart`).then((r) => r.data);
export const relinkSession = (id: string) => api.post(`/sessions/${id}/relink`).then((r) => r.data);
export const setAutoReply = (id: string, enabled: boolean) => api.put(`/sessions/${id}/auto-reply`, { enabled }).then((r) => r.data);
export const setAiReplies = (id: string, enabled: boolean) => api.put(`/sessions/${id}/ai-replies`, { enabled }).then((r) => r.data);
export const setQuickReplies = (id: string, enabled: boolean) => api.put(`/sessions/${id}/quick-replies`, { enabled }).then((r) => r.data);

// Groups
export const getGroups = () => api.get('/groups').then((r) => r.data);
export const addGroup = (name: string, description?: string) => api.post('/groups', { name, description }).then((r) => r.data);
export const renameGroup = (id: string, name: string) => api.put(`/groups/${id}`, { name }).then((r) => r.data);
export const deleteGroup = (id: string) => api.delete(`/groups/${id}`).then((r) => r.data);

// Contacts
export const getContacts = (group?: string, search?: string, page: number = 1, limit: number = 50) =>
    api.get('/contacts', { params: { group, search, page, limit } }).then((r) => r.data);
export const getContactGroups = () => api.get('/contacts/groups').then((r) => r.data);
export const addContact = (data: any) => api.post('/contacts', data).then((r) => r.data);
export const updateContact = (id: string, data: any) => api.put(`/contacts/${id}`, data).then((r) => r.data);
export const deleteContact = (id: string) => api.delete(`/contacts/${id}`).then((r) => r.data);
export const bulkDeleteContacts = (contactIds: string[]) => api.post('/contacts/bulk-delete', { contactIds }).then((r) => r.data);
export const deleteContactGroup = (name: string) => api.delete(`/contacts/group/${name}`).then((r) => r.data);
export const importContacts = (contacts: any[], group: string) => api.post('/contacts/import', { contacts, group }).then((r) => r.data);
export const moveToGroup = (contactIds: string[], group: string, copy: boolean) =>
    api.post('/contacts/move-to-group', { contactIds, group, copy }).then((r) => r.data);
export const syncWhatsAppContacts = (sessionId: string) => api.get(`/contacts/sync/${sessionId}`).then((r) => r.data);
export const getWhatsAppGroups = (sessionId: string) => api.get(`/contacts/wa-groups/${sessionId}`).then((r) => r.data);
export const grabGroupContacts = (sessionId: string, groupId: string) => api.get(`/contacts/grab-group/${sessionId}/${groupId}`).then((r) => r.data);

// Messages/Campaigns
export const getCampaigns = () => api.get('/campaigns').then((r) => r.data);
export const getCampaign = (id: string) => api.get(`/campaigns/${id}`).then((r) => r.data);
export const sendBulkMessages = (data: any) => api.post('/messages/send-bulk', data).then((r) => r.data);
export const previewMessage = (template: string, contact: any) => api.post('/messages/preview', { template, contact }).then((r) => r.data);
export const deleteCampaign = (id: string) => api.delete(`/campaigns/${id}`).then((r) => r.data);
export const retryCampaign = (id: string, sessionId: string) => api.post(`/campaigns/${id}/retry`, { sessionId }).then((r) => r.data);
export const restartCampaign = (id: string, sessionId: string) => api.post(`/campaigns/${id}/restart`, { sessionId }).then((r) => r.data);

// Templates
export const getTemplates = () => api.get('/templates').then((r) => r.data);
export const addTemplate = (data: any) => api.post('/templates', data).then((r) => r.data);
export const updateTemplate = (id: string, data: any) => api.put(`/templates/${id}`, data).then((r) => r.data);
export const deleteTemplate = (id: string) => api.delete(`/templates/${id}`).then((r) => r.data);

// Quick Replies
export const getQuickReplies = () => api.get('/quick-replies').then((r) => r.data);
export const addQuickReply = (data: any) => api.post('/quick-replies', data).then((r) => r.data);
export const updateQuickReply = (id: string, data: any) => api.put(`/quick-replies/${id}`, data).then((r) => r.data);
export const deleteQuickReply = (id: string) => api.delete(`/quick-replies/${id}`).then((r) => r.data);
export const toggleQuickReply = (id: string, enabled: boolean) => api.put(`/quick-replies/${id}/toggle`, { enabled }).then((r) => r.data);

// Schedules
export const getSchedules = () => api.get('/schedules').then((r) => r.data);
export const addSchedule = (data: any) => api.post('/schedules', data).then((r) => r.data);
export const updateSchedule = (id: string, data: any) => api.put(`/schedules/${id}`, data).then((r) => r.data);
export const deleteSchedule = (id: string) => api.delete(`/schedules/${id}`).then((r) => r.data);
export const toggleSchedule = (id: string, enabled: boolean) => api.put(`/schedules/${id}/toggle`, { enabled }).then((r) => r.data);

// Analytics
export const getAnalytics = (range: string = '30days') => api.get(`/analytics?range=${range}`).then((r) => r.data);

// Settings
export const getSettings = () => api.get('/settings').then((r) => r.data);
export const updateSettings = (data: any) => api.put('/settings', data).then((r) => r.data);
export const checkForUpdate = () => api.get('/check-update').then((r) => r.data);
export const getVersion = () => api.get('/version').then((r) => r.data);

// Admin
export const generateAdminKey = (days: number) => api.post('/admin/generate-key', { days }).then((r) => r.data);
export const getAdminHistory = () => api.get('/admin/history').then((r) => r.data);

// Upload
export const uploadMedia = (formData: FormData) => api.post('/media/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
}).then(r => r.data);

export const uploadContactsCsv = (formData: FormData) => api.post('/contacts/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
}).then(r => r.data);
export const importContactsMapped = (uploadId: string, group: string, mapping: any) =>
    api.post('/contacts/import-mapped', { uploadId, group, mapping }).then((r) => r.data);

// AI Image Generation
export const generateCampaignImage = (message: string) =>
    api.post('/media/generate-image', { message }, { timeout: 120000 }).then(r => r.data);

// Company Logo (composited into AI-generated images)
export const uploadCompanyLogo = (formData: FormData) => api.post('/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
}).then(r => r.data);
export const deleteCompanyLogo = () => api.delete('/settings/logo').then(r => r.data);

// Blacklist
export const getBlacklist = (search?: string) => api.get('/blacklist', { params: search ? { search } : {} }).then(r => r.data);
export const addBlacklist = (phone: string, reason?: string) => api.post('/blacklist', { phone, reason }).then(r => r.data);
export const removeBlacklist = (id: string) => api.delete(`/blacklist/${id}`).then(r => r.data);
export const importBlacklist = (phones: string[], reason?: string) => api.post('/blacklist/import', { phones, reason }).then(r => r.data);

// DND (Do Not Disturb)
export const getDndSettings = () => api.get('/settings/dnd').then(r => r.data);
export const updateDndSettings = (data: any) => api.put('/settings/dnd', data).then(r => r.data);

// Webhooks
export const getWebhooks = () => api.get('/webhooks').then(r => r.data);
export const addWebhook = (data: any) => api.post('/webhooks', data).then(r => r.data);
export const updateWebhook = (id: string, data: any) => api.put(`/webhooks/${id}`, data).then(r => r.data);
export const deleteWebhook = (id: string) => api.delete(`/webhooks/${id}`).then(r => r.data);
export const testWebhook = (id: string) => api.post(`/webhooks/${id}/test`).then(r => r.data);
export const getWebhookEvents = () => api.get('/webhooks/events').then(r => r.data);

// Follow-ups
export const getFollowUps = (status?: string) => api.get('/follow-ups', { params: status ? { status } : {} }).then(r => r.data);
export const getFollowUpStats = () => api.get('/follow-ups/stats').then(r => r.data);
export const addFollowUp = (data: any) => api.post('/follow-ups', data).then(r => r.data);
export const updateFollowUp = (id: string, data: any) => api.put(`/follow-ups/${id}`, data).then(r => r.data);
export const deleteFollowUp = (id: string) => api.delete(`/follow-ups/${id}`).then(r => r.data);
export const runFollowUp = (id: string) => api.post(`/follow-ups/${id}/run`).then(r => r.data);

// WhatsApp Group Management
export const getWaGroups = (sessionId: string) => api.get(`/contacts/wa-groups/${sessionId}`).then(r => r.data);
export const getWaGroupParticipants = (sessionId: string, groupId: string) => api.get(`/contacts/grab-group/${sessionId}/${groupId}`).then(r => r.data);
export const createWaGroup = (sessionId: string, name: string, participants: string[]) => api.post('/wa-groups/create', { sessionId, name, participants }).then(r => r.data);
export const addWaGroupMembers = (groupId: string, sessionId: string, participants: string[]) => api.post(`/wa-groups/${groupId}/add`, { sessionId, participants }).then(r => r.data);
export const removeWaGroupMembers = (groupId: string, sessionId: string, participants: string[]) => api.post(`/wa-groups/${groupId}/remove`, { sessionId, participants }).then(r => r.data);
export const renameWaGroup = (groupId: string, sessionId: string, name: string) => api.put(`/wa-groups/${groupId}/rename`, { sessionId, name }).then(r => r.data);
export const leaveWaGroup = (groupId: string, sessionId: string) => api.post(`/wa-groups/${groupId}/leave`, { sessionId }).then(r => r.data);
export const getWaGroupInvite = (groupId: string, sessionId: string) => api.get(`/wa-groups/${groupId}/invite`, { params: { sessionId } }).then(r => r.data);
export const getWaGroupParticipantsDetailed = (groupId: string, sessionId: string) => api.get(`/wa-groups/${groupId}/participants/${sessionId}`).then(r => r.data);

// Group Export
export const exportWaGroup = (groupId: string, sessionId: string) => api.get(`/wa-groups/${groupId}/export/${sessionId}`).then(r => r.data);
export const exportAllWaGroups = (sessionId: string) => api.get(`/wa-groups/export-all/${sessionId}`).then(r => r.data);
export const exportAllWaGroupsCsv = (sessionId: string) => `/api/wa-groups/export-all-csv/${sessionId}`;
export const exportAllWaGroupsSummaryCsv = (sessionId: string) => `/api/wa-groups/export-all-summary-csv/${sessionId}`;

// WhatsApp Group Categories
export const getWaGroupCategories = () => api.get('/wa-group-categories').then(r => r.data);
export const createWaGroupCategory = (name: string, description?: string) => api.post('/wa-group-categories', { name, description }).then(r => r.data);
export const renameWaGroupCategory = (id: number, name: string) => api.put(`/wa-group-categories/${id}`, { name }).then(r => r.data);
export const deleteWaGroupCategory = (id: number) => api.delete(`/wa-group-categories/${id}`).then(r => r.data);
export const getWaGroupCategoryMembers = (id: number) => api.get(`/wa-group-categories/${id}/groups`).then(r => r.data);
export const addGroupToCategory = (id: number, sessionId: string, groupId: string, groupName?: string) => api.post(`/wa-group-categories/${id}/add-group`, { sessionId, groupId, groupName }).then(r => r.data);
export const removeGroupFromCategory = (id: number, sessionId: string, groupId: string) => api.post(`/wa-group-categories/${id}/remove-group`, { sessionId, groupId }).then(r => r.data);
export const removeGroupCategoryMember = (memberId: number) => api.delete(`/wa-group-categories/group-member/${memberId}`).then(r => r.data);
export const getGroupCategories = (sessionId: string, groupId: string) => api.get(`/wa-group-categories/group/${sessionId}/${groupId}`).then(r => r.data);
export const bulkAddToCategoryGroups = (id: number, sessionId: string, participants: string[]) => api.post(`/wa-group-categories/${id}/bulk-add`, { sessionId, participants }).then(r => r.data);
export const bulkRemoveFromCategoryGroups = (id: number, sessionId: string, participants: string[]) => api.post(`/wa-group-categories/${id}/bulk-remove`, { sessionId, participants }).then(r => r.data);
