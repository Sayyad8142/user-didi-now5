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

export default function AdminSettings() {
  const {
    enabled: soundOn,
    toggle: toggleSound,
    play: testSound
  } = useNewBookingAlert();
  const [activeTab, setActiveTab] = useState("general");

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3">
            <Link to="/admin" className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Back to Admin Dashboard">
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-lg font-semibold text-gray-900">Settings</h1>
              <p className="text-sm text-gray-500">Configure system preferences</p>
            </div>
          </div>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4 max-w-4xl mx-auto">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="general" className="flex items-center gap-2">
              <Settings className="w-4 h-4" />
              General
            </TabsTrigger>
            <TabsTrigger value="pricing" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Pricing
            </TabsTrigger>
            <TabsTrigger value="workers" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Workers
            </TabsTrigger>
            <TabsTrigger value="legal-pdf" className="flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Legal
            </TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 mt-6">
            {/* Notifications Settings */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Bell className="h-5 w-5 text-[#ff007a]" />
                  Notifications
                </CardTitle>
                <CardDescription>
                  Manage sound alerts and notification preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Volume2 className="h-4 w-4 text-gray-600 flex-shrink-0" />
                        <h3 className="font-medium text-gray-900">Sound Alerts</h3>
                      </div>
                      <p className="text-sm text-gray-600 leading-relaxed">
                        Play audio notifications for new bookings and overdue items
                      </p>
                    </div>
                  </div>
                  <Button onClick={toggleSound} variant={soundOn ? "default" : "outline"} className="w-full h-11 text-base">
                    {soundOn ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
                    {soundOn ? "Sound Enabled" : "Sound Disabled"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* System Information */}
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Info className="h-5 w-5 text-[#ff007a]" />
                  System Information
                </CardTitle>
                <CardDescription>
                  Application status and system details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Version</div>
                        <div className="text-base font-semibold text-gray-900">v1.0</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-500 mb-1">Status</div>
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

          <TabsContent value="pricing" className="mt-6">
            <Card>
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <DollarSign className="h-5 w-5 text-[#ff007a]" />
                  Pricing Management
                </CardTitle>
                <CardDescription>
                  Configure service pricing for different communities and services
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="p-4 bg-gray-50 rounded-xl space-y-3">
                  <div>
                    <h3 className="font-medium text-gray-900 mb-1">Service Pricing</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      Set prices for maid, cook, and bathroom cleaning services
                    </p>
                  </div>
                  <Button asChild className="w-full h-11">
                    <Link to="/admin/pricing" className="flex items-center justify-center gap-2">
                      <Settings className="h-4 w-4" />
                      Configure Pricing
                    </Link>
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="workers" className="mt-6">
            <WorkersTable />
          </TabsContent>

          <TabsContent value="legal-pdf" className="mt-6">
            <SettingsLegalPDF />
          </TabsContent>
        </Tabs>
      </div>

      <AdminBottomNav />
    </div>
  );
}