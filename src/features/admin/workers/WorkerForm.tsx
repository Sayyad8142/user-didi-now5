import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Camera, Upload } from "lucide-react";
import { toast } from "sonner";
import { Worker, adminUpsertWorker, uploadWorkerPhoto } from "./api";
import { PhoneInputIN } from "@/components/auth/PhoneInputIN";
import { useCommunities } from "@/hooks/useCommunities";

interface WorkerFormProps {
  worker?: Worker | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}

const SERVICE_TYPES = [
  { id: 'maid', label: 'Maid' },
  { id: 'cook', label: 'Cook' },
  { id: 'bathroom_cleaning', label: 'Bathroom Cleaning' }
];

export function WorkerForm({ worker, open, onOpenChange, onSaved }: WorkerFormProps) {
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [serviceTypes, setServiceTypes] = useState<string[]>([]);
  const { communities, loading: communitiesLoading } = useCommunities();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm({
    defaultValues: {
      full_name: '',
      phone: '',
      upi_id: '',
      community: '',
      is_active: true
    }
  });

  useEffect(() => {
    if (worker) {
      reset({
        full_name: worker.full_name,
        phone: worker.phone,
        upi_id: worker.upi_id,
        community: worker.community || '',
        is_active: worker.is_active
      });
      setPhotoUrl(worker.photo_url);
      setServiceTypes(worker.service_types);
    } else {
      reset({
        full_name: '',
        phone: '',
        upi_id: '',
        community: '',
        is_active: true
      });
      setPhotoUrl(undefined);
      setServiceTypes([]);
    }
  }, [worker, reset]);

  const handlePhotoUpload = async (file: File) => {
    try {
      setUploading(true);
      console.log('Uploading photo...', file.name);
      const url = await uploadWorkerPhoto(file);
      setPhotoUrl(url);
      toast.success("Photo uploaded successfully");
    } catch (error: any) {
      console.error('Photo upload error:', error);
      const message = error?.message || "Failed to upload photo";
      toast.error(message);
    } finally {
      setUploading(false);
    }
  };

  const onSubmit = async (data: any) => {
    if (serviceTypes.length === 0) {
      toast.error("Please select at least one service type");
      return;
    }

    try {
      setLoading(true);
      
      await adminUpsertWorker({
        full_name: data.full_name,
        phone: data.phone,
        upi_id: data.upi_id,
        service_types: serviceTypes,
        community: data.community,
        photo_url: photoUrl ?? null,
        is_active: data.is_active ?? true,
      });
      
      toast.success(worker ? "Worker updated" : "Worker created");
      onSaved();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Save worker failed:', error);
      toast.error(error?.message ?? 'Failed to save worker');
    } finally {
      setLoading(false);
    }
  };

  const handleServiceTypeChange = (serviceId: string, checked: boolean) => {
    if (checked) {
      setServiceTypes(prev => [...prev, serviceId]);
    } else {
      setServiceTypes(prev => prev.filter(id => id !== serviceId));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{worker ? 'Edit Worker' : 'Add Worker'}</DialogTitle>
          <DialogDescription>
            {worker ? 'Update worker information and settings' : 'Add a new worker to the system'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Photo Upload */}
          <div className="flex flex-col items-center space-y-2">
            <Avatar className="w-20 h-20">
              <AvatarImage src={photoUrl} />
              <AvatarFallback>
                <Camera className="w-8 h-8" />
              </AvatarFallback>
            </Avatar>
            <Label 
              htmlFor="photo" 
              className={`cursor-pointer flex items-center gap-2 text-sm ${
                uploading ? 'text-muted-foreground cursor-not-allowed' : 'text-primary hover:text-primary/80'
              }`}
            >
              <Upload className="w-4 h-4" />
              {uploading ? 'Uploading…' : 'Upload Photo'}
            </Label>
            <Input
              id="photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  console.log('Selected file:', file.name, file.type, file.size);
                  handlePhotoUpload(file);
                }
              }}
            />
            <p className="text-xs text-muted-foreground text-center">
              JPG, PNG or WebP • Max 5MB
            </p>
          </div>

          {/* Form Fields */}
          <div>
            <Label htmlFor="full_name">Full Name *</Label>
            <Input
              id="full_name"
              {...register('full_name', { required: 'Name is required' })}
            />
            {errors.full_name && (
              <p className="text-sm text-destructive mt-1">{errors.full_name.message}</p>
            )}
          </div>

          <div>
            <PhoneInputIN
              value={watch('phone')}
              onChange={(value) => setValue('phone', value)}
              error={errors.phone?.message}
              required
            />
          </div>

          <div>
            <Label htmlFor="upi_id">UPI ID</Label>
            <Input
              id="upi_id"
              placeholder="name@okaxis (optional)"
              {...register('upi_id')}
            />
          </div>

          <div>
            <Label htmlFor="community">Community</Label>
            <Select
              value={watch('community')}
              onValueChange={(value) => setValue('community', value)}
              disabled={communitiesLoading}
            >
              <SelectTrigger>
                <SelectValue placeholder={communitiesLoading ? "Loading communities..." : "Select community"} />
              </SelectTrigger>
              <SelectContent>
                {communities.map((community) => (
                  <SelectItem key={community.id} value={community.value}>
                    {community.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Service Types */}
          <div>
            <Label>Service Types *</Label>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {SERVICE_TYPES.map((service) => (
                <div key={service.id} className="flex items-center space-x-2">
                  <Checkbox
                    id={service.id}
                    checked={serviceTypes.includes(service.id)}
                    onCheckedChange={(checked) => 
                      handleServiceTypeChange(service.id, !!checked)
                    }
                  />
                  <Label htmlFor={service.id} className="text-sm">
                    {service.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Active Status */}
          <div className="flex items-center justify-between">
            <Label htmlFor="is_active">Active</Label>
            <Switch
              id="is_active"
              checked={watch('is_active')}
              onCheckedChange={(checked) => setValue('is_active', checked)}
            />
          </div>

          <div className="flex gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={loading}
              className="flex-1"
            >
              {loading ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}