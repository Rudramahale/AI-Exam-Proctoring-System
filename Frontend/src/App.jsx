import { useEffect, useRef, useState } from 'react';

const questions = [
  { text: 'What does CPU stand for?', options: ['Central Processing Unit', 'Core Processing Unit', 'Central Program Unit', 'Computer Processing Unit'], correct: 0 },
  { text: 'Which language runs in a web browser?', options: ['Python', 'Java', 'JavaScript', 'C++'], correct: 2 },
  { text: 'What does HTML stand for?', options: ['HyperText Markup Language', 'HighText Machine Language', 'HyperTransfer Markup Language', 'None'], correct: 0 },
  { text: 'Which planet is closest to the Sun?', options: ['Earth', 'Venus', 'Mercury', 'Mars'], correct: 2 },
  { text: 'What is 12 × 12?', options: ['124', '144', '134', '148'], correct: 1 },
  { text: 'Who invented the telephone?', options: ['Edison', 'Tesla', 'Bell', 'Marconi'], correct: 2 },
  { text: 'What is the capital of France?', options: ['Rome', 'Berlin', 'Madrid', 'Paris'], correct: 3 },
  { text: 'Which data structure uses FIFO?', options: ['Stack', 'Queue', 'Tree', 'Graph'], correct: 1 },
  { text: 'What does RAM stand for?', options: ['Random Access Memory', 'Read Access Memory', 'Run Access Memory', 'Random Assigned Memory'], correct: 0 },
  { text: 'Which symbol is used for comments in Python?', options: ['//', '/*', '#', '--'], correct: 2 },
];

