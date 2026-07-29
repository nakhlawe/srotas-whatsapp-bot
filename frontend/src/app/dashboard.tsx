'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { getAnalytics } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
    Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis,
    Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Send, Users, Paperclip, CheckCircle, Brain, Zap, Smartphone, Rocket, ArrowRight } from 'lucide-react';

// Shared easing (cubic bezier — always valid Framer Motion Easing type)
const ease = [0.25, 0.46, 0.45, 0.94] as const;

// ── Animated counter hook ─────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1100) {
    const [count, setCount] = useState(0);
    const frameRef = useRef<number>(0);
    useEffect(() => {
        if (!target) { setCount(0); return; }
        const start = Date.now();
        const tick = () => {
            const elapsed = Date.now() - start;
            const p = Math.min(elapsed / duration, 1);
            setCount(Math.round((1 - Math.pow(1 - p, 3)) * target));
            if (p < 1) frameRef.current = requestAnimationFrame(tick);
        };
        frameRef.current = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(frameRef.current);
    }, [target, duration]);
    return count;
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload?.length) return null;
    return (
        <div className="card-glass rounded-xl px-4 py-3 text-sm shadow-xl" style={{ border: '1px solid var(--border)' }}>
            <p className="text-muted-foreground mb-1.5 font-medium text-xs">{label}</p>
            {payload.map((p: any) => (
                <div key={p.dataKey} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
                    <span className="text-foreground font-semibold">{p.value}</span>
                    <span className="text-muted-foreground text-xs capitalize">{p.name}</span>
                </div>
            ))}
        </div>
    );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ title, value, icon: Icon, color, delay = 0, onClick }: {
    title: string; value: number | string; icon: any; color: string; delay?: number; onClick?: () => void;
}) {
    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    const animated = useCountUp(numValue, 1000);
    const display = typeof value === 'string' && value.includes('%') ? `${animated}%` : animated;

    return (
        <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay, duration: 0.4, ease }}
        >
            <Card
                onClick={onClick}
                className={`card-glow group overflow-hidden relative ${onClick ? 'cursor-pointer hover:border-primary/50 transition-all active:scale-[0.98]' : ''}`}
            >
                <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl"
                    style={{ background: `linear-gradient(90deg, ${color}, transparent)` }} />
                <CardHeader className="flex flex-row items-center justify-between pb-2 pt-5">
                    <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</CardTitle>
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
                        style={{ background: `${color}22` }}>
                        <Icon className="w-4 h-4" style={{ color }} />
                    </div>
                </CardHeader>
                <CardContent className="pb-5">
                    <div className="text-3xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {display}
                    </div>
                </CardContent>
            </Card>
        </motion.div>
    );
}

interface DashboardProps {
    onNavigate?: (page: string) => void;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
export function Dashboard({ onNavigate }: DashboardProps) {
    const [range, setRange] = useState('30days');
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        getAnalytics(range)
            .then(setData)
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [range]);

    if (loading || !data) {
        return (
            <div className="p-8 flex items-center justify-center h-full">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                    <p className="text-sm text-muted-foreground animate-pulse">Loading analytics...</p>
                </div>
            </div>
        );
    }

    const { stats, messagesOverTime, hourlyPattern, aiAnalytics, quickReplyAnalytics, topCampaigns, sessions, groupStats, groupActivity } = data;

    const chartData = messagesOverTime?.labels?.map((label: string, i: number) => ({
        name: label,
        sent: messagesOverTime.sent[i] || 0,
        failed: messagesOverTime.failed[i] || 0,
    })) || [];

    const hourlyData = hourlyPattern?.labels?.map((label: string, i: number) => ({
        hour: label,
        messages: hourlyPattern.counts[i] || 0,
    })) || [];

    const aiSuccessRate = aiAnalytics?.successRate || 0;
    const radialData = [{ name: 'Success', value: aiSuccessRate, fill: '#3b82f6' }];

