'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Brain, Check, Clock3, Crosshair, Flame, Gauge, Grid3X3, Layers3, ListOrdered, Move, Repeat2, RotateCcw, Sparkles, TimerReset, Type, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

type Step = 'goal' | 'games' | 'difficulty' | 'ready' | 'game' | 'result' | 'mission';
type Goal = 'study' | 'speed' | 'accuracy';
type Difficulty = 'easy' | 'medium' | 'hard';
type GameId = 'focus' | 'memory' | 'speed' | 'direction' | 'order';
type Direction = 'up' | 'right' | 'down' | 'left';
type Result = { score: number; points: number; accuracy: number; reaction: number; correct: number; wrong: number; previousBest: number };
type DevelopmentPlan = { focus: string; evidence: string; nextTarget: string; technique: string; realLife: string; level: string };
type FocusTile = { color: string; label?: string; isTarget: boolean };

const DEFAULT_GAME_SECONDS = 30;
function getGameSeconds(game: GameId) { return game === 'focus' ? 10 : DEFAULT_GAME_SECONDS; }
const COLORS = ['#c5ff4a', '#ff6b54', '#70a8ff', '#f1c94b'];
const EXTENDED_COLORS = ['#ff6b54', '#70a8ff', '#f1c94b', '#b078ff', '#ff78bd', '#38d9c5', '#ff934f'];
const COLOR_WORDS = ['YEŞİL', 'KIRMIZI', 'MAVİ', 'SARI', 'MOR', 'PEMBE', 'TURKUAZ'];
const SYMBOLS = ['●', '▲', '■', '◆', '★', '✚'];
const DIRECTIONS: Direction[] = ['up', 'right', 'down', 'left'];
const DIRECTION_LABELS: Record<Direction, string> = { up: 'YUKARI', right: 'SAĞ', down: 'AŞAĞI', left: 'SOL' };

const GOALS: Array<{ id: Goal; title: string; description: string; icon: typeof Brain }> = [
  { id: 'study', title: 'Ders çalışırken odaklanmak', description: 'Dikkatini daha uzun süre tek noktada tut.', icon: Brain },
  { id: 'speed', title: 'Daha hızlı düşünmek', description: 'Doğru kararı daha kısa sürede ver.', icon: Zap },
  { id: 'accuracy', title: 'Dikkat hatalarını azaltmak', description: 'Acele etmeden doğru hedefi yakala.', icon: Crosshair },
];
const GAMES: Array<{ id: GameId; title: string; description: string; skill: string; icon: typeof Brain }> = [
  { id: 'focus', title: 'Renk Avı', description: 'Doğru rengi veya kelimeyi yakala.', skill: 'Seçici dikkat', icon: Crosshair },
  { id: 'memory', title: 'Hafıza Matrisi', description: 'Parlayan karelerin yerini hatırla.', skill: 'Görsel hafıza', icon: Grid3X3 },
  { id: 'speed', title: 'Hızlı Eşleşme', description: 'İki sembol aynı mı, farklı mı?', skill: 'İşlem hızı', icon: Repeat2 },
  { id: 'direction', title: 'Yön Değiştir', description: 'Kelimeyi değil, okun yönünü seç.', skill: 'Bilişsel esneklik', icon: Move },
  { id: 'order', title: 'Sayı Sırası', description: 'Dağınık sayıları küçükten büyüğe bul.', skill: 'Problem çözme', icon: ListOrdered },
];
const DIFFICULTIES: Array<{ id: Difficulty; title: string; description: string; scoring: string; icon: typeof Gauge }> = [
  { id: 'easy', title: 'Kolay', description: 'Daha az dikkat dağıtıcı', scoring: '+10 doğru · −3 yanlış', icon: Gauge },
  { id: 'medium', title: 'Orta', description: 'Daha kalabalık ve şaşırtıcı', scoring: '+15 doğru · −5 yanlış', icon: Layers3 },
  { id: 'hard', title: 'Zor', description: 'Çelişen ipuçları ve daha çok öğe', scoring: '+20 doğru · −7 yanlış', icon: Type },
];

