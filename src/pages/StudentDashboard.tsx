import { useEffect, useState, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import Navigation from '@/components/Navigation';
import CGPAGauge from '@/components/CGPAGauge';
import PredictionAnalysis from '@/components/PredictionAnalysis';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TrendingUp, TrendingDown, Minus, BookOpen, Target, Brain, Trophy, RefreshCw } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer } from 'recharts';
import { useLinearRegression } from '@/hooks/useLinearRegression';
import { extractStudentFeatures, calculateCurrentCGPA, type StudentFeatures } from '@/lib/linearRegression';

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [prediction, setPrediction] = useState<any>(null);
  const [scores, setScores] = useState<any[]>([]);
  const [performance, setPerformance] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState<any>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [showAnalysis, setShowAnalysis] = useState(false);
  
  const { calculateLocalPrediction, fetchServerPrediction, isLoading: isPredicting } = useLinearRegression();

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
      setProfile(profileData);

      // Fetch latest prediction
      const { data: predData } = await supabase
        .from('predictions')
        .select('*')
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setPrediction(predData);

      // Fetch scores with course info matching user's semester and department
      const { data: scoresData } = await supabase
        .from('scores')
        .select(`
          *,
          courses!inner (
            course_name,
            credits,
            is_lab,
            semester,
            department
          )
        `)
        .eq('student_id', user.id)
        .eq('courses.semester', profileData?.semester || 1)
        .eq('courses.department', profileData?.department);
      setScores(scoresData || []);

      // Fetch performance factors with courses matching user's semester and department
      const { data: perfData } = await supabase
        .from('performance_factors')
        .select(`
          *,
          courses!inner (
            course_name,
            course_code,
            is_lab,
            semester,
            department
          )
        `)
        .eq('student_id', user.id)
        .eq('courses.semester', profileData?.semester || 1)
        .eq('courses.department', profileData?.department);
      
      // Filter to show exactly 5 theory and 3 labs
      const theorySubjects = (perfData || []).filter(p => !p.courses?.is_lab).slice(0, 5);
      const labSubjects = (perfData || []).filter(p => p.courses?.is_lab).slice(0, 3);
      setPerformance([...theorySubjects, ...labSubjects]);

      setLoading(false);
    };

    fetchData();
  }, [user]);
  // Calculate linear regression prediction (must be before any early returns)
  const regressionPrediction = useMemo(() => {
    if (performance.length === 0 && scores.length === 0) return null;
    return calculateLocalPrediction(performance, scores);
  }, [performance, scores, calculateLocalPrediction]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Navigation />
        <div className="container mx-auto p-8">
          <div className="text-center">Loading dashboard...</div>
        </div>
      </div>
    );
  }

  const getTrendIcon = (trend: string) => {
    if (trend === 'Improving') return <TrendingUp className="w-4 h-4 text-green-500" />;
    if (trend === 'Declining') return <TrendingDown className="w-4 h-4 text-red-500" />;
    return <Minus className="w-4 h-4 text-yellow-500" />;
  };

  const calculateEngagement = (attendance: number, studyHours: number) => {
    const IDEAL_STUDY_HOURS = 3;
    const studyHourRatio = (studyHours / IDEAL_STUDY_HOURS) * 100;
    const engagement = (0.4 * attendance) + (0.6 * studyHourRatio);
    return Math.min(Math.round(engagement), 100);
  };

  // Handle recalculate prediction
  const handleRecalculatePrediction = async () => {
    if (!user) return;
    const result = await fetchServerPrediction(user.id);
    if (result) {
      setPrediction((prev: any) => ({
        ...prev,
        predicted_cgpa: result.predicted_cgpa,
        recommendation: result.recommendation,
        focus_subject: result.focus_subject,
      }));
    }
  };

  const handleCourseClick = (perf: any) => {
    setSelectedCourse(perf);
    setIsDialogOpen(true);
  };

  const getCoursePieData = (perf: any) => {
    const courseScore = scores.find(s => s.course_id === perf.course_id);
    const data = [];
    
    if (courseScore?.exam1_score) data.push({ name: 'Exam 1', value: courseScore.exam1_score });
    if (courseScore?.exam2_score) data.push({ name: 'Exam 2', value: courseScore.exam2_score });
    if (courseScore?.exam3_score) data.push({ name: 'Exam 3', value: courseScore.exam3_score });
    if (courseScore?.final_score) data.push({ name: 'Final', value: courseScore.final_score });
    
    return data;
  };

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--destructive))'];

  const chartData = performance.map(p => ({
    subject: p.courses?.course_name || 'Unknown',
    attendance: p.attendance,
    engagement: calculateEngagement(p.attendance, p.study_hours_weekly || 0),
    studyHours: p.study_hours_weekly || 0
  }));

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation />
      
      <div className="container mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold gradient-text mb-2">
            Welcome, {profile?.name}!
          </h1>
          <p className="text-muted-foreground">
            {profile?.department} • Semester {profile?.semester}
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-8">
          {/* CGPA Gauge */}
          <div className="md:col-span-2 lg:col-span-1">
            <CGPAGauge value={prediction?.predicted_cgpa || 0} />
          </div>

          {/* Key Metrics */}
          <Card className="glass-card cursor-pointer hover:border-primary/50 transition-colors" onClick={() => navigate('/class-rankings')}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Trophy className="w-5 h-5" />
                Rankings
              </CardTitle>
              <CardDescription>Click to view full rankings</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Institution Average</span>
                  <span className="font-bold">{prediction?.predicted_average?.toFixed(1)}%</span>
                </div>
                <Progress value={prediction?.predicted_average || 0} className="h-2" />
              </div>
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>Topper Score</span>
                  <span className="font-bold">{prediction?.predicted_topper?.toFixed(1)}%</span>
                </div>
                <Progress value={prediction?.predicted_topper || 0} className="h-2" />
              </div>
            </CardContent>
          </Card>

          {/* Recommendation */}
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="w-5 h-5" />
                AI Recommendation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm">
                {prediction?.recommendation || 'Complete your scores to get personalized recommendations.'}
              </p>
              {prediction?.focus_subject && (
                <div className="mt-4">
                  <span className="text-xs text-muted-foreground">Focus Subject:</span>
                  <Badge variant="destructive" className="ml-2">
                    {prediction.focus_subject}
                  </Badge>
                </div>
              )}
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRecalculatePrediction}
                  disabled={isPredicting}
                  className="w-full"
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${isPredicting ? 'animate-spin' : ''}`} />
                  {isPredicting ? 'Recalculating...' : 'Recalculate'}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Linear Regression Analysis */}
        {regressionPrediction && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold gradient-text">Prediction Analysis</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAnalysis(!showAnalysis)}
              >
                {showAnalysis ? 'Hide Details' : 'Show Details'}
              </Button>
            </div>
            {showAnalysis && (
              <PredictionAnalysis
                predictedCGPA={regressionPrediction.predictedCGPA}
                currentCGPA={regressionPrediction.currentCGPA}
                features={regressionPrediction.features}
                recommendation={regressionPrediction.recommendation}
                focusSubject={regressionPrediction.focusSubject}
              />
            )}
          </div>
        )}

        {/* Performance Trends */}
        {performance.length > 0 && (
          <Card className="glass-card mb-8">
            <CardHeader>
              <CardTitle>Subject-wise Performance</CardTitle>
              <CardDescription>Track your attendance, engagement, and study hours</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="subject" angle={-45} textAnchor="end" height={100} />
                  <YAxis />
                  <RechartsTooltip />
                  <Legend />
                  <Bar dataKey="attendance" fill="hsl(var(--primary))" name="Attendance %" />
                  <Bar dataKey="engagement" fill="hsl(var(--secondary))" name="Engagement %" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        {/* Subject Details */}
        {performance.length > 0 && (
          <>
            {/* Theory Subjects */}
            {performance.filter(p => !p.courses?.is_lab).length > 0 && (
              <div className="mb-8">
                <h2 className="text-2xl font-bold mb-4 gradient-text">Theory Subjects ({performance.filter(p => !p.courses?.is_lab).length})</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {performance.filter(p => !p.courses?.is_lab).map((perf) => (
                    <Card 
                      key={perf.id} 
                      className="glass-card border-primary/20 cursor-pointer hover:border-primary/50 transition-all"
                      onClick={() => handleCourseClick(perf)}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            {perf.courses?.course_name}
                          </span>
                          {getTrendIcon(perf.trend)}
                        </CardTitle>
                        <CardDescription className="text-xs">{perf.courses?.course_code}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <p className="text-muted-foreground">Attendance</p>
                            <p className="text-lg font-bold">{perf.attendance}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Engagement</p>
                            <p className="text-lg font-bold">{calculateEngagement(perf.attendance, perf.study_hours_weekly || 0)}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Study Hours</p>
                            <p className="text-lg font-bold">{((perf.study_hours_weekly || 0) / 7).toFixed(1)}h/day</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground">Trend</p>
                            <Badge variant={perf.trend === 'Improving' ? 'default' : perf.trend === 'Declining' ? 'destructive' : 'secondary'}>
                              {perf.trend}
                            </Badge>
                          </div>
                        </div>
                        {(() => {
                          const courseScore = scores.find(s => s.course_id === perf.course_id);
                          if (courseScore) {
                            return (
                              <div className="pt-3 border-t border-border/50">
                                <p className="text-xs text-muted-foreground mb-2 font-medium">Exam Scores</p>
                                <div className="grid grid-cols-4 gap-2 text-sm">
                                  {courseScore.exam1_score !== null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Exam 1</p>
                                      <p className="font-bold">{courseScore.exam1_score}</p>
                                    </div>
                                  )}
                                  {courseScore.exam2_score !== null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Exam 2</p>
                                      <p className="font-bold">{courseScore.exam2_score}</p>
                                    </div>
                                  )}
                                  {courseScore.exam3_score !== null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Exam 3</p>
                                      <p className="font-bold">{courseScore.exam3_score}</p>
                                    </div>
                                  )}
                                  {courseScore.final_score !== null && (
                                    <div className="text-center">
                                      <p className="text-xs text-muted-foreground">Final</p>
                                      <p className="font-bold">{courseScore.final_score}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Lab Subjects */}
            {performance.filter(p => p.courses?.is_lab).length > 0 && (
              <div>
                <h2 className="text-2xl font-bold mb-4 gradient-text">Laboratory Subjects ({performance.filter(p => p.courses?.is_lab).length})</h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {performance.filter(p => p.courses?.is_lab).map((perf) => (
                    <Card 
                      key={perf.id} 
                      className="glass-card border-secondary/20 cursor-pointer hover:border-secondary/50 transition-all"
                      onClick={() => handleCourseClick(perf)}
                    >
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-base">
                          <span className="flex items-center gap-2">
                            <BookOpen className="w-4 h-4" />
                            {perf.courses?.course_name}
                          </span>
                          {getTrendIcon(perf.trend)}
                        </CardTitle>
                        <CardDescription className="text-xs">{perf.courses?.course_code}</CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Attendance</p>
                            <p className="text-base font-bold">{perf.attendance}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Engagement</p>
                            <p className="text-base font-bold">{calculateEngagement(perf.attendance, perf.study_hours_weekly || 0)}%</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Study Hours</p>
                            <p className="text-base font-bold">{((perf.study_hours_weekly || 0) / 7).toFixed(1)}h/day</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Trend</p>
                            <Badge variant={perf.trend === 'Improving' ? 'default' : perf.trend === 'Declining' ? 'destructive' : 'secondary'} className="text-xs">
                              {perf.trend}
                            </Badge>
                          </div>
                        </div>
                        {(() => {
                          const courseScore = scores.find(s => s.course_id === perf.course_id);
                          if (courseScore) {
                            return (
                              <div className="pt-2 border-t border-border/50">
                                <p className="text-xs text-muted-foreground mb-2 font-medium">Exam Scores</p>
                                <div className="grid grid-cols-4 gap-1 text-xs">
                                  {courseScore.exam1_score !== null && (
                                    <div className="text-center">
                                      <p className="text-[10px] text-muted-foreground">E1</p>
                                      <p className="font-bold">{courseScore.exam1_score}</p>
                                    </div>
                                  )}
                                  {courseScore.exam2_score !== null && (
                                    <div className="text-center">
                                      <p className="text-[10px] text-muted-foreground">E2</p>
                                      <p className="font-bold">{courseScore.exam2_score}</p>
                                    </div>
                                  )}
                                  {courseScore.exam3_score !== null && (
                                    <div className="text-center">
                                      <p className="text-[10px] text-muted-foreground">E3</p>
                                      <p className="font-bold">{courseScore.exam3_score}</p>
                                    </div>
                                  )}
                                  {courseScore.final_score !== null && (
                                    <div className="text-center">
                                      <p className="text-[10px] text-muted-foreground">Final</p>
                                      <p className="font-bold">{courseScore.final_score}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </>
        )}


        {performance.length === 0 && (
          <Card className="glass-card">
            <CardContent className="text-center py-12">
              <BookOpen className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-semibold mb-2">No Performance Data Yet</h3>
              <p className="text-muted-foreground">
                Start tracking your performance by adding scores and study metrics.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Course Details Dialog */}
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <BookOpen className="w-5 h-5" />
                {selectedCourse?.courses?.course_name}
              </DialogTitle>
            </DialogHeader>
            {selectedCourse && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Course Code</p>
                    <p className="font-semibold">{selectedCourse.courses?.course_code}</p>
                  </div>
                  <div className="space-y-2">
                    <p className="text-sm text-muted-foreground">Type</p>
                    <Badge variant={selectedCourse.courses?.is_lab ? "secondary" : "default"}>
                      {selectedCourse.courses?.is_lab ? "Laboratory" : "Theory"}
                    </Badge>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Attendance</p>
                    <p className="text-2xl font-bold">{selectedCourse.attendance}%</p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Engagement</p>
                    <p className="text-2xl font-bold">
                      {calculateEngagement(selectedCourse.attendance, selectedCourse.study_hours_weekly || 0)}%
                    </p>
                  </div>
                  <div className="text-center">
                    <p className="text-sm text-muted-foreground mb-1">Study Hours</p>
                    <p className="text-2xl font-bold">
                      {((selectedCourse.study_hours_weekly || 0) / 7).toFixed(1)}h/day
                    </p>
                  </div>
                </div>

                {getCoursePieData(selectedCourse).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-4">Exam Performance</h3>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={getCoursePieData(selectedCourse)}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, value }) => `${name}: ${value}`}
                          outerRadius={100}
                          fill="hsl(var(--primary))"
                          dataKey="value"
                        >
                          {getCoursePieData(selectedCourse).map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <RechartsTooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}

                <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">Trend:</span>
                    <Badge variant={
                      selectedCourse.trend === 'Improving' ? 'default' : 
                      selectedCourse.trend === 'Declining' ? 'destructive' : 
                      'secondary'
                    }>
                      {getTrendIcon(selectedCourse.trend)}
                      <span className="ml-1">{selectedCourse.trend}</span>
                    </Badge>
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
