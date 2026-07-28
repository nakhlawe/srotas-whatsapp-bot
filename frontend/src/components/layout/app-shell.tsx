'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    Smartphone,
    Users,
    Megaphone,
    CalendarClock,
    FileText,
    Zap,
    Settings,
    HelpCircle,
    Shield,
    MessageSquareMore,
    Ban,
    Globe,
    Clock,
    UsersRound,
    Sun,
    Moon,
    ChevronRight
} from 'lucide-react';
import { getLicenseStatus, getSessions, getCampaigns, getVersion } from '@/lib/api';
import { toast } from 'sonner';
import { useSocket } from '../providers/socket-provider';

interface AppShellProps {
    children: (activePage: string, setActivePage: (page: string) => void) => React.ReactNode;
}

const NAV_ITEMS = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'sessions', label: 'Devices', icon: Smartphone },
    { id: 'contacts', label: 'Contacts', icon: Users },
    { id: 'messaging', label: 'Campaigns', icon: Megaphone },
    { id: 'scheduler', label: 'Scheduler', icon: CalendarClock },
    { id: 'templates', label: 'Templates', icon: FileText },
    { id: 'quickreplies', label: 'Quick Replies', icon: Zap },
    { id: 'blacklist', label: 'Blacklist', icon: Ban },
    { id: 'groups', label: 'Groups', icon: UsersRound },
    { id: 'webhooks', label: 'Webhooks', icon: Globe },
    { id: 'follow-ups', label: 'Follow-ups', icon: Clock },
    { id: 'settings', label: 'Settings', icon: Settings },
    { id: 'help', label: 'Help', icon: HelpCircle },
];

