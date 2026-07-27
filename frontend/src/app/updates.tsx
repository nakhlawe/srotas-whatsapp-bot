'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { checkForUpdate, getVersion } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowUpCircle, RefreshCw, CheckCircle, Download, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';

const ease = [0.25, 0.46, 0.45, 0.94] as const;

export function Updates() {
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [checkingUpdate, setCheckingUpdate] = useState(false);
    const [currentVersion, setCurrentVersion] = useState<string>('');
    const [clientOs, setClientOs] = useState<string>('unknown');

    useEffect(() => {
        if (typeof window !== 'undefined') {
            const ua = window.navigator.userAgent.toLowerCase();
            if (ua.includes('win')) setClientOs('windows');
            else if (ua.includes('mac')) setClientOs('mac');
        }
        getVersion().then((data: any) => setCurrentVersion(data.version)).catch(console.error);
        // Automatically check for updates on mount
        handleCheckUpdate();
    }, []);

    const handleCheckUpdate = async () => {
        setCheckingUpdate(true);
        try {
            const data = await checkForUpdate();
            setUpdateInfo(data);
            if (data.updateAvailable) {
                toast.success(`New version v${data.latestVersion} available!`);
            } else if (data.error) {
                toast.error(data.error);
            }
        } catch {
            toast.error('Failed to check for updates');
        } finally {
            setCheckingUpdate(false);
        }
    };

    return (
        <div className="p-4 sm:p-6 xl:p-8 max-w-[800px] mx-auto space-y-5 w-full">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }}>
                <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Software Updates</h1>
                <p className="text-sm text-muted-foreground mt-0.5">Check for and download the latest versions of AJM.bot</p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1, duration: 0.4, ease }}>
                <Card className="card-glow overflow-hidden">
                    <div className="h-0.5 w-full" style={{ background: 'linear-gradient(90deg, #f59e0b, transparent)' }} />
                    <CardHeader className="pb-3 pt-5 px-5">
                        <CardTitle className="text-lg flex items-center gap-3" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-amber-500/20">
                                <ArrowUpCircle className="w-4 h-4 text-amber-500" />
                            </div>
                            Update Status
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="px-5 pb-6 space-y-6">
                        <div className="flex items-center justify-between p-4 bg-secondary/30 rounded-xl border border-border/50">
                            <div>
                                <div className="text-xs text-muted-foreground uppercase font-semibold mb-1">Current Version</div>
                                <div className="font-mono font-bold text-2xl">v{updateInfo?.currentVersion || currentVersion || '...'}</div>
                            </div>
                            <Button onClick={handleCheckUpdate} disabled={checkingUpdate} className="gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-md h-10">
                                <RefreshCw className={`w-4 h-4 \${checkingUpdate ? 'animate-spin' : ''}`} />
                                {checkingUpdate ? 'Checking...' : 'Check for Updates'}
                            </Button>
                        </div>

                        {updateInfo && !updateInfo.updateAvailable && !updateInfo.error && (
                            <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                                <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                                <div>
                                    <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400">You're up to date!</h3>
                                    <p className="text-xs text-emerald-600/80 dark:text-emerald-400/80 mt-0.5">You are running the latest stable release.</p>
                                </div>
                            </div>
                        )}

                        {updateInfo?.updateAvailable && (
                            <div className="space-y-4">
                                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl space-y-3">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-2.5">
                                            <Download className="w-5 h-5 text-amber-500 shrink-0" />
                                            <div>
                                                <span className="text-base font-bold text-amber-600 dark:text-amber-400 block leading-none">
                                                    v{updateInfo.latestVersion} is available!
                                                </span>
                                                {updateInfo.publishedAt && (
                                                    <span className="text-[11px] text-muted-foreground mt-1 block">
                                                        Released on {new Date(updateInfo.publishedAt).toLocaleDateString()}
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    {updateInfo.releaseNotes && (
                                        <div className="pt-3 border-t border-amber-500/20">
                                            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                                                {updateInfo.releaseNotes}
                                            </p>
                                        </div>
                                    )}
                                </div>

                                <div className="pt-2">
                                    {updateInfo.downloadWindows || updateInfo.downloadMac ? (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                            {(clientOs === 'windows' || clientOs === 'unknown' || !updateInfo.downloadMac) && updateInfo.downloadWindows && (
                                                <a href={updateInfo.downloadWindows} target="_blank" rel="noreferrer">
                                                    <Button size="lg" className="w-full gap-2 bg-blue-600 hover:bg-blue-700 text-white shadow-md">
                                                        <Download className="w-4 h-4" /> Download for Windows (.exe)
                                                    </Button>
                                                </a>
                                            )}
                                            {(clientOs === 'mac' || clientOs === 'unknown' || !updateInfo.downloadWindows) && updateInfo.downloadMac && (
                                                <a href={updateInfo.downloadMac} target="_blank" rel="noreferrer">
                                                    <Button size="lg" className="w-full gap-2 bg-gray-600 hover:bg-gray-700 text-white shadow-md">
                                                        <Download className="w-4 h-4" /> Download for Mac (.dmg)
                                                    </Button>
                                                </a>
                                            )}
                                        </div>
                                    ) : (
                                        <a href={updateInfo.releaseUrl} target="_blank" rel="noreferrer">
                                            <Button size="lg" className="w-full gap-2 bg-amber-600 hover:bg-amber-700 text-white shadow-md">
                                                <ExternalLink className="w-4 h-4" /> Go to Download Page
                                            </Button>
                                        </a>
                                    )}
                                </div>

                                <div className="p-4 bg-secondary/40 rounded-xl mt-4">
                                    <div className="text-xs text-muted-foreground uppercase tracking-wider font-semibold mb-3">Installation Instructions</div>
                                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal pl-5">
                                        <li>Download the installer file for your operating system.</li>
                                        <li>Run the installer and follow the setup wizard.</li>
                                        <li>Your existing data (sessions, templates, contacts) will be automatically preserved.</li>
                                        <li>If you run into issues, completely close AJM.bot from the system tray before running the installer again.</li>
                                    </ol>
                                </div>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </motion.div>
        </div>
    );
}
