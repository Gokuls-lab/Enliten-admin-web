
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Upload, FileText, Link } from 'lucide-react';

interface Exam {
  id: string;
  title: string;
  short_name: string;
}

interface Subject {
  id: string;
  name: string;
}

interface FileUploadProps {
  exams: Exam[];
  subjects: Subject[];
  onUploadComplete: () => void;
}

const FileUpload: React.FC<FileUploadProps> = ({ exams, subjects, onUploadComplete }) => {
  const [files, setFiles] = useState<File[]>([]);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [resourceType, setResourceType] = useState<'file' | 'youtube_link'>('file');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [selectedExams, setSelectedExams] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string | 'none'>('none');
  const [orderIndex, setOrderIndex] = useState<string>('0');
  const [isActive, setIsActive] = useState(true);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setFiles(Array.from(e.target.files));
    }
  };

  const handleExamToggle = (examId: string) => {
    setSelectedExams(prev =>
      prev.includes(examId)
        ? prev.filter(id => id !== examId)
        : [...prev, examId]
    );
  };

  const uploadFile = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    
    const { error } = await supabase.storage
      .from('notes')
      .upload(fileName, file);

    if (error) {
      console.error('Upload error:', error);
      return null;
    }

    return fileName;
  };

  const createFileResource = async (fileName: string | null, fileUrl: string | null) => {
    const { data: user } = await supabase.auth.getUser();
    
    const { data: resource, error } = await supabase
      .from('file_resources')
      .insert({
        title,
        description,
        file_name: fileName,
        file_url: fileUrl,
        resource_type: resourceType,
        subject_id: selectedSubject !== 'none' ? selectedSubject : null,
        order_index: parseInt(orderIndex, 10) || 0,
        is_active: isActive,
        created_by: user.user?.id
      })
      .select()
      .single();

    if (error) {
      console.error('Resource creation error:', error);
      return null;
    }

    // Link to selected exams
    if (selectedExams.length > 0) {
      const examLinks = selectedExams.map(examId => ({
        file_resource_id: resource.id,
        exam_id: examId
      }));

      const { error: linkError } = await supabase
        .from('file_resource_exams')
        .insert(examLinks);

      if (linkError) {
        console.error('Exam linking error:', linkError);
      }
    }

    return resource;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!title.trim()) {
      toast({
        title: "Error",
        description: "Title is required",
        variant: "destructive"
      });
      return;
    }

    if (resourceType === 'file' && files.length === 0) {
      toast({
        title: "Error",
        description: "Please select at least one file",
        variant: "destructive"
      });
      return;
    }

    if (resourceType === 'youtube_link' && !youtubeUrl.trim()) {
      toast({
        title: "Error",
        description: "YouTube URL is required",
        variant: "destructive"
      });
      return;
    }

    setUploading(true);

    try {
      if (resourceType === 'file') {
        // Handle multiple file uploads
        const uploadPromises = files.map(async (file) => {
          const fileName = await uploadFile(file);
          if (fileName) {
            return await createFileResource(fileName, null);
          }
          return null;
        });

        const results = await Promise.all(uploadPromises);
        const successCount = results.filter(result => result !== null).length;

        toast({
          title: "Upload Complete",
          description: `Successfully uploaded ${successCount} of ${files.length} files`
        });
      } else {
        // Handle YouTube link
        await createFileResource(null, youtubeUrl);
        toast({
          title: "Success",
          description: "YouTube link added successfully"
        });
      }

      // Reset form
      setFiles([]);
      setTitle('');
      setDescription('');
      setYoutubeUrl('');
      setSelectedExams([]);
      setSelectedSubject('none');
      setOrderIndex('0');
      setIsActive(true);
      
      onUploadComplete();
      
    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: "Failed to upload. Please try again.",
        variant: "destructive"
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="title">Title *</Label>
        <Input
          id="title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Enter resource title"
          required
        />
      </div>

      <div>
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Enter resource description"
          rows={3}
        />
      </div>

      <div>
        <Label>Resource Type</Label>
        <Select value={resourceType} onValueChange={(value: 'file' | 'youtube_link') => setResourceType(value)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="file">
              <div className="flex items-center space-x-2">
                <FileText className="h-4 w-4" />
                <span>File Upload</span>
              </div>
            </SelectItem>
            <SelectItem value="youtube_link">
              <div className="flex items-center space-x-2">
                <Link className="h-4 w-4" />
                <span>YouTube Link</span>
              </div>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {resourceType === 'file' ? (
        <div>
          <Label htmlFor="files">Files *</Label>
          <Input
            id="files"
            type="file"
            multiple
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.txt,.xls,.xlsx"
          />
          {files.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {files.length} file(s) selected
            </p>
          )}
        </div>
      ) : (
        <div>
          <Label htmlFor="youtube-url">YouTube URL *</Label>
          <Input
            id="youtube-url"
            value={youtubeUrl}
            onChange={(e) => setYoutubeUrl(e.target.value)}
            placeholder="https://www.youtube.com/watch?v=..."
            type="url"
          />
        </div>
      )}

      <div>
        <Label>Associated Exams</Label>
        <div className="max-h-40 overflow-y-auto border rounded p-2 space-y-2">
          {exams.map((exam) => (
            <div key={exam.id} className="flex items-center space-x-2">
              <Checkbox
                id={exam.id}
                checked={selectedExams.includes(exam.id)}
                onCheckedChange={() => handleExamToggle(exam.id)}
              />
              <Label htmlFor={exam.id} className="text-sm">
                {exam.title} ({exam.short_name})
              </Label>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>Subject</Label>
        <Select value={selectedSubject} onValueChange={setSelectedSubject}>
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
        <Label htmlFor="order-index">Order Index</Label>
        <Input
          id="order-index"
          type="number"
          value={orderIndex}
          onChange={(e) => setOrderIndex(e.target.value)}
          placeholder="0"
        />
        <p className="text-sm text-gray-500 mt-1">Order in the subject timeline.</p>
      </div>

      <div className="flex items-center space-x-2">
        <Checkbox
          id="is-active"
          checked={isActive}
          onCheckedChange={setIsActive}
        />
        <Label htmlFor="is-active">Active</Label>
      </div>

      <Button type="submit" disabled={uploading} className="w-full">
        {uploading ? (
          <>
            <Upload className="h-4 w-4 mr-2 animate-spin" />
            Uploading...
          </>
        ) : (
          <>
            <Upload className="h-4 w-4 mr-2" />
            {resourceType === 'file' ? 'Upload Files' : 'Add YouTube Link'}
          </>
        )}
      </Button>
    </form>
  );
};

export default FileUpload;
