'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Brain, Check, Clock3, Crosshair, Flame, Gauge, Layers3, RotateCcw, Sparkles, TimerReset, Type, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

declare global {
  interface Document {
    modelContext?: {
      registerTool: (tool: {
        name: string;
        title: string;
        description: string;
        inputSchema: object;
        annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
        execute: (input: unknown) => unknown;
      }, options?: { signal?: AbortSignal }) => void | Promise<void>;
    };
  }
}

type Step = 'goal' | 'difficulty' | 'ready' | 'game' | 'result' | 'mission';
type Goal = 'study' | 'speed' | 'accuracy';
type Difficulty = 'easy' | 'medium' | 'hard';
type Result = { score: number; points: number; mode: Difficulty; accuracy: number; reaction: number; correct: number; wrong: number; missed: number };
type GameTile = { color: string; label?: string; isTarget: boolean };

const GOALS: Array<{ id: Goal; title: string; description: string; icon: typeof Brain }> = [
  { id: 'study', title: 'Ders çalışırken odaklanmak', description: 'Dikkatini daha uzun süre tek noktada tut.', icon: Brain },
  { id: 'speed', title: 'Daha hızlı düşünmek', description: 'Doğru kararı daha kısa sürede ver.', icon: Zap },
  { id: 'accuracy', title: 'Dikkat hatalarını azaltmak', description: 'Acele etmeden doğru hedefi yakala.', icon: Crosshair },
];
const COLORS = ['#c5ff4a', '#ff6b54', '#70a8ff', '#f1c94b'];
const EXTENDED_COLORS = ['#ff6b54', '#70a8ff', '#f1c94b', '#b078ff', '#ff78bd', '#38d9c5', '#ff934f'];
const COLOR_WORDS = ['YEŞİL', 'KIRMIZI', 'MAVİ', 'SARI', 'MOR', 'PEMBE', 'TURKUAZ'];
const DIFFICULTIES: Array<{ id: Difficulty; title: string; description: string; scoring: string; icon: typeof Gauge }> = [
  { id: 'easy', title: 'Kolay', description: '4 renk ve düzenli dağılım', scoring: '+10 doğru · −3 yanlış', icon: Gauge },
  { id: 'medium', title: 'Orta', description: '8 renk ve tamamen rastgele dağılım', scoring: '+15 doğru · −5 yanlış', icon: Layers3 },
  { id: 'hard', title: 'Zor', description: 'Kelime ile yazı rengi birbiriyle çelişir', scoring: '+20 doğru · −7 yanlış', icon: Type },
];
const GAME_SECONDS = 30;

function createBoard(difficulty: Difficulty, targetIndex = Math.floor(Math.random() * 9), round = 0): GameTile[] {
  return Array.from({ length: 9 }, (_, index) => {
    const isTarget = index === targetIndex;
    if (difficulty === 'easy') return { isTarget, color: isTarget ? COLORS[0] : COLORS[((index + round) % 3) + 1] };
    if (difficulty === 'medium') return { isTarget, color: isTarget ? COLORS[0] : EXTENDED_COLORS[Math.floor(Math.random() * EXTENDED_COLORS.length)] };
    const inkPalette = [COLORS[0], ...EXTENDED_COLORS];
    const inkColor = inkPalette[Math.floor(Math.random() * inkPalette.length)];
    const distractorWords = COLOR_WORDS.filter((word) => word !== 'YEŞİL');
    return { isTarget, color: inkColor, label: isTarget ? 'YEŞİL' : distractorWords[Math.floor(Math.random() * distractorWords.length)] };
  });
}

function getFeedback(result: Result) {
  if (result.accuracy < 70 && result.reaction < 550) return { title: 'Hızın yüksek, kontrolü güçlendirelim.', body: 'Hızlı karar veriyorsun fakat acele etmek hata oranını artırıyor. Bir sonraki turda ilk dürtünü yarım saniye beklet.' };
  if (result.accuracy >= 85 && result.reaction > 700) return { title: 'Dikkatin güçlü, sıra hızda.', body: 'Hedefleri doğru ayırt ediyorsun. Aynı doğruluğu korurken tepki süreni biraz kısaltmayı deneyebilirsin.' };
  if (result.missed > result.wrong + 2) return { title: 'Dikkatini sürdürme kasını çalıştıralım.', body: 'Yanlış seçimden çok hedef kaçırdın. Kısa ve kesintisiz çalışma blokları senin için daha etkili olabilir.' };
  return { title: 'Hız ve doğruluk dengende.', body: 'Kararlarını kontrollü ve istikrarlı verdin. Şimdi bu odağı gerçek bir çalışma görevine taşıma zamanı.' };
}

