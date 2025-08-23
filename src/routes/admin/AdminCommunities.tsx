import { useState, useEffect } from 'react';
import { Plus, Trash2, Edit2, Check, X } from 'lucide-react';
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
      <div className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-gray-200 rounded w-1/4"></div>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Manage Communities</h1>
          <p className="text-muted-foreground">Add, edit, or remove community options</p>
        </div>
        <Button onClick={() => setIsAdding(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Community
        </Button>
      </div>

      {isAdding && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Input
                placeholder="Community name"
                value={newCommunityName}
                onChange={(e) => setNewCommunityName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleAddCommunity()}
                className="flex-1"
              />
              <Button onClick={handleAddCommunity} size="sm">
                <Check className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => {
                  setIsAdding(false);
                  setNewCommunityName('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {communities.map((community) => (
          <Card key={community.id}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {editingId === community.id ? (
                    <Input
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && handleEditCommunity(community.id)}
                      className="w-64"
                    />
                  ) : (
                    <div>
                      <div className="font-medium">{community.name}</div>
                      <div className="text-sm text-muted-foreground">Value: {community.value}</div>
                    </div>
                  )}
                  <Badge variant={community.is_active ? 'default' : 'secondary'}>
                    {community.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  {editingId === community.id ? (
                    <>
                      <Button 
                        size="sm" 
                        onClick={() => handleEditCommunity(community.id)}
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
                      >
                        <Edit2 className="h-4 w-4" />
                      </Button>
                      <Button
                        variant={community.is_active ? 'secondary' : 'default'}
                        size="sm"
                        onClick={() => handleToggleActive(community.id, community.is_active)}
                      >
                        {community.is_active ? 'Deactivate' : 'Activate'}
                      </Button>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Delete Community</AlertDialogTitle>
                            <AlertDialogDescription>
                              Are you sure you want to delete "{community.name}"? This action cannot be undone.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDeleteCommunity(community.id)}>
                              Delete
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {communities.length === 0 && (
        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-muted-foreground">No communities found. Add your first community to get started.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}