
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { BookOpen, Plus, Edit, Trash2, Search, FolderOpen } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import Navbar from '@/components/Navbar';

interface Subject {
  id: string;
  name: string;
  description: string;
  image_url?: string;
  created_at: string;
  subject_exams?: { exams: { id: string; title: string; category: string } }[];
}

interface Exam {
  id: string;
  title: string;
  category: string;
}

export default function SubjectManagement() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingSubject, setEditingSubject] = useState<Subject | null>(null);
  const [newSubject, setNewSubject] = useState({
    name: '',
    description: '',
    image_url: '',
    selectedExams: [] as string[]
  });

  const { toast } = useToast();
  const queryClient = useQueryClient();

  console.log('SubjectManagement component mounted');

  // Fetch subjects with related exam data
  const { data: subjects, isLoading, error } = useQuery({
    queryKey: ['subjects'],
    queryFn: async () => {
      console.log('Fetching subjects...');
      let allData: Subject[] = [];
      let from = 0;
      const batchSize = 1000;
      let hasMore = true;

      while (hasMore) {
        const { data, error } = await supabase
          .from('subjects')
          .select(`
            *,
            subject_exams (
              exams (
                id,
                title,
                category
              )
            )
          `)
          .order('created_at', { ascending: false })
          .range(from, from + batchSize - 1);

        if (error) {
          console.error('Error fetching subjects batch:', error);
          throw error;
        }

        if (!data || data.length === 0) {
          hasMore = false;
        } else {
          allData = [...allData, ...data as Subject[]];
          if (data.length < batchSize) {
            hasMore = false;
          } else {
            from += batchSize;
          }
        }
      }

      console.log('Total subjects fetched:', allData.length);
      return allData;
    },
  });

  // Fetch exams for selection
  const { data: exams } = useQuery({
    queryKey: ['exams'],
    queryFn: async () => {
      console.log('Fetching exams...');
      const { data, error } = await supabase
        .from('exams')
        .select('id, title, category')
        .eq('is_active', true)
        .order('title');
      
      console.log('Exams query result:', { data, error });
      if (error) throw error;
      return data as Exam[];
    },
  });

  const [examSearchTerm, setExamSearchTerm] = useState('');
  const filteredExams = React.useMemo(() => {
    if (!exams) return [];
    return exams.filter(exam =>
      exam.title.toLowerCase().includes(examSearchTerm.toLowerCase()) ||
      exam.category.toLowerCase().includes(examSearchTerm.toLowerCase())
    );
  }, [exams, examSearchTerm]);

  // Table exam filter states
  const [examFilterOpen, setExamFilterOpen] = useState(false);
  const [selectedExamFilters, setSelectedExamFilters] = useState<string[]>([]);
  const [examTableSearchTerm, setExamTableSearchTerm] = useState('');
  const examFilterRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (examFilterRef.current && !examFilterRef.current.contains(event.target as Node)) {
        setExamFilterOpen(false);
      }
    }
    if (examFilterOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    } else {
      document.removeEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [examFilterOpen]);

  const filteredExamsForTable = React.useMemo(() => {
    if (!exams) return [];
    return exams.filter(exam =>
      exam.title.toLowerCase().includes(examTableSearchTerm.toLowerCase()) ||
      exam.category.toLowerCase().includes(examTableSearchTerm.toLowerCase())
    );
  }, [exams, examTableSearchTerm]);

  // Create/Update subject mutation
  const subjectMutation = useMutation({
    mutationFn: async (subjectData: any) => {
      if (editingSubject) {
        // Update subject
        const { error: subjectError } = await supabase
          .from('subjects')
          .update({
            name: subjectData.name,
            description: subjectData.description,
            image_url: subjectData.image_url || null
          })
          .eq('id', editingSubject.id);
        if (subjectError) throw subjectError;

        // Delete existing exam relationships
        await supabase.from('subject_exams').delete().eq('subject_id', editingSubject.id);

        // Insert new exam relationships
        if (subjectData.selectedExams.length > 0) {
          const examRelations = subjectData.selectedExams.map((examId: string) => ({
            subject_id: editingSubject.id,
            exam_id: examId
          }));
          await supabase.from('subject_exams').insert(examRelations);
        }
      } else {
        // Create new subject
        const { data: newSubjectData, error: subjectError } = await supabase
          .from('subjects')
          .insert([{
            name: subjectData.name,
            description: subjectData.description,
            image_url: subjectData.image_url || null
          }])
          .select()
          .single();
        if (subjectError) throw subjectError;

        // Insert exam relationships
        if (subjectData.selectedExams.length > 0) {
          const examRelations = subjectData.selectedExams.map((examId: string) => ({
            subject_id: newSubjectData.id,
            exam_id: examId
          }));
          await supabase.from('subject_exams').insert(examRelations);
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      setIsDialogOpen(false);
      setEditingSubject(null);
      setNewSubject({
        name: '',
        description: '',
        image_url: '',
        selectedExams: []
      });
      toast({
        title: "Success",
        description: `Subject ${editingSubject ? 'updated' : 'created'} successfully`,
      });
    },
    onError: (error) => {
      console.error('Subject mutation error:', error);
      toast({
        title: "Error",
        description: `Failed to ${editingSubject ? 'update' : 'create'} subject: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Delete subject mutation
  const deleteMutation = useMutation({
    mutationFn: async (subjectId: string) => {
      const { error } = await supabase
        .from('subjects')
        .delete()
        .eq('id', subjectId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subjects'] });
      toast({
        title: "Success",
        description: "Subject deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Failed to delete subject: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    subjectMutation.mutate(newSubject);
  };

  const handleEdit = async (subject: Subject) => {
    setEditingSubject(subject);
    
    // Fetch current exam relationships
    const { data: currentExams } = await supabase
      .from('subject_exams')
      .select('exam_id')
      .eq('subject_id', subject.id);

    setNewSubject({
      name: subject.name,
      description: subject.description,
      image_url: subject.image_url || '',
      selectedExams: currentExams?.map(rel => rel.exam_id) || []
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (subjectId: string) => {
    if (confirm('Are you sure you want to delete this subject? This will also remove all questions and relationships associated with it.')) {
      deleteMutation.mutate(subjectId);
    }
  };

  const handleExamToggle = (examId: string) => {
    setNewSubject(prev => ({
      ...prev,
      selectedExams: prev.selectedExams.includes(examId)
        ? prev.selectedExams.filter(id => id !== examId)
        : [...prev.selectedExams, examId]
    }));
  };

  const filteredSubjects = subjects?.filter(subject => {
    const matchesSearch = subject.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      subject.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesExam = selectedExamFilters.length === 0 || (subject.subject_exams && subject.subject_exams.some(rel => rel.exams && selectedExamFilters.includes(rel.exams.id)));
    return matchesSearch && matchesExam;
  }) || [];


  console.log('Render state:', { 
    isLoading, 
    error, 
    subjectsCount: subjects?.length, 
    examsCount: exams?.length,
    filteredSubjectsCount: filteredSubjects.length 
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    console.error('Subject query error:', error);
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Error loading subjects</h2>
          <p className="text-gray-600">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navbar />
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-3">
            <FolderOpen className="h-8 w-8 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">Subject Management</h1>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button className="flex items-center space-x-2">
                <Plus className="h-4 w-4" />
                <span>Add Subject</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingSubject ? 'Edit Subject' : 'Add New Subject'}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <Label htmlFor="name">Subject Name</Label>
                  <Input
                    id="name"
                    value={newSubject.name}
                    onChange={(e) => setNewSubject({ ...newSubject, name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={newSubject.description}
                    onChange={(e) => setNewSubject({ ...newSubject, description: e.target.value })}
                    rows={3}
                  />
                </div>
                <div>
                  <Label htmlFor="image_url">Image URL</Label>
                  <Input
                    id="image_url"
                    type="url"
                    placeholder="https://example.com/image.jpg"
                    value={newSubject.image_url}
                    onChange={(e) => setNewSubject({ ...newSubject, image_url: e.target.value })}
                  />
                  <p className="text-xs text-gray-500 mt-1">Optional: URL for the subject's display image</p>
                </div>
                
                <div>
                  <Label>Associated Exams</Label>
                  <Input
                    type="text"
                    placeholder="Search exams..."
                    value={examSearchTerm}
                    onChange={(e) => setExamSearchTerm(e.target.value)}
                    className="mb-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                  <div className="grid grid-cols-2 gap-2 mt-2 max-h-64 overflow-y-auto">
                    {filteredExams.map((exam) => (
                      <div key={exam.id} className="flex items-center space-x-2 mb-2">
                        <Checkbox
                          id={`exam-${exam.id}`}
                          checked={newSubject.selectedExams.includes(exam.id)}
                          onCheckedChange={() => handleExamToggle(exam.id)}
                        />
                        <Label htmlFor={`exam-${exam.id}`} className="text-sm">
                          {exam.title} ({exam.category})
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <Button type="submit" className="w-full">
                  {editingSubject ? 'Update Subject' : 'Create Subject'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>Subjects ({filteredSubjects.length})</CardTitle>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search subjects..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 w-64"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead className="relative group">
                    <div className="flex items-center gap-1">
                      Associated Exams
                      <button
                        className="ml-1 p-1 rounded hover:bg-gray-200 inline-flex items-center"
                        onClick={e => {
                          e.stopPropagation();
                          setExamFilterOpen(prev => !prev);
                        }}
                        aria-label="Filter Exams"
                        type="button"
                      >
                        <Search className="h-4 w-4 text-gray-500 group-hover:text-blue-600" />
                      </button>
                    </div>
                    {examFilterOpen && (
                      <div ref={examFilterRef} className="absolute left-0 z-20 mt-2 bg-white border rounded shadow-lg w-72 p-4">
                        <div className="font-semibold mb-2">Filter by Exam</div>
                        <Input
                          type="text"
                          placeholder="Search exams..."
                          value={examTableSearchTerm}
                          onChange={e => setExamTableSearchTerm(e.target.value)}
                          className="mb-2 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                        <div className="max-h-64 overflow-y-auto">
                          {filteredExamsForTable.map(exam => (
                            <div key={exam.id} className="flex items-center space-x-2 mb-2">
                              <input
                                type="checkbox"
                                checked={selectedExamFilters.includes(exam.id)}
                                onChange={() => {
                                  setSelectedExamFilters(prev =>
                                    prev.includes(exam.id)
                                      ? prev.filter(id => id !== exam.id)
                                      : [...prev, exam.id]
                                  );
                                }}
                                id={`exam-filter-${exam.id}`}
                              />
                              <label htmlFor={`exam-filter-${exam.id}`} className="text-sm cursor-pointer">
                                {exam.title} ({exam.category})
                              </label>
                            </div>
                          ))}
                        </div>
                        <button
                          className="mt-2 text-xs text-blue-600 hover:underline"
                          onClick={() => {
                            setSelectedExamFilters([]);
                            setExamTableSearchTerm('');
                          }}
                          type="button"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredSubjects.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8">
                      <FolderOpen className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects found</h3>
                      <p className="text-gray-500 mb-4">Get started by creating your first subject.</p>
                      <Button onClick={() => setIsDialogOpen(true)}>
                        <Plus className="h-4 w-4 mr-2" />
                        Add Subject
                      </Button>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredSubjects.map((subject) => (
                    <TableRow key={subject.id}>
                      <TableCell className="font-medium">{subject.name}</TableCell>
                      <TableCell className="max-w-md">
                        {subject.description?.length > 100 
                          ? `${subject.description.substring(0, 100)}...` 
                          : subject.description}
                      </TableCell>
                      <TableCell>
                        {subject.subject_exams?.map((rel, idx) => (
                          <div key={idx} className="text-sm">
                            {rel.exams.title}
                          </div>
                        )) || <span className="text-gray-400">No exams assigned</span>}
                      </TableCell>
                      <TableCell>{new Date(subject.created_at).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(subject)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(subject.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
    </>
  );
}