function shuffle<T>(items: T[]) {
  const next = [...items];
  for (let index = next.length - 1; index > 0; index -= 1) { const target = Math.floor(Math.random() * (index + 1)); [next[index], next[target]] = [next[target], next[index]]; }
  return next;
}
function createFocusBoard(difficulty: Difficulty, round = 0): FocusTile[] {
  const targetIndex = Math.floor(Math.random() * 9);
  return Array.from({ length: 9 }, (_, index) => {
    const isTarget = index === targetIndex;
    if (difficulty === 'easy') return { isTarget, color: isTarget ? COLORS[0] : COLORS[((index + round) % 3) + 1] };
    if (difficulty === 'medium') return { isTarget, color: isTarget ? COLORS[0] : EXTENDED_COLORS[Math.floor(Math.random() * EXTENDED_COLORS.length)] };
    const palette = [COLORS[0], ...EXTENDED_COLORS]; const distractors = COLOR_WORDS.filter((word) => word !== 'YEŞİL');
    return { isTarget, color: palette[Math.floor(Math.random() * palette.length)], label: isTarget ? 'YEŞİL' : distractors[Math.floor(Math.random() * distractors.length)] };
  });
}
function memoryTargets(difficulty: Difficulty) { const count = difficulty === 'easy' ? 3 : difficulty === 'medium' ? 4 : 5; return shuffle(Array.from({ length: 16 }, (_, index) => index)).slice(0, count); }
function orderBoard(difficulty: Difficulty) { const count = difficulty === 'easy' ? 6 : difficulty === 'medium' ? 8 : 9; return shuffle(Array.from({ length: count }, (_, index) => index + 1)); }
function directionRound(difficulty: Difficulty) { const arrow = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)]; let word = arrow; if (difficulty !== 'easy') { const choices = DIRECTIONS.filter((item) => item !== arrow); word = choices[Math.floor(Math.random() * choices.length)]; } return { arrow, word }; }
const GAME_COACHING: Record<GameId, { accuracy: string; speed: string; technique: string; transfer: string }> = {
  focus: { accuracy: 'Dikkat filtresini güçlendir', speed: 'Hedef taramasını hızlandır', technique: 'Önce tüm alanı tara, sonra hedefe dokun. İlk gördüğün parlak nesneye refleksle gitme.', transfer: 'Çalışırken yalnızca konuyla ilgili anahtar kelimeleri işaretle; dikkat dağıtan sekmeleri kapat.' },
  memory: { accuracy: 'Görsel gruplamayı güçlendir', speed: 'Hatırlama yolunu kısalt', technique: 'Kareleri tek tek ezberleme; onları üçgen, çizgi veya köşe gibi tek bir şekle dönüştür.', transfer: 'Bir paragrafı okuduktan sonra kapat ve üç ana fikri konumlarıyla birlikte zihninde canlandır.' },
  speed: { accuracy: 'Karşılaştırma kontrolünü güçlendir', speed: 'İşlem hızını artır', technique: 'İki sembolün tamamına bakma; önce dış hat, sonra merkez ayrıntısı şeklinde iki aşamalı karşılaştır.', transfer: 'Test çözerken önce soru kökünü ve seçeneklerdeki değişen kelimeyi karşılaştır.' },
  direction: { accuracy: 'Çeldiriciyi bastırmayı güçlendir', speed: 'Kural değişimine hızlan', technique: 'Kelimeyi içinden okumadan önce okun ucunu bul. Cevabı yalnızca görsel yönden üret.', transfer: 'Ders sırasında bildirim geldiğinde içeriğini okumadan kapat ve kaldığın satıra geri dön.' },
  order: { accuracy: 'Sıralı planlamayı güçlendir', speed: 'Görsel taramayı hızlandır', technique: 'Ekranı soldan sağa satırlar halinde tara; aradığın sayıyı bulmadan rastgele noktalara atlama.', transfer: 'Büyük bir ödevi başlamadan önce yapılacakları küçükten büyüğe 3–5 adıma sırala.' },
};
function getDevelopmentPlan(game: GameId, result: Result): DevelopmentPlan {
  const copy = GAME_COACHING[game];
  const lowAccuracy = result.accuracy < 78;
  const slowReaction = result.reaction > 850;
  const targetAccuracy = Math.min(98, Math.max(80, result.accuracy + (lowAccuracy ? 10 : 3)));
  const targetReaction = result.reaction ? Math.max(250, result.reaction - (slowReaction ? 120 : 60)) : 700;
  const improvement = result.previousBest ? result.points - result.previousBest : 0;
  const level = result.previousBest === 0 ? 'İlk ölçümün — gelişim çizgin şimdi başlıyor' : improvement > 0 ? `Önceki rekorunun ${improvement} puan üzerindesin` : improvement === 0 ? 'Kişisel rekorunu korudun' : `Rekoruna ulaşmak için ${Math.abs(improvement)} puan kaldı`;
  if (lowAccuracy) return {
    focus: copy.accuracy,
    evidence: `${result.correct} doğruya karşı ${result.wrong} hata yaptın. %${result.accuracy} doğruluk, şu an hızdan önce karar kontrolünün çalışılması gerektiğini gösteriyor.`,
    nextTarget: `Sonraki turda en az %${targetAccuracy} doğruluk ve en fazla ${Math.max(0, result.wrong - 1)} hata`,
    technique: copy.technique,
    realLife: copy.transfer,
    level,
  };
  if (slowReaction) return {
    focus: copy.speed,
    evidence: `%${result.accuracy} doğruluğun sağlam; ortalama ${result.reaction} ms tepki süresi kararın doğru ama otomatikleşmeye açık olduğunu gösteriyor.`,
    nextTarget: `Doğruluğu %${Math.max(80, result.accuracy - 3)} üzerinde tutup tepkiyi ${targetReaction} ms altına indir`,
    technique: copy.technique,
    realLife: copy.transfer,
    level,
  };
  return {
    focus: 'Bir üst zorlukta istikrar kazan',
    evidence: `%${result.accuracy} doğruluk ve ${result.reaction} ms tepkiyle hız–kontrol dengesini kurdun. Artık amaç bunu daha yoğun çeldiriciler altında korumak.`,
    nextTarget: `Bir üst modda %${Math.max(82, result.accuracy - 5)} doğruluk ve ${targetReaction} ms tepki`,
    technique: copy.technique,
    realLife: copy.transfer,
    level,
  };
}
function DirectionIcon({ direction, className = '' }: { direction: Direction; className?: string }) { const Icon = direction === 'up' ? ArrowUp : direction === 'right' ? ArrowRight : direction === 'down' ? ArrowDown : ArrowLeft; return <Icon className={className} />; }

