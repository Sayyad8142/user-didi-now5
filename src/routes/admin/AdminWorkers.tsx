import React from 'react';
import { ArrowLeft, Users, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import { WorkersTable } from '@/features/admin/workers/WorkersTable';

export default function AdminWorkers() {
  return (
    <>
      <div className="p-4 pb-20 min-h-screen bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link 
              to="/admin"
              className="p-2 hover:bg-white rounded-xl transition-colors border border-gray-200 bg-white shadow-sm"
            >
              <ArrowLeft className="h-5 w-5 text-gray-600" />
            </Link>
            <div>
              <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Users className="h-6 w-6 text-[#ff007a]" />
                Workers Management
              </h1>
              <p className="text-sm text-gray-600">Manage your team of workers</p>
            </div>
          </div>
        </div>

        {/* Workers Table */}
        <Card className="border-0 shadow-lg rounded-2xl bg-white">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5 text-[#ff007a]" />
                All Workers
              </CardTitle>
              <Link to="/admin/settings#workers">
                <Button 
                  className="bg-gradient-to-r from-[#ff007a] to-pink-600 hover:from-pink-600 hover:to-[#ff007a] text-white rounded-xl shadow-md"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Worker
                </Button>
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <WorkersTable />
          </CardContent>
        </Card>
      </div>
      
      <AdminBottomNav />
    </>
  );
}