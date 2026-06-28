
import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import FileUpload from '@/components/FileUpload';
import FileResourceList from '@/components/FileResourceList';
import { FileText, Upload } from 'lucide-react';
import Navbar from '@/components/Navbar';

interface Exam {
  id: string;
  title: string;
  short_name: string;
}

interface Subject {
  id: string;
  name: string;
}

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

const FileManagement: React.FC = () => {
  const [exams, setExams] = useState<Exam[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [resources, setResources] = useState<FileResource[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchExams = async () => {
    try {
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, short_name')
        .eq('is_active', true)
        .order('title');

      if (error) throw error;
      setExams(data || []);
    } catch (error) {
      console.error('Error fetching exams:', error);
      toast({
        title: "Error",
        description: "Failed to fetch exams",
        variant: "destructive"
      });
    }
  };

  const fetchSubjects = async () => {
    try {
      const { data, error } = await supabase
        .from('subjects')
        .select('id, name')
        .order('name');

      if (error) throw error;
      setSubjects(data || []);
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast({
        title: "Error",
        description: "Failed to fetch subjects",
        variant: "destructive"
      });
    }
  };

  const fetchResources = async () => {
    try {
      const { data, error } = await supabase
        .from('file_resources')
        .select(`
          *,
          file_resource_exams (
            exam_id,
            exams (
              title,
              short_name
            )
          )
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setResources(data || []);
    } catch (error) {
      console.error('Error fetching resources:', error);
      toast({
        title: "Error",
        description: "Failed to fetch resources",
        variant: "destructive"
      });
    }
  };

  const handleDataRefresh = () => {
    fetchResources();
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchExams(), fetchSubjects(), fetchResources()]);
      setLoading(false);
    };

    loadData();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <>
    <Navbar />
    <div className="min-h-screen bg-gray-50 p-6">
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">File Management</h1>
        <p className="text-gray-600">Upload and manage files and resources for exams</p>
      </div>

      <Tabs defaultValue="upload" className="space-y-6">
        <TabsList>
          <TabsTrigger value="upload" className="flex items-center space-x-2">
            <Upload className="h-4 w-4" />
            <span>Upload Files</span>
          </TabsTrigger>
          <TabsTrigger value="manage" className="flex items-center space-x-2">
            <FileText className="h-4 w-4" />
            <span>Manage Resources</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">
          <Card>
            <CardHeader>
              <CardTitle>Upload New Resource</CardTitle>
              <CardDescription>
                Upload files or add YouTube links with associated exam information
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FileUpload exams={exams} subjects={subjects} onUploadComplete={handleDataRefresh} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>Resource Management</CardTitle>
              <CardDescription>
                View, edit, and delete uploaded resources
              </CardDescription>
            </CardHeader>
            <CardContent>
              {resources.length === 0 ? (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No resources uploaded yet</p>
                </div>
              ) : (
                <FileResourceList 
                  resources={resources} 
                  exams={exams} 
                  subjects={subjects}
                  onUpdate={handleDataRefresh} 
                />
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
    </div>
    </>
  );
};

export default FileManagement;