export default function Home() {
  const [step, setStep] = useState<Step>('goal'); const [goal, setGoal] = useState<Goal>('study'); const [game, setGame] = useState<GameId>('focus'); const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [seconds, setSeconds] = useState(() => getGameSeconds('focus')); const [round, setRound] = useState(0); const [correct, setCorrect] = useState(0); const [wrong, setWrong] = useState(0); const [reactions, setReactions] = useState<number[]>([]); const [result, setResult] = useState<Result | null>(null);
  const [focusBoard, setFocusBoard] = useState<FocusTile[]>(() => createFocusBoard('easy')); const [memoryCells, setMemoryCells] = useState<number[]>([]); const [memoryPicked, setMemoryPicked] = useState<number[]>([]); const [memoryReveal, setMemoryReveal] = useState(true);
  const [speedPair, setSpeedPair] = useState<[string, string]>(['●', '●']); const [direction, setDirection] = useState(() => directionRound('easy')); const [numbers, setNumbers] = useState<number[]>(() => orderBoard('easy')); const [nextNumber, setNextNumber] = useState(1);
  const [missionSeconds, setMissionSeconds] = useState(600); const [missionActive, setMissionActive] = useState(false); const [distractions, setDistractions] = useState(0); const [missionDone, setMissionDone] = useState(false);
  const [bestScores, setBestScores] = useState<Record<GameId, number>>({ focus: 0, memory: 0, speed: 0, direction: 0, order: 0 });
  const spawnedAt = useRef(Date.now()); const finishGameRef = useRef<() => void>(() => undefined); const memoryTimer = useRef<number | null>(null);
  const selectedGoal = GOALS.find((item) => item.id === goal) ?? GOALS[0]; const selectedGame = GAMES.find((item) => item.id === game) ?? GAMES[0]; const selectedDifficulty = DIFFICULTIES.find((item) => item.id === difficulty) ?? DIFFICULTIES[0];
  const SelectedGoalIcon = selectedGoal.icon; const SelectedGameIcon = selectedGame.icon;

  const revealMemory = useCallback((level: Difficulty) => { if (memoryTimer.current) window.clearTimeout(memoryTimer.current); setMemoryCells(memoryTargets(level)); setMemoryPicked([]); setMemoryReveal(true); memoryTimer.current = window.setTimeout(() => { setMemoryReveal(false); spawnedAt.current = Date.now(); }, level === 'hard' ? 800 : level === 'medium' ? 1100 : 1400); }, []);
  const newSpeedPair = useCallback(() => { const first = SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]; const same = Math.random() > 0.5; const alternatives = SYMBOLS.filter((item) => item !== first); setSpeedPair([first, same ? first : alternatives[Math.floor(Math.random() * alternatives.length)]]); spawnedAt.current = Date.now(); }, []);
  const resetGame = useCallback(() => { setSeconds(getGameSeconds(game)); setRound(0); setCorrect(0); setWrong(0); setReactions([]); setResult(null); setFocusBoard(createFocusBoard(difficulty)); setDirection(directionRound(difficulty)); setNumbers(orderBoard(difficulty)); setNextNumber(1); if (game === 'memory') revealMemory(difficulty); if (game === 'speed') newSpeedPair(); spawnedAt.current = Date.now(); }, [difficulty, game, newSpeedPair, revealMemory]);
  const finishGame = useCallback(() => {
    const total = correct + wrong; const accuracy = total ? Math.round((correct / total) * 100) : 0; const reaction = reactions.length ? Math.round(reactions.reduce((sum, value) => sum + value, 0) / reactions.length) : 0; const speedScore = reaction ? Math.max(0, Math.min(100, 120 - reaction / 8)) : 0;
    const values = difficulty === 'easy' ? { correct: 10, wrong: 3 } : difficulty === 'medium' ? { correct: 15, wrong: 5 } : { correct: 20, wrong: 7 }; const points = Math.max(0, correct * values.correct - wrong * values.wrong); const nextResult = { score: Math.round(accuracy * 0.7 + speedScore * 0.3), points, accuracy, reaction, correct, wrong, previousBest: bestScores[game] };
    setResult(nextResult); localStorage.setItem('focusbridge-last-result', JSON.stringify({ ...nextResult, game, difficulty })); setBestScores((current) => { const next = { ...current, [game]: Math.max(current[game], points) }; localStorage.setItem('focusbridge-game-bests', JSON.stringify(next)); return next; }); setStep('result');
  }, [bestScores, correct, difficulty, game, reactions, wrong]); finishGameRef.current = finishGame;

  useEffect(() => { if (step !== 'game') return; if (seconds <= 0) { finishGameRef.current(); return; } const timer = window.setTimeout(() => setSeconds((value) => value - 1), 1000); return () => window.clearTimeout(timer); }, [seconds, step]);
  useEffect(() => { const saved = localStorage.getItem('focusbridge-game-bests'); if (saved) { try { setBestScores((current) => ({ ...current, ...JSON.parse(saved) })); } catch { /* Bozuk yerel veri oyunu engellemez. */ } } return () => { if (memoryTimer.current) window.clearTimeout(memoryTimer.current); }; }, []);
  useEffect(() => { if (!missionActive || missionSeconds <= 0) return; const timer = window.setTimeout(() => setMissionSeconds((value) => value - 1), 1000); return () => window.clearTimeout(timer); }, [missionActive, missionSeconds]);

  const record = (isCorrect: boolean) => {
    const elapsed = Math.max(1, Date.now() - spawnedAt.current);
    setReactions((values) => [...values, elapsed]);
    if (isCorrect) setCorrect((value) => value + 1); else setWrong((value) => value + 1);
  };
  const nextRound = () => { setRound((value) => value + 1); if (game === 'focus') setFocusBoard(createFocusBoard(difficulty, round + 1)); if (game === 'speed') newSpeedPair(); if (game === 'direction') { setDirection(directionRound(difficulty)); spawnedAt.current = Date.now(); } if (game === 'order') { setNumbers(orderBoard(difficulty)); setNextNumber(1); spawnedAt.current = Date.now(); } };
  const handleFocus = (index: number) => { record(Boolean(focusBoard[index]?.isTarget)); nextRound(); spawnedAt.current = Date.now(); };
  const handleSpeed = (answer: boolean) => { record(answer === (speedPair[0] === speedPair[1])); nextRound(); };
  const handleDirection = (answer: Direction) => { record(answer === direction.arrow); nextRound(); };
  const handleNumber = (value: number) => { if (value !== nextNumber) { record(false); return; } record(true); if (nextNumber === numbers.length) nextRound(); else { setNextNumber((current) => current + 1); spawnedAt.current = Date.now(); } };
  const handleMemory = (index: number) => { if (memoryReveal || memoryPicked.includes(index)) return; const hit = memoryCells.includes(index); record(hit); if (!hit) { revealMemory(difficulty); return; } const nextPicked = [...memoryPicked, index]; setMemoryPicked(nextPicked); if (nextPicked.length === memoryCells.length) { setRound((value) => value + 1); window.setTimeout(() => revealMemory(difficulty), 180); } };
  const startGame = () => { resetGame(); setStep('game'); };
  const restart = () => { if (memoryTimer.current) window.clearTimeout(memoryTimer.current); setStep('goal'); setMissionSeconds(600); setMissionActive(false); setDistractions(0); setMissionDone(false); };
  const developmentPlan = useMemo(() => result ? getDevelopmentPlan(game, result) : null, [game, result]);
  const readyCopy: Record<GameId, { title: string; body: string }> = {
    focus: { title: difficulty === 'hard' ? 'Rengi değil, kelimeyi takip et.' : 'Yalnızca yeşil hedefe dokun.', body: 'Her seçimden sonra tahta yenilenir. Doğru hedefi mümkün olduğunca hızlı bul.' },
    memory: { title: 'Parlayan kareleri aklında tut.', body: 'Kareler gizlendikten sonra hatırladığın yerlere dokun. Yanlış seçim yeni turu başlatır.' },
    speed: { title: 'Semboller aynı mı, farklı mı?', body: 'İki sembolü karşılaştır ve alttaki doğru cevaba dokun.' },
    direction: { title: 'Kelimeyi değil, oku takip et.', body: 'Ortadaki okun baktığı yönü seç. Yazı özellikle seni yanıltmaya çalışacak.' },
    order: { title: 'Sayıları sırayla temizle.', body: 'Dağınık sayıların içinden önce 1’i, sonra 2’yi ve devamını bul.' },
  };

  return <main className="min-h-screen bg-background text-foreground">
    <div className="noise" aria-hidden="true" />
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-6 sm:px-8"><button className="flex items-center gap-3" onClick={restart} aria-label="Ana ekrana dön"><span className="logo-mark"><Brain className="size-5" /></span><span className="text-lg font-black tracking-[-0.04em]">focusbridge</span></button><div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white/65"><Flame className="size-4 text-[#f1c94b]" /><span>Bugünkü seri</span><strong className="text-white">1</strong></div></header>
    <section className="mx-auto flex w-full max-w-6xl flex-1 px-5 pb-10 sm:px-8"><div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="game-shell min-h-[640px]">
        <div className="mb-8 flex items-center justify-between gap-4"><div className="flex gap-2" aria-label="İlerleme">{(['goal', 'games', 'difficulty', 'ready', 'game', 'result', 'mission'] as Step[]).map((item, index) => { const current = ['goal', 'games', 'difficulty', 'ready', 'game', 'result', 'mission'].indexOf(step); return <span key={item} className={`step-dot ${index <= current ? 'active' : ''}`} />; })}</div><span className="eyebrow">Günlük antrenman · 01</span></div>

        {step === 'goal' && <div className="animate-in"><p className="eyebrow mb-3 text-[#c5ff4a]">Bugün neyi güçlendirelim?</p><h1 className="max-w-2xl text-4xl font-black leading-[1.05] tracking-[-0.055em] sm:text-6xl">Odağını seç.<br /><span className="text-white/35">Gerisini birlikte ölçelim.</span></h1><div className="mt-10 grid gap-3">{GOALS.map((item) => { const Icon = item.icon; const selected = goal === item.id; return <button key={item.id} onClick={() => setGoal(item.id)} className={`goal-card ${selected ? 'selected' : ''}`}><span className="goal-icon"><Icon className="size-5" /></span><span className="min-w-0 text-left"><strong className="block text-base sm:text-lg">{item.title}</strong><span className="mt-1 block text-sm text-white/50">{item.description}</span></span><span className="ml-auto grid size-6 shrink-0 place-items-center rounded-full border border-white/15">{selected && <Check className="size-4 text-[#07110d]" />}</span></button>; })}</div><Button className="primary-cta mt-8" size="lg" onClick={() => setStep('games')}>Oyunu seç <ArrowRight /></Button></div>}

        {step === 'games' && <div className="animate-in"><p className="eyebrow mb-3 text-[#c5ff4a]">5 mini oyun</p><h1 className="text-4xl font-black tracking-[-0.055em] sm:text-5xl">Bugünkü antrenmanın hangisi?</h1><div className="game-picker mt-8">{GAMES.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setGame(item.id)} className={`game-choice ${game === item.id ? 'selected' : ''}`}><span className="game-choice-icon"><Icon /></span><span><strong>{item.title}</strong><small>{item.description}</small><em>{item.skill}</em></span></button>; })}</div><div className="mt-8 flex gap-3"><Button variant="outline" size="lg" className="back-button" onClick={() => setStep('goal')}>Geri dön</Button><Button className="primary-cta" size="lg" onClick={() => setStep('difficulty')}>Devam et <ArrowRight /></Button></div></div>}

        {step === 'difficulty' && <div className="animate-in"><p className="eyebrow mb-3 text-[#c5ff4a]">{selectedGame.title} · Zorluk</p><h1 className="text-4xl font-black tracking-[-0.055em] sm:text-5xl">Meydan okumanı seç.</h1><div className="mt-10 grid gap-3 sm:grid-cols-3">{DIFFICULTIES.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => setDifficulty(item.id)} className={`difficulty-card ${difficulty === item.id ? 'selected' : ''}`}><span className="difficulty-icon"><Icon className="size-5" /></span><strong>{item.title}</strong><span>{item.description}</span><small>{item.scoring}</small></button>; })}</div><div className="mt-8 flex gap-3"><Button variant="outline" size="lg" className="back-button" onClick={() => setStep('games')}>Geri dön</Button><Button className="primary-cta" size="lg" onClick={() => setStep('ready')}>Modu seç <ArrowRight /></Button></div></div>}

        {step === 'ready' && <div className="animate-in flex min-h-[500px] flex-col items-center justify-center text-center"><div className="ready-icon"><SelectedGameIcon /></div><p className="eyebrow mt-8 text-[#c5ff4a]">{selectedGame.title} · {selectedDifficulty.title}</p><h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">{readyCopy[game].title}</h1><p className="mt-4 max-w-lg text-base leading-7 text-white/55">{readyCopy[game].body}</p><Button className="primary-cta mt-8" size="lg" onClick={startGame}>Başlat <Zap /></Button></div>}

        {step === 'game' && <div className="animate-in"><div className="mb-5 flex items-end justify-between gap-4"><div><p className="eyebrow text-[#c5ff4a]">{selectedGame.title} · {selectedDifficulty.title}</p><h1 className="mt-1 text-3xl font-black tracking-[-0.04em]">{selectedGame.skill}</h1></div><div className="text-right"><span className="block font-mono text-3xl font-bold tabular-nums">00:{String(seconds).padStart(2, '0')}</span><span className="text-sm text-white/45">kalan süre</span></div></div><Progress value={(seconds / getGameSeconds(game)) * 100} className="game-progress mb-6" /><GameArea game={game} difficulty={difficulty} round={round} focusBoard={focusBoard} onFocus={handleFocus} memoryCells={memoryCells} memoryPicked={memoryPicked} memoryReveal={memoryReveal} onMemory={handleMemory} speedPair={speedPair} onSpeed={handleSpeed} direction={direction} onDirection={handleDirection} numbers={numbers} nextNumber={nextNumber} onNumber={handleNumber} /><div className="mt-5 flex justify-between text-sm text-white/50"><span>Doğru <strong className="text-white">{correct}</strong></span><span>Hata <strong className="text-white">{wrong}</strong></span></div></div>}

        {step === 'result' && result && developmentPlan && <div className="animate-in">
          <div className="result-kicker"><span><Sparkles className="size-4" /> Kişisel gelişim analizi</span><small>{developmentPlan.level}</small></div>
          <div className="mt-5 grid gap-6 sm:grid-cols-[180px_1fr] sm:items-center"><div className="score-ring" style={{ '--score': `${result.score * 3.6}deg` } as React.CSSProperties}><div><strong>{result.score}</strong><span>/100</span></div></div><div><p className="eyebrow text-[#c5ff4a]">{selectedGame.title} · Koç yorumu</p><h1 className="mt-2 text-3xl font-black leading-tight tracking-[-0.045em] sm:text-4xl">{developmentPlan.focus}</h1><p className="mt-3 leading-7 text-white/58">{developmentPlan.evidence}</p></div></div>
          <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label={`${selectedDifficulty.title} puanı`} value={String(result.points)} /><Metric label="Doğruluk" value={`%${result.accuracy}`} /><Metric label="Tepki" value={result.reaction ? `${result.reaction} ms` : '—'} /><Metric label="Yanlış" value={String(result.wrong)} /></div>
          <section className="growth-route mt-6"><div className="growth-route-head"><div><span className="eyebrow text-[#c5ff4a]">Sadece skor değil</span><h2>Gelişim rotan</h2></div><span className="route-badge">Sana özel</span></div><div className="growth-grid"><article><span>01</span><div><small>Sonraki hedef</small><strong>{developmentPlan.nextTarget}</strong></div></article><article><span>02</span><div><small>Uygulayacağın teknik</small><strong>{developmentPlan.technique}</strong></div></article><article className="transfer-card"><span>03</span><div><small>Gerçek hayata transfer</small><strong>{developmentPlan.realLife}</strong></div></article></div></section>
          <div className="mt-7 flex flex-wrap gap-3"><Button variant="outline" size="lg" className="back-button" onClick={() => setStep('games')}>Başka oyun</Button><Button variant="outline" size="lg" className="back-button" onClick={startGame}>Planla tekrar dene <RotateCcw /></Button><Button className="primary-cta" size="lg" onClick={() => setStep('mission')}>Gerçek hayata taşı <ArrowRight /></Button></div>
        </div>}

        {step === 'mission' && <div className="animate-in flex min-h-[510px] flex-col items-center justify-center text-center">{!missionDone ? <><div className={`mission-clock ${missionActive ? 'active' : ''}`}><Clock3 className="size-7" /><strong>{String(Math.floor(missionSeconds / 60)).padStart(2, '0')}:{String(missionSeconds % 60).padStart(2, '0')}</strong></div><p className="eyebrow mt-8 text-[#c5ff4a]">Gerçek hayat görevi</p><h1 className="mt-3 max-w-xl text-4xl font-black tracking-[-0.05em]">10 dakika, tek konu, sıfır bildirim.</h1><p className="mt-4 max-w-lg leading-7 text-white/55">Telefonunu sessize al ve tek bir ders konusuna çalış. Dikkatin dağıldığında aşağıdaki butona dokun.</p>{!missionActive ? <Button className="primary-cta mt-7" size="lg" onClick={() => setMissionActive(true)}>Görevi başlat <TimerReset /></Button> : <div className="mt-7 flex flex-wrap justify-center gap-3"><Button variant="outline" size="lg" className="back-button" onClick={() => setDistractions((value) => value + 1)}>Dikkatim dağıldı · {distractions}</Button><Button className="primary-cta" size="lg" onClick={() => { setMissionDone(true); setMissionActive(false); }}>Tamamladım <Check /></Button></div>}</> : <><div className="success-mark"><Check className="size-10" /></div><p className="eyebrow mt-8 text-[#c5ff4a]">Köprü kuruldu</p><h1 className="mt-3 text-4xl font-black tracking-[-0.05em] sm:text-5xl">Oyun bitti. Kazanım gerçek hayatta.</h1><p className="mt-4 max-w-lg leading-7 text-white/55">Bu seansta dikkatinin {distractions} kez dağıldığını fark ettin.</p><Button variant="outline" size="lg" className="back-button mt-7" onClick={restart}>Yeniden dene <RotateCcw /></Button></>}</div>}
      </div>

      <aside className="side-panel"><div><p className="eyebrow">Bugünkü hedef</p><div className="mt-4 flex items-start gap-3"><span className="side-icon"><SelectedGoalIcon className="size-5" /></span><div><strong className="block leading-tight">{selectedGoal.title}</strong><span className="mt-1 block text-sm text-white/45">Kişisel rota</span></div></div></div><div className="mode-summary"><span className="side-icon"><SelectedGameIcon className="size-5" /></span><div><strong>{selectedGame.title}</strong><span>{selectedGame.skill} · {selectedDifficulty.title}</span></div></div><div className="side-divider" /><div><p className="eyebrow">Neyi ölçüyoruz?</p><ul className="mt-4 space-y-4 text-sm text-white/60"><li><span className="metric-dot bg-[#c5ff4a]" /> Doğru karar</li><li><span className="metric-dot bg-[#70a8ff]" /> Tepki süresi</li><li><span className="metric-dot bg-[#ff6b54]" /> Dikkat hatası</li></ul></div><div className="best-scores"><p className="eyebrow">Oyun rekorların</p><div>{GAMES.map((item) => <span key={item.id}>{item.title} <strong>{bestScores[item.id]}</strong></span>)}</div></div></aside>
    </div></section>
  </main>;
}

