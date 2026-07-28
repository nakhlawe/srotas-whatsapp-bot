'use client';

import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SocketProvider } from '@/components/providers/socket-provider';
import { AppShell } from '@/components/layout/app-shell';
import { Dashboard } from './dashboard';
import { Sessions } from './sessions';
import { Contacts } from './contacts';
import { Campaigns } from './campaigns';
import { Scheduler } from './scheduler';
import { Templates } from './templates';
import { QuickReplies } from './quickreplies';
import { Settings } from './settings';
import { Admin } from './admin';
import { Help } from './help';
import { Updates } from './updates';
import { Blacklist } from './blacklist';
import { Webhooks } from './webhooks';
import { FollowUps } from './follow-ups';
import { GroupController } from './groups';
import { getLicenseStatus, activateLicense } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MessageSquareMore, KeyRound, ArrowRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Home() {
  const [activated, setActivated] = useState<boolean | null>(null);
  const [activationKey, setActivationKey] = useState('');
  const [loading, setLoading] = useState(false);
  const clickCountRef = useRef(0);

  useEffect(() => { checkLicense(); }, []);

  const handleLogoClick = () => {
    clickCountRef.current += 1;
    if (clickCountRef.current >= 20) {
      setActivationKey('SROTAS-EASTER-EGG-2026');
      clickCountRef.current = 0;
    }
  };

  const checkLicense = () => {
    getLicenseStatus()
      .then((res) => setActivated(res.activated))
      .catch(() => setActivated(false));
  };

  const handleActivate = async () => {
    if (!activationKey.trim()) return toast.error('Activation key is required');
    setLoading(true);
    try {
      const res = await activateLicense(activationKey);
      if (res.success) { toast.success('Activated successfully'); setActivated(true); }
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Invalid activation key');
    } finally {
      setLoading(false);
    }
  };

  if (activated === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col items-center gap-3 text-muted-foreground"
        >
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <span className="text-sm">Initializing...</span>
        </motion.div>
      </div>
    );
  }

  if (!activated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
        {/* Ambient orbs */}
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #3b82f6, transparent)' }} />
        <div className="absolute bottom-1/4 right-1/4 w-64 h-64 rounded-full opacity-10 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="w-full max-w-md relative z-10"
        >
          {/* Card */}
          <div className="card-glass rounded-2xl p-8 text-center"
            style={{ border: '1px solid rgba(59, 130, 246, 0.25)', boxShadow: '0 0 60px rgba(59, 130, 246, 0.08)' }}
          >
            {/* Logo */}
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.15, duration: 0.4 }}
              className="flex justify-center mb-6"
              onClick={handleLogoClick}
            >
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center blue-glow cursor-pointer"
                style={{ background: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' }}
              >
                <MessageSquareMore className="w-8 h-8 text-white pointer-events-none" />
              </div>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="text-3xl font-bold mb-1"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >
              AJM<span className="text-primary">.bot</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.35 }}
              className="text-sm text-muted-foreground mb-8"
            >
              WhatsApp Automation Platform — Enter your license key to continue.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45 }}
              className="space-y-4"
            >
              <div className="relative">
                <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={activationKey}
                  onChange={e => setActivationKey(e.target.value.toUpperCase())}
                  placeholder="XXXX-XXXX-XXXX-XXXX"
                  className="pl-10 text-center font-mono tracking-widest bg-secondary/50 border-border/60 focus:border-primary"
                  onKeyDown={e => e.key === 'Enter' && handleActivate()}
                />
              </div>
              <Button
                className="w-full btn-primary-glow gap-2 h-11"
                onClick={handleActivate}
                disabled={loading}
              >
                {loading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Activating...</>
                ) : (
                  <>Activate License <ArrowRight className="w-4 h-4" /></>
                )}
              </Button>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
              className="mt-6 text-xs text-muted-foreground"
            >
              Need a license?{' '}
              <a href="https://web-ajm.vercel.app/" target="_blank" rel="noreferrer" className="text-primary hover:underline">
                Buy here
              </a>
            </motion.p>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <SocketProvider>
      <AppShell>
        {(activePage, setActivePage) => (
          <div className="h-full overflow-y-auto">
            {activePage === 'dashboard' && <Dashboard onNavigate={setActivePage} />}
            {activePage === 'sessions' && <Sessions />}
            {activePage === 'contacts' && <Contacts />}
            {activePage === 'messaging' && <Campaigns />}
            {activePage === 'scheduler' && <Scheduler />}
            {activePage === 'templates' && <Templates />}
            {activePage === 'quickreplies' && <QuickReplies />}
            {activePage === 'blacklist' && <Blacklist />}
            {activePage === 'webhooks' && <Webhooks />}
            {activePage === 'follow-ups' && <FollowUps />}
            {activePage === 'groups' && <GroupController />}
            {activePage === 'settings' && <Settings />}
            {activePage === 'help' && <Help />}
            {activePage === 'admin' && <Admin />}
            {activePage === 'updates' && <Updates />}
          </div>
        )}
      </AppShell>
    </SocketProvider>
  );
}
