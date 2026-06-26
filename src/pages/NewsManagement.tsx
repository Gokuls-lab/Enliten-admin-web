import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  RefreshCw,
  Trash2,
  Clock,
  MapPin,
  Newspaper,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ────────────────────────────────────────────────────
interface NewsItem {
  date: string;
  title: string;
  content: string;
  source?: string;
  gs_tags?: string[];
  exam_relevance?: string;
}

interface CategoryData {
  news_items: NewsItem[];
  total_items: number;
  emoji?: string;
}

interface NewsRecord {
  id: string;
  fetched_at: string;
  region: string;
  categories: Record<string, CategoryData>;
  total_items: number;
  model_used?: string;
  raw_timestamp?: string;
}

// ─── Category color map ──────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  Politics: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
  Economy: 'bg-green-500/20 text-green-300 border-green-500/30',
  Sports: 'bg-orange-500/20 text-orange-300 border-orange-500/30',
  Science_Technology: 'bg-purple-500/20 text-purple-300 border-purple-500/30',
  Environment: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
  Education: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
  Culture: 'bg-pink-500/20 text-pink-300 border-pink-500/30',
  Health: 'bg-red-500/20 text-red-300 border-red-500/30',
  Infrastructure: 'bg-slate-500/20 text-slate-300 border-slate-500/30',
  International_Relations: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
};

const GS_TAG_COLORS: Record<string, string> = {
  GS1: 'bg-blue-600 text-white',
  GS2: 'bg-green-600 text-white',
  GS3: 'bg-orange-600 text-white',
  GS4: 'bg-purple-600 text-white',
};

