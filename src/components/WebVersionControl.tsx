import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Globe } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function WebVersionControl() {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadCurrentVersion = async () => {
    try {
      const { data } = await supabase
        .from('ops_settings')
        .select('value')
        .eq('key', 'web_version')
        .single();
      
      if (data?.value) {
        setCurrentVersion(data.value);
      }
    } catch (error) {
      console.error('Failed to load version:', error);
    }
  };

  useEffect(() => {
    loadCurrentVersion();
  }, []);

  const bumpVersion = async () => {
    setLoading(true);
    try {
      // Get current version
      const { data: current } = await supabase
        .from('ops_settings')
        .select('value')
        .eq('key', 'web_version')
        .single();

      if (!current?.value) {
        throw new Error('No current version found');
      }

      // Parse and increment patch version
      const versionParts = current.value.split('.');
      const major = parseInt(versionParts[0] || '1');
      const minor = parseInt(versionParts[1] || '0');
      const patch = parseInt(versionParts[2] || '0');
      const newVersion = `${major}.${minor}.${patch + 1}`;

      // Update version
      const { error } = await supabase
        .from('ops_settings')
        .update({ value: newVersion })
        .eq('key', 'web_version');

      if (error) throw error;

      setCurrentVersion(newVersion);
      toast({
        title: "Version updated",
        description: `Web version bumped to ${newVersion}. Users will see update notification.`,
      });
    } catch (error) {
      console.error('Failed to bump version:', error);
      toast({
        title: "Error",
        description: "Failed to update web version",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
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
        <div className="p-4 bg-gray-50 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium text-gray-900">Current Version</h3>
              <p className="text-sm text-gray-600">v{currentVersion || '1.0.0'}</p>
            </div>
          </div>
          
          <Button 
            onClick={bumpVersion} 
            disabled={loading}
            className="w-full h-11"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Updating...' : 'Bump Patch Version'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}