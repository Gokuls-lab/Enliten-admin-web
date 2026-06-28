
import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Settings, Save, Database, Mail, Shield, Globe, BrainCircuit } from 'lucide-react';
import Navbar from '@/components/Navbar';
import { supabase } from '@/integrations/supabase/client';
import { useEffect } from 'react';

export default function SystemSettings() {
  const [settings, setSettings] = useState({
    siteName: 'Cyber Learning Platform',
    siteDescription: 'Advanced cybersecurity training and certification platform',
    allowRegistration: true,
    requireEmailVerification: true,
    defaultUserRole: 'user',
    maxLoginAttempts: 5,
    sessionTimeout: 30,
    enableAnalytics: true,
    maintenanceMode: false,
    smtpHost: '',
    smtpPort: 587,
    smtpUsername: '',
    smtpPassword: '',
    fromEmail: 'noreply@cyberlearning.com',
    apiRateLimit: 100,
    maxFileUploadSize: 10
  });

  const [aiConfig, setAiConfig] = useState({
    model: 'qwen/qwen3.7-plus',
    webModel: 'google/gemini-3-flash-preview',
    v_5h_limit: 0.15,
    v_7d_limit: 0.85
  });

  useEffect(() => {
    const loadAiConfig = async () => {
      try {
        const { data } = await (supabase as any).from('system_settings').select('value').eq('key', 'ai_config').single();
        if (data?.value) {
          setAiConfig(prev => ({ ...prev, ...data.value }));
        }
      } catch (err) {
        console.error('Failed to load AI config', err);
      }
    };
    loadAiConfig();
  }, []);

  const { toast } = useToast();

  const handleSave = async () => {
    try {
      await (supabase as any).from('system_settings').upsert({
        key: 'ai_config',
        value: aiConfig
      });
      toast({
        title: "Settings Saved",
        description: "System settings have been updated successfully",
      });
    } catch (err) {
      toast({
        title: "Error Saving Settings",
        description: "Failed to save AI configuration to database.",
        variant: "destructive"
      });
    }
  };

  const handleReset = () => {
    if (confirm('Are you sure you want to reset all settings to default values?')) {
      // Reset to default values
      toast({
        title: "Settings Reset",
        description: "All settings have been reset to default values",
      });
    }
  };

  return (
    <>
    <Navbar />
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center space-x-3 mb-6">
          <Settings className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">System Settings</h1>
        </div>

        <div className="space-y-6">
          {/* AI Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <BrainCircuit className="h-5 w-5" />
                <span>AI Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="aiModel">Main Chat Default Model (OpenRouter)</Label>
                  <Input
                    id="aiModel"
                    value={aiConfig.model}
                    onChange={(e) => setAiConfig({ ...aiConfig, model: e.target.value })}
                    placeholder="e.g. qwen/qwen3.7-plus"
                  />
                </div>
                <div>
                  <Label htmlFor="aiWebModel">Web Enabled Model (OpenRouter)</Label>
                  <Input
                    id="aiWebModel"
                    value={aiConfig.webModel}
                    onChange={(e) => setAiConfig({ ...aiConfig, webModel: e.target.value })}
                    placeholder="e.g. google/gemini-3-flash-preview"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="v5hLimit">5-Hour Budget Limit (USD)</Label>
                  <Input
                    id="v5hLimit"
                    type="number"
                    step="0.01"
                    value={aiConfig.v_5h_limit}
                    onChange={(e) => setAiConfig({ ...aiConfig, v_5h_limit: parseFloat(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="v7dLimit">7-Day Budget Limit (USD)</Label>
                  <Input
                    id="v7dLimit"
                    type="number"
                    step="0.01"
                    value={aiConfig.v_7d_limit}
                    onChange={(e) => setAiConfig({ ...aiConfig, v_7d_limit: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* General Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Globe className="h-5 w-5" />
                <span>General Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="siteName">Site Name</Label>
                  <Input
                    id="siteName"
                    value={settings.siteName}
                    onChange={(e) => setSettings({ ...settings, siteName: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="fromEmail">From Email</Label>
                  <Input
                    id="fromEmail"
                    type="email"
                    value={settings.fromEmail}
                    onChange={(e) => setSettings({ ...settings, fromEmail: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label htmlFor="siteDescription">Site Description</Label>
                <Textarea
                  id="siteDescription"
                  value={settings.siteDescription}
                  onChange={(e) => setSettings({ ...settings, siteDescription: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Maintenance Mode</Label>
                  <p className="text-sm text-gray-500">Enable to put the site in maintenance mode</p>
                </div>
                <Switch
                  checked={settings.maintenanceMode}
                  onCheckedChange={(checked) => setSettings({ ...settings, maintenanceMode: checked })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Authentication Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Shield className="h-5 w-5" />
                <span>Authentication & Security</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Allow User Registration</Label>
                  <p className="text-sm text-gray-500">Allow new users to register accounts</p>
                </div>
                <Switch
                  checked={settings.allowRegistration}
                  onCheckedChange={(checked) => setSettings({ ...settings, allowRegistration: checked })}
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Require Email Verification</Label>
                  <p className="text-sm text-gray-500">Users must verify their email before accessing the platform</p>
                </div>
                <Switch
                  checked={settings.requireEmailVerification}
                  onCheckedChange={(checked) => setSettings({ ...settings, requireEmailVerification: checked })}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="maxLoginAttempts">Max Login Attempts</Label>
                  <Input
                    id="maxLoginAttempts"
                    type="number"
                    value={settings.maxLoginAttempts}
                    onChange={(e) => setSettings({ ...settings, maxLoginAttempts: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="sessionTimeout">Session Timeout (minutes)</Label>
                  <Input
                    id="sessionTimeout"
                    type="number"
                    value={settings.sessionTimeout}
                    onChange={(e) => setSettings({ ...settings, sessionTimeout: parseInt(e.target.value) })}
                  />
                </div>
                <div>
                  <Label htmlFor="apiRateLimit">API Rate Limit (per minute)</Label>
                  <Input
                    id="apiRateLimit"
                    type="number"
                    value={settings.apiRateLimit}
                    onChange={(e) => setSettings({ ...settings, apiRateLimit: parseInt(e.target.value) })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Email Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Mail className="h-5 w-5" />
                <span>Email Settings</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtpHost">SMTP Host</Label>
                  <Input
                    id="smtpHost"
                    value={settings.smtpHost}
                    onChange={(e) => setSettings({ ...settings, smtpHost: e.target.value })}
                    placeholder="smtp.example.com"
                  />
                </div>
                <div>
                  <Label htmlFor="smtpPort">SMTP Port</Label>
                  <Input
                    id="smtpPort"
                    type="number"
                    value={settings.smtpPort}
                    onChange={(e) => setSettings({ ...settings, smtpPort: parseInt(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtpUsername">SMTP Username</Label>
                  <Input
                    id="smtpUsername"
                    value={settings.smtpUsername}
                    onChange={(e) => setSettings({ ...settings, smtpUsername: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="smtpPassword">SMTP Password</Label>
                  <Input
                    id="smtpPassword"
                    type="password"
                    value={settings.smtpPassword}
                    onChange={(e) => setSettings({ ...settings, smtpPassword: e.target.value })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* System Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <Database className="h-5 w-5" />
                <span>System Configuration</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>Enable Analytics</Label>
                  <p className="text-sm text-gray-500">Track user behavior and system performance</p>
                </div>
                <Switch
                  checked={settings.enableAnalytics}
                  onCheckedChange={(checked) => setSettings({ ...settings, enableAnalytics: checked })}
                />
              </div>
              <div>
                <Label htmlFor="maxFileUploadSize">Max File Upload Size (MB)</Label>
                <Input
                  id="maxFileUploadSize"
                  type="number"
                  value={settings.maxFileUploadSize}
                  onChange={(e) => setSettings({ ...settings, maxFileUploadSize: parseInt(e.target.value) })}
                />
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <Card>
            <CardContent className="pt-6">
              <div className="flex justify-between space-x-4">
                <Button variant="outline" onClick={handleReset}>
                  Reset to Defaults
                </Button>
                <Button onClick={handleSave} className="flex items-center space-x-2">
                  <Save className="h-4 w-4" />
                  <span>Save Settings</span>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  </>
  );
}
