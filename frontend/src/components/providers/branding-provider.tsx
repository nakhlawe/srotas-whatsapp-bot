'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { getSettings } from '@/lib/api';

interface Branding {
    app_name: string;
    company_name: string;
    company_website: string;
    company_email: string;
}

const defaultBranding: Branding = {
    app_name: 'AJM.bot',
    company_name: '',
    company_website: '',
    company_email: '',
};

const BrandingContext = createContext<Branding>(defaultBranding);

export function BrandingProvider({ children }: { children: React.ReactNode }) {
    const [branding, setBranding] = useState<Branding>(defaultBranding);

    useEffect(() => {
        getSettings().then(s => {
            setBranding({
                app_name: s.app_name || 'AJM.bot',
                company_name: s.company_name || '',
                company_website: s.company_website || '',
                company_email: s.company_email || '',
            });
        }).catch(() => {});
    }, []);

    return (
        <BrandingContext.Provider value={branding}>
            {children}
        </BrandingContext.Provider>
    );
}

export const useBranding = () => useContext(BrandingContext);
