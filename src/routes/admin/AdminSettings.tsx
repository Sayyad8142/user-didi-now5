import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Settings, Bell, BellOff, DollarSign, ArrowLeft, Info, Volume2, Users, FileText, Globe, RefreshCw, MessageSquare, HelpCircle, LogOut } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import { useNewBookingAlert } from '@/features/admin/useNewBookingAlert';
import { WorkersTable } from '@/features/admin/workers/WorkersTable';
import { LegalPDFs } from '@/features/admin/settings/LegalPDFs';
import AdminFaqsTab from '@/features/admin/settings/AdminFaqsTab';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast } from 'sonner';

export default function AdminSettings() {
  const navigate = useNavigate();
  const {
    enabled: soundOn,
    toggle: toggleSound,
    play: testSound
  } = useNewBookingAlert();
  const [activeTab, setActiveTab] = useState("general");
  const [loading, setLoading] = useState(false);
  const [currentVersion, setCurrentVersion] = useState<string>('v1.0.0');
  const [forceUpdates, setForceUpdates] = useState<boolean>(false);
  const { toast: toastHook } = useToast();

  const handleLogout = async () => {
    try {
      console.log('Starting logout process...');
      
      // Clear the portal store first
      const { PortalStore } = await import('@/lib/portal');
      PortalStore.clear();
      
      // Sign out from Supabase (handle gracefully even if session doesn't exist)
      const { error } = await supabase.auth.signOut();
      
      // Don't throw error if session doesn't exist - this is expected in some cases
      if (error && !error.message.includes('session')) {
        console.error('Logout error:', error);
        toast.error(error.message || 'Failed to logout');
        return;
      }
      
      console.log('Logout successful, redirecting...');
      toast.success('Logged out successfully');
      
      // Force navigation to admin login
      window.location.href = '/admin-login';
    } catch (error: any) {
      console.error('Logout error:', error);
      toast.error('Logout failed, but redirecting anyway');
      // Even if logout fails, redirect to login page
      window.location.href = '/admin-login';
    }
  };

  // Load from RPC (admin_get_web_version)
  async function loadVersion() {
    const { data, error } = await supabase.rpc('admin_get_web_version');
    if (error) {
      console.error(error);
      toastHook({ variant: 'destructive', title: 'Error', description: 'Failed to load web version' });
      return;
    }
    if (data && data.length > 0) {
      setCurrentVersion(data[0].web_version ?? 'v1.0.0');
      setForceUpdates(Boolean(data[0].force));
    }
  }

  useEffect(() => { loadVersion(); }, []);

  // Helper: bump patch (vX.Y.Z -> vX.Y.(Z+1))
  function bumpPatchString(v: string) {
    const clean = v.startsWith('v') ? v.slice(1) : v;
    const [maj = 1, min = 0, pat = 0] = clean.split('.').map(n => Number(n));
    return `v${maj}.${min}.${pat + 1}`;
  }

  // Save via RPC (admin_set_web_version)
  async function onBumpPatch() {
    setLoading(true);
    const next = bumpPatchString(currentVersion);
    const { error } = await supabase.rpc('admin_set_web_version', {
      new_version: next,
      force: forceUpdates,
    });
    setLoading(false);

    if (error) {
      console.error(error);
      toastHook({ variant: 'destructive', title: 'Error', description: error.message || 'Failed to update web version' });
      return;
    }
    setCurrentVersion(next);
    toastHook({ title: 'Updated', description: `Web version set to ${next}${forceUpdates ? ' (forced)' : ''}` });
  }

  return (
    <div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
      {/* Mobile-optimized header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link to="/admin" className="p-2 hover:bg-muted rounded-xl transition-colors" title="Back to Admin Dashboard">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-semibold">Settings</h1>
            <p className="text-xs text-muted-foreground hidden sm:block">Configure system preferences</p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-4 pb-24 md:pb-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-7 h-auto p-1">
              <TabsTrigger value="general" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <Settings className="w-4 h-4" />
                <span className="hidden sm:inline">General</span>
              </TabsTrigger>
              <TabsTrigger value="pricing" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <DollarSign className="w-4 h-4" />
                <span className="hidden sm:inline">Pricing</span>
              </TabsTrigger>
              <TabsTrigger value="workers" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <Users className="w-4 h-4" />
                <span className="hidden sm:inline">Workers</span>
              </TabsTrigger>
              <TabsTrigger value="communities" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <Globe className="w-4 h-4" />
                <span className="hidden sm:inline">Communities</span>
              </TabsTrigger>
              <TabsTrigger value="faqs" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <HelpCircle className="w-4 h-4" />
                <span className="hidden sm:inline">FAQs</span>
              </TabsTrigger>
              <TabsTrigger value="feedback" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <MessageSquare className="w-4 h-4" />
                <span className="hidden sm:inline">Feedback</span>
              </TabsTrigger>
              <TabsTrigger value="legal-pdf" className="flex flex-col items-center gap-1 px-2 py-2 text-xs">
                <FileText className="w-4 h-4" />
                <span className="hidden sm:inline">Legal</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general" className="space-y-4 mt-4">
              {/* Notifications Settings */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Bell className="h-5 w-5 text-[#ff007a]" />
                    Notifications
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Manage sound alerts and notification preferences
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="p-3 bg-muted/50 rounded-xl space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Volume2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          <h3 className="font-medium">Sound Alerts</h3>
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          Play audio notifications for new bookings and overdue items
                        </p>
                      </div>
                    </div>
                    <Button onClick={toggleSound} variant={soundOn ? "default" : "outline"} className="w-full h-10 text-sm">
                      {soundOn ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
                      {soundOn ? "Sound Enabled" : "Sound Disabled"}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Web Version Control */}
              <Card>
                <CardHeader className="pb-4">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Globe className="h-5 w-5 text-[#ff007a]" />
                    Publish Web Update
                  </CardTitle>
                  <CardDescription>
                    Bump version so users refresh to the newest build
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 bg-gray-50 rounded-xl space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-medium text-gray-900">Current Version</h3>
                          <p className="text-sm text-gray-600">{currentVersion}</p>
                        </div>
                      </div>
                      
                      {/* Force Updates Toggle */}
                      <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
                        <div className="flex items-center space-x-3">
                          <div>
                            <Label htmlFor="force-mode" className="text-sm font-medium">
                              Force Updates
                            </Label>
                            <p className="text-xs text-gray-500">
                              {forceUpdates ? 'Users will update immediately' : 'Users see notification banner'}
                            </p>
                          </div>
                        </div>
                        <Switch
                          id="force-mode"
                          checked={forceUpdates}
                          onCheckedChange={setForceUpdates}
                          disabled={loading}
                        />
                      </div>
                      
                      <Button 
                        onClick={onBumpPatch} 
                        disabled={loading}
                        className="w-full h-11"
                      >
                        <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Updating...' : 'Bump Patch Version'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* System Information */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Info className="h-5 w-5 text-[#ff007a]" />
                    System Information
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Application status and system details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="p-3 bg-muted/50 rounded-xl">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Version</div>
                          <div className="text-base font-semibold">v1.0</div>
                        </div>
                        <div>
                          <div className="text-sm font-medium text-muted-foreground mb-1">Status</div>
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                            <span className="text-base font-semibold text-green-600">Active</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Logout Section */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <LogOut className="h-5 w-5 text-[#ff007a]" />
                    Account
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Sign out of your admin account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-muted/50 rounded-xl space-y-3">
                    <div>
                      <h3 className="font-medium mb-1 text-red-600">Sign Out</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        This will sign you out of the admin panel
                      </p>
                    </div>
                    <Button 
                      onClick={handleLogout} 
                      variant="destructive" 
                      className="w-full h-10"
                    >
                      <LogOut className="h-4 w-4 mr-2" />
                      Sign Out
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pricing" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <DollarSign className="h-5 w-5 text-[#ff007a]" />
                    Pricing Management
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Configure service pricing for different communities and services
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-muted/50 rounded-xl space-y-3">
                    <div>
                      <h3 className="font-medium mb-1">Service Pricing</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Set prices for maid, cook, and bathroom cleaning services
                      </p>
                    </div>
                    <Button asChild className="w-full h-10">
                      <Link to="/admin/pricing" className="flex items-center justify-center gap-2">
                        <Settings className="h-4 w-4" />
                        Configure Pricing
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="workers" className="mt-4">
              <WorkersTable />
            </TabsContent>

            <TabsContent value="communities" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Globe className="h-5 w-5 text-[#ff007a]" />
                    Community Management
                  </CardTitle>
                  <CardDescription className="text-sm">
                    Add, edit, or remove community options for user profiles
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-muted/50 rounded-xl space-y-3">
                    <div>
                      <h3 className="font-medium mb-1">Community Options</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Manage the list of communities available for users to select
                      </p>
                    </div>
                    <Button asChild className="w-full h-10">
                      <Link to="/admin/communities" className="flex items-center justify-center gap-2">
                        <Globe className="h-4 w-4" />
                        Manage Communities
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="faqs" className="mt-4">
              <AdminFaqsTab />
            </TabsContent>

            <TabsContent value="feedback" className="mt-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <MessageSquare className="h-5 w-5 text-[#ff007a]" />
                    Customer Feedback
                  </CardTitle>
                  <CardDescription className="text-sm">
                    View and manage customer feedback and ratings
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="p-3 bg-muted/50 rounded-xl space-y-3">
                    <div>
                      <h3 className="font-medium mb-1">Feedback Management</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        Access customer reviews, ratings, and feedback for all services
                      </p>
                    </div>
                    <Button asChild className="w-full h-10">
                      <Link to="/admin/feedback" className="flex items-center justify-center gap-2">
                        <MessageSquare className="h-4 w-4" />
                        View Feedback
                      </Link>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="legal-pdf" className="mt-4">
              <LegalPDFs />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <AdminBottomNav />
    </div>
  );
}