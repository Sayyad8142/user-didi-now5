import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RefreshCw, Globe, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export function WebVersionControl() {
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [updateMode, setUpdateMode] = useState<'soft' | 'force'>('soft');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const loadCurrentSettings = async () => {
    try {
      const { data } = await supabase
        .from('ops_settings')
        .select('key, value')
        .in('key', ['web_version', 'web_update_mode']);
      
      if (data) {
        const versionRow = data.find(row => row.key === 'web_version');
        const modeRow = data.find(row => row.key === 'web_update_mode');
        
        if (versionRow?.value) setCurrentVersion(versionRow.value);
        if (modeRow?.value) setUpdateMode(modeRow.value as 'soft' | 'force');
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  };

  useEffect(() => {
    loadCurrentSettings();
  }, []);

  const toggleUpdateMode = async () => {
    setLoading(true);
    try {
      const newMode = updateMode === 'soft' ? 'force' : 'soft';
      
      const { error } = await supabase
        .from('ops_settings')
        .update({ value: newMode })
        .eq('key', 'web_update_mode');

      if (error) throw error;

      setUpdateMode(newMode);
      toast({
        title: "Update mode changed",
        description: `Updates will now be ${newMode === 'force' ? 'forced immediately' : 'shown as notifications'}`,
      });
    } catch (error) {
      console.error('Failed to toggle update mode:', error);
      toast({
        title: "Error",
        description: "Failed to update mode",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const bumpVersion = async () => {
    setLoading(true);
    try {
      // Get current version
      const { data: current } = await supabase
        .from('ops_settings')
        .select('value')
        .eq('key', 'web_version')
        .single();

      let currentVersion = current?.value || '1.0.0';
      
      // If no version exists, create it first
      if (!current?.value) {
        const { error: insertError } = await supabase
          .from('ops_settings')
          .insert({ key: 'web_version', value: '1.0.0' });
        
        if (insertError) {
          // If insert fails, try upsert instead
          const { error: upsertError } = await supabase
            .from('ops_settings')
            .upsert({ key: 'web_version', value: '1.0.0' });
          
          if (upsertError) throw upsertError;
        }
        currentVersion = '1.0.0';
      }

      // Parse and increment patch version
      const versionParts = currentVersion.split('.');
      const major = parseInt(versionParts[0] || '1');
      const minor = parseInt(versionParts[1] || '0');
      const patch = parseInt(versionParts[2] || '0');
      const newVersion = `${major}.${minor}.${patch + 1}`;

      // Update version
      const { error } = await supabase
        .from('ops_settings')
        .upsert({ key: 'web_version', value: newVersion });

      if (error) throw error;

      setCurrentVersion(newVersion);
      
      const modeText = updateMode === 'force' ? 'Users will be updated immediately.' : 'Users will see update notification.';
      toast({
        title: "Version updated",
        description: `Web version bumped to ${newVersion}. ${modeText}`,
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
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900">Current Version</h3>
                <p className="text-sm text-gray-600">v{currentVersion || '1.0.0'}</p>
              </div>
            </div>
            
            {/* Update Mode Toggle */}
            <div className="flex items-center justify-between p-3 bg-white rounded-lg border">
              <div className="flex items-center space-x-3">
                <AlertTriangle className={`h-4 w-4 ${updateMode === 'force' ? 'text-orange-500' : 'text-gray-400'}`} />
                <div>
                  <Label htmlFor="force-mode" className="text-sm font-medium">
                    Force Updates
                  </Label>
                  <p className="text-xs text-gray-500">
                    {updateMode === 'force' ? 'Users will update immediately' : 'Users see notification banner'}
                  </p>
                </div>
              </div>
              <Switch
                id="force-mode"
                checked={updateMode === 'force'}
                onCheckedChange={toggleUpdateMode}
                disabled={loading}
              />
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
        </div>
      </CardContent>
    </Card>
  );
}