// ─── Sub-component: Category Accordion ──────────────────────
function CategoryAccordion({ catKey, catData }: { catKey: string; catData: CategoryData }) {
  const [open, setOpen] = useState(false);
  const colorClass = CATEGORY_COLORS[catKey] || 'bg-gray-500/20 text-gray-300 border-gray-500/30';
  const emoji = catData.emoji || '📰';
  const label = catKey.replace(/_/g, ' ');

  return (
    <div className={`rounded-xl border ${colorClass.includes('border') ? '' : 'border-white/10'} mb-3 overflow-hidden`}>
      <button
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-white/5 transition-colors"
        onClick={() => setOpen((prev) => !prev)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{emoji}</span>
          <span className="font-semibold text-white">{label}</span>
          <Badge className={`${colorClass} border text-xs`}>{catData.total_items} items</Badge>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
      </button>

      {open && (
        <div className="border-t border-white/10 divide-y divide-white/5">
          {(catData.news_items || []).map((item, i) => (
            <div key={i} className="px-4 py-3 bg-black/20">
              <div className="flex flex-wrap items-center gap-2 mb-1">
                {(item.gs_tags || []).map((tag) => (
                  <span key={tag} className={`text-xs font-bold px-2 py-0.5 rounded ${GS_TAG_COLORS[tag] || 'bg-gray-600 text-white'}`}>
                    {tag}
                  </span>
                ))}
                {item.exam_relevance && (
                  <span className="text-xs border border-yellow-500/40 text-yellow-300 px-2 py-0.5 rounded">
                    {item.exam_relevance}
                  </span>
                )}
                {item.source && (
                  <span className="text-xs text-gray-500 ml-auto">{item.source}</span>
                )}
              </div>
              {item.title && <p className="text-sm font-semibold text-white mb-1">{item.title}</p>}
              <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">{item.content}</p>
              {item.date && <p className="text-xs text-gray-500 mt-1">{item.date}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sub-component: News Record Card ────────────────────────
function NewsRecordCard({ record, onDelete }: { record: NewsRecord; onDelete: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const categories = record.categories || {};
  const fetchedDate = new Date(record.fetched_at);

  return (
    <Card className="bg-[#1a2332] border-white/10 text-white mb-4">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <Clock className="w-3.5 h-3.5" />
              <span>{fetchedDate.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-400">
              <MapPin className="w-3.5 h-3.5" />
              <span>{record.region}</span>
              {record.model_used && (
                <span className="text-xs text-gray-600">• {record.model_used}</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Newspaper className="w-4 h-4 text-blue-400" />
              <span className="text-white font-semibold">{record.total_items || 0} total news items</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded((prev) => !prev)}
              className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
            >
              {expanded ? 'Collapse' : 'View Details'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onDelete(record.id)}
              className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Category summary pills */}
        <div className="flex flex-wrap gap-2 mt-3">
          {Object.entries(categories).map(([catKey, catData]) => {
            const colorClass = CATEGORY_COLORS[catKey] || 'bg-gray-500/20 text-gray-300';
            const emoji = (catData as CategoryData).emoji || '📰';
            return (
              <span
                key={catKey}
                className={`text-xs px-2 py-1 rounded-full border ${colorClass} flex items-center gap-1`}
              >
                {emoji} {catKey.replace(/_/g, ' ')} ({(catData as CategoryData).total_items})
              </span>
            );
          })}
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0">
          <div className="border-t border-white/10 pt-4">
            {Object.entries(categories).map(([catKey, catData]) => (
              <CategoryAccordion key={catKey} catKey={catKey} catData={catData as CategoryData} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ─── Main Page ───────────────────────────────────────────────
export default function NewsManagement() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isFetching, setIsFetching] = useState(false);

  // Fetch all news records from Supabase
  const { data: newsRecords, isLoading, error } = useQuery<NewsRecord[]>({
    queryKey: ['current_affairs_news'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('current_affairs_news' as any)
        .select('*')
        .order('fetched_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return (data || []) as unknown as NewsRecord[];
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('current_affairs_news' as any).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current_affairs_news'] });
      toast({ title: 'Deleted', description: 'News record deleted successfully.' });
    },
    onError: (err: any) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Manual trigger — calls the backend API endpoint
  const handleManualFetch = async () => {
    setIsFetching(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch('/api/fetch-news', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-Admin-Secret': 'enliten-cron-secret-2025',
        },
      });

      const json = await res.json();
      if (res.ok) {
        toast({
          title: '✅ News Fetched!',
          description: `Stored ${json.total_items} news items successfully.`,
        });
        queryClient.invalidateQueries({ queryKey: ['current_affairs_news'] });
      } else {
        toast({
          title: '❌ Fetch Failed',
          description: json.error || json.details || 'Unknown error',
          variant: 'destructive',
        });
      }
    } catch (err: any) {
      toast({ title: 'Network Error', description: err.message, variant: 'destructive' });
    } finally {
      setIsFetching(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0f1623] text-white">
      {/* Header */}
      <div className="bg-[#141d2b] border-b border-white/10 px-4 sm:px-6 lg:px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/admin')}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-1" />
              Back
            </Button>
            <div>
              <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <Newspaper className="w-5 h-5 text-blue-400" />
                Current Affairs News Manager
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                Tamil Nadu · AI-powered · Sources: UPSC/TNPSC prep sites
              </p>
            </div>
          </div>

          <Button
            onClick={handleManualFetch}
            disabled={isFetching}
            className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            {isFetching ? 'Fetching…' : 'Fetch Now'}
          </Button>
        </div>
      </div>

      {/* Info banner */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl px-4 py-3 flex items-start gap-3 mb-6">
          <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
          <div className="text-sm text-blue-200">
            <span className="font-semibold">Auto-fetch:</span> The news scheduler microservice runs every 4 hours.
            You can also trigger a manual fetch anytime using the "Fetch Now" button.
            The AI uses <span className="font-mono text-blue-300">google/gemini-2.5-flash-lite</span> with
            native web search grounded on approved UPSC/TNPSC domains.
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Card className="bg-[#1a2332] border-white/10">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-white">{newsRecords?.length ?? '–'}</p>
              <p className="text-xs text-gray-400 mt-1">Stored Snapshots</p>
            </CardContent>
          </Card>
          <Card className="bg-[#1a2332] border-white/10">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-white">
                {newsRecords?.[0]?.total_items ?? '–'}
              </p>
              <p className="text-xs text-gray-400 mt-1">Latest Batch Items</p>
            </CardContent>
          </Card>
          <Card className="bg-[#1a2332] border-white/10">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-white">10</p>
              <p className="text-xs text-gray-400 mt-1">Categories</p>
            </CardContent>
          </Card>
          <Card className="bg-[#1a2332] border-white/10">
            <CardContent className="p-4">
              <p className="text-2xl font-bold text-white">4h</p>
              <p className="text-xs text-gray-400 mt-1">Auto-refresh Interval</p>
            </CardContent>
          </Card>
        </div>

        {/* News records list */}
        {isLoading && (
          <div className="flex items-center justify-center py-16 text-gray-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2" />
            Loading news records…
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span className="text-sm">Failed to load records: {(error as any).message}</span>
          </div>
        )}

        {!isLoading && !error && (!newsRecords || newsRecords.length === 0) && (
          <div className="text-center py-16">
            <Newspaper className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No news records yet.</p>
            <p className="text-gray-500 text-sm mt-1">Click "Fetch Now" to pull today's current affairs.</p>
          </div>
        )}

        {!isLoading && newsRecords && newsRecords.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <p className="text-sm text-gray-300">
                Showing <span className="text-white font-semibold">{newsRecords.length}</span> snapshots (latest first)
              </p>
            </div>
            {newsRecords.map((record) => (
              <NewsRecordCard
                key={record.id}
                record={record}
                onDelete={(id) => deleteMutation.mutate(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
