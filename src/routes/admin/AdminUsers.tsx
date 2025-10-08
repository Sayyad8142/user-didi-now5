import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, User, Calendar, Phone, Home, History, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { AdminBottomNav } from '@/components/AdminBottomNav';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface UserProfile {
  id: string;
  full_name: string;
  phone: string;
  community: string;
  flat_no: string;
  created_at: string;
  booking_count?: number;
  bookings?: UserBooking[];
}

interface UserBooking {
  id: string;
  service_type: string;
  booking_type: string;
  status: string;
  price_inr: number;
  scheduled_date?: string;
  scheduled_time?: string;
  created_at: string;
  completed_at?: string;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  const loadUsers = async () => {
    try {
      setLoading(true);

      // First get all users
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Then get booking counts for each user
      const usersWithBookings = await Promise.all(
        (profiles || []).map(async (profile) => {
          const { data: bookings, error: bookingsError } = await supabase
            .from('bookings')
            .select('id, service_type, booking_type, status, price_inr, scheduled_date, scheduled_time, created_at, completed_at')
            .eq('user_id', profile.id)
            .order('created_at', { ascending: false });

          if (bookingsError) {
            console.error('Error loading bookings for user:', profile.id, bookingsError);
            return { ...profile, booking_count: 0, bookings: [] };
          }

          return {
            ...profile,
            booking_count: bookings?.length || 0,
            bookings: bookings || []
          };
        })
      );

      setUsers(usersWithBookings);
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const filteredUsers = users.filter(user => 
    user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.phone?.includes(searchTerm) ||
    user.community?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.flat_no?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleUserClick = (user: UserProfile) => {
    setSelectedUser(user);
    setShowHistory(true);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800';
      case 'assigned': return 'bg-blue-100 text-blue-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (showHistory && selectedUser) {
    return (
      <div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b safe-top">
          <div className="flex items-center gap-2 px-3 py-2">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowHistory(false)}
              className="h-8 w-8 rounded-xl"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div className="flex-1 min-w-0">
              <h1 className="font-semibold text-lg">User Details</h1>
              <p className="text-xs text-muted-foreground">{selectedUser.full_name}</p>
            </div>
          </div>
        </header>

        <main className="flex-1 flex flex-col overflow-hidden pb-24 md:pb-6">
          {/* User Info Card */}
          <div className="p-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <User className="h-5 w-5 text-primary" />
                  {selectedUser.full_name}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedUser.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Home className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm">{selectedUser.community}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Flat Number:</span>
                  <span className="text-sm font-medium">{selectedUser.flat_no || 'Not provided'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Bookings:</span>
                  <Badge variant="secondary">{selectedUser.booking_count}</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Joined:</span>
                  <span className="text-sm">{format(new Date(selectedUser.created_at), 'MMM d, yyyy')}</span>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Booking History */}
          <div className="flex-1 px-3">
            <Card className="h-full">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <History className="h-5 w-5 text-primary" />
                  Booking History
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <ScrollArea className="h-[400px] px-4">
                  {selectedUser.bookings && selectedUser.bookings.length > 0 ? (
                    <div className="space-y-3 pb-4">
                      {selectedUser.bookings.map((booking) => (
                        <div key={booking.id} className="p-3 border rounded-lg bg-muted/30">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <div className="font-medium text-sm">
                                {booking.service_type?.charAt(0).toUpperCase() + booking.service_type?.slice(1)}
                              </div>
                              <div className="text-xs text-muted-foreground">
                                {booking.booking_type === 'scheduled' && booking.scheduled_date && booking.scheduled_time
                                  ? `${format(new Date(booking.scheduled_date), 'MMM d')} at ${booking.scheduled_time}`
                                  : 'Instant booking'
                                }
                              </div>
                            </div>
                            <Badge className={cn('text-xs', getStatusColor(booking.status))}>
                              {booking.status}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center justify-between text-xs text-muted-foreground">
                            <span>{format(new Date(booking.created_at), 'MMM d, yyyy h:mm a')}</span>
                            <span className="font-medium">₹{booking.price_inr}</span>
                          </div>
                          
                          {booking.completed_at && (
                            <div className="text-xs text-green-600 mt-1">
                              Completed: {format(new Date(booking.completed_at), 'MMM d, h:mm a')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <History className="h-8 w-8 text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">No bookings yet</p>
                    </div>
                  )}
                </ScrollArea>
              </CardContent>
            </Card>
          </div>
        </main>

        <AdminBottomNav />
      </div>
    );
  }

  return (
    <div className="min-h-[100svh] max-w-screen-sm mx-auto bg-background text-foreground flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur border-b safe-top">
        <div className="flex items-center gap-2 px-3 py-2">
          <Link to="/admin" className="p-2 hover:bg-muted rounded-xl transition-colors">
            <ArrowLeft className="h-5 w-5 text-muted-foreground" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="font-semibold text-lg">User Management</h1>
            <p className="text-xs text-muted-foreground">
              {filteredUsers.length} of {users.length} users
            </p>
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col overflow-hidden pb-24 md:pb-6">
        {/* Search */}
        <div className="p-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 pr-4 h-11 rounded-xl bg-muted/50 border-muted focus:bg-background transition-colors"
            />
          </div>
        </div>

        {/* User List */}
        <ScrollArea className="flex-1 px-3">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <div className="text-lg font-medium">Loading users...</div>
              </div>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-center">
                <User className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <div className="text-lg font-medium">No users found</div>
                <p className="text-sm text-muted-foreground">
                  {searchTerm ? 'Try adjusting your search' : 'No users have registered yet'}
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pb-4">
              {filteredUsers.map((user) => (
                <Card 
                  key={user.id} 
                  className="cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => handleUserClick(user)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-4 w-4 text-primary flex-shrink-0" />
                          <h3 className="font-medium text-sm truncate">{user.full_name}</h3>
                        </div>
                        
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Phone className="h-3 w-3" />
                            <span>{user.phone}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Home className="h-3 w-3" />
                            <span>{user.community}{user.flat_no ? ` - ${user.flat_no}` : ''}</span>
                          </div>
                          
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            <span>Joined {format(new Date(user.created_at), 'MMM d, yyyy')}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          {user.booking_count} bookings
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ScrollArea>
      </main>

      <AdminBottomNav />
    </div>
  );
}