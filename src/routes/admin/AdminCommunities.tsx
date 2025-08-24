import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle, 
  AlertDialogTrigger 
} from '@/components/ui/alert-dialog';

interface Community {
  id: string;
  name: string;
  value: string;
  is_active: boolean;
  created_at: string;
}

export default function AdminCommunities() {
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<Community[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [newCommunityName, setNewCommunityName] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const { toast } = useToast();

  const fetchCommunities = async () => {
    try {
      const { data, error } = await supabase
        .from('communities')
        .select('*')
        .order('name');

      if (error) throw error;
      setCommunities(data || []);
    } catch (error) {
      console.error('Error fetching communities:', error);
      toast({
        title: 'Error',
        description: 'Failed to load communities',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCommunities();
  }, []);

  const generateValue = (name: string) => {
    return name.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  };

  const handleAddCommunity = async () => {
    if (!newCommunityName.trim()) return;

    try {
      const value = generateValue(newCommunityName);
      const { error } = await supabase
        .from('communities')
        .insert({
          name: newCommunityName.trim(),
          value: value,
          is_active: true
        });

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Community added successfully',
      });

      setNewCommunityName('');
      setIsAdding(false);
      fetchCommunities();
    } catch (error: any) {
      console.error('Error adding community:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to add community',
        variant: 'destructive',
      });
    }
  };

  const handleEditCommunity = async (id: string) => {
    if (!editingName.trim()) return;

    try {
      const value = generateValue(editingName);
      const { error } = await supabase
        .from('communities')
        .update({
          name: editingName.trim(),
          value: value
        })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Community updated successfully',
      });

      setEditingId(null);
      setEditingName('');
      fetchCommunities();
    } catch (error: any) {
      console.error('Error updating community:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update community',
        variant: 'destructive',
      });
    }
  };

  const handleDeleteCommunity = async (id: string) => {
    try {
      const { error } = await supabase
        .from('communities')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: 'Community deleted successfully',
      });

      fetchCommunities();
    } catch (error: any) {
      console.error('Error deleting community:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete community',
        variant: 'destructive',
      });
    }
  };

  const handleToggleActive = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('communities')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;

      toast({
        title: 'Success',
        description: `Community ${!currentStatus ? 'activated' : 'deactivated'} successfully`,
      });

      fetchCommunities();
    } catch (error: any) {
      console.error('Error toggling community status:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to update community status',
        variant: 'destructive',
      });
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-background p-4 space-y-6">
        <div className="max-w-4xl mx-auto">
          <div className="animate-pulse space-y-6">
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 bg-muted rounded-full"></div>
              <div className="h-8 bg-muted rounded w-1/4"></div>
            </div>
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 bg-muted rounded-2xl"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background p-4 space-y-6">
      <div className="max-w-4xl mx-auto">
        {/* Header with Back Button */}
        <header className="mb-6 flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => navigate('/admin')}
            className="h-9 w-9 rounded-full border"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1">
            <div className="text-2xl font-bold text-primary">Manage Communities</div>
            <div className="text-xs text-muted-foreground">Add, edit, or remove community options</div>
          </div>
          <Button 
            onClick={() => setIsAdding(true)} 
            className="rounded-2xl shadow-lg hover:shadow-xl transition-all"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Community
          </Button>
        </header>

        {/* Add New Community Form */}
        {isAdding && (
          <div className="rounded-2xl bg-card border shadow-sm p-4 mb-6">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Enter community name"
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCommunity()}
                className="flex-1 rounded-xl border-input"
              />
              <Button 
                onClick={handleAddCommunity} 
                size="sm"
                className="rounded-xl"
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setIsAdding(false);
                  setNewCommunityName('');
                }}
                className="rounded-xl"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}

        {/* Communities List */}
        <div className="space-y-3">
          {communities.map((community) => (
            <div key={community.id} className="rounded-2xl bg-card border shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {editingId === community.id ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEditCommunity(community.id)}
                      className="w-64 rounded-xl"
                    />
                  ) : (
                    <div className="flex-1">
                      <div className="font-semibold text-card-foreground">{community.name}</div>
                      <div className="text-sm text-muted-foreground">Value: {community.value}</div>
                    </div>
                  )}
                  <Badge 
                    variant={community.is_active ? 'default' : 'secondary'}
                    className="rounded-full px-3 py-1"
                  >
                    {community.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  {editingId === community.id ? (
                    <>
                      <Button 
                        size="sm" 
                        onClick={() => handleEditCommunity(community.id)}
                        className="rounded-xl"
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => {
                          setEditingId(null);
                          setEditingName('');
                        }}
                        className="rounded-xl"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingId(community.id);
                          setEditingName(community.name);
                        }}
                        className="rounded-xl"
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={community.is_active ? 'secondary' : 'default'}
                        size="sm"
                        onClick={() => handleToggleActive(community.id, community.is_active)}
                        className="rounded-xl"
                      >
                        {community.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button 
                            variant="destructive" 
                            size="sm"
                            className="rounded-xl"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="rounded-2xl">
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Community</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{community.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel className="rounded-xl">Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleDeleteCommunity(community.id)}
                              className="rounded-xl"
                            >
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {communities.length === 0 && (
          <div className="rounded-2xl bg-card border shadow-sm p-8 text-center">
            <div className="text-4xl mb-3">🏘️</div>
            <h3 className="font-semibold text-card-foreground mb-2">No Communities Yet</h3>
            <p className="text-muted-foreground">Add your first community to get started managing service areas.</p>
          </div>
        )}
      </div>
    </div>
  );
}