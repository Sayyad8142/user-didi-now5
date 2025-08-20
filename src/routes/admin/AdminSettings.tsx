import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings, Bell, BellOff, DollarSign, ArrowLeft, Info, Volume2, Users, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import { useNewBookingAlert } from '@/features/admin/useNewBookingAlert';
import { WorkersTable } from '@/features/admin/workers/WorkersTable';
import SettingsLegalPDF from '@/routes/admin/SettingsLegalPDF';
import { WebVersionControl } from '@/components/WebVersionControl';

export default function AdminSettings() {
  const {
    enabled: soundOn,
    toggle: toggleSound,
    play: testSound
  } = useNewBookingAlert();
  const [activeTab, setActiveTab] = useState("general");

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
            <TabsList className="grid w-full grid-cols-4 h-auto p-1">
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
              <WebVersionControl />

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

            <TabsContent value="legal-pdf" className="mt-4">
              <SettingsLegalPDF />
            </TabsContent>
          </Tabs>
        </div>
      </main>

      <AdminBottomNav />
    </div>
  );
}