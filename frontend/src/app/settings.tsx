'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { getSettings, updateSettings, getLicenseStatus, deactivateLicense, uploadCompanyLogo, deleteCompanyLogo, getDndSettings, updateDndSettings } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Brain, Palette, KeyRound, Save, Infinity, Eye, EyeOff, CheckCircle, Sun, Moon, Cpu, Settings2, LogOut, ShieldCheck, ImagePlus, Trash2, RotateCcw, Sparkles, Bell } from 'lucide-react';
import { toast } from 'sonner';

const ease = [0.25, 0.46, 0.45, 0.94] as const;

export function Settings() {
    const [settings, setSettings] = useState<any>({
        theme: 'dark',
        ai_provider: 'gemini',
        ai_model: '',
        ai_chat_history: false,
        ai_chat_history_limit: 20,
        ai_use_system_prompt: true,
        system_prompt: '',
        min_delay: '8000',
        max_delay: '18000',
        gemini_api_key: '',
        openai_api_key: '',
        anti_ban_enabled: true,
        anti_ban_ignore_bots: true,
        anti_ban_cooldown_sec: '30',
        anti_ban_typing_delay_min: '3',
        anti_ban_typing_delay_max: '6',
        image_generation_prompt: '',
    });

    const availableModels = {
        gemini: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview'],
        openai: ['gpt-5.4', 'gpt-5.4-thinking', 'gpt-5.2', 'gpt-5.2-codex', 'o4-mini', 'gpt-image-1.5']
    };

    const [license, setLicense] = useState<any>(null);
    const [saving, setSaving] = useState(false);
    const [showApiKey, setShowApiKey] = useState(false);
    const [activeTab, setActiveTab] = useState('ai');
    const [activePromptTab, setActivePromptTab] = useState<'bot' | 'image'>('bot');
    const [hasLogo, setHasLogo] = useState(false);
    const [logoVersion, setLogoVersion] = useState(0); // Cache-buster for logo preview
    const [logoUploading, setLogoUploading] = useState(false);
    const logoInputRef = React.useRef<HTMLInputElement>(null);
    const [dndEnabled, setDndEnabled] = useState(false);
    const [dndStartTime, setDndStartTime] = useState('22:00');
    const [dndEndTime, setDndEndTime] = useState('08:00');

    const DEFAULT_IMAGE_PROMPT = `You are a world-class commercial photographer, CGI director, and graphic designer specializing in premium Indian brand campaigns. Your work appears in Forbes India, Vogue India, and campaigns for Tata, Mahindra, and Reliance.

CAMPAIGN MESSAGE:
{{message}}

═══ STEP 1 — DECIDE THE FORMAT (do this first) ═══
Read the campaign message carefully and choose ONE of the two formats below based on its content and intent:

FORMAT A — POSTER
Choose this when the message is about: a SALE, DISCOUNT, LIMITED OFFER, EVENT, LAUNCH, ANNOUNCEMENT, DEADLINE, or URGENCY.
Signals: words like "off", "sale", "offer", "ends", "launch", "new", "limited", "hurry", "today only", "introducing", "event", "%"
→ A poster uses BOLD TEXT as a primary design element, dramatic background, strong color contrast, and typographic hierarchy to grab instant attention.

FORMAT B — GENERAL PROMOTIONAL
Choose this when the message is about: a SERVICE, PRODUCT SHOWCASE, BRAND AWARENESS, TRUST-BUILDING, or GENERAL INFORMATION.
Signals: describing what a company does, features, reliability, expertise, quality, "we provide", "our services", "contact us"
→ A general promo uses a photorealistic scene where the SERVICE or PRODUCT is the visual hero. Minimal or no text overlay.

═══ STEP 2 — EXECUTE THE CHOSEN FORMAT ═══

IF FORMAT A (POSTER):
- Layout: Dramatic full-bleed background (real photographic or cinematic CGI scene related to the service/product)
- Text hierarchy: 1 massive headline (the core offer, max 4 words) + 1 supporting subline (max 6 words)
- Typography: ONLY clean geometric sans-serif — Helvetica Neue, Futura, or Montserrat. Bold/Black weight. NO serif, script, retro, or decorative fonts
- Colors: High contrast — white or bright accent text on dark dramatic background
- People: Optional — small supporting role only

IF FORMAT B (GENERAL PROMOTIONAL):
- Layout: The SERVICE, PRODUCT, or ENVIRONMENT is the dominant visual hero
- Text: Minimal or none — at most a 3–5 word label
- Photography: Shot on Phase One XF IQ4 — tack sharp, shallow depth of field (bokeh), cinematic color grade
- People: Secondary role only — background or periphery. NEVER the primary subject

═══ RULES FOR BOTH FORMATS ═══

PHOTOREALISM: This image MUST look like a real photograph — NO illustrations, drawings, flat design, cartoon, anime, or watercolor
PEOPLE: If included — must be Indian (South Asian), aspirational, aged 25–45, modern premium attire, genuine expressions
TYPOGRAPHY: ONLY Helvetica Neue, Futura, Montserrat. NO serif, script, decorative, or retro fonts
FORMAT: Square (1:1). Single dominant focal point. Clean, uncluttered composition
NO INVENTED BRANDING: Do NOT add logos or brand marks not explicitly provided`;

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        e.target.value = ''; // Allow re-selecting the same file
        if (!file) return;
        setLogoUploading(true);
        try {
            const formData = new FormData();
            formData.append('logo', file);
            await uploadCompanyLogo(formData);
            setHasLogo(true);
            setLogoVersion(v => v + 1);
            toast.success('Company logo uploaded');
        } catch (error: any) {
            toast.error(error.response?.data?.error || 'Failed to upload logo');
        } finally {
            setLogoUploading(false);
        }
    };

    const handleLogoDelete = async () => {
        try {
            await deleteCompanyLogo();
            setHasLogo(false);
            toast.success('Company logo removed');
        } catch {
            toast.error('Failed to remove logo');
        }
    };

    useEffect(() => {
        getSettings().then(s => {
            setSettings(s);
            setHasLogo(!!s.has_company_logo);
        }).catch(console.error);
        getLicenseStatus().then(setLicense).catch(console.error);
        getDndSettings().then(d => {
            setDndEnabled(d.enabled);
            setDndStartTime(d.startTime);
            setDndEndTime(d.endTime);
        }).catch(console.error);
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await updateSettings(settings);
            await updateDndSettings({ enabled: dndEnabled, startTime: dndStartTime, endTime: dndEndTime });
            toast.success('Settings saved successfully');
        } catch {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!confirm("Are you sure you want to deactivate this license? You will need to enter your license key again to use the application.")) return;
        try {
            await deactivateLicense();
            window.location.reload();
        } catch (e: any) {
            toast.error('Failed to deactivate license');
        }
    };

    return (
        <div className="p-4 sm:p-6 xl:p-8 max-w-[1200px] mx-auto space-y-6 w-full h-full flex flex-col">
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease }} className="flex justify-between items-center shrink-0">
                <div>
                    <h1 className="text-2xl font-bold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Settings</h1>
                    <p className="text-sm text-muted-foreground mt-0.5">Manage application configurations</p>
                </div>
                <Button onClick={handleSave} disabled={saving} className="btn-primary-glow gap-2 min-w-[140px] shadow-md">
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Settings'}
                </Button>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.4, ease }}
                className="flex-1 flex flex-col"
            >
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col">
                    <TabsList className="grid w-full grid-cols-2 mb-6 bg-secondary/50 p-1 border border-border/50 max-w-md mx-auto">
                        <TabsTrigger value="ai" className="gap-2 text-xs">
                            <Cpu className="w-4 h-4" /> AI Engine
                        </TabsTrigger>
                        <TabsTrigger value="system" className="gap-2 text-xs">
                            <Settings2 className="w-4 h-4" /> System Config
                        </TabsTrigger>
                    </TabsList>

                    {/* AI ENGINE TAB */}
                    <TabsContent value="ai" className="flex-1 flex flex-col gap-6 mt-0">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 flex-1">
                            {/* Left Column: API & Model + Easter Egg Settings */}
                            <div className="lg:col-span-1 flex flex-col gap-6 shrink-0">
                                {/* API & Model Configuration */}
                                <Card className="card-glow border-border/50 shadow-sm h-fit">
                                    <CardHeader className="pb-4 pt-5 px-5 border-b border-border/30">
                                        <CardTitle className="text-base flex items-center gap-2.5 font-semibold">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-purple-500/20">
                                                <Brain className="w-3.5 h-3.5 text-purple-400" />
                                            </div>
                                            API & Model
                                        </CardTitle>
                                        <CardDescription className="text-[11px] mt-1">Select and authenticate your AI provider.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-5 space-y-5">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-foreground/80">Provider</Label>
                                            <Select
                                                value={settings.ai_provider}
                                                onValueChange={(v) => {
                                                    const prov = (v === 'openai' ? 'openai' : 'gemini');
                                                    setSettings({ ...settings, ai_provider: prov, ai_model: availableModels[prov][0] });
                                                }}
                                            >
                                                <SelectTrigger className="bg-secondary/30 h-9 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="gemini" className="text-xs">Google Gemini</SelectItem>
                                                    <SelectItem value="openai" className="text-xs">OpenAI</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-foreground/80">Model</Label>
                                            <Select
                                                value={settings.ai_model || availableModels[settings.ai_provider === 'openai' ? 'openai' : 'gemini'][0]}
                                                onValueChange={(v) => setSettings({ ...settings, ai_model: v || '' })}
                                            >
                                                <SelectTrigger className="bg-secondary/30 h-9 text-xs"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {availableModels[settings.ai_provider === 'openai' ? 'openai' : 'gemini'].map(m => (
                                                        <SelectItem key={m} value={m} className="text-xs">{m}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-semibold text-foreground/80">
                                                {settings.ai_provider === 'gemini' ? 'Gemini API Key' : 'OpenAI API Key'}
                                            </Label>
                                            <div className="relative">
                                                <Input type={showApiKey ? 'text' : 'password'}
                                                    value={settings.ai_provider === 'gemini' ? settings.gemini_api_key : settings.openai_api_key}
                                                    onChange={e => setSettings({ ...settings, [settings.ai_provider === 'gemini' ? 'gemini_api_key' : 'openai_api_key']: e.target.value })}
                                                    placeholder={`Enter ${settings.ai_provider === 'gemini' ? 'Gemini' : 'OpenAI'} API key`}
                                                    className="bg-secondary/30 font-mono pr-8 h-9 text-xs" />
                                                <button type="button" onClick={() => setShowApiKey(!showApiKey)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors">
                                                    {showApiKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                                </button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>

                                {/* Company Logo — composited into AI-generated campaign images */}
                                <Card className="card-glow border-border/50 shadow-sm h-fit">
                                    <CardHeader className="pb-4 pt-5 px-5 border-b border-border/30">
                                        <CardTitle className="text-base flex items-center gap-2.5 font-semibold">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-500/20">
                                                <ImagePlus className="w-3.5 h-3.5 text-pink-400" />
                                            </div>
                                            Company Logo
                                        </CardTitle>
                                        <CardDescription className="text-[11px] mt-1">
                                            Added automatically to every AI-generated campaign image. PNG, JPG or WEBP, max 5 MB.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-5">
                                        <input type="file" ref={logoInputRef} className="hidden"
                                            accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
                                            onChange={handleLogoUpload} />
                                        {hasLogo ? (
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 rounded-lg border border-border/50 bg-secondary/30 flex items-center justify-center overflow-hidden shrink-0">
                                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                                    <img src={`/api/settings/logo?v=${logoVersion}`} alt="Company logo" className="max-w-full max-h-full object-contain" />
                                                </div>
                                                <div className="flex flex-col gap-2 flex-1 min-w-0">
                                                    <Button variant="outline" size="sm" onClick={() => logoInputRef.current?.click()}
                                                        disabled={logoUploading} className="text-xs h-8 gap-1.5">
                                                        <ImagePlus className="w-3.5 h-3.5" /> {logoUploading ? 'Uploading…' : 'Replace'}
                                                    </Button>
                                                    <Button variant="ghost" size="sm" onClick={handleLogoDelete}
                                                        className="text-xs h-8 gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10">
                                                        <Trash2 className="w-3.5 h-3.5" /> Remove
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div onClick={() => !logoUploading && logoInputRef.current?.click()}
                                                className="border-2 border-dashed border-border/50 rounded-xl p-5 text-center cursor-pointer hover:bg-secondary/30 hover:border-primary/40 transition-all bg-secondary/10">
                                                <ImagePlus className="w-6 h-6 mx-auto mb-2 text-primary/60" />
                                                <span className="text-xs font-medium">{logoUploading ? 'Uploading…' : 'Click to upload your logo'}</span>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>

                                {/* Easter Egg Settings (Moved directly below API & Model) */}
                                {license?.isLifetime && (
                                    <Card className="card-glow border-purple-500/20 bg-purple-500/5 shadow-sm shrink-0">
                                        <CardContent className="p-5 flex flex-col gap-4">
                                            <div>
                                                <h3 className="text-sm font-semibold text-purple-400 flex items-center gap-2">
                                                    Chat Context
                                                    <span className="px-1.5 py-0.5 rounded-md bg-purple-500/20 text-[9px] uppercase tracking-wider">Easter Egg</span>
                                                </h3>
                                                <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
                                                    Allows the AI to read previous messages.
                                                    <span className="text-orange-400 block mt-1 font-medium">Privacy Warning: History is sent to the AI API.</span>
                                                </p>
                                            </div>
                                            <div className="flex flex-col gap-3 bg-background/50 border border-border/50 rounded-lg p-3">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-xs font-medium cursor-pointer">Active</Label>
                                                    <Switch
                                                        checked={settings.ai_chat_history}
                                                        onCheckedChange={(checked: boolean) => setSettings({ ...settings, ai_chat_history: checked })}
                                                    />
                                                </div>
                                                <div className={`flex items-center justify-between pt-2 border-t border-border/40 transition-opacity ${!settings.ai_chat_history ? 'opacity-40 pointer-events-none' : ''}`}>
                                                    <Label className="text-xs text-muted-foreground">Message Limit</Label>
                                                    <Input
                                                        type="number"
                                                        min={1}
                                                        max={500}
                                                        className="w-16 h-7 text-xs text-center font-mono border-border/60"
                                                        value={settings.ai_chat_history_limit}
                                                        onChange={(e) => setSettings({ ...settings, ai_chat_history_limit: parseInt(e.target.value) || 20 })}
                                                    />
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                )}
                            </div>

                            {/* Right: Prompt Cards switcher with unmistakable high-contrast visual cues */}
                            <div className="lg:col-span-2 flex flex-col gap-4">
                                {/* Minimal yet Superior Switcher Bar */}
                                <div className="grid grid-cols-2 p-1.5 bg-secondary/60 border border-border/50 rounded-xl gap-2 shadow-inner">
                                    <button
                                        type="button"
                                        onClick={() => setActivePromptTab('bot')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                                            activePromptTab === 'bot'
                                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/40 shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
                                        }`}
                                    >
                                        <Brain className={`w-4 h-4 shrink-0 ${activePromptTab === 'bot' ? 'text-blue-400' : 'opacity-70'}`} />
                                        <span className="truncate">Bot System Prompt</span>
                                    </button>

                                    <button
                                        type="button"
                                        onClick={() => setActivePromptTab('image')}
                                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
                                            activePromptTab === 'image'
                                                ? 'bg-pink-500/20 text-pink-400 border border-pink-500/40 shadow-sm'
                                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50 border border-transparent'
                                        }`}
                                    >
                                        <Sparkles className={`w-4 h-4 shrink-0 ${activePromptTab === 'image' ? 'text-pink-400' : 'opacity-70'}`} />
                                        <span className="truncate">Image Generation Prompt</span>
                                    </button>
                                </div>

                                {/* Active Prompt Card Display */}
                                {activePromptTab === 'bot' ? (
                                    /* Bot System Prompt Card */
                                    <Card className="card-glow border-blue-500/30 flex flex-col shadow-sm transition-all" style={{ minHeight: '340px' }}>
                                        <CardHeader className="pb-3 pt-5 px-5 border-b border-border/30 shrink-0 flex flex-row items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                                                    <div className="w-6 h-6 rounded-md flex items-center justify-center bg-blue-500/20 shrink-0">
                                                        <Brain className="w-3.5 h-3.5 text-blue-400" />
                                                    </div>
                                                    Bot System Prompt
                                                </CardTitle>
                                                <CardDescription className="text-[11px] mt-0.5">Defines the AI persona, tone, and knowledge base for the WhatsApp bot.</CardDescription>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                                {license?.isLifetime && (
                                                    <div className="flex items-center gap-1.5 bg-secondary/30 border border-border/50 px-2.5 py-1.5 rounded-full">
                                                        <Switch
                                                            checked={settings.ai_use_system_prompt}
                                                            onCheckedChange={(checked: boolean) => setSettings({ ...settings, ai_use_system_prompt: checked })}
                                                            className="scale-75"
                                                        />
                                                        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Active</span>
                                                    </div>
                                                )}
                                                <Button
                                                    variant="ghost" size="sm"
                                                    className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground"
                                                    onClick={() => {
                                                        if (confirm('Reset bot prompt to default?')) {
                                                            setSettings((s: any) => ({ ...s, system_prompt: '' }));
                                                        }
                                                    }}
                                                >
                                                    <RotateCcw className="w-3 h-3" /> Reset
                                                </Button>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="p-0 flex-1 flex flex-col relative overflow-hidden">
                                            <Textarea
                                                className="flex-1 w-full font-mono text-[12px] resize-none border-0 rounded-none bg-secondary/5 p-4 leading-relaxed focus-visible:ring-0 focus-visible:bg-secondary/10 transition-colors overflow-y-auto"
                                                style={{ minHeight: '320px' }}
                                                value={settings.system_prompt}
                                                onChange={e => setSettings({ ...settings, system_prompt: e.target.value })}
                                                placeholder="You are a helpful assistant for our business..."
                                            />
                                        </CardContent>
                                    </Card>
                                ) : (
                                    /* Image Generation Prompt Card */
                                    <Card className="card-glow border-pink-500/30 flex flex-col shadow-sm transition-all" style={{ minHeight: '340px' }}>
                                        <CardHeader className="pb-3 pt-5 px-5 border-b border-border/30 shrink-0 flex flex-row items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <CardTitle className="text-base font-semibold flex items-center gap-2 text-foreground">
                                                    <div className="w-6 h-6 rounded-md flex items-center justify-center bg-pink-500/20 shrink-0">
                                                        <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                                                    </div>
                                                    Image Generation Prompt
                                                </CardTitle>
                                                <CardDescription className="text-[11px] mt-0.5">Controls how AI generates campaign images. Use <code className="text-[10px] bg-secondary/60 px-1 py-0.5 rounded">{'{{message}}'}</code> to inject the campaign message.</CardDescription>
                                            </div>
                                            <Button
                                                variant="ghost" size="sm"
                                                className="h-7 px-2 text-[11px] gap-1 text-muted-foreground hover:text-foreground shrink-0"
                                                onClick={() => {
                                                    if (confirm('Reset image prompt to default?')) {
                                                        setSettings((s: any) => ({ ...s, image_generation_prompt: '' }));
                                                    }
                                                }}
                                            >
                                                <RotateCcw className="w-3 h-3" /> Reset
                                            </Button>
                                        </CardHeader>
                                        <CardContent className="p-0 flex-1 flex flex-col relative overflow-hidden">
                                            <Textarea
                                                className="flex-1 w-full font-mono text-[12px] resize-none border-0 rounded-none bg-secondary/5 p-4 leading-relaxed focus-visible:ring-0 focus-visible:bg-secondary/10 transition-colors overflow-y-auto"
                                                style={{ minHeight: '320px' }}
                                                value={settings.image_generation_prompt || DEFAULT_IMAGE_PROMPT}
                                                onChange={e => setSettings({ ...settings, image_generation_prompt: e.target.value })}
                                                placeholder="Describe how the AI should generate images..."
                                            />
                                        </CardContent>
                                    </Card>
                                )}
                            </div>
                        </div>
                    </TabsContent>

                    {/* SYSTEM TAB */}
                    <TabsContent value="system" className="mt-0">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                            {/* Anti-Ban Protections */}
                            <Card className="card-glow border-emerald-500/30 bg-emerald-500/5 shadow-sm md:col-span-2">
                                <CardHeader className="pb-4 pt-5 px-5 border-b border-border/30">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base flex items-center gap-2.5 font-semibold text-emerald-600 dark:text-emerald-400">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/20">
                                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                            </div>
                                            Anti-Ban & Loop Safeguards (Recommended)
                                        </CardTitle>
                                        <Switch
                                            checked={settings.anti_ban_enabled}
                                            onCheckedChange={checked => setSettings({ ...settings, anti_ban_enabled: checked })}
                                        />
                                    </div>
                                    <CardDescription className="text-[11px] mt-1">
                                        Protects your WhatsApp account from being restricted or unlinked by simulating human pacing and blocking automated bot loops.
                                    </CardDescription>
                                </CardHeader>
                                {settings.anti_ban_enabled && (
                                    <CardContent className="p-5 grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <div className="flex items-center justify-between gap-3 bg-background/50 border border-border/50 rounded-lg p-3 md:col-span-1">
                                            <div>
                                                <Label className="text-xs font-semibold text-foreground/90">Ignore Bots & System Chats</Label>
                                                <p className="text-[10px] text-muted-foreground mt-0.5">Automatically blocks replies to official WhatsApp bots & LID accounts.</p>
                                            </div>
                                            <Switch
                                                checked={settings.anti_ban_ignore_bots}
                                                onCheckedChange={checked => setSettings({ ...settings, anti_ban_ignore_bots: checked })}
                                            />
                                        </div>

                                        <div className="space-y-1.5 bg-background/50 border border-border/50 rounded-lg p-3">
                                            <Label className="text-xs font-semibold text-foreground/90">Cooldown per Contact (Seconds)</Label>
                                            <p className="text-[10px] text-muted-foreground">Min wait time between replies to same number (Default: 30s).</p>
                                            <Input
                                                type="number"
                                                min="0"
                                                max="300"
                                                value={settings.anti_ban_cooldown_sec}
                                                onChange={e => setSettings({ ...settings, anti_ban_cooldown_sec: e.target.value })}
                                                className="bg-secondary/30 font-mono h-8 text-xs mt-1"
                                            />
                                        </div>

                                        <div className="space-y-1.5 bg-background/50 border border-border/50 rounded-lg p-3">
                                            <Label className="text-xs font-semibold text-foreground/90">Typing Delay Range (Seconds)</Label>
                                            <p className="text-[10px] text-muted-foreground">Randomized human typing delay (Default: 3 to 6s).</p>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="30"
                                                    value={settings.anti_ban_typing_delay_min}
                                                    onChange={e => setSettings({ ...settings, anti_ban_typing_delay_min: e.target.value })}
                                                    placeholder="Min"
                                                    className="bg-secondary/30 font-mono h-8 text-xs"
                                                />
                                                <span className="text-xs text-muted-foreground">to</span>
                                                <Input
                                                    type="number"
                                                    min="0"
                                                    max="60"
                                                    value={settings.anti_ban_typing_delay_max}
                                                    onChange={e => setSettings({ ...settings, anti_ban_typing_delay_max: e.target.value })}
                                                    placeholder="Max"
                                                    className="bg-secondary/30 font-mono h-8 text-xs"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>

                            {/* Do Not Disturb */}
                            <Card className="card-glow border-amber-500/30 bg-amber-500/5 shadow-sm md:col-span-2">
                                <CardHeader className="pb-4 pt-5 px-5 border-b border-border/30">
                                    <div className="flex items-center justify-between">
                                        <CardTitle className="text-base flex items-center gap-2.5 font-semibold text-amber-600 dark:text-amber-400">
                                            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-amber-500/20">
                                                <Bell className="w-4 h-4 text-amber-500" />
                                            </div>
                                            Do Not Disturb (DND)
                                        </CardTitle>
                                        <Switch
                                            checked={dndEnabled}
                                            onCheckedChange={setDndEnabled}
                                        />
                                    </div>
                                    <CardDescription className="text-[11px] mt-1">
                                        Pause all auto-replies and follow-ups during specified hours.
                                    </CardDescription>
                                </CardHeader>
                                {dndEnabled && (
                                    <CardContent className="p-5">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                            <div className="space-y-1.5 bg-background/50 border border-border/50 rounded-lg p-3">
                                                <Label className="text-xs font-semibold text-foreground/90">Start Time</Label>
                                                <p className="text-[10px] text-muted-foreground">Auto-replies stop at this time</p>
                                                <Input
                                                    type="time"
                                                    value={dndStartTime}
                                                    onChange={e => setDndStartTime(e.target.value)}
                                                    className="bg-secondary/30 font-mono h-8 text-xs mt-1"
                                                />
                                            </div>
                                            <div className="space-y-1.5 bg-background/50 border border-border/50 rounded-lg p-3">
                                                <Label className="text-xs font-semibold text-foreground/90">End Time</Label>
                                                <p className="text-[10px] text-muted-foreground">Auto-replies resume at this time</p>
                                                <Input
                                                    type="time"
                                                    value={dndEndTime}
                                                    onChange={e => setDndEndTime(e.target.value)}
                                                    className="bg-secondary/30 font-mono h-8 text-xs mt-1"
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                )}
                            </Card>

                            {/* Theme */}
                            <Card className="card-glow border-border/50 shadow-sm">
                                <CardHeader className="pb-4 pt-5 px-5 border-b border-border/30">
                                    <CardTitle className="text-base flex items-center gap-2.5 font-semibold">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-blue-500/20">
                                            <Palette className="w-3.5 h-3.5 text-blue-400" />
                                        </div>
                                        Appearance
                                    </CardTitle>
                                    <CardDescription className="text-[11px] mt-1">Customize the user interface.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-6 flex flex-col items-center justify-center h-40">
                                    <div className="w-full max-w-[240px] flex bg-secondary/50 rounded-xl p-1.5 border border-border/50 relative shadow-inner">
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSettings({ ...settings, theme: 'light' });
                                                localStorage.setItem('theme', 'light');
                                                document.documentElement.classList.toggle('dark', false);
                                            }}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-colors ${settings.theme === 'light' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            <Sun className="w-4 h-4" /> Light
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setSettings({ ...settings, theme: 'dark' });
                                                localStorage.setItem('theme', 'dark');
                                                document.documentElement.classList.toggle('dark', true);
                                            }}
                                            className={`relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 text-xs font-semibold transition-colors ${settings.theme === 'dark' ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                        >
                                            <Moon className="w-4 h-4" /> Dark
                                        </button>

                                        <div className="absolute inset-y-1.5 left-1.5 right-1.5 pointer-events-none">
                                            <div className="relative w-full h-full">
                                                <motion.div
                                                    className="absolute top-0 bottom-0 w-1/2 bg-background rounded-lg shadow-sm border border-border/40"
                                                    initial={false}
                                                    animate={{ x: settings.theme === 'dark' ? '100%' : '0%' }}
                                                    transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            {/* License */}
                            <Card className="card-glow border-border/50 shadow-sm flex flex-col">
                                <CardHeader className="pb-4 pt-5 px-5 border-b border-border/30 shrink-0">
                                    <CardTitle className="text-base flex items-center gap-2.5 font-semibold">
                                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-emerald-500/20">
                                            <KeyRound className="w-3.5 h-3.5 text-emerald-500" />
                                        </div>
                                        License Information
                                    </CardTitle>
                                    <CardDescription className="text-[11px] mt-1">Your active subscription details.</CardDescription>
                                </CardHeader>
                                <CardContent className="p-5 flex-1 flex flex-col justify-between h-40">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/20 shrink-0">
                                                <CheckCircle className="w-5 h-5 text-emerald-500" />
                                            </div>
                                            <div>
                                                <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Active License</div>
                                                <div className="text-xs text-muted-foreground font-mono mt-0.5 tracking-wider">{license?.keyMasked || '—'}</div>
                                            </div>
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={handleDeactivate}
                                            className="text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-7 px-2"
                                            title="Deactivate License"
                                        >
                                            <LogOut className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 mt-auto">
                                        <div className="bg-secondary/30 rounded-lg p-2.5 text-center border border-border/40">
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Expires On</div>
                                            <div className="font-semibold text-xs">{license?.isLifetime ? 'Lifetime' : license?.expiryDate || '—'}</div>
                                        </div>
                                        <div className="bg-secondary/30 rounded-lg p-2.5 text-center border border-border/40">
                                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold mb-1">Days Left</div>
                                            <div className="font-bold text-sm flex items-center justify-center text-primary">
                                                {license?.isLifetime ? <Infinity className="w-4 h-4" /> : (license?.daysRemaining || '—')}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                        </div>
                    </TabsContent>
                </Tabs>
            </motion.div>
        </div>
    );
}