type GameAreaProps = { game: GameId; difficulty: Difficulty; round: number; focusBoard: FocusTile[]; onFocus: (index: number) => void; memoryCells: number[]; memoryPicked: number[]; memoryReveal: boolean; onMemory: (index: number) => void; speedPair: [string, string]; onSpeed: (same: boolean) => void; direction: { arrow: Direction; word: Direction }; onDirection: (direction: Direction) => void; numbers: number[]; nextNumber: number; onNumber: (value: number) => void };
function GameArea(props: GameAreaProps) {
  if (props.game === 'focus') return <div className="tile-grid">{props.focusBoard.map((tile, index) => <button key={`${props.round}-${index}`} className={`game-tile ${props.difficulty !== 'hard' && tile.isTarget ? 'target' : ''} ${props.difficulty === 'hard' ? 'word-tile' : ''}`} onClick={() => props.onFocus(index)}>{props.difficulty === 'hard' ? <strong style={{ color: tile.color }}>{tile.label}</strong> : <span style={{ backgroundColor: tile.color }} />}</button>)}</div>;
  if (props.game === 'memory') return <div className="memory-wrap"><p>{props.memoryReveal ? 'Akılda tut…' : `${props.memoryCells.length - props.memoryPicked.length} kare kaldı`}</p><div className="memory-grid">{Array.from({ length: 16 }, (_, index) => { const lit = (props.memoryReveal && props.memoryCells.includes(index)) || props.memoryPicked.includes(index); return <button key={`${props.round}-${index}`} className={lit ? 'lit' : ''} onClick={() => props.onMemory(index)} aria-label={`${index + 1}. kare`} />; })}</div></div>;
  if (props.game === 'speed') return <div className="speed-game"><div className="symbol-pair"><span>{props.speedPair[0]}</span><span>{props.speedPair[1]}</span></div><p>Semboller aynı mı?</p><div><button onClick={() => props.onSpeed(false)}>Farklı</button><button onClick={() => props.onSpeed(true)}>Aynı</button></div></div>;
  if (props.game === 'direction') return <div className="direction-game"><span className="direction-word">{DIRECTION_LABELS[props.direction.word]}</span><DirectionIcon direction={props.direction.arrow} className="direction-arrow" /><p>Ok hangi yöne bakıyor?</p><div>{DIRECTIONS.map((item) => <button key={item} onClick={() => props.onDirection(item)} aria-label={DIRECTION_LABELS[item]}><DirectionIcon direction={item} /></button>)}</div></div>;
  return <div className="order-game"><p>Sıradaki sayı: <strong>{props.nextNumber}</strong></p><div>{props.numbers.map((value) => <button key={`${props.round}-${value}`} className={value < props.nextNumber ? 'cleared' : ''} onClick={() => props.onNumber(value)} disabled={value < props.nextNumber}>{value}</button>)}</div></div>;
}
function Metric({ label, value }: { label: string; value: string }) { return <div className="metric-card"><span>{label}</span><strong>{value}</strong></div>; }
