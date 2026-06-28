
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { FileText, Link, Download, Edit, Trash2, Eye, EyeOff } from 'lucide-react';

interface FileResource {
  id: string;
  title: string;
  description: string | null;
  file_name: string | null;
  file_url: string | null;
  resource_type: string;
  is_active: boolean;
  created_at: string;
  subject_id: string | null;
  order_index: number;
  file_resource_exams: Array<{
    exam_id: string;
    exams: {
      title: string;
      short_name: string;
    };
  }>;
}

interface Exam {
  id: string;
  title: string;
  short_name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface FileResourceListProps {
  resources: FileResource[];
  exams: Exam[];
  subjects: Subject[];
  onUpdate: () => void;
}

const FileResourceList: React.FC<FileResourceListProps> = ({ resources, exams, subjects, onUpdate }) => {
  const [editingResource, setEditingResource] = useState<FileResource | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editSubject, setEditSubject] = useState<string | 'none'>('none');
  const [editOrderIndex, setEditOrderIndex] = useState<string>('0');
  const [editSelectedExams, setEditSelectedExams] = useState<string[]>([]);
  const [editIsActive, setEditIsActive] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const { toast } = useToast();

  const handleEdit = (resource: FileResource) => {
    setEditingResource(resource);
    setEditTitle(resource.title);
    setEditDescription(resource.description || '');
    setEditSubject(resource.subject_id || 'none');
    setEditOrderIndex((resource.order_index || 0).toString());
    setEditSelectedExams(resource.file_resource_exams.map(fre => fre.exam_id));
    setEditIsActive(resource.is_active);
    setEditDialogOpen(true);
  };

  const handleExamToggle = (examId: string) => {
    setEditSelectedExams(prev =>
      prev.includes(examId)
        ? prev.filter(id => id !== examId)
        : [...prev, examId]
    );
  };

  const handleUpdate = async () => {
    if (!editingResource) return;

    try {
      // Update file resource
      const { error: updateError } = await supabase
        .from('file_resources')
        .update({
          title: editTitle,
          description: editDescription,
          subject_id: editSubject !== 'none' ? editSubject : null,
          order_index: parseInt(editOrderIndex, 10) || 0,
          is_active: editIsActive
        })
        .eq('id', editingResource.id);

      if (updateError) throw updateError;

      // Update exam associations
      // First, delete existing associations
      await supabase
        .from('file_resource_exams')
        .delete()
        .eq('file_resource_id', editingResource.id);

      // Then, insert new associations
      if (editSelectedExams.length > 0) {
        const examLinks = editSelectedExams.map(examId => ({
          file_resource_id: editingResource.id,
          exam_id: examId
        }));

        const { error: linkError } = await supabase
          .from('file_resource_exams')
          .insert(examLinks);

        if (linkError) throw linkError;
      }

      toast({
        title: "Success",
        description: "Resource updated successfully"
      });

      setEditDialogOpen(false);
      onUpdate();
    } catch (error) {
      console.error('Update error:', error);
      toast({
        title: "Error",
        description: "Failed to update resource",
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (resource: FileResource) => {
    if (!confirm('Are you sure you want to delete this resource?')) return;

    try {
      // Delete file from storage if it exists
      if (resource.file_name) {
        await supabase.storage
          .from('notes')
          .remove([resource.file_name]);
      }

      // Delete resource record (associations will be deleted due to CASCADE)
      const { error } = await supabase
        .from('file_resources')
        .delete()
        .eq('id', resource.id);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Resource deleted successfully"
      });

      onUpdate();
    } catch (error) {
      console.error('Delete error:', error);
      toast({
        title: "Error",
        description: "Failed to delete resource",
        variant: "destructive"
      });
    }
  };

  const handleDownload = async (resource: FileResource) => {
    if (!resource.file_name) return;

    try {
      const { data, error } = await supabase.storage
        .from('notes')
        .download(resource.file_name);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = resource.file_name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: "Failed to download file",
        variant: "destructive"
      });
    }
  };

