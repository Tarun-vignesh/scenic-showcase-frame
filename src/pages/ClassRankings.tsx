import { useEffect, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import Navigation from '@/components/Navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Trophy, TrendingUp, Users, Award } from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';

interface TopperData {
  name: string;
  email: string;
  department: string;
  predicted_cgpa: number;
  rank: number;
}

export default function ClassRankings() {
  const { user } = useAuth();
  const [toppers, setToppers] = useState<TopperData[]>([]);
  const [avgCGPA, setAvgCGPA] = useState<number>(0);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRankings = async () => {
      try {
        // Fetch all predictions with profiles
        const { data: predictionsData, error } = await supabase
          .from('predictions')
          .select(`
            predicted_cgpa,
            student_id,
            created_at,
            profiles!inner (
              name,
              email,
              department
            )
          `)
          .order('created_at', { ascending: false });

        if (error) {
          console.error('Error fetching predictions:', error);
          setLoading(false);
          return;
        }

        if (predictionsData && predictionsData.length > 0) {
          // Group by student and get latest prediction (highest CGPA)
          const studentMap = new Map();
          
          predictionsData.forEach((pred: any) => {
            const existing = studentMap.get(pred.student_id);
            // Keep the prediction with highest CGPA for each student
            if (!existing || existing.predicted_cgpa < pred.predicted_cgpa) {
              studentMap.set(pred.student_id, {
                student_id: pred.student_id,
                predicted_cgpa: pred.predicted_cgpa,
                name: pred.profiles.name,
                email: pred.profiles.email,
                department: pred.profiles.department,
              });
            }
          });

          // Convert to array and sort by CGPA descending
          const rankedStudents = Array.from(studentMap.values())
            .sort((a, b) => b.predicted_cgpa - a.predicted_cgpa)
            .map((student, index) => ({
              ...student,
              rank: index + 1,
            }));

          console.log('Ranked students:', rankedStudents.length, rankedStudents);

          // Get top 10
          const top10 = rankedStudents.slice(0, 10);
          setToppers(top10);

          // Calculate average across all students
          const total = rankedStudents.reduce((sum, s) => sum + s.predicted_cgpa, 0);
          setAvgCGPA(rankedStudents.length > 0 ? total / rankedStudents.length : 0);

          // Find user's rank
          const userEntry = rankedStudents.find(s => s.student_id === user?.id);
          if (userEntry) {
            setUserRank(userEntry.rank);
          }
        }
      } catch (error) {
        console.error('Error in fetchRankings:', error);
      }

      setLoading(false);
    };

    if (user) {
      fetchRankings();
    }
  }, [user]);

  const getMedalColor = (rank: number) => {
    if (rank === 1) return 'text-yellow-500';
    if (rank === 2) return 'text-gray-400';
    if (rank === 3) return 'text-orange-600';
    return 'text-muted-foreground';
  };

  const getMedalIcon = (rank: number) => {
    if (rank <= 3) {
      return <Trophy className={`w-6 h-6 ${getMedalColor(rank)}`} />;
    }
    return null;
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="container mx-auto p-8">
          <div className="text-center">Loading rankings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      
      <div className="container mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            Class Rankings
          </h1>
          <p className="text-muted-foreground">
            Top performers and institution statistics
          </p>
        </div>

        {/* Statistics Cards */}
        <div className="grid gap-6 md:grid-cols-3 mb-8">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Institution Average
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold gradient-text">
                {avgCGPA.toFixed(2)}
              </div>
              <p className="text-sm text-muted-foreground mt-1">CGPA</p>
            </CardContent>
          </Card>

          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-500" />
                Top Score
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold gradient-text">
                {toppers[0]?.predicted_cgpa.toFixed(2) || 'N/A'}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                {toppers[0]?.name || 'No data'}
              </p>
            </CardContent>
          </Card>

          {userRank && (
            <Card className="glass-card border-primary/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="w-5 h-5" />
                  Your Rank
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold gradient-text">
                  #{userRank}
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  Out of {toppers.length} students
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Toppers List */}
        <Card className="glass-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Top 10 Students
            </CardTitle>
            <CardDescription>
              Highest predicted CGPA rankings
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {toppers.map((topper) => (
                <div
                  key={topper.email}
                  className={`flex items-center gap-4 p-4 rounded-lg border transition-colors ${
                    topper.email === user?.email
                      ? 'bg-primary/10 border-primary/50'
                      : 'bg-card/50 border-border/50'
                  }`}
                >
                  <div className="flex items-center justify-center w-12">
                    {getMedalIcon(topper.rank) || (
                      <span className="text-xl font-bold text-muted-foreground">
                        {topper.rank}
                      </span>
                    )}
                  </div>

                  <Avatar className="h-12 w-12">
                    <AvatarFallback className="bg-primary/20 text-primary font-semibold">
                      {topper.name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{topper.name}</h3>
                      {topper.email === user?.email && (
                        <Badge variant="default" className="text-xs">You</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{topper.department}</p>
                  </div>

                  <div className="text-right">
                    <div className="text-2xl font-bold gradient-text">
                      {topper.predicted_cgpa.toFixed(2)}
                    </div>
                    <p className="text-xs text-muted-foreground">CGPA</p>
                  </div>
                </div>
              ))}

              {toppers.length === 0 && (
                <div className="text-center py-8 text-muted-foreground">
                  No ranking data available yet
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