export default function Home() {
  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<Goal>('study');
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [seconds, setSeconds] = useState(GAME_SECONDS);
  const [round, setRound] = useState(0);
  const [board, setBoard] = useState<GameTile[]>(() => createBoard('easy', 2, 0));
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [missed, setMissed] = useState(0);
  const [reactions, setReactions] = useState<number[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [missionSeconds, setMissionSeconds] = useState(600);
  const [missionActive, setMissionActive] = useState(false);
  const [distractions, setDistractions] = useState(0);
  const [missionDone, setMissionDone] = useState(false);
  const [bestScores, setBestScores] = useState<Record<Difficulty, number>>({ easy: 0, medium: 0, hard: 0 });
  const spawnedAt = useRef(Date.now());
  const finishGameRef = useRef<() => void>(() => undefined);
  const transitionLocked = useRef(false);

  const resetGame = useCallback(() => {
    setSeconds(GAME_SECONDS); setRound(0); setBoard(createBoard(difficulty, 2, 0)); transitionLocked.current = false;
    setCorrect(0); setWrong(0); setMissed(0); setReactions([]); setResult(null);
    spawnedAt.current = Date.now();
  }, [difficulty]);

  const finishGame = useCallback(() => {
    const total = correct + wrong + missed;
    const accuracy = total ? Math.round((correct / total) * 100) : 0;
    const reaction = reactions.length ? Math.round(reactions.reduce((sum, value) => sum + value, 0) / reactions.length) : 0;
    const speedScore = reaction ? Math.max(0, Math.min(100, 120 - reaction / 8)) : 0;
    const values = difficulty === 'easy' ? { correct: 10, wrong: 3, missed: 1 } : difficulty === 'medium' ? { correct: 15, wrong: 5, missed: 2 } : { correct: 20, wrong: 7, missed: 3 };
    const points = Math.max(0, correct * values.correct - wrong * values.wrong - missed * values.missed);
    const nextResult = { score: Math.round(accuracy * 0.7 + speedScore * 0.3), points, mode: difficulty, accuracy, reaction, correct, wrong, missed };
    setResult(nextResult); localStorage.setItem('focusbridge-last-result', JSON.stringify(nextResult));
    setBestScores((current) => { const next = { ...current, [difficulty]: Math.max(current[difficulty], points) }; localStorage.setItem('focusbridge-best-scores', JSON.stringify(next)); return next; });
    setStep('result');
  }, [correct, difficulty, missed, reactions, wrong]);
  finishGameRef.current = finishGame;

  useEffect(() => {
    if (step !== 'game') return;
    if (seconds <= 0) { finishGameRef.current(); return; }
    const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [seconds, step]);

  useEffect(() => {
    const saved = localStorage.getItem('focusbridge-best-scores');
    if (saved) {
      try { setBestScores({ easy: 0, medium: 0, hard: 0, ...JSON.parse(saved) }); } catch { /* Bozuk yerel veri oyunu engellemez. */ }
    }
  }, []);

  useEffect(() => {
    if (!missionActive || missionSeconds <= 0) return;
    const timer = window.setTimeout(() => setMissionSeconds((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [missionActive, missionSeconds]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    const validGoals: Goal[] = ['study', 'speed', 'accuracy'];
    const validDifficulties: Difficulty[] = ['easy', 'medium', 'hard'];
    void Promise.resolve(context.registerTool({
      name: 'start_focus_training',
      title: 'Odak antrenmanı başlat',
      description: 'Kullanıcının hedefini seçer ve görünür dikkat antrenmanı hazırlık ekranını açar.',
      inputSchema: {
        type: 'object', properties: { goal: { type: 'string', enum: validGoals }, difficulty: { type: 'string', enum: validDifficulties } },
        required: ['goal', 'difficulty'], additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute(input: unknown) {
        const value = (input as { goal?: unknown })?.goal;
        const level = (input as { difficulty?: unknown })?.difficulty;
        if (typeof value !== 'string' || !validGoals.includes(value as Goal)) throw new Error('Geçersiz hedef.');
        if (typeof level !== 'string' || !validDifficulties.includes(level as Difficulty)) throw new Error('Geçersiz zorluk modu.');
        setGoal(value as Goal); setDifficulty(level as Difficulty); setStep('ready');
        return { status: 'ready', goal: value, difficulty: level };
      },
    }, { signal: lifecycle.signal })).catch(() => undefined);
    return () => lifecycle.abort();
  }, []);

  const feedback = useMemo(() => result ? getFeedback(result) : null, [result]);
  const selectedGoal = GOALS.find((item) => item.id === goal) ?? GOALS[0];
  const SelectedGoalIcon = selectedGoal.icon;
  const selectedDifficulty = DIFFICULTIES.find((item) => item.id === difficulty) ?? DIFFICULTIES[0];
  const SelectedDifficultyIcon = selectedDifficulty.icon;
  const startGame = () => { resetGame(); setStep('game'); };
  const handleTile = (index: number) => {
    if (transitionLocked.current) return;
    transitionLocked.current = true;
    if (board[index]?.isTarget) { setCorrect((value) => value + 1); setReactions((values) => [...values, Date.now() - spawnedAt.current]); }
    else setWrong((value) => value + 1);
    setRound((value) => { const next = value + 1; setBoard(createBoard(difficulty, undefined, next)); return next; });
    spawnedAt.current = Date.now();
    window.setTimeout(() => { transitionLocked.current = false; }, 80);
  };
  const restart = () => {
    resetGame(); setStep('goal'); setMissionSeconds(600); setMissionActive(false); setDistractions(0); setMissionDone(false);
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="noise" aria-hidden="true" />
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8">
        <button className="flex items-center gap-3" onClick={restart} aria-label="Ana ekrana dön">
          <span className="logo-mark"><Brain className="size-5" /></span><span className="text-lg font-black tracking-[-0.04em]">focusbridge</span>
        </button>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/65"><Flame className="size-4 text-[#f1c94b]" /><span>Bugünkü seri</span><strong className="text-white">1</strong></div>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 px-5 pb-10 sm:px-8">
        <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
          <div className="game-shell min-h-[640px]">
            <div className="mb-8 flex items-center justify-between gap-4">
              <div className="flex gap-2" aria-label="İlerleme">
                {(['goal', 'difficulty', 'ready', 'game', 'result', 'mission'] as Step[]).map((item, index) => {
                  const currentIndex = ['goal', 'difficulty', 'ready', 'game', 'result', 'mission'].indexOf(step);
                  return <span key={item} className={`step-dot ${index <= currentIndex ? 'active' : ''}`} />;
                })}
              </div>
              <span className="eyebrow">Günlük antrenman · 01</span>
            </div>

            {step === 'goal' && <div className="animate-in">
              <p className="eyebrow mb-3 text-[#c5ff4a]">Bugün neyi güçlendirelim?</p>
              <h1 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-6xl">Odağını seç.<br /><span className="text-white/35">Gerisini birlikte ölçelim.</span></h1>
              <div className="mt-10 grid gap-3">
                {GOALS.map((item) => { const Icon = item.icon; const selected = goal === item.id; return (
                  <button key={item.id} onClick={() => setGoal(item.id)} className={`goal-card ${selected ? 'selected' : ''}`} aria-pressed={selected}>
                    <span className="goal-icon"><Icon className="size-5" /></span>
                    <span className="min-w-0 text-left"><strong className="block text-base sm:text-lg">{item.title}</strong><span className="mt-1 block text-sm text-white/50">{item.description}</span></span>
                    <span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full border border-white/15">{selected && <Check className="size-4 text-[#07110d]" />}</span>
                  </button> ); })}
              </div>
              <Button className="primary-cta mt-8" size="lg" onClick={() => setStep('difficulty')}>Zorluk seç <ArrowRight /></Button>
            </div>}

            {step === 'difficulty' && <div className="animate-in">
              <p className="eyebrow mb-3 text-[#c5ff4a]">Zorluk modu</p>
              <h1 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-6xl">Kendine uygun<br /><span className="text-white/35">meydan okumayı seç.</span></h1>
              <div className="mt-10 grid gap-3 sm:grid-cols-3">
                {DIFFICULTIES.map((item) => { const Icon = item.icon; const selected = difficulty === item.id; return (
                  <button key={item.id} onClick={() => setDifficulty(item.id)} className={`difficulty-card ${selected ? 'selected' : ''}`} aria-pressed={selected}>
                    <span className="difficulty-icon"><Icon className="size-5" /></span>
                    <strong>{item.title}</strong><span>{item.description}</span><small>{item.scoring}</small>
                  </button>
                ); })}
              </div>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button variant="outline" size="lg" className="h-12 border-white/15 bg-white/[0.04] px-5 text-white hover:bg-white/10" onClick={() => setStep('goal')}>Geri dön</Button>
                <Button className="primary-cta" size="lg" onClick={() => setStep('ready')}>Modu seç <ArrowRight /></Button>
              </div>
            </div>}

            {step === 'ready' && <div className="animate-in flex min-h-[500px] flex-col items-center justify-center text-center">
              {difficulty === 'hard' ? <div className="stroop-demo" style={{ color: '#ff6b54' }}>YEŞİL</div> : <div className="target-demo"><span /></div>}
              <p className="eyebrow mt-8 text-[#c5ff4a]">{selectedDifficulty.title} mod</p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">{difficulty === 'hard' ? 'Rengi değil, kelimeyi takip et.' : 'Yalnızca yeşil hedefe dokun.'}</h1>
              <p className="mt-4 max-w-lg text-base leading-7 text-white/55">{difficulty === 'hard' ? 'Yazının rengi seni yanıltacak. Hangi renkte görünürse görünsün, yalnızca “YEŞİL” yazan kelimeye dokun.' : difficulty === 'medium' ? 'Sekiz renk her turda rastgele yer değiştirecek. 30 saniye boyunca doğru yeşili yakala.' : 'Diğer renkler düzenli dağılır. 30 saniye boyunca hem hızını hem doğruluğunu ölçeceğiz.'}</p>
              <Button className="primary-cta mt-8" size="lg" onClick={startGame}>Başlat <Zap /></Button>
            </div>}

            {step === 'game' && <div className="animate-in">
              <div className="mb-5 flex items-end justify-between"><div><p className="eyebrow text-[#c5ff4a]">{selectedDifficulty.title} · {difficulty === 'hard' ? 'YEŞİL kelimesini yakala' : 'Yeşili yakala'}</p><h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">Dikkatini hedefte tut.</h1></div><div className="text-right"><span className="block font-mono text-3xl font-bold tabular-nums">00:{String(seconds).padStart(2, '0')}</span><span className="text-sm text-white/45">kalan süre</span></div></div>
              <Progress value={(seconds / GAME_SECONDS) * 100} className="game-progress mb-6" />
              <div className="tile-grid" aria-label="Dikkat oyunu alanı">
                {board.map((tile, index) => (
                  <button key={`${round}-${index}`} className={`game-tile ${difficulty !== 'hard' && tile.isTarget ? 'target' : ''} ${difficulty === 'hard' ? 'word-tile' : ''}`} onClick={() => handleTile(index)} aria-label={difficulty === 'hard' ? `${tile.label} yazısı` : 'Renkli hedef'}>
                    {difficulty === 'hard' ? <strong style={{ color: tile.color }}>{tile.label}</strong> : <span style={{ backgroundColor: tile.color }} />}
                  </button>
                ))}
              </div>
              <div className="mt-5 flex justify-between text-sm text-white/50"><span>Doğru <strong className="text-white">{correct}</strong></span><span>Hata <strong className="text-white">{wrong}</strong></span></div>
            </div>}

            {step === 'result' && result && feedback && <div className="animate-in">
              <p className="eyebrow text-[#c5ff4a]">Antrenman tamamlandı</p>
              <div className="mt-5 grid gap-6 sm:grid-cols-[200px_1fr] sm:items-center">
                <div className="score-ring" style={{ '--score': `${result.score * 3.6}deg` } as React.CSSProperties}><div><strong>{result.score}</strong><span>/100</span></div></div>
                <div><h1 className="text-3xl font-black leading-tight tracking-[-0.045em] sm:text-4xl">{feedback.title}</h1><p className="mt-4 leading-7 text-white/58">{feedback.body}</p></div>
              </div>
              <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label={`${selectedDifficulty.title} puanı`} value={String(result.points)} /><Metric label="Doğruluk" value={`%${result.accuracy}`} /><Metric label="Tepki" value={`${result.reaction} ms`} /><Metric label="Yanlış" value={String(result.wrong)} /></div>
              <div className="insight-card mt-6"><Sparkles className="size-5 text-[#c5ff4a]" /><div><strong>Bugünün içgörüsü</strong><p>{result.accuracy >= 80 ? 'Dikkatini doğru hedefe taşıyabiliyorsun. Şimdi bunu 10 dakikalık kesintisiz bir çalışma bloğuna aktar.' : 'Hızı biraz düşürmek hata oranını azaltabilir. Gerçek görevde önce doğruluğa odaklan.'}</p></div></div>
              <Button className="primary-cta mt-7" size="lg" onClick={() => setStep('mission')}>Gerçek hayata taşı <ArrowRight /></Button>
            </div>}

            {step === 'mission' && <div className="animate-in flex min-h-[510px] flex-col items-center justify-center text-center">
              {!missionDone ? <>
                <div className={`mission-clock ${missionActive ? 'active' : ''}`}><Clock3 className="size-7" /><strong>{String(Math.floor(missionSeconds / 60)).padStart(2, '0')}:{String(missionSeconds % 60).padStart(2, '0')}</strong></div>
                <p className="eyebrow mt-8 text-[#c5ff4a]">Gerçek hayat görevi</p><h1 className="mt-3 max-w-xl text-4xl font-black tracking-[-0.05em]">10 dakika, tek konu, sıfır bildirim.</h1>
                <p className="mt-4 max-w-lg leading-7 text-white/55">Telefonunu sessize al ve tek bir ders konusuna çalış. Dikkatin dağıldığında aşağıdaki butona dokun.</p>
                {!missionActive ? <Button className="primary-cta mt-7" size="lg" onClick={() => setMissionActive(true)}>Görevi başlat <TimerReset /></Button> :
                  <div className="mt-7 flex flex-wrap justify-center gap-3"><Button variant="outline" size="lg" className="h-12 border-white/15 bg-white/[0.04] px-5 text-white hover:bg-white/10" onClick={() => setDistractions((value) => value + 1)}>Dikkatim dağıldı · {distractions}</Button><Button className="primary-cta" size="lg" onClick={() => { setMissionDone(true); setMissionActive(false); localStorage.setItem('focusbridge-mission-done', 'true'); }}>Tamamladım <Check /></Button></div>}
              </> : <>
                <div className="success-mark"><Check className="size-10" /></div><p className="eyebrow mt-8 text-[#c5ff4a]">Köprü kuruldu</p>
                <h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Oyun bitti. Kazanım gerçek hayatta.</h1>
                <p className="mt-4 max-w-lg leading-7 text-white/55">Bu seansta dikkatinin {distractions} kez dağıldığını fark ettin. Fark etmek, kontrol etmenin ilk adımı.</p>
                <Button variant="outline" size="lg" className="mt-7 h-12 border-white/15 bg-white/[0.04] px-5 text-white hover:bg-white/10" onClick={restart}>Yeniden dene <RotateCcw /></Button>
              </>}
            </div>}
          </div>

          <aside className="side-panel">
            <div><p className="eyebrow">Bugünkü hedef</p><div className="mt-4 flex items-start gap-3"><span className="side-icon"><SelectedGoalIcon className="size-5" /></span><div><strong className="block leading-tight">{selectedGoal.title}</strong><span className="mt-1 block text-sm text-white/45">Kişisel rota</span></div></div></div>
            <div className="mode-summary"><span className="side-icon"><SelectedDifficultyIcon className="size-5" /></span><div><strong>{selectedDifficulty.title} mod</strong><span>{selectedDifficulty.scoring}</span></div></div>
            <div className="side-divider" />
            <div><p className="eyebrow">Neyi ölçüyoruz?</p><ul className="mt-4 space-y-4 text-sm text-white/60"><li><span className="metric-dot bg-[#c5ff4a]" /> Doğru hedef seçimi</li><li><span className="metric-dot bg-[#70a8ff]" /> Tepki süresi</li><li><span className="metric-dot bg-[#ff6b54]" /> Dikkat kaybı</li></ul></div>
            <div className="best-scores"><p className="eyebrow">En iyi mod puanların</p><div><span>Kolay <strong>{bestScores.easy}</strong></span><span>Orta <strong>{bestScores.medium}</strong></span><span>Zor <strong>{bestScores.hard}</strong></span></div></div>
          </aside>
        </div>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>;
}
