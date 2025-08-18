import React from 'react';
import { Link } from 'react-router-dom';
import { Settings, Bell, BellOff, DollarSign, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import { useNewBookingAlert } from '@/features/admin/useNewBookingAlert';

export default function AdminSettings() {
  const { enabled: soundOn, toggle: toggleSound, play: testSound } = useNewBookingAlert();

  return (
    <div className="min-h-dvh bg-rose-50/40 pb-20">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-pink-50">
        <div className="w-full px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin"
              className="h-9 w-9 rounded-full border border-gray-300 text-gray-700 hover:border-pink-300 hover:text-[#ff007a] hover:bg-pink-50 inline-flex items-center justify-center transition-colors"
              title="Back to Admin Dashboard"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="flex flex-col">
              <h1 className="text-lg sm:text-2xl font-bold">
                <span className="text-[#ff007a]">Admin</span> — <span className="text-gray-700">Settings</span>
              </h1>
              <span className="text-xs text-gray-500 hidden sm:block">Configure system preferences</span>
            </div>
          </div>
        </div>
      </header>

      <main className="w-full px-4 pb-24 pt-6 space-y-6">
        {/* Notifications Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-[#ff007a]" />
              Notification Settings
            </CardTitle>
            <CardDescription>
              Configure sound alerts and notification preferences
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Sound Notifications</h3>
                <p className="text-sm text-gray-600">Play sound alerts for new bookings and overdue items</p>
              </div>
              <Button
                onClick={toggleSound}
                variant={soundOn ? "default" : "outline"}
                size="sm"
                className="flex items-center gap-2"
              >
                {soundOn ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                {soundOn ? "Enabled" : "Disabled"}
              </Button>
            </div>

            {soundOn && (
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <h3 className="font-medium text-gray-900">Test Sound</h3>
                  <p className="text-sm text-gray-600">Check if your notification sound is working</p>
                </div>
                <Button
                  onClick={testSound}
                  variant="outline"
                  size="sm"
                  className="text-blue-700 border-blue-300 hover:bg-blue-100"
                >
                  🔊 Test Sound
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Settings */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 text-[#ff007a]" />
              Pricing Management
            </CardTitle>
            <CardDescription>
              Configure service pricing for different communities and services
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
              <div>
                <h3 className="font-medium text-gray-900">Service Pricing</h3>
                <p className="text-sm text-gray-600">Set prices for maid, cook, and bathroom cleaning services</p>
              </div>
              <Button asChild>
                <Link
                  to="/admin/pricing"
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Configure Pricing
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* System Information */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-[#ff007a]" />
              System Information
            </CardTitle>
            <CardDescription>
              Application status and system details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">Version</div>
                <div className="text-gray-600">Admin Console v1.0</div>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="font-medium text-gray-900">Status</div>
                <div className="text-green-600 font-medium">● Active</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </main>

      <AdminBottomNav />
    </div>
  );
}