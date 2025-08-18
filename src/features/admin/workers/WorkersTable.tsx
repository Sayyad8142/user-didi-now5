import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Search, Plus, Edit, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { Worker, listWorkers, deleteWorker } from "./api";
import { WorkerForm } from "./WorkerForm";

export function WorkersTable() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      const data = await listWorkers(searchQuery, serviceFilter === "all" ? undefined : serviceFilter);
      setWorkers(data);
    } catch (error) {
      toast.error("Failed to load workers");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWorkers();
  }, [searchQuery, serviceFilter]);

  const handleDelete = async (id: string) => {
    try {
      await deleteWorker(id);
      toast.success("Worker deleted");
      fetchWorkers();
    } catch (error) {
      toast.error("Failed to delete worker");
      console.error(error);
    } finally {
      setDeleteId(null);
    }
  };

  const handleEdit = (worker: Worker) => {
    setSelectedWorker(worker);
    setShowForm(true);
  };

  const handleAdd = () => {
    setSelectedWorker(null);
    setShowForm(true);
  };

  const getServiceBadges = (serviceTypes: string[]) => {
    const serviceLabels: Record<string, string> = {
      maid: 'Maid',
      cook: 'Cook',
      bathroom_cleaning: 'Bathroom'
    };

    return serviceTypes.map(type => (
      <Badge key={type} variant="secondary" className="text-xs">
        {serviceLabels[type] || type}
      </Badge>
    ));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-xl font-semibold">Workers Management</h2>
        <Button onClick={handleAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Add Worker
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or phone..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={serviceFilter} onValueChange={setServiceFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Filter by service" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Services</SelectItem>
            <SelectItem value="maid">Maid</SelectItem>
            <SelectItem value="cook">Cook</SelectItem>
            <SelectItem value="bathroom_cleaning">Bathroom</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Workers List */}
      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            Loading workers...
          </div>
        ) : workers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No workers found
          </div>
        ) : (
          workers.map((worker) => (
            <div
              key={worker.id}
              className="bg-card border rounded-lg p-4 space-y-3"
            >
              <div className="flex items-start gap-3">
                <Avatar className="w-12 h-12">
                  <AvatarImage src={worker.photo_url} />
                  <AvatarFallback>
                    <User className="w-6 h-6" />
                  </AvatarFallback>
                </Avatar>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-medium truncate">{worker.full_name}</h3>
                    <Badge variant={worker.is_active ? "default" : "secondary"}>
                      {worker.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>

                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>{worker.phone}</p>
                    <p className="font-mono text-xs">{worker.upi_id}</p>
                    {worker.community && (
                      <p className="text-xs">{worker.community}</p>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 mt-2">
                    {getServiceBadges(worker.service_types)}
                  </div>
                </div>

                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleEdit(worker)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDeleteId(worker.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Worker Form Modal */}
      <WorkerForm
        worker={selectedWorker}
        open={showForm}
        onOpenChange={setShowForm}
        onSaved={fetchWorkers}
      />

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Worker</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && handleDelete(deleteId)}
              className="bg-destructive text-destructive-foreground"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}