    return (
        <div className="p-6 xl:p-10 space-y-6 max-w-[1600px] mx-auto w-full">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.4, ease }}>
                    <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        Analytics Overview
                    </h1>
                    <p className="text-sm text-muted-foreground mt-0.5">WhatsApp campaign performance at a glance</p>
                </motion.div>
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2, ease }}>
                    <Select value={range} onValueChange={(v) => setRange(v || '30days')}>
                        <SelectTrigger className="w-[160px] bg-secondary/50 border-border/60">
                            <SelectValue placeholder="Select range" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="today">Today</SelectItem>
                            <SelectItem value="yesterday">Yesterday</SelectItem>
                            <SelectItem value="7days">Last 7 Days</SelectItem>
                            <SelectItem value="30days">Last 30 Days</SelectItem>
                            <SelectItem value="all">All Time</SelectItem>
                        </SelectContent>
                    </Select>
                </motion.div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                <StatCard title="Messages Sent" value={stats?.totalMessages || 0} icon={Send} color="#3b82f6" delay={0.05} onClick={() => onNavigate?.('messaging')} />
                <StatCard title="People Reached" value={stats?.peopleReached || 0} icon={Users} color="#06b6d4" delay={0.1} onClick={() => onNavigate?.('contacts')} />
                <StatCard title="Media Sent" value={stats?.mediaSent || 0} icon={Paperclip} color="#8b5cf6" delay={0.15} onClick={() => onNavigate?.('templates')} />
                <StatCard title="Delivery Rate" value={`${stats?.deliveryRate || 0}%`} icon={CheckCircle} color="#10b981" delay={0.2} onClick={() => onNavigate?.('messaging')} />
            </div>

            {/* Charts */}
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.25, duration: 0.5, ease }}
                className="grid grid-cols-1 lg:grid-cols-3 gap-5"
            >
                {/* Area Chart */}
                <Card className="card-glow lg:col-span-2">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base">Messages Over Time</CardTitle>
                        <CardDescription className="text-xs">Sent vs failed based on selected period</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 4, right: 10, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colSent" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colFail" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.25} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                                    <XAxis dataKey="name" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                                    <YAxis stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: '12px' }} />
                                    <Area type="monotone" dataKey="sent" name="Sent" stroke="#3b82f6" strokeWidth={2} fill="url(#colSent)" dot={false} activeDot={{ r: 5 }} animationDuration={1200} />
                                    <Area type="monotone" dataKey="failed" name="Failed" stroke="#ef4444" strokeWidth={2} fill="url(#colFail)" dot={false} activeDot={{ r: 5 }} animationDuration={1200} />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>

                {/* Hourly Bar Chart */}
                <Card className="card-glow">
                    <CardHeader className="pb-0">
                        <CardTitle className="text-base">Hourly Activity</CardTitle>
                        <CardDescription className="text-xs">All-time hourly message pattern</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="h-[280px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={hourlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colHour" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.85} />
                                            <stop offset="100%" stopColor="#1d4ed8" stopOpacity={0.5} />
                                        </linearGradient>
                                    </defs>
                                    <XAxis dataKey="hour" stroke="var(--muted-foreground)" fontSize={9} tickLine={false} axisLine={false} />
                                    <YAxis stroke="var(--muted-foreground)" fontSize={9} tickLine={false} axisLine={false} />
                                    <RechartsTooltip content={<CustomTooltip />} />
                                    <Bar dataKey="messages" name="Messages" fill="url(#colHour)" radius={[3, 3, 0, 0]} animationDuration={1200} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </CardContent>
                </Card>
            </motion.div>

            {/* Bottom Row */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.35, duration: 0.4, ease }}
                className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5"
            >
                {/* AI Analytics — CSS SVG ring */}
                {/* AI Analytics — CSS SVG ring */}
                <Card
                    onClick={() => onNavigate?.('settings')}
                    className="card-glow cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group/card"
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Brain className="w-4 h-4 text-purple-400" /> AI Analytics
                        </CardTitle>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all text-primary" />
                    </CardHeader>
                    <CardContent>
                        {/* SVG circle progress ring */}
                        <div className="flex flex-col items-center py-2 mb-3">
                            <div className="relative w-28 h-28">
                                <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                                    {/* Track */}
                                    <circle cx="50" cy="50" r="40"
                                        fill="none" stroke="var(--secondary)" strokeWidth="8" />
                                    {/* Progress */}
                                    <motion.circle
                                        cx="50" cy="50" r="40"
                                        fill="none"
                                        stroke="url(#aiGrad)"
                                        strokeWidth="8"
                                        strokeLinecap="round"
                                        strokeDasharray={`${2 * Math.PI * 40}`}
                                        initial={{ strokeDashoffset: 2 * Math.PI * 40 }}
                                        animate={{ strokeDashoffset: 2 * Math.PI * 40 * (1 - aiSuccessRate / 100) }}
                                        transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
                                    />
                                    <defs>
                                        <linearGradient id="aiGrad" x1="0" y1="0" x2="1" y2="0">
                                            <stop offset="0%" stopColor="#8b5cf6" />
                                            <stop offset="100%" stopColor="#3b82f6" />
                                        </linearGradient>
                                    </defs>
                                </svg>
                                {/* Center label */}
                                <div className="absolute inset-0 flex flex-col items-center justify-center">
                                    <span className="text-xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif", color: '#8b5cf6' }}>
                                        {aiSuccessRate}%
                                    </span>
                                    <span className="text-[10px] text-muted-foreground mt-0.5">Success</span>
                                </div>
                            </div>
                        </div>
                        {[
                            { label: 'Conversations', val: aiAnalytics?.totalConversations || 0 },
                            { label: 'AI Messages', val: aiAnalytics?.messagesHandled || aiAnalytics?.totalMessagesHandled || 0 },
                            { label: 'Avg Response', val: `${aiAnalytics?.avgResponseTime || (aiAnalytics?.avgResponseTimeMs ? Math.round(aiAnalytics.avgResponseTimeMs / 1000) : 0)}s` },
                            { label: 'Avg Context', val: `${aiAnalytics?.avgHistoryMessages || 0} msgs` },
                        ].map(item => (
                            <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-border/50 last:border-0">
                                <span className="text-muted-foreground text-xs">{item.label}</span>
                                <span className="font-semibold text-xs">{item.val}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Quick Replies */}
                <Card
                    onClick={() => onNavigate?.('quickreplies')}
                    className="card-glow cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group/card"
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Zap className="w-4 h-4 text-yellow-400" /> Quick Replies
                        </CardTitle>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all text-primary" />
                    </CardHeader>
                    <CardContent className="space-y-0">
                        {[
                            { label: 'Total Triggers', val: quickReplyAnalytics?.totalTriggers || 0 },
                            { label: 'Unique Users', val: quickReplyAnalytics?.uniqueUsers || 0 },
                            { label: 'Avg Response', val: `${quickReplyAnalytics?.avgResponseTime || quickReplyAnalytics?.avgResponseTimeMs || 0}ms` },
                            { label: 'Most Used', val: quickReplyAnalytics?.mostUsed || quickReplyAnalytics?.mostUsedKeyword || '—' },
                        ].map(item => (
                            <div key={item.label} className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
                                <span className="text-muted-foreground text-xs">{item.label}</span>
                                <span className="font-semibold text-xs truncate max-w-[90px] text-right">{item.val}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Sessions */}
                <Card
                    onClick={() => onNavigate?.('sessions')}
                    className="card-glow cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group/card"
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Smartphone className="w-4 h-4 text-blue-400" /> Active Sessions
                        </CardTitle>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all text-primary" />
                    </CardHeader>
                    <CardContent>
                        {sessions?.length > 0 ? (
                            <div className="space-y-2">
                                {sessions.map((s: any, idx: number) => (
                                    <div key={idx} className="flex justify-between items-center p-2.5 rounded-lg bg-secondary/40 hover:bg-secondary/80 transition-colors">
                                        <div>
                                            <p className="font-medium text-xs">{s.name}</p>
                                            <p className="text-[10px] text-muted-foreground">{s.phone ? `+${s.phone}` : 'No number'}</p>
                                        </div>
                                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full
                                            ${s.status === 'ready' ? 'badge-success' : s.status === 'disconnected' ? 'badge-destructive' : 'badge-warning'}`}>
                                            {s.status}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-6">No sessions connected</p>
                        )}
                    </CardContent>
                </Card>

                {/* Groups */}
                <Card
                    onClick={() => onNavigate?.('groups')}
                    className="card-glow cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group/card"
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-green-400" /> Groups
                        </CardTitle>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all text-primary" />
                    </CardHeader>
                    <CardContent>
                        {groupStats ? (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-secondary/40">
                                    <span className="text-xs text-muted-foreground">Total Groups</span>
                                    <span className="font-bold text-lg">{groupStats.totalGroups}</span>
                                </div>
                                <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-secondary/40">
                                    <span className="text-xs text-muted-foreground">Total Members</span>
                                    <span className="font-bold text-lg">{groupStats.totalMembers}</span>
                                </div>
                                <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-secondary/40">
                                    <span className="text-xs text-muted-foreground">Categories</span>
                                    <span className="font-bold text-lg">{groupStats.totalCategories}</span>
                                </div>
                                {groupStats.sessions?.map((s: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center px-2.5 py-1 rounded-lg hover:bg-secondary/60 transition-colors">
                                        <span className="text-xs text-muted-foreground truncate max-w-[120px]">{s.sessionName}</span>
                                        <span className="text-xs font-semibold">{s.groupCount} groups / {s.memberCount} members</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-6">No group data</p>
                        )}
                    </CardContent>
                </Card>

                {/* Group Activity */}
                <Card
                    onClick={() => onNavigate?.('groups')}
                    className="card-glow cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group/card"
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Users className="w-4 h-4 text-emerald-400" /> Group Activity
                        </CardTitle>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all text-primary" />
                    </CardHeader>
                    <CardContent>
                        {groupActivity ? (
                            <div className="space-y-1.5">
                                <div className="flex justify-between items-center px-2.5 py-1 rounded-lg bg-secondary/30">
                                    <span className="text-xs text-muted-foreground">Actions Total</span>
                                    <span className="font-bold text-base">{groupActivity.total}</span>
                                </div>
                                {[
                                    { label: 'Members Added', val: groupActivity.addMember, color: 'text-green-400' },
                                    { label: 'Members Removed', val: groupActivity.removeMember, color: 'text-red-400' },
                                    { label: 'Groups Created', val: groupActivity.createGroup, color: 'text-blue-400' },
                                    { label: 'Requests Approved', val: groupActivity.approveRequest, color: 'text-emerald-400' },
                                    { label: 'Requests Rejected', val: groupActivity.rejectRequest, color: 'text-orange-400' },
                                    { label: 'Promotions', val: groupActivity.promoteMember, color: 'text-purple-400' },
                                    { label: 'Demotions', val: groupActivity.demoteMember, color: 'text-yellow-400' },
                                    { label: 'Renames', val: groupActivity.renameGroup, color: 'text-cyan-400' },
                                ].map(item => (
                                    <div key={item.label} className="flex justify-between items-center px-2.5 py-1 rounded-lg hover:bg-secondary/40 transition-colors">
                                        <span className="text-xs text-muted-foreground">{item.label}</span>
                                        <span className={`text-xs font-semibold ${item.color}`}>{item.val}</span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
                        )}
                    </CardContent>
                </Card>

                {/* Top Campaigns */}
                <Card
                    onClick={() => onNavigate?.('messaging')}
                    className="card-glow cursor-pointer hover:border-primary/50 transition-all active:scale-[0.99] group/card"
                >
                    <CardHeader className="pb-2 flex flex-row items-center justify-between">
                        <CardTitle className="text-sm flex items-center gap-2">
                            <Rocket className="w-4 h-4 text-cyan-400" /> Top Campaigns
                        </CardTitle>
                        <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover/card:opacity-100 group-hover/card:translate-x-0.5 transition-all text-primary" />
                    </CardHeader>
                    <CardContent>
                        {topCampaigns?.length > 0 ? (
                            <div className="space-y-3">
                                {topCampaigns.map((c: any) => {
                                    const total = (c.sent || 0) + (c.failed || 0);
                                    const pct = total > 0 ? Math.round((c.sent / total) * 100) : 0;
                                    return (
                                        <div key={c.id} className="space-y-1.5 p-1.5 rounded-lg hover:bg-secondary/60 transition-colors">
                                            <div className="flex justify-between items-center">
                                                <span className="font-medium text-xs truncate max-w-[120px]">{c.name}</span>
                                                <span className="text-[10px] text-muted-foreground">{pct}%</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
                                                <motion.div
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${pct}%` }}
                                                    transition={{ duration: 1, ease, delay: 0.4 }}
                                                    className="h-full rounded-full"
                                                    style={{ background: 'linear-gradient(90deg, #3b82f6, #06b6d4)' }}
                                                />
                                            </div>
                                            <div className="flex justify-between text-[10px] text-muted-foreground">
                                                <span className="text-blue-400">{c.sent} sent</span>
                                                <span className="text-red-400">{c.failed} failed</span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <p className="text-xs text-muted-foreground text-center py-6">No campaigns found</p>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