  const getFileUrl = (fileName: string) => {
    const { data } = supabase.storage.from('notes').getPublicUrl(fileName);
    return data.publicUrl;
  };

  return (
    <div className="space-y-4">
      {resources.map((resource) => (
        <Card key={resource.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex items-center space-x-2">
                {resource.resource_type === 'file' ? (
                  <FileText className="h-5 w-5" />
                ) : (
                  <Link className="h-5 w-5" />
                )}
                <CardTitle className="text-lg">{resource.title}</CardTitle>
                {resource.is_active ? (
                  <Badge variant="default">
                    <Eye className="h-3 w-3 mr-1" />
                    Active
                  </Badge>
                ) : (
                  <Badge variant="secondary">
                    <EyeOff className="h-3 w-3 mr-1" />
                    Inactive
                  </Badge>
                )}
              </div>
              <div className="flex space-x-2">
                <Button variant="outline" size="sm" onClick={() => handleEdit(resource)}>
                  <Edit className="h-4 w-4" />
                </Button>
                <Button variant="outline" size="sm" onClick={() => handleDelete(resource)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
                {resource.resource_type === 'file' && resource.file_name && (
                  <Button variant="outline" size="sm" onClick={() => handleDownload(resource)}>
                    <Download className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {resource.description && (
              <p className="text-gray-600 mb-3">{resource.description}</p>
            )}
            
            {resource.resource_type === 'youtube_link' && resource.file_url && (
              <div className="mb-3">
                <a 
                  href={resource.file_url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {resource.file_url}
                </a>
              </div>
            )}

            {resource.resource_type === 'file' && resource.file_name && (
              <div className="mb-3">
                <a 
                  href={getFileUrl(resource.file_name)} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  View File
                </a>
              </div>
            )}

            {resource.file_resource_exams.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-2">Associated Exams:</p>
                <div className="flex flex-wrap gap-2">
                  {resource.file_resource_exams.map((fre) => (
                    <Badge key={fre.exam_id} variant="outline">
                      {fre.exams.title} ({fre.exams.short_name})
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-xs text-gray-500 mt-3">
              Created: {new Date(resource.created_at).toLocaleDateString()}
              {resource.subject_id && ` • Subject: ${subjects.find(s => s.id === resource.subject_id)?.name || 'Unknown'}`}
              {resource.order_index !== undefined && ` • Order: ${resource.order_index}`}
            </p>
          </CardContent>
        </Card>
      ))}

      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Resource</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">Title</Label>
              <Input
                id="edit-title"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={editDescription}
                onChange={(e) => setEditDescription(e.target.value)}
                rows={3}
              />
            </div>

            <div>
              <Label>Subject</Label>
              <Select value={editSubject} onValueChange={setEditSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a subject (optional)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {subjects.map((sub) => (
                    <SelectItem key={sub.id} value={sub.id}>
                      {sub.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="edit-order-index">Order Index</Label>
              <Input
                id="edit-order-index"
                type="number"
                value={editOrderIndex}
                onChange={(e) => setEditOrderIndex(e.target.value)}
                placeholder="0"
              />
            </div>

            <div>
              <Label>Associated Exams</Label>
              <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-2">
                {exams.map((exam) => (
                  <div key={exam.id} className="flex items-center space-x-2">
                    <Checkbox
                      id={`edit-${exam.id}`}
                      checked={editSelectedExams.includes(exam.id)}
                      onCheckedChange={() => handleExamToggle(exam.id)}
                    />
                    <Label htmlFor={`edit-${exam.id}`} className="text-sm">
                      {exam.title} ({exam.short_name})
                    </Label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="edit-is-active"
                checked={editIsActive}
                onCheckedChange={setEditIsActive}
              />
              <Label htmlFor="edit-is-active">Active</Label>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleUpdate}>
                Update Resource
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FileResourceList;