export function AppShell({ children }: AppShellProps) {
    const [activePage, setActivePage] = useState('dashboard');
    const [hasEasterEgg, setHasEasterEgg] = useState(false);
    const [isDark, setIsDark] = useState(true);
    const [isOnline, setIsOnline] = useState(false);
    const [isSendingCampaign, setIsSendingCampaign] = useState(false);
    const [isAutoReplyOn, setIsAutoReplyOn] = useState(false);
    const [appVersion, setAppVersion] = useState<string>('...');

    const { socket } = useSocket();

    const fetchStatus = async () => {
        try {
            const [sessions, campaigns] = await Promise.all([
                getSessions(),
                getCampaigns()
            ]);

            const connectedSessions = sessions.filter((s: any) => s.status === 'ready');
            setIsOnline(connectedSessions.length > 0);

            const autoReplyOn = connectedSessions.some((s: any) => s.auto_reply === 1 || s.ai_replies_enabled === 1);
            setIsAutoReplyOn(autoReplyOn);

            const activeCampaign = campaigns.some((c: any) => c.status === 'running' || c.status === 'sending');
            setIsSendingCampaign(activeCampaign);
        } catch (e) {
            // ignore
        }
    };

    useEffect(() => {
        fetchStatus();

        if (socket) {
            socket.on('session:ready', fetchStatus);
            socket.on('session:disconnected', fetchStatus);
            socket.on('bulk:progress', fetchStatus);
            socket.on('bulk:complete', fetchStatus);

            return () => {
                socket.off('session:ready', fetchStatus);
                socket.off('session:disconnected', fetchStatus);
                socket.off('bulk:progress', fetchStatus);
                socket.off('bulk:complete', fetchStatus);
            };
        }
    }, [socket]);

    useEffect(() => {
        getLicenseStatus().then((status) => {
            if (status.isLifetime) setHasEasterEgg(true);
        }).catch(console.error);

        getVersion().then((data) => {
            if (data && data.version) setAppVersion(data.version);
        }).catch(console.error);

        const saved = localStorage.getItem('theme');
        const dark = saved !== 'light';
        setIsDark(dark);
        document.documentElement.classList.toggle('dark', dark);
    }, []);

    const toggleTheme = () => {
        const next = !isDark;
        setIsDark(next);
        document.documentElement.classList.toggle('dark', next);
        localStorage.setItem('theme', next ? 'dark' : 'light');
    };

    const allNavItems = hasEasterEgg
        ? [...NAV_ITEMS, { id: 'admin', label: 'Admin', icon: Shield }]
        : NAV_ITEMS;

    const activeLabel = allNavItems.find(n => n.id === activePage)?.label || 'Dashboard';

    return (
        <div className="flex h-screen bg-background text-foreground overflow-hidden">
            {/* ── Sidebar ─────────────────────────────── */}
            <motion.aside
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="w-64 xl:w-72 flex flex-col flex-shrink-0"
                style={{ background: 'var(--sidebar)', borderRight: '1px solid var(--sidebar-border)' }}
            >
                {/* Logo + Theme Toggle */}
                <div
                    className="h-16 flex items-center justify-between px-5 flex-shrink-0"
                    style={{ borderBottom: '1px solid var(--sidebar-border)' }}
                >
                    <div
                        className="flex items-center gap-3 select-none"
                    >
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center blue-glow flex-shrink-0"
                            style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}
                        >
                            <MessageSquareMore className="w-4 h-4 text-white" />
                        </div>
                        <div>
                            <div className="font-bold text-base tracking-tight leading-none" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                                AJM<span className="text-primary">.bot</span>
                            </div>
                            <div className="text-[10px] text-muted-foreground tracking-widest uppercase">Dashboard</div>
                        </div>
                    </div>

                    {/* Theme toggle — icon only, next to logo */}
                    <button
                        onClick={toggleTheme}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors flex-shrink-0"
                        title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            {isDark ? (
                                <motion.div
                                    key="moon"
                                    initial={{ rotate: -30, opacity: 0 }}
                                    animate={{ rotate: 0, opacity: 1 }}
                                    exit={{ rotate: 30, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Moon className="w-4 h-4" />
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="sun"
                                    initial={{ rotate: 30, opacity: 0 }}
                                    animate={{ rotate: 0, opacity: 1 }}
                                    exit={{ rotate: -30, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                >
                                    <Sun className="w-4 h-4" />
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </button>
                </div>

                {/* Navigation */}
                <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
                    {allNavItems.map((item, i) => {
                        const Icon = item.icon;
                        const isActive = activePage === item.id;
                        const isAdmin = item.id === 'admin';

                        return (
                            <motion.button
                                key={item.id}
                                initial={{ x: -10, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                transition={{ delay: 0.04 * i, duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
                                onClick={() => setActivePage(item.id)}
                                whileHover={{ x: 3 }}
                                whileTap={{ scale: 0.97 }}
                                className={`
                                    w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200
                                    ${isActive
                                        ? 'nav-active'
                                        : isAdmin
                                            ? 'text-purple-400 hover:bg-purple-400/10'
                                            : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                                    }
                                `}
                            >
                                <div className="flex items-center gap-3">
                                    <Icon className={`w-4 h-4 flex-shrink-0 ${isActive ? 'text-primary' : isAdmin ? 'text-purple-400' : ''}`} />
                                    {item.label}
                                </div>
                                {isActive && <ChevronRight className="w-3.5 h-3.5 text-primary opacity-60" />}
                            </motion.button>
                        );
                    })}
                </nav>

                {/* Footer — status only, no theme toggle */}
                <div className="p-4 flex-shrink-0" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
                    <div className="flex flex-col gap-3 px-1 items-center justify-center text-center">
                        <div className="flex items-center gap-2">
                            <span className="relative flex h-2 w-2">
                                {isOnline ? (
                                    <>
                                        {isSendingCampaign ? (
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-[ping_0.5s_cubic-bezier(0,0,0.2,1)_infinite]" />
                                        ) : isAutoReplyOn ? (
                                            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]" />
                                        ) : null}
                                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                                    </>
                                ) : (
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-neutral-400" />
                                )}
                            </span>
                            <span className="text-xs text-muted-foreground">{isOnline ? 'Online' : 'Offline'}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center justify-center gap-1">
                            <span>designed by</span>
                            <motion.a
                                href="https://web-ajm.vercel.app/"
                                target="_blank"
                                rel="noreferrer"
                                className="font-bold tracking-wider inline-flex items-center text-xs"
                                style={{
                                    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 400 100'%3E%3Cpath d='M0,50 C150,150 250,-50 400,50 L400,150 L0,150 Z' fill='%233b82f6' /%3E%3C/svg%3E")`,
                                    backgroundColor: '#93c5fd', // light blue base
                                    backgroundSize: '15px 150%',
                                    backgroundRepeat: 'repeat-x',
                                    WebkitBackgroundClip: 'text',
                                    WebkitTextFillColor: 'transparent',
                                    backgroundClip: 'text',
                                    color: 'transparent'
                                }}
                                animate={{ backgroundPosition: ['0px 30%', '15px 30%'] }}
                                transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}
                            >
                                web-ajm.vercel.app
                            </motion.a>
                        </div>
                    </div>
                </div>
            </motion.aside>

            {/* ── Main Content ─────────────────────────── */}
            <main className="flex-1 overflow-hidden flex flex-col">
                {/* Header */}
                <div
                    className="h-16 flex-shrink-0 flex items-center justify-between px-8"
                    style={{ borderBottom: '1px solid var(--border)' }}
                >
                    <div>
                        <h2 className="text-base font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            {activeLabel}
                        </h2>
                        <p className="text-xs text-muted-foreground">AJM.bot · WhatsApp Automation Platform</p>
                    </div>
                    <button
                        onClick={() => setActivePage('updates')}
                        className="text-xs px-3 py-1 rounded-full badge-blue font-medium cursor-pointer hover:opacity-80 transition-opacity"
                        title="Check for updates"
                    >v{appVersion}</button>
                </div>

                {/* Page with transition */}
                <AnimatePresence mode="wait">
                    <motion.div
                        key={activePage}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
                        className="flex-1 overflow-y-auto"
                    >
                        {children(activePage, setActivePage)}
                    </motion.div>
                </AnimatePresence>
            </main>
        </div>
    );
}