const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const formatDateTime = (v) => new Date(v).toLocaleString('en-GB', { hour12: false, day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';
const getDuration = (start, end) => { const d = Math.max(0, new Date(end) - new Date(start)); return `${Math.floor(d / 60000)}m ${Math.floor((d % 60000) / 1000)}s`; };

function App() {
  const [screen, setScreen] = useState('auth');
  const [authMode, setAuthMode] = useState('login');
  const [authToken, setAuthToken] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [student, setStudent] = useState({ name: '', studentId: '', email: '', password: '', photo: '', loginTime: '' });
  const [webcamActive, setWebcamActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [loginError, setLoginError] = useState('');
  const [answers, setAnswers] = useState(Array(10).fill(null));
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [secondsLeft, setSecondsLeft] = useState(15 * 60);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [examStartTime, setExamStartTime] = useState('');
  const [examEndTime, setExamEndTime] = useState('');
  const [resultScore, setResultScore] = useState(0);
  const [fullscreenWarning, setFullscreenWarning] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [userId, setUserId] = useState(null);
  const [userRole, setUserRole] = useState('');
  const [adminSessions, setAdminSessions] = useState({ ongoing: [], submitted: [] });
  const [violationAlerts, setViolationAlerts] = useState([]);
  const [camPos, setCamPos] = useState({ x: null, y: null }); // null = use CSS default until first drag
  const [submitError, setSubmitError] = useState('');

  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const frameCaptureIntervalRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const dragRef = useRef({ dragging: false, startX: 0, startY: 0, origX: 0, origY: 0 });
  const answersRef = useRef(answers);
  const sessionIdRef = useRef(sessionId);
  const authTokenRef = useRef(authToken);
  answersRef.current = answers;
  sessionIdRef.current = sessionId;
  authTokenRef.current = authToken;

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); frameCaptureIntervalRef.current && clearInterval(frameCaptureIntervalRef.current); }, []);

  useEffect(() => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
    }
  }, [screen, webcamActive]);

  const VIOLATION_NAMES = {
    VIO_001: 'No Face Detected',
    VIO_002: 'Multiple Faces Detected',
    VIO_003: 'Mobile Device Detected',
    VIO_004: 'Suspicious Head Movement',
    VIO_005: 'Tab Switch Detected',
    VIO_006: 'Camera Blocked',
    VIO_007: 'Full Screen Exit',
  };

  const showAlert = (v_type_id) => {
    const name = VIOLATION_NAMES[v_type_id] || v_type_id;
    const id = Date.now();
    setViolationAlerts(p => [...p, { id, v_type_id, name }]);
    setTimeout(() => setViolationAlerts(p => p.filter(a => a.id !== id)), 4000);
  };

  const reportViolation = async (v_type_id) => {
    const sid = sessionIdRef.current;
    const tok = authTokenRef.current;
    if (!sid || !tok) return;
    showAlert(v_type_id);
    try {
      await fetch(`${API_BASE}/violation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ session_id: sid, v_type_id, image_path: '' }),
      });
    } catch (e) { console.warn('Violation report failed', e); }
  };

  useEffect(() => {
    if (screen !== 'exam') return;
    const handleKeyDown = (e) => {
      if ((e.ctrlKey && ['c', 'v', 'x'].includes(e.key.toLowerCase())) || (e.altKey && e.key === 'Tab')) {
        e.preventDefault();
        reportViolation('VIO_005');
      }
    };
    const handleContextMenu = (e) => { e.preventDefault(); reportViolation('VIO_005'); };
    const handleFullscreenChange = () => {
      const fs = !document.fullscreenElement;
      setFullscreenWarning(fs);
      if (fs && !isSubmittingRef.current) reportViolation('VIO_007');
    };
    const handleVisibilityChange = () => { if (document.hidden) reportViolation('VIO_005'); };
    const handleWindowBlur = () => {
      // window.blur fires when the ENTIRE window loses focus (Alt+Tab, Win+Tab).
      // Small delay so document.hidden has settled before we check it.
      setTimeout(() => {
        if (document.hidden && !isSubmittingRef.current) reportViolation('VIO_005');
      }, 100);
    };
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [screen, sessionId, authToken]);

  useEffect(() => {
    if (screen !== 'exam' || submissionComplete) return;
    const interval = setInterval(() => {
      setSecondsLeft(p => { if (p <= 1) return 0; return p - 1; });
    }, 1000);
    return () => clearInterval(interval);
  }, [screen, submissionComplete]);

  useEffect(() => {
    if (screen !== 'exam' || submissionComplete || secondsLeft > 0) return;
    handleFinalSubmission(true);
  }, [secondsLeft, screen, submissionComplete]);

  useEffect(() => {
    if (screen !== 'exam' || submissionComplete || !webcamActive || !sessionId) {
      frameCaptureIntervalRef.current && clearInterval(frameCaptureIntervalRef.current);
      frameCaptureIntervalRef.current = null;
      return;
    }
    frameCaptureIntervalRef.current = setInterval(captureAndSendFrame, 3000);
    return () => { frameCaptureIntervalRef.current && clearInterval(frameCaptureIntervalRef.current); };
  }, [screen, submissionComplete, webcamActive, sessionId]);

  const requestCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setWebcamActive(true);
      setCameraError('');
    } catch { setCameraError('Unable to access webcam.'); setWebcamActive(false); }
  };

  const capturePhoto = () => {
    if (!webcamActive || !videoRef.current || !hiddenCanvasRef.current) { setCameraError('Start webcam first.'); return; }
    const canvas = hiddenCanvasRef.current;
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    canvas.getContext('2d').drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
    setStudent(p => ({ ...p, photo: canvas.toDataURL('image/jpeg', 0.8) }));
  };

  const handleAuth = async () => {
    setAuthLoading(true); setAuthError('');
    if (!student.email.trim() || !student.password.trim() || (authMode === 'signup' && !student.name.trim())) { setAuthError('Fill all fields.'); setAuthLoading(false); return; }
    const url = `${API_BASE}/${authMode === 'signup' ? 'sign_up' : 'login'}`;
    const payload = authMode === 'signup' ? { name: student.name, email: student.email, password: student.password, role: 'student' } : { email: student.email, password: student.password };
    try {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setAuthError(data.detail || 'Auth failed.'); return; }
      setAuthToken(data.access_token);
      setUserId(data.user_id);
      setUserRole(data.role || 'student');
      setStudent(p => ({ ...p, studentId: String(data.user_id) }));
      if (data.role === 'admin') {
        setScreen('admin');
      } else {
        setScreen('verify');
      }
    } catch { setAuthError('Cannot reach backend.'); }
    finally { setAuthLoading(false); }
  };

  const captureAndSendFrame = async () => {
    const sid = sessionIdRef.current;
    const tok = authTokenRef.current;
    if (!videoRef.current || !hiddenCanvasRef.current || !sid) return;

    // ── Layer 1: Check browser video track state ─────────────────────────────
    // When the user turns the camera off via OS/browser, the track readyState
    // changes to 'ended' or 'muted'. We detect this BEFORE capturing a frame,
    // because a dead track still shows the last frozen frame in the <video>
    // element — pixel analysis alone would not catch it.
    const tracks = streamRef.current?.getVideoTracks() ?? [];
    const trackLive = tracks.length > 0 && tracks[0].readyState === 'live' && !tracks[0].muted;
    if (!trackLive && tracks.length > 0) {
      // Camera was turned off externally — report VIO_006 directly
      reportViolation('VIO_006');
      return;
    }

    try {
      const canvas = hiddenCanvasRef.current;
      canvas.width  = videoRef.current.videoWidth  || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      canvas.getContext('2d').drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        try {
          const fd = new FormData();
          fd.append('photo', blob, 'frame.jpg');
          fd.append('session_id', String(sid));
          const res = await fetch(`${API_BASE}/monitor-frame`, { method: 'POST', body: fd, headers: tok ? { Authorization: `Bearer ${tok}` } : {} });
          const data = await res.json();
          // ── Layer 2: Backend darkness check catches physical lens covers ──
          if      (data.detection === 'camera_blocked')           showAlert('VIO_006');
          else if (data.detection === 'no_face')                  showAlert('VIO_001');
          else if (data.detection === 'multiple_faces')           showAlert('VIO_002');
          else if (data.detection === 'suspicious_head_movement') showAlert('VIO_004');
        } catch (e) { console.warn('Frame send failed', e); }
      }, 'image/jpeg', 0.8);
    } catch (e) { console.warn('Frame capture failed', e); }
  };

  const enterFullscreen = () => new Promise((resolve, reject) => {
    if (document.fullscreenElement) { resolve(); return; }
    let done = false;
    const cleanup = () => {
      done = true;
      document.removeEventListener('fullscreenchange', onChange);
      document.removeEventListener('fullscreenerror', onError);
    };
    const onChange = () => {
      if (document.fullscreenElement) { cleanup(); resolve(); }
    };
    const onError = () => { cleanup(); reject(new Error('fullscreenerror')); };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('fullscreenerror', onError);
    const p = document.documentElement.requestFullscreen();
    if (p && p.catch) p.catch(e => { if (!done) { cleanup(); reject(e); } });
    setTimeout(() => { if (!done) { cleanup(); reject(new Error('fullscreen_timeout')); } }, 3000);
  });

  const handleStartExam = async () => {
    if (!student.photo) { setLoginError('Capture a photo first.'); return; }

    // Fullscreen gate — must enter fullscreen before we even try the API
    try {
      await enterFullscreen();
    } catch {
      setLoginError('Fullscreen is required to start the exam. Please allow fullscreen and try again.');
      return;
    }

    setSubmitLoading(true); setLoginError('');
    try {
      const res = await fetch(`${API_BASE}/start_exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ student_photo: student.photo }),
      });
      const data = await res.json();
      if (!res.ok) { setLoginError(data.detail || 'Cannot start exam.'); setSubmitLoading(false); return; }
      setSessionId(data.session_id);
      setExamStartTime(data.start_time);
      setStudent(p => ({ ...p, loginTime: formatDateTime(new Date(data.start_time)) }));
      setSecondsLeft(15 * 60);
      setFullscreenWarning(false);
      setScreen('exam');
    } catch { setLoginError('Cannot reach backend.'); }
    finally { setSubmitLoading(false); }
  };

  const handleFinalSubmission = async (auto = false) => {
    // First click from exam screen — open the confirm modal
    if (!auto && !showSubmitModal) { setShowSubmitModal(true); return; }
    // Guard against double-clicks while a request is in-flight
    if (isSubmittingRef.current) return;
    setSubmitError('');
    setSubmitLoading(true);
    frameCaptureIntervalRef.current && clearInterval(frameCaptureIntervalRef.current);
    const ans = answersRef.current;
    const sid = sessionIdRef.current;
    const tok = authTokenRef.current;
    const score = ans.reduce((t, a, i) => t + (a === questions[i].correct ? 1 : 0), 0);
    const answersObj = Object.fromEntries(ans.map((a, i) => [i, a !== null ? a : null]));
    setResultScore(score);
    isSubmittingRef.current = true;
    const endTime = new Date().toISOString();
    try {
      const res = await fetch(`${API_BASE}/end_exam`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
        body: JSON.stringify({ session_id: sid, answers: answersObj, score }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        setSubmitError(errData.detail || `Submission failed (${res.status}). Please try again.`);
        isSubmittingRef.current = false;
        setSubmitLoading(false);
        return;
      }
    } catch (e) {
      setSubmitError('Cannot reach backend. Your answers are saved. Please try again.');
      isSubmittingRef.current = false;
      setSubmitLoading(false);
      return;
    }
    // Success path
    setExamEndTime(endTime);
    setSubmissionComplete(true);
    setShowSubmitModal(false);
    isSubmittingRef.current = false;
    setSubmitLoading(false);
    setScreen('result');
  };

  const downloadReport = () => {
    const summary = {
      student: { name: student.name, studentId: student.studentId, email: student.email, loginTime: student.loginTime },
      exam: { title: 'Proctored Assessment — Module 1', startTime: examStartTime, endTime: examEndTime, duration: getDuration(examStartTime, examEndTime), score: `${resultScore} / ${questions.length}` },
      questions: questions.map((item, i) => ({ question: item.text, selectedAnswer: item.options[answers[i]] ?? 'No answer', correctAnswer: item.options[item.correct], correct: answers[i] === item.correct })),
    };
    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'exam-report.json'; a.click();
    URL.revokeObjectURL(url);
  };

  const renderAuthScreen = () => (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-8 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <p className="text-cyan-300 uppercase tracking-[0.3em]">AI Exam Proctoring Portal</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-50">{authMode === 'login' ? 'Login' : 'Create an account'}</h1>
        <p className="mt-3 max-w-2xl text-slate-300">{authMode === 'login' ? 'Sign in with your email and password.' : 'Create an account to register for the proctored exam.'}</p>
      </header>
      <main className="grid gap-8 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="space-y-6 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-lg shadow-slate-950/40">
          {authMode === 'signup' && (
            <div className="space-y-4">
              <label className="block text-sm text-slate-300">Name</label>
              <input type="text" value={student.name} onChange={e => setStudent(p => ({ ...p, name: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50" placeholder="Jane Doe" />
            </div>
          )}
          <div className="space-y-4">
            <label className="block text-sm text-slate-300">Email</label>
            <input type="email" value={student.email} onChange={e => setStudent(p => ({ ...p, email: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50" placeholder="student@example.com" />
          </div>
          <div className="space-y-4">
            <label className="block text-sm text-slate-300">Password</label>
            <input type="password" value={student.password} onChange={e => setStudent(p => ({ ...p, password: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50" placeholder="••••••••" />
          </div>
          <button type="button" onClick={handleAuth} className="w-full rounded-3xl bg-cyan-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-400" disabled={authLoading}>{authLoading ? 'Processing...' : authMode === 'login' ? 'Login' : 'Create account'}</button>
          {authError && <p className="text-sm text-rose-300">{authError}</p>}
          <p className="text-sm text-slate-400">{authMode === 'login' ? 'New to the exam portal?' : 'Already have an account?'} <button type="button" onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(''); }} className="font-semibold text-cyan-300 transition hover:text-cyan-200">{authMode === 'login' ? 'Create one' : 'Sign in'}</button></p>
        </section>
        <aside className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-8 shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
          <h2 className="text-xl font-semibold text-slate-100">Prepare for the exam</h2>
          <p className="mt-4 text-slate-300">After login, proceed to verification where you will enable webcam monitoring and begin the exam.</p>
          <div className="mt-6 space-y-4 rounded-3xl bg-slate-900/90 p-6">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">What you need</p>
            <ul className="space-y-3 text-slate-300">
              <li className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />Valid email and password</li>
              <li className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />Webcam access</li>
              <li className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />Student ID for the session</li>
            </ul>
          </div>
        </aside>
      </main>
    </div>
  );

  const renderVerifyScreen = () => (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-8 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <p className="text-cyan-300 uppercase tracking-[0.3em]">Phase 1 · AI Exam Proctoring</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-50">Candidate Verification</h1>
        <p className="mt-3 max-w-2xl text-slate-300">Enter your details, enable webcam, and start your proctored assessment.</p>
        {authToken && student.email && <p className="mt-4 text-sm text-emerald-300">Signed in as {student.email}</p>}
      </header>
      <main className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="space-y-6 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-lg shadow-slate-950/40">
          <div className="space-y-4"><label className="block text-sm text-slate-300">Student Name</label><input type="text" value={student.name} onChange={e => setStudent(p => ({ ...p, name: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50" placeholder="Jane Doe" /></div>
          <div className="space-y-4"><label className="block text-sm text-slate-300">Student ID</label><input type="text" value={student.studentId} onChange={e => setStudent(p => ({ ...p, studentId: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50" placeholder="123" /></div>
          <div className="space-y-4"><label className="block text-sm text-slate-300">Email</label><input type="email" value={student.email} onChange={e => setStudent(p => ({ ...p, email: e.target.value }))} className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50" placeholder="student@example.com" /></div>
          <div className="flex flex-col gap-4 rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Webcam verification</p><p className="mt-1 text-slate-300">Start the camera and capture a snapshot.</p></div>
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${webcamActive ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20' : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20'}`}>{webcamActive ? 'Camera Active' : 'Camera Inactive'}</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <button type="button" onClick={requestCamera} className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Start Webcam</button>
              <button type="button" onClick={capturePhoto} className="rounded-2xl border border-cyan-500/20 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400" disabled={!webcamActive}>Capture Photo</button>
            </div>
            {student.photo && <div className="rounded-3xl border border-slate-800 bg-slate-950 p-3"><p className="text-xs uppercase tracking-[0.2em] text-slate-400">Captured photo</p><img src={student.photo} alt="Captured" className="mt-3 h-40 w-full rounded-2xl object-cover ring-1 ring-slate-700" /></div>}
            {cameraError && <p className="text-sm text-rose-300">{cameraError}</p>}
          </div>
          <button type="button" onClick={handleStartExam} className="w-full rounded-3xl bg-cyan-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-400" disabled={submitLoading}>{submitLoading ? 'Starting...' : 'Begin Exam'}</button>
          {loginError && <p className="text-sm text-rose-300">{loginError}</p>}
        </section>
        <aside className="space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/80 p-8 shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
          <div className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-100">Preview</h2>
            <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/90 p-4">
              <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900">
                {webcamActive ? <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-slate-500">Camera preview</div>}
              </div>
            </div>
          </div>
          <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-5">
            <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Readiness</p>
            <ul className="mt-4 space-y-3 text-slate-300">
              <li className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />Provide name, ID, email</li>
              <li className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />Webcam active + photo captured</li>
              <li className="flex items-start gap-3"><span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400" />Fullscreen enforced</li>
            </ul>
          </div>
        </aside>
      </main>
      <canvas ref={hiddenCanvasRef} className="hidden" />
    </div>
  );

  const renderExamScreen = () => {
    const q = questions[currentQuestion];
    return (
      <div className="relative min-h-screen overflow-hidden bg-[#031328] px-4 py-6 sm:px-6 lg:px-8">
        {fullscreenWarning && <div className="fixed inset-x-0 top-0 z-50 border-b border-rose-500/30 bg-rose-950/95 p-4 text-sm text-rose-100 shadow-lg shadow-black/40"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span>Please return to fullscreen mode.</span><button type="button" onClick={() => document.documentElement.requestFullscreen().catch(() => {})} className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-400">Re-enter Fullscreen</button></div></div>}
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
          {violationAlerts.map(a => (
            <div key={a.id} className="rounded-2xl border border-rose-500/40 bg-rose-950/95 px-5 py-3 text-sm text-rose-100 shadow-lg shadow-black/40 animate-bounce pointer-events-auto">
              <span className="font-semibold">Violation:</span> {a.name}
            </div>
          ))}
        </div>
        <header className="mb-8 rounded-[2rem] border border-cyan-500/10 bg-slate-950/90 p-6 shadow-[0_35px_90px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-3">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Proctored Assessment — Module 1</p>
              <div className="flex flex-wrap items-center gap-3 text-slate-300">
                <span className="rounded-2xl border border-cyan-500/20 bg-slate-900/80 px-4 py-2 text-sm">{student.name}</span>
                <span className="rounded-2xl border border-slate-700/70 bg-slate-900/80 px-4 py-2 text-sm">{student.studentId}</span>
              </div>
            </div>
            <div className="rounded-3xl bg-slate-900/95 px-5 py-4 text-slate-100 shadow-inner shadow-cyan-500/10">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Time Remaining</p>
              <p className="mt-2 text-4xl font-semibold tracking-[0.04em] text-cyan-300">{formatTime(secondsLeft)}</p>
            </div>
          </div>
        </header>
        <main className="grid gap-8 xl:grid-cols-[1fr_320px]">
          <section className="space-y-8 rounded-[2rem] border border-slate-800/80 bg-slate-950/85 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="rounded-3xl border border-cyan-500/15 bg-slate-900/80 p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question {currentQuestion + 1} of {questions.length}</p><h2 className="mt-3 text-2xl font-semibold text-slate-100">{q.text}</h2></div>
                <span className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200">{answers[currentQuestion] !== null ? 'Answered' : 'Unanswered'}</span>
              </div>
            </div>
            <div className="space-y-4">{q.options.map((opt, idx) => { const sel = answers[currentQuestion] === idx; return (<button key={opt} type="button" onClick={() => setAnswers(p => { const u = [...p]; u[currentQuestion] = idx; return u; })} className={`w-full rounded-3xl border px-5 py-4 text-left transition ${sel ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]' : 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-900'}`}><div className="flex items-center gap-4"><span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-slate-300 ring-1 ring-slate-700">{String.fromCharCode(65 + idx)}</span><span className="text-sm leading-6">{opt}</span></div></button>); })}</div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-3">
                <button type="button" onClick={() => setCurrentQuestion(p => Math.max(p - 1, 0))} className="rounded-3xl border border-slate-700/80 bg-slate-900/90 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40">Previous</button>
                <button type="button" onClick={() => setCurrentQuestion(p => Math.min(p + 1, questions.length - 1))} className="rounded-3xl border border-slate-700/80 bg-slate-900/90 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40">Next</button>
              </div>
              <button type="button" onClick={() => handleFinalSubmission(false)} className="rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Submit Exam</button>
            </div>
          </section>
          <aside className="space-y-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/85 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="rounded-3xl border border-cyan-500/15 bg-slate-900/80 p-5"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Monitoring Status</p><div className="mt-4 rounded-3xl bg-slate-950/90 p-4 text-slate-300"><p className="text-sm font-semibold text-slate-100">You are being monitored</p><p className="mt-2 text-sm leading-6 text-slate-400">Persistent webcam monitoring and live time tracking.</p></div></div>
            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/95 p-4"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Navigator</p><div className="mt-4 grid grid-cols-5 gap-3">{questions.map((_, idx) => { const st = answers[idx] === null ? 'unset' : 'answered'; return (<button key={idx} type="button" onClick={() => setCurrentQuestion(idx)} className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${idx === currentQuestion ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-400' : st === 'answered' ? 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'}`}>Q{idx + 1}</button>); })}</div></div>
          </aside>
        </main>
        <div
          className="fixed z-40 w-[340px] rounded-3xl border-2 border-cyan-400 bg-slate-950/98 shadow-[0_20px_70px_rgba(0,200,255,0.3)] backdrop-blur-sm select-none overflow-hidden"
          style={camPos.x !== null ? { top: camPos.y + 'px', left: camPos.x + 'px' } : { bottom: '24px', right: '24px' }}
        >
          {/* ── Drag handle (top bar) ── */}
          <div
            className="flex items-center justify-between gap-2 border-b border-cyan-500/20 bg-slate-900/90 px-4 py-2.5 cursor-grab active:cursor-grabbing"
            onMouseDown={(e) => {
              e.preventDefault();
              const dr = dragRef.current;
              const el = e.currentTarget.closest('.fixed');
              const rect = el.getBoundingClientRect();
              dr.dragging = true;
              dr.startX = e.clientX;
              dr.startY = e.clientY;
              dr.origX = rect.left;
              dr.origY = rect.top;
              const handleMouseMove = (mv) => {
                if (!dr.dragging) return;
                const nx = dr.origX + (mv.clientX - dr.startX);
                const ny = dr.origY + (mv.clientY - dr.startY);
                setCamPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
              };
              const handleMouseUp = () => {
                dr.dragging = false;
                document.removeEventListener('mousemove', handleMouseMove);
                document.removeEventListener('mouseup', handleMouseUp);
              };
              document.addEventListener('mousemove', handleMouseMove);
              document.addEventListener('mouseup', handleMouseUp);
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-base leading-none text-slate-400 tracking-widest">⠿⠿</span>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-cyan-300">Webcam Monitor</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-xs text-slateald-400 text-slate-400">Live</span>
            </div>
          </div>
          {/* ── Video feed ── */}
          <div className="relative overflow-hidden bg-slate-900">
            {webcamActive
              ? <video ref={videoRef} autoPlay muted playsInline className="h-52 w-full object-cover" />
              : <div className="flex h-52 items-center justify-center bg-slate-900 text-slate-500 text-sm">Feed unavailable</div>
            }
          </div>
          {/* ── Footer info ── */}
          <div className="border-t border-slate-800 bg-slate-950/90 px-4 py-2">
            <p className="text-xs text-slate-500 text-center">Frame capture every 3s · drag header to move</p>
          </div>
        </div>
        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[2rem] border border-cyan-500/20 bg-slate-900/95 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
              <h2 className="text-2xl font-semibold text-slate-100">Confirm submission</h2>
              <p className="mt-4 text-slate-300">Are you sure? You cannot return after submission.</p>
              {submitError && (
                <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-950/60 px-4 py-3">
                  <p className="text-sm text-rose-300">⚠ {submitError}</p>
                </div>
              )}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => { setShowSubmitModal(false); setSubmitError(''); }}
                  disabled={submitLoading}
                  className="rounded-3xl border border-slate-700/80 bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleFinalSubmission(true)}
                  disabled={submitLoading}
                  className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:opacity-60"
                >
                  {submitLoading ? 'Submitting…' : submitError ? 'Try Again' : 'Submit'}
                </button>
              </div>
            </div>
          </div>
        )}
        <canvas ref={hiddenCanvasRef} className="hidden" />
      </div>
    );
  };

  const renderResultScreen = () => (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-[2rem] border border-cyan-500/20 bg-slate-900/90 p-8 shadow-[0_35px_90px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Completion Summary</p>
        <h1 className="mt-4 text-4xl font-semibold text-slate-100">Exam Result</h1>
        <p className="mt-3 max-w-2xl text-slate-300">Your verified score and session report.</p>
      </header>
      <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-3xl bg-slate-900/95 p-6"><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Student</p><p className="mt-3 text-xl font-semibold text-slate-100">{student.name}</p><p className="mt-1 text-slate-400">{student.studentId}</p></div>
            <div className="rounded-3xl bg-slate-900/95 p-6"><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Score</p><p className="mt-3 text-4xl font-semibold text-cyan-300">{resultScore} / {questions.length}</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-3xl bg-slate-900/95 p-5"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Start</p><p className="mt-3 text-sm text-slate-200">{formatDateTime(examStartTime)}</p></div>
            <div className="rounded-3xl bg-slate-900/95 p-5"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">End</p><p className="mt-3 text-sm text-slate-200">{formatDateTime(examEndTime)}</p></div>
            <div className="rounded-3xl bg-slate-900/95 p-5"><p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Duration</p><p className="mt-3 text-sm text-slate-200">{getDuration(examStartTime, examEndTime)}</p></div>
          </div>
          {student.photo && <div className="rounded-[2rem] border border-cyan-500/10 bg-slate-900/90 p-6"><div className="flex items-center justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Identity</p><p className="mt-2 text-slate-400">Photo captured at login.</p></div><img src={student.photo} alt="Identity" className="h-24 w-24 rounded-3xl object-cover ring-2 ring-cyan-500/40" /></div></div>}
        </div>
        <aside className="space-y-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <div className="rounded-[2rem] bg-slate-900/95 p-6"><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Actions</p><button type="button" onClick={downloadReport} className="mt-6 w-full rounded-3xl bg-cyan-500 px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400">Download Report</button></div>
          <div className="rounded-[2rem] bg-slate-900/95 p-6"><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Audit</p><p className="mt-4 text-slate-400 leading-6">All answers evaluated after submission. Correct answers shown only in this summary.</p></div>
        </aside>
      </section>
      <section className="space-y-4 rounded-[2rem] border border-slate-800/75 bg-slate-950/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <h2 className="text-2xl font-semibold text-slate-100">Question Breakdown</h2>
        <div className="space-y-4">{questions.map((item, idx) => { const sel = answers[idx]; const selected = sel !== null ? item.options[sel] : 'No answer'; const correct = sel === item.correct; return (<div key={item.text} className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Q{idx + 1}</p><p className="mt-2 text-lg font-semibold text-slate-100">{item.text}</p></div><span className={`rounded-full px-4 py-2 text-sm font-semibold ${correct ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{correct ? 'Correct' : 'Incorrect'}</span></div><div className="mt-5 grid gap-3 sm:grid-cols-2"><div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Selected</p><p className="mt-2 text-slate-100">{selected}</p></div><div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300"><p className="text-xs uppercase tracking-[0.25em] text-slate-500">Correct</p><p className="mt-2 text-slate-100">{item.options[item.correct]}</p></div></div></div>); })}</div>
      </section>
    </div>
  );

  useEffect(() => {
    if (screen !== 'admin' || !authToken) return;
    fetch(`${API_BASE}/admin`, { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(d => setAdminSessions(d))
      .catch((e) => console.warn('Admin fetch failed', e));
  }, [screen, authToken]);

  const renderAdminScreen = () => (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-8 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-cyan-300 uppercase tracking-[0.3em]">Admin Dashboard</p>
            <h1 className="mt-4 text-4xl font-semibold text-slate-50">Exam Proctoring Overview</h1>
            <p className="mt-3 text-slate-300">Monitor ongoing exams and review submitted sessions.</p>
          </div>
          <button type="button" onClick={() => { setScreen('auth'); setAuthToken(''); setUserRole(''); }} className="rounded-2xl border border-slate-700/80 bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40">Logout</button>
        </div>
      </header>

      <section className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-8 shadow-lg shadow-slate-950/40">
        <h2 className="text-2xl font-semibold text-slate-100 mb-6">Ongoing Sessions</h2>
        {adminSessions.ongoing?.length === 0 ? <p className="text-slate-400">No ongoing sessions.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700"><th className="py-3 px-4">Session ID</th><th className="py-3 px-4">Student</th><th className="py-3 px-4">Start Time</th><th className="py-3 px-4">Risk Score</th></tr></thead>
              <tbody>{adminSessions.ongoing?.map(s => (
                <tr key={s.session_id} className="border-b border-slate-800 text-slate-200 hover:bg-slate-800/40"><td className="py-3 px-4">{s.session_id}</td><td className="py-3 px-4">{s.student_name}</td><td className="py-3 px-4">{formatDateTime(s.start_time)}</td><td className="py-3 px-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.risk_score > 30 ? 'bg-rose-500/20 text-rose-300' : s.risk_score > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{s.risk_score}</span></td></tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-3xl border border-slate-800/80 bg-slate-950/90 p-8 shadow-lg shadow-slate-950/40">
        <h2 className="text-2xl font-semibold text-slate-100 mb-6">Submitted Sessions</h2>
        {adminSessions.submitted?.length === 0 ? <p className="text-slate-400">No submitted sessions.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="text-slate-400 uppercase tracking-wider border-b border-slate-700"><th className="py-3 px-4">Session ID</th><th className="py-3 px-4">Student</th><th className="py-3 px-4">Start Time</th><th className="py-3 px-4">Score</th><th className="py-3 px-4">Risk</th><th className="py-3 px-4">Report</th></tr></thead>
              <tbody>{adminSessions.submitted?.map(s => (
                <tr key={s.session_id} className="border-b border-slate-800 text-slate-200 hover:bg-slate-800/40">
                  <td className="py-3 px-4">{s.session_id}</td>
                  <td className="py-3 px-4">{s.student_name}</td>
                  <td className="py-3 px-4">{formatDateTime(s.start_time)}</td>
                  <td className="py-3 px-4">{s.score ?? '-'}</td>
                  <td className="py-3 px-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold ${s.risk_score > 30 ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{s.risk_score}</span></td>
                  <td className="py-3 px-4"><a href={`${API_BASE}${s.report_link}`} target="_blank" rel="noreferrer" className="text-cyan-400 underline hover:text-cyan-300">PDF</a></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );

  return <div className="min-h-screen bg-[#020c1b] text-slate-100">{screen === 'auth' && renderAuthScreen()}{screen === 'verify' && renderVerifyScreen()}{screen === 'exam' && renderExamScreen()}{screen === 'result' && renderResultScreen()}{screen === 'admin' && renderAdminScreen()}</div>;
}

export default App;
