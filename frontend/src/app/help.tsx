'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';

export function Help() {
    const downloadSampleCsv = () => {
        const csvContent = 'name,phone,company,city\nJohn Doe,+919876543210,Acme Corp,Bangalore\nJane Smith,+14155552671,Tech Inc,San Francisco\nRahul Sharma,9876543210,TechNova,Mumbai';
        const blob = new Blob([csvContent], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'sample_contacts.csv';
        a.click();
        window.URL.revokeObjectURL(url);
    };

    return (
        <div className="p-8 max-w-4xl mx-auto space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Help & Resources</h1>
                <p className="text-muted-foreground mt-1">Learn how to use AJM.bot effectively. Click on any section to expand.</p>
            </div>

            <Card>
                <CardContent className="p-0">
                    {/* @ts-ignore */}
                    <Accordion type="single" collapsible className="w-full" defaultValue="item-1">
                        <AccordionItem value="item-1" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">🚀 Getting Started</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-6 pb-6">
                                <div>
                                    <h4 className="text-foreground font-medium mb-1">1. Connect Your WhatsApp Account</h4>
                                    <p>Go to <strong>Devices</strong> → Click <strong>+ Add Account</strong> → Scan the QR code with WhatsApp (Linked Devices).</p>
                                </div>
                                <div>
                                    <h4 className="text-foreground font-medium mb-1">2. Import Your Contacts</h4>
                                    <p>Go to <strong>Contacts</strong> → Click <strong>📁 Import CSV</strong> → Upload your contacts file. Use the sample CSV below as a template.</p>
                                </div>
                                <div>
                                    <h4 className="text-foreground font-medium mb-1">3. Create Your First Campaign</h4>
                                    <p>Go to <strong>Campaigns</strong> → Click <strong>+ New Campaign</strong> → Write your message with placeholders like {`{{name}}`} → Click <strong>🚀 Send Now</strong>.</p>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-2" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">📥 Download Sample CSV</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-4 pb-6">
                                <p>Download a ready-to-use CSV template with example contacts and all available fields:</p>
                                <Button onClick={downloadSampleCsv} className="gap-2">
                                    <Download className="w-4 h-4" /> Download Sample CSV
                                </Button>
                                <div className="mt-4 p-4 bg-secondary/50 rounded-lg border border-border">
                                    <strong className="text-foreground">CSV Format Guide:</strong>
                                    <ul className="mt-2 pl-5 list-disc space-y-1">
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">phone</code> — Required. Include the country code (e.g., +919876543210). A bare 10-digit Indian mobile number (e.g., 9876543210) is automatically prefixed with 91 on import.</li>
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">name</code> — Contact's full name</li>
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">company</code> — Company or organization name</li>
                                        <li><strong>Custom fields</strong> — Any extra column (email, city, product, etc.) becomes a custom field. After uploading, you'll see a column-mapping step where you can confirm which column is phone/name/company and edit the {`{{placeholder}}`} name used for each custom field.</li>
                                    </ul>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-3" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">📝 Using Message Templates & Placeholders</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-4 pb-6">
                                <div>
                                    <h4 className="text-foreground font-medium mb-2">Placeholders</h4>
                                    <p className="mb-2">Use placeholders to personalize messages for each contact:</p>
                                    <ul className="pl-5 list-disc space-y-1">
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">{`{{name}}`}</code> — Contact's name</li>
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">{`{{phone}}`}</code> — Contact's phone number</li>
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">{`{{company}}`}</code> — Contact's company</li>
                                        <li><code className="text-primary bg-primary/10 px-1 py-0.5 rounded">{`{{custom_field}}`}</code> — Any custom field from your CSV (e.g., {`{{city}}`}, {`{{product}}`})</li>
                                    </ul>
                                </div>

                                <div className="pt-2">
                                    <h4 className="text-foreground font-medium mb-2">Example Message</h4>
                                    <div className="p-4 bg-secondary/50 rounded-lg font-mono text-sm border border-border">
                                        Hi {`{{name}}`}, <br />
                                        Thanks for choosing {`{{product}}`}! <br />
                                        We'll deliver to {`{{city}}`} soon. <br />
                                        - {`{{company}}`}
                                    </div>
                                </div>

                                <div className="pt-2">
                                    <h4 className="text-foreground font-medium mb-2">Reusable Templates</h4>
                                    <p className="mb-2">Save frequently used messages as templates:</p>
                                    <ol className="pl-5 list-decimal space-y-1">
                                        <li>Go to <strong>Templates</strong> tab</li>
                                        <li>Click <strong>+ New Template</strong></li>
                                        <li>Add message, media, and buttons</li>
                                        <li>Load templates when creating campaigns</li>
                                    </ol>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-4" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">🖼️ Sending Multiple Media Files</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-4 pb-6">
                                <p>You can send up to 10 images, videos, or documents per message!</p>
                                <ol className="pl-5 list-decimal space-y-1">
                                    <li>When creating a campaign or template, scroll to the <strong>Media Attachments</strong> section</li>
                                    <li>Click to browse or drag-and-drop your files</li>
                                    <li>The live <strong>Message Preview</strong> will instantly show you how it looks</li>
                                    <li>Just like official WhatsApp, your text message acts as the <strong>caption</strong> for the first media file! Subsequent media files are sent securely in the same batch.</li>
                                </ol>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-5" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">⚡ Setting Up Quick Replies</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-4 pb-6">
                                <p>Quick Replies automatically respond when contacts send specific keywords:</p>
                                <ol className="pl-5 list-decimal space-y-1">
                                    <li>Go to <strong>Quick Replies</strong> tab</li>
                                    <li>Click <strong>+ Add Quick Reply</strong></li>
                                    <li>Set trigger keyword (e.g., "pricing", "help", "menu")</li>
                                    <li>Write the auto-reply message</li>
                                    <li>Toggle <strong>Enable</strong> when ready</li>
                                </ol>
                                <div className="mt-4 p-4 bg-secondary/50 rounded-lg border border-border">
                                    <strong className="text-foreground">Example:</strong><br />
                                    <span className="inline-block mt-2">Trigger: <code className="text-primary bg-primary/10 px-1 py-0.5 rounded">pricing</code></span><br />
                                    <span className="inline-block mt-1">Reply: <em>"Our Premium Plan is $99/month. Enterprise Plan is $299/month. Reply with your choice!"</em></span>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-6" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">📅 Scheduling Campaigns</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-4 pb-6">
                                <p>Schedule messages to send automatically at specific times:</p>
                                <ol className="pl-5 list-decimal space-y-1">
                                    <li>Go to <strong>Scheduler</strong> tab</li>
                                    <li>Click <strong>+ New Schedule</strong></li>
                                    <li>Choose frequency (Once, Daily, Weekly, Monthly)</li>
                                    <li>Set time and template</li>
                                </ol>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-7" className="px-6 border-b">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">✨ Best Practices (Avoiding Bans)</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-6 pb-6">
                                <div className="p-4 bg-green-500/10 border-l-4 border-green-500 rounded-r-lg">
                                    <p className="text-green-700 dark:text-green-400 font-semibold mb-2">✓ Our defaults are optimized for the sweet spot: Fast delivery + Ban-proof!</p>
                                    <ul className="list-disc pl-5 space-y-1 text-green-700/80 dark:text-green-400/80 text-sm">
                                        <li><strong>Use 8-18 second delays</strong> (default settings) — Perfect balance of speed & safety</li>
                                        <li><strong>Limit: 50-100 messages per day</strong> per account for safety</li>
                                        <li><strong>Warm up new accounts</strong> — start with 10-20 messages/day for the first week</li>
                                        <li><strong>Randomization is automatic</strong> — system picks random delay between min & max</li>
                                        <li><strong>Avoid sending after 10 PM</strong> or before 9 AM local time</li>
                                        <li><strong>Never send identical messages</strong> — use placeholders to personalize ({`{{name}}`}, {`{{company}}`})</li>
                                    </ul>
                                </div>

                                <div className="p-4 bg-blue-500/10 border-l-4 border-blue-500 rounded-r-lg">
                                    <p className="text-blue-700 dark:text-blue-400 font-semibold mb-2">⚡ Campaign Speed Estimates:</p>
                                    <ul className="list-disc pl-5 space-y-1 text-blue-700/80 dark:text-blue-400/80 text-sm">
                                        <li>50 messages ≈ <strong>11 minutes</strong></li>
                                        <li>100 messages ≈ <strong>22 minutes</strong></li>
                                        <li>200 messages ≈ <strong>43 minutes</strong></li>
                                    </ul>
                                </div>

                                <div>
                                    <h4 className="text-foreground font-medium mb-2">📱 WhatsApp Guidelines</h4>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li>Only message people who have opted in or are existing contacts</li>
                                        <li>Respect WhatsApp's Business Policy and Terms of Service</li>
                                        <li>Provide value in every message — avoid spam</li>
                                        <li>Include opt-out instructions if doing marketing</li>
                                        <li>Use proper business account verification when possible</li>
                                    </ul>
                                </div>
                            </AccordionContent>
                        </AccordionItem>

                        <AccordionItem value="item-8" className="px-6 border-b-0">
                            <AccordionTrigger className="hover:no-underline py-6">
                                <span className="text-lg font-semibold flex items-center gap-2">🔧 Troubleshooting</span>
                            </AccordionTrigger>
                            <AccordionContent className="text-muted-foreground space-y-6 pb-6">
                                <div>
                                    <h4 className="text-foreground font-medium mb-1">Device shows "Disconnected" or "Error"</h4>
                                    <p>Click <strong>🔗 Relink</strong> to clear auth and scan a fresh QR code.</p>
                                </div>
                                <div>
                                    <h4 className="text-foreground font-medium mb-1">Messages not sending</h4>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li>Ensure WhatsApp device status is "Connected"</li>
                                        <li>Check phone numbers have country code (e.g., +919876543210)</li>
                                        <li>View campaign analytics for error details</li>
                                    </ul>
                                </div>
                                <div>
                                    <h4 className="text-foreground font-medium mb-1">CSV import failed</h4>
                                    <ul className="list-disc pl-5 space-y-1">
                                        <li>Use the sample CSV template as reference</li>
                                        <li>Ensure 'phone' column exists and has valid numbers</li>
                                        <li>Check file is saved as CSV (not Excel format)</li>
                                    </ul>
                                </div>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                </CardContent>
            </Card>
        </div>
    );
}
