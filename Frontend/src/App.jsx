import { useEffect, useRef, useState } from 'react';

const questions = [
  {
    text: 'What does CPU stand for?',
    options: [
      'Central Processing Unit',
      'Core Processing Unit',
      'Central Program Unit',
      'Computer Processing Unit',
    ],
    correct: 0,
  },
  {
    text: 'Which language runs in a web browser?',
    options: ['Python', 'Java', 'JavaScript', 'C++'],
    correct: 2,
  },
  {
    text: 'What does HTML stand for?',
    options: [
      'HyperText Markup Language',
      'HighText Machine Language',
      'HyperTransfer Markup Language',
      'None',
    ],
    correct: 0,
  },
  {
    text: 'Which planet is closest to the Sun?',
    options: ['Earth', 'Venus', 'Mercury', 'Mars'],
    correct: 2,
  },
  {
    text: 'What is 12 × 12?',
    options: ['124', '144', '134', '148'],
    correct: 1,
  },
  {
    text: 'Who invented the telephone?',
    options: ['Edison', 'Tesla', 'Bell', 'Marconi'],
    correct: 2,
  },
  {
    text: 'What is the capital of France?',
    options: ['Rome', 'Berlin', 'Madrid', 'Paris'],
    correct: 3,
  },
  {
    text: 'Which data structure uses FIFO?',
    options: ['Stack', 'Queue', 'Tree', 'Graph'],
    correct: 1,
  },
  {
    text: 'What does RAM stand for?',
    options: [
      'Random Access Memory',
      'Read Access Memory',
      'Run Access Memory',
      'Random Assigned Memory',
    ],
    correct: 0,
  },
  {
    text: 'Which symbol is used for comments in Python?',
    options: ['//', '/*', '#', '--'],
    correct: 2,
  },
];

const formatTime = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${remainder.toString().padStart(2, '0')}`;
};

const formatDateTime = (value) => {
  const date = new Date(value);
  return date.toLocaleString('en-GB', {
    hour12: false,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

const getDuration = (start, end) => {
  const diff = Math.max(0, new Date(end) - new Date(start));
  const minutes = Math.floor(diff / 60000);
  const seconds = Math.floor((diff % 60000) / 1000);
  return `${minutes}m ${seconds}s`;
};

function App() {
  const [screen, setScreen] = useState('login');
  const [student, setStudent] = useState({
    name: '',
    studentId: '',
    email: '',
    photo: '',
    loginTime: '',
  });
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
  const [warnings, setWarnings] = useState(0);
  const [violations, setViolations] = useState([]);
  const [activeWarningMessage, setActiveWarningMessage] = useState('');
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [lastTabChangeTime, setLastTabChangeTime] = useState(0);

  const videoRef = useRef(null);
  const hiddenCanvasRef = useRef(null);
  const streamRef = useRef(null);
  const monitoringIntervalRef = useRef(null);

  const addViolation = (type, message) => {
    const now = Date.now();
    const timestamp = new Date().toISOString();

    const violation = {
      id: `${type}_${now}`,
      type,
      message,
      timestamp,
    };

    setViolations((prev) => [...prev, violation]);
    setWarnings((prev) => prev + 1);
    setActiveWarningMessage(message);
    setShowWarningModal(true);

    setTimeout(() => {
      setShowWarningModal(false);
    }, 5000);
  };

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (screen !== 'exam') {
      return undefined;
    }

    const handleKeyDown = (event) => {
      if ((event.ctrlKey && ['c', 'v', 'x'].includes(event.key.toLowerCase())) || (event.altKey && event.key === 'Tab')) {
        event.preventDefault();
      }
    };

    const handleContextMenu = (event) => {
      event.preventDefault();
    };

    const handleFullscreenChange = () => {
      const isFullscreen = !!document.fullscreenElement;
      setFullscreenWarning(!isFullscreen);

      if (!isFullscreen) {
        addViolation('fullscreen_exit', 'Fullscreen exited. Please return to fullscreen mode.');
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        const now = Date.now();
        if (now - lastTabChangeTime > 500) {
          addViolation('tab_switch', 'Tab switch detected. Please return to the exam tab.');
          setLastTabChangeTime(now);
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('contextmenu', handleContextMenu);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [screen, lastTabChangeTime]);

  useEffect(() => {
    if (screen !== 'exam' || submissionComplete) {
      return undefined;
    }

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          handleFinalSubmission(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [screen, submissionComplete]);

  useEffect(() => {
    if (screen !== 'exam') {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
        monitoringIntervalRef.current = null;
      }
      return undefined;
    }

    monitoringIntervalRef.current = setInterval(() => {
      if (!videoRef.current || !hiddenCanvasRef.current) {
        return;
      }

      const video = videoRef.current;
      const canvas = hiddenCanvasRef.current;
      const ctx = canvas.getContext('2d');

      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const image = canvas.toDataURL('image/jpeg', 0.7);

      const payload = {
        timestamp: new Date().toISOString(),
        type: 'monitoring_frame',
        image,
      };

      console.log('📸 Photo captured at:', payload.timestamp);
      console.log(payload);
    }, 3000);

    return () => {
      if (monitoringIntervalRef.current) {
        clearInterval(monitoringIntervalRef.current);
        monitoringIntervalRef.current = null;
      }
    };
  }, [screen]);

  const requestCamera = async () => {
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setWebcamActive(true);
      setCameraError('');
    } catch (error) {
      setCameraError('Unable to access webcam. Please allow camera permission.');
      setWebcamActive(false);
    }
  };

  const capturePhoto = () => {
    if (!webcamActive || !videoRef.current || !hiddenCanvasRef.current) {
      setCameraError('Start the webcam before capturing a photo.');
      return;
    }

    const video = videoRef.current;
    const canvas = hiddenCanvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const photoData = canvas.toDataURL('image/jpeg', 0.8);
    setStudent((prev) => ({ ...prev, photo: photoData }));
  };

  const validateLogin = () => {
    if (!student.name.trim() || !student.studentId.trim() || !student.email.trim()) {
      setLoginError('All fields are required before starting the exam.');
      return false;
    }

    const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(student.email);
    if (!emailIsValid) {
      setLoginError('Enter a valid email address.');
      return false;
    }

    if (!webcamActive) {
      setLoginError('Please start webcam verification before proceeding.');
      return false;
    }

    if (!student.photo) {
      setLoginError('Capture a photo to proceed to the exam.');
      return false;
    }

    setLoginError('');
    return true;
  };

  const startExam = () => {
    if (!validateLogin()) {
      return;
    }

    const startTime = new Date();
    const formatted = formatDateTime(startTime);
    setStudent((prev) => ({ ...prev, loginTime: formatted }));
    setExamStartTime(startTime.toISOString());
    setSecondsLeft(15 * 60);
    setFullscreenWarning(false);
    setScreen('exam');

    document.documentElement.requestFullscreen().catch(() => {
      setFullscreenWarning(true);
    });
  };

  const handleAnswerChange = (index) => {
    setAnswers((prev) => {
      const updated = [...prev];
      updated[currentQuestion] = index;
      return updated;
    });
  };

  const calculateScore = () => {
    return answers.reduce((total, answer, index) => {
      return total + (answer === questions[index].correct ? 1 : 0);
    }, 0);
  };

  const handleFinalSubmission = (auto = false) => {
    if (!auto && !showSubmitModal) {
      setShowSubmitModal(true);
      return;
    }

    const finalScore = calculateScore();
    setResultScore(finalScore);
    setExamEndTime(new Date().toISOString());
    setSubmissionComplete(true);
    setShowSubmitModal(false);
    setScreen('result');

    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const downloadReport = () => {
    const summary = {
      student: {
        name: student.name,
        studentId: student.studentId,
        email: student.email,
        loginTime: student.loginTime,
      },
      exam: {
        title: 'Proctored Assessment — Module 1',
        startTime: examStartTime,
        endTime: examEndTime,
        duration: getDuration(examStartTime, examEndTime),
        score: `${resultScore} / ${questions.length}`,
        cheatingScore: 0,
      },
      questions: questions.map((item, index) => ({
        question: item.text,
        selectedAnswer: item.options[answers[index]] ?? 'No answer',
        correctAnswer: item.options[item.correct],
        correct: answers[index] === item.correct,
      })),
    };

    const blob = new Blob([JSON.stringify(summary, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'exam-report.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const renderWarningModal = () => {
    if (!showWarningModal) {
      return null;
    }

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm pointer-events-auto">
        <div className="w-full max-w-sm rounded-3xl border border-amber-500/30 bg-amber-950/95 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
          <div className="flex items-center gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-amber-500/20 text-2xl">
              ⚠️
            </span>
            <div>
              <h3 className="text-lg font-semibold text-amber-100">Warning {warnings}</h3>
              <p className="text-sm text-amber-300">{activeWarningMessage}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowWarningModal(false)}
            className="mt-6 w-full rounded-2xl bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  };

  const renderLoginScreen = () => {
    return (
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-3xl border border-cyan-500/20 bg-slate-900/80 p-8 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <p className="text-cyan-300 uppercase tracking-[0.3em]">Phase 1 · AI Exam Proctoring</p>
          <h1 className="mt-4 text-4xl font-semibold text-slate-50">Candidate Verification</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Enter your credentials, verify your webcam, and capture your identity photo before starting the proctored assessment.
          </p>
        </header>

        <main className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="space-y-6 rounded-3xl border border-slate-800/80 bg-slate-900/80 p-8 shadow-lg shadow-slate-950/40">
            <div className="space-y-4">
              <label className="block text-sm text-slate-300">Student Name</label>
              <input
                type="text"
                value={student.name}
                onChange={(event) => setStudent((prev) => ({ ...prev, name: event.target.value }))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50"
                placeholder="Jane Doe"
              />
            </div>

            <div className="space-y-4">
              <label className="block text-sm text-slate-300">Student ID</label>
              <input
                type="text"
                value={student.studentId}
                onChange={(event) => setStudent((prev) => ({ ...prev, studentId: event.target.value }))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50"
                placeholder="STU-2024-001"
              />
            </div>

            <div className="space-y-4">
              <label className="block text-sm text-slate-300">Email</label>
              <input
                type="email"
                value={student.email}
                onChange={(event) => setStudent((prev) => ({ ...prev, email: event.target.value }))}
                className="w-full rounded-2xl border border-slate-700 bg-slate-950 px-4 py-3 text-slate-100 outline-none ring-1 ring-slate-800 transition focus:border-cyan-400 focus:ring-cyan-500/50"
                placeholder="student@example.com"
              />
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Webcam verification</p>
                  <p className="mt-1 text-slate-300">Start the camera and capture a snapshot to continue.</p>
                </div>
                <span
                  className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${
                    webcamActive ? 'bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-500/20' : 'bg-rose-500/15 text-rose-300 ring-1 ring-rose-500/20'
                  }`}
                >
                  {webcamActive ? 'Camera Active' : 'Camera Inactive'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={requestCamera}
                  className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Start Webcam Verification
                </button>
                <button
                  type="button"
                  onClick={capturePhoto}
                  className="rounded-2xl border border-cyan-500/20 bg-slate-900 px-5 py-3 text-sm font-semibold text-slate-100 transition hover:border-cyan-400"
                  disabled={!webcamActive}
                >
                  Capture Photo
                </button>
              </div>
              {student.photo && (
                <div className="rounded-3xl border border-slate-800 bg-slate-950 p-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Captured identity photo</p>
                  <img src={student.photo} alt="Captured student" className="mt-3 h-40 w-full rounded-2xl object-cover ring-1 ring-slate-700" />
                </div>
              )}
              {cameraError && <p className="text-sm text-rose-300">{cameraError}</p>}
            </div>

            <button
              type="button"
              onClick={startExam}
              className="w-full rounded-3xl bg-cyan-500 px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-400"
            >
              Begin Exam
            </button>

            {loginError && <p className="text-sm text-rose-300">{loginError}</p>}
            {student.loginTime && (
              <p className="text-sm text-slate-400">Login timestamp: {student.loginTime}</p>
            )}
          </section>

          <aside className="space-y-6 rounded-3xl border border-slate-800/70 bg-slate-900/80 p-8 shadow-[0_30px_70px_rgba(0,0,0,0.35)]">
            <div className="space-y-3">
              <h2 className="text-xl font-semibold text-slate-100">Verification Preview</h2>
              <div className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950/90 p-4">
                <div className="relative aspect-video overflow-hidden rounded-2xl bg-slate-900">
                  {webcamActive ? (
                    <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-slate-500">
                      Camera preview will appear here.
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-5">
              <p className="text-sm uppercase tracking-[0.2em] text-cyan-300">Exam readiness</p>
              <ul className="mt-4 space-y-3 text-slate-300">
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
                  Provide name, ID, and email.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
                  Webcam must be active and photo captured.
                </li>
                <li className="flex items-start gap-3">
                  <span className="mt-1 h-2.5 w-2.5 rounded-full bg-cyan-400"></span>
                  Fullscreen will be enforced during the exam.
                </li>
              </ul>
            </div>
          </aside>
        </main>

        <canvas ref={hiddenCanvasRef} className="hidden" />
      </div>
    );
  };

  const renderExamScreen = () => {
    const question = questions[currentQuestion];
    const isAnswered = answers[currentQuestion] !== null;

    return (
      <div className="relative min-h-screen overflow-hidden bg-[#031328] px-4 py-6 sm:px-6 lg:px-8">
        {fullscreenWarning && (
          <div className="fixed inset-x-0 top-0 z-50 border-b border-rose-500/30 bg-rose-950/95 p-4 text-sm text-rose-100 shadow-lg shadow-black/40">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>⚠️ Please return to fullscreen mode.</span>
              <button
                type="button"
                onClick={() => document.documentElement.requestFullscreen().catch(() => {})}
                className="rounded-2xl bg-rose-500 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-rose-400"
              >
                Re-enter Fullscreen
              </button>
            </div>
          </div>
        )}

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
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question {currentQuestion + 1} of {questions.length}</p>
                  <h2 className="mt-3 text-2xl font-semibold text-slate-100">{question.text}</h2>
                </div>
                <span className="inline-flex rounded-full bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200">
                  {isAnswered ? 'Answered' : 'Unanswered'}
                </span>
              </div>
            </div>

            <div className="space-y-4">
              {question.options.map((option, index) => {
                const selected = answers[currentQuestion] === index;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => handleAnswerChange(index)}
                    className={`w-full rounded-3xl border px-5 py-4 text-left transition ${
                      selected
                        ? 'border-cyan-400 bg-cyan-500/10 text-cyan-100 shadow-[inset_0_0_0_1px_rgba(56,189,248,0.35)]'
                        : 'border-slate-800 bg-slate-900/90 text-slate-200 hover:border-cyan-500/40 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-4">
                      <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-slate-950 text-sm font-semibold text-slate-300 ring-1 ring-slate-700">
                        {String.fromCharCode(65 + index)}
                      </span>
                      <span className="text-sm leading-6">{option}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setCurrentQuestion((prev) => Math.max(prev - 1, 0))}
                  className="rounded-3xl border border-slate-700/80 bg-slate-900/90 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentQuestion((prev) => Math.min(prev + 1, questions.length - 1))}
                  className="rounded-3xl border border-slate-700/80 bg-slate-900/90 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40"
                >
                  Next
                </button>
              </div>
              <button
                type="button"
                onClick={() => handleFinalSubmission(false)}
                className="rounded-3xl bg-cyan-500 px-6 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Submit Exam
              </button>
            </div>
          </section>

          <aside className="space-y-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/85 p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="rounded-3xl border border-cyan-500/15 bg-slate-900/80 p-5">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Monitoring Status</p>
              <div className="mt-4 rounded-3xl bg-slate-950/90 p-4 text-slate-300 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-slate-100">You are being monitored</p>
                  <p className="mt-2 text-sm leading-6 text-slate-400">
                    This session includes persistent webcam monitoring and live time tracking for exam integrity.
                  </p>
                </div>
                <div className="pt-3 border-t border-slate-700/50 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Warnings:</span>
                    <span className={`text-sm font-semibold ${warnings > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                      {warnings}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-400">Monitoring Active:</span>
                    <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  </div>
                  {violations.length > 0 && (
                    <div className="pt-2 border-t border-slate-700/50">
                      <p className="text-xs text-slate-500 mb-1">Last Violation:</p>
                      <p className="text-xs text-slate-400">{violations[violations.length - 1].message}</p>
                      <p className="text-xs text-slate-500 mt-1">{formatDateTime(violations[violations.length - 1].timestamp)}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-700/60 bg-slate-900/95 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Question Navigator</p>
              <div className="mt-4 grid grid-cols-5 gap-3">
                {questions.map((_, index) => {
                  const status = answers[index] === null ? 'unset' : 'answered';
                  const current = index === currentQuestion;
                  return (
                    <button
                      key={index}
                      type="button"
                      onClick={() => setCurrentQuestion(index)}
                      className={`rounded-2xl px-3 py-2 text-xs font-semibold transition ${
                        current ? 'bg-cyan-500 text-slate-950 ring-2 ring-cyan-400' : status === 'answered' ? 'bg-cyan-500/20 text-cyan-200 hover:bg-cyan-500/30' : 'bg-slate-900 text-slate-500 hover:bg-slate-800'
                      }`}
                    >
                      Q{index + 1}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        </main>

        <div className="pointer-events-none fixed top-6 right-6 z-40 w-[320px] rounded-3xl border border-cyan-500/15 bg-slate-950/95 p-4 shadow-[0_20px_70px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 py-3 px-3">
            {webcamActive ? (
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-48 h-36 rounded-lg border-2 border-green-500 object-cover"
              />
            ) : (
              <div className="flex h-36 items-center justify-center text-slate-500">Webcam feed unavailable</div>
            )}
            <div className="mt-3 rounded-2xl bg-slate-950/90 px-3 py-2 text-sm text-slate-200">
              <span className="font-semibold text-cyan-300">Live Feed</span> — persistent monitoring active.
            </div>
          </div>
        </div>

        {showSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6 backdrop-blur-sm">
            <div className="w-full max-w-xl rounded-[2rem] border border-cyan-500/20 bg-slate-900/95 p-8 shadow-[0_30px_90px_rgba(0,0,0,0.6)]">
              <h2 className="text-2xl font-semibold text-slate-100">Confirm submission</h2>
              <p className="mt-4 text-slate-300">
                Are you sure you want to submit? You cannot return to the exam once submission is confirmed.
              </p>
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={() => setShowSubmitModal(false)}
                  className="rounded-3xl border border-slate-700/80 bg-slate-950 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-cyan-500/40"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleFinalSubmission(true)}
                  className="rounded-3xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
                >
                  Submit exam
                </button>
              </div>
            </div>
          </div>
        )}

        {renderWarningModal()}
      </div>
    );
  };

  const renderResultScreen = () => {
    return (
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="rounded-[2rem] border border-cyan-500/20 bg-slate-900/90 p-8 shadow-[0_35px_90px_rgba(0,0,0,0.45)] backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Completion Summary</p>
          <h1 className="mt-4 text-4xl font-semibold text-slate-100">Exam Result</h1>
          <p className="mt-3 max-w-2xl text-slate-300">
            Below is your verified score and session report. The captured identity photo and monitoring summary are included for audit.
          </p>
        </header>

        <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <div className="space-y-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-3xl bg-slate-900/95 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Student</p>
                <p className="mt-3 text-xl font-semibold text-slate-100">{student.name}</p>
                <p className="mt-1 text-slate-400">{student.studentId}</p>
              </div>
              <div className="rounded-3xl bg-slate-900/95 p-6">
                <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Score</p>
                <p className="mt-3 text-4xl font-semibold text-cyan-300">{resultScore} / {questions.length}</p>
                <p className="mt-1 text-slate-400">Cheating score: 0</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="rounded-3xl bg-slate-900/95 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Start time</p>
                <p className="mt-3 text-sm text-slate-200">{formatDateTime(examStartTime)}</p>
              </div>
              <div className="rounded-3xl bg-slate-900/95 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">End time</p>
                <p className="mt-3 text-sm text-slate-200">{formatDateTime(examEndTime)}</p>
              </div>
              <div className="rounded-3xl bg-slate-900/95 p-5">
                <p className="text-xs uppercase tracking-[0.3em] text-cyan-300">Duration</p>
                <p className="mt-3 text-sm text-slate-200">{getDuration(examStartTime, examEndTime)}</p>
              </div>
            </div>

            <div className="rounded-[2rem] border border-cyan-500/10 bg-slate-900/90 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Identity capture</p>
                  <p className="mt-2 text-slate-400">The photo captured at login is retained for the session report.</p>
                </div>
                {student.photo && <img src={student.photo} alt="Captured identity" className="h-24 w-24 rounded-3xl object-cover ring-2 ring-cyan-500/40" />}
              </div>
            </div>
          </div>

          <aside className="space-y-6 rounded-[2rem] border border-slate-800/80 bg-slate-950/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
            <div className="rounded-[2rem] bg-slate-900/95 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Report Actions</p>
              <button
                type="button"
                onClick={downloadReport}
                className="mt-6 w-full rounded-3xl bg-cyan-500 px-5 py-4 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400"
              >
                Download Report
              </button>
            </div>
            <div className="rounded-[2rem] bg-slate-900/95 p-6">
              <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Audit note</p>
              <p className="mt-4 text-slate-400 leading-6">
                All answers were evaluated after submission. Correct answers are shown only in this summary to preserve exam integrity.
              </p>
            </div>
          </aside>
        </section>

        <section className="space-y-4 rounded-[2rem] border border-slate-800/75 bg-slate-950/90 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
          <h2 className="text-2xl font-semibold text-slate-100">Question Breakdown</h2>
          <div className="space-y-4">
            {questions.map((item, index) => {
              const selectedIndex = answers[index];
              const selectedAnswer = selectedIndex !== null ? item.options[selectedIndex] : 'No answer';
              const correctAnswer = item.options[item.correct];
              const correct = selectedIndex === item.correct;
              return (
                <div key={item.text} className="rounded-3xl border border-slate-800/70 bg-slate-900/80 p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm uppercase tracking-[0.3em] text-cyan-300">Question {index + 1}</p>
                      <p className="mt-2 text-lg font-semibold text-slate-100">{item.text}</p>
                    </div>
                    <span className={`rounded-full px-4 py-2 text-sm font-semibold ${correct ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                      {correct ? '✅ Correct' : '❌ Incorrect'}
                    </span>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Selected</p>
                      <p className="mt-2 text-slate-100">{selectedAnswer}</p>
                    </div>
                    <div className="rounded-3xl bg-slate-950/80 p-4 text-sm text-slate-300">
                      <p className="text-xs uppercase tracking-[0.25em] text-slate-500">Correct</p>
                      <p className="mt-2 text-slate-100">{correctAnswer}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#020c1b] text-slate-100">
      {screen === 'login' && renderLoginScreen()}
      {screen === 'exam' && renderExamScreen()}
      {screen === 'result' && renderResultScreen()}
    </div>
  );
}

export default App;
