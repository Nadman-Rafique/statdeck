/**
 * src/pages/StudentPage.jsx
 * Notion-style Student Progress Page (/my-page for students, interactive /preview for tutor)
 * with Google Drive Master Note uploads, viewing, replacement, and deletion.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { collection, doc, onSnapshot, updateDoc } from "firebase/firestore";
import { db } from "../firebase";
import { useAuth } from "../context/AuthContext";
import {
  calculateChapterScore,
  calculateSubjectScore,
  calculateUnifiedRank
} from "../utils/scoring";

const DRIVE_UPLOAD_URL = import.meta.env.VITE_DRIVE_UPLOAD_URL || "";

function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const commaIdx = result.indexOf(",");
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

export default function StudentPage({ isPreview = false }) {
  const { role, studentProfile } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [expandedSubjectId, setExpandedSubjectId] = useState(null);
  const [uploadingChapter, setUploadingChapter] = useState(null);
  const [noteStatus, setNoteStatus] = useState({ type: "", text: "" });

  const fileInputRef = useRef(null);
  const pendingUploadChapterRef = useRef(null);

  const selectedIdParam = searchParams.get("id");
  const canEditProgress = isPreview || role === "tutor";

  const showNoteNotice = (type, text) => {
    setNoteStatus({ type, text });
    setTimeout(() => setNoteStatus({ type: "", text: "" }), 4000);
  };

  useEffect(() => {
    const unsubStudents = onSnapshot(collection(db, "students"), (snap) => {
      setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubSubjects = onSnapshot(collection(db, "subjects"), (snap) => {
      setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    const unsubExams = onSnapshot(collection(db, "exams"), (snap) => {
      setExams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubStudents();
      unsubSubjects();
      unsubExams();
    };
  }, []);

  // Resolve active student: student's own profile OR tutor-selected preview student
  const activeStudent = useMemo(() => {
    if (!isPreview && role === "student" && studentProfile) {
      return studentProfile;
    }
    if (students.length === 0) return null;
    if (selectedIdParam) {
      const match = students.find((s) => s.id === selectedIdParam);
      if (match) return match;
    }
    return students[0];
  }, [isPreview, role, studentProfile, students, selectedIdParam]);

  const handleToggleStep = async (chapterName, field) => {
    if (!canEditProgress || !activeStudent?.id) return;

    const currentProgress = activeStudent.progress || {};
    const chProgress = currentProgress[chapterName] || {
      basicConcept: false,
      basicQn: false,
      masterNote: false
    };

    const updatedProgress = {
      ...currentProgress,
      [chapterName]: {
        ...chProgress,
        [field]: !chProgress[field]
      }
    };

    await updateDoc(doc(db, "students", activeStudent.id), {
      progress: updatedProgress
    });
  };

  const handleTriggerNoteUpload = (chapterName) => {
    if (!canEditProgress || !activeStudent?.id) return;
    if (!DRIVE_UPLOAD_URL) {
      showNoteNotice(
        "err",
        "Set VITE_DRIVE_UPLOAD_URL in your .env file to enable Google Drive uploads."
      );
      return;
    }
    pendingUploadChapterRef.current = chapterName;
    fileInputRef.current?.click();
  };

  const handleNoteFileSelected = async (e) => {
    const file = e.target.files?.[0];
    const chapterName = pendingUploadChapterRef.current;
    e.target.value = "";
    pendingUploadChapterRef.current = null;

    if (!file || !chapterName || !activeStudent?.id) return;

    // Keep base64 payload reasonable for Apps Script execution limits (~15MB raw)
    if (file.size > 15 * 1024 * 1024) {
      showNoteNotice("err", "File must be 15 MB or smaller.");
      return;
    }

    setUploadingChapter(chapterName);
    try {
      const base64Data = await readFileAsBase64(file);
      const res = await fetch(DRIVE_UPLOAD_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          base64Data,
          studentName: activeStudent.name || "Student",
          chapterName
        })
      });

      const data = await res.json();
      if (!res.ok || data.error || !data.viewUrl) {
        throw new Error(data.error || "Drive upload failed");
      }

      const currentProgress = activeStudent.progress || {};
      const chProgress = currentProgress[chapterName] || {
        basicConcept: false,
        basicQn: false,
        masterNote: false
      };

      const updatedProgress = {
        ...currentProgress,
        [chapterName]: {
          ...chProgress,
          masterNote: true,
          masterNoteFile: {
            name: data.fileName || file.name,
            url: data.viewUrl,
            uploadedAt: new Date().toISOString()
          }
        }
      };

      await updateDoc(doc(db, "students", activeStudent.id), {
        progress: updatedProgress
      });

      showNoteNotice("ok", `Uploaded "${file.name}" for ${chapterName}.`);
    } catch (err) {
      console.error(err);
      showNoteNotice("err", `Master Note upload error: ${err.message}`);
    } finally {
      setUploadingChapter(null);
    }
  };

  const handleDeleteNote = async (chapterName) => {
    if (!canEditProgress || !activeStudent?.id) return;
    if (!window.confirm(`Remove the Master Note and uncheck Master Note for "${chapterName}"?`)) {
      return;
    }

    const currentProgress = activeStudent.progress || {};
    const chProgress = currentProgress[chapterName] || {
      basicConcept: false,
      basicQn: false,
      masterNote: false
    };

    const { masterNoteFile: _removed, ...restChapterProgress } = chProgress;

    const updatedProgress = {
      ...currentProgress,
      [chapterName]: {
        ...restChapterProgress,
        masterNote: false
      }
    };

    try {
      await updateDoc(doc(db, "students", activeStudent.id), {
        progress: updatedProgress
      });
      showNoteNotice(
        "ok",
        `Removed Master Note and unchecked Master Note for "${chapterName}".`
      );
    } catch (err) {
      console.error(err);
      showNoteNotice("err", `Failed to delete note: ${err.message}`);
    }
  };

  // Compute per-subject & per-chapter breakdowns dynamically for enrolled subjects
  const computed = useMemo(() => {
    if (!activeStudent) {
      return {
        subjectBreakdowns: [],
        rank: { totalScore: 50, rankTier: "Starter" },
        upcomingExams: [],
        lastGradedExam: null,
        insights: [],
        uploadedNotes: []
      };
    }

    const levelSubjects = subjects.filter(
      (sub) => !sub.level || !activeStudent.level || sub.level === activeStudent.level
    );

    const enrolledIds = Array.isArray(activeStudent.enrolledSubjectIds)
      ? activeStudent.enrolledSubjectIds
      : [];

    const visibleSubjects =
      enrolledIds.length > 0
        ? levelSubjects.filter((s) => enrolledIds.includes(s.id))
        : levelSubjects;

    const sortedExams = [...exams].sort((a, b) =>
      (a.date || "").localeCompare(b.date || "")
    );

    const uploadedNotes = [];

    const subjectBreakdowns = visibleSubjects.map((sub) => {
      const subChapters = Array.isArray(sub.chapters) ? sub.chapters : [];

      const mockExams = sortedExams.filter(
        (ex) =>
          ex.isMock &&
          ex.subjectId === sub.id &&
          ex.scores?.[activeStudent.id] !== undefined
      );
      const latestMock = mockExams[mockExams.length - 1];
      const mockPct = latestMock
        ? (latestMock.scores[activeStudent.id] / latestMock.maxMarks) * 100
        : 0;

      const chapterRows = subChapters.map((ch) => {
        const prog = activeStudent.progress?.[ch.name] || {
          basicConcept: false,
          basicQn: false,
          masterNote: false,
          masterNoteFile: null
        };

        if (prog.masterNoteFile?.url) {
          uploadedNotes.push({
            subjectName: sub.name,
            chapterName: ch.name,
            fileName: prog.masterNoteFile.name || `${ch.name} Note`,
            url: prog.masterNoteFile.url
          });
        }

        const chExams = sortedExams.filter(
          (ex) =>
            !ex.isMock &&
            ex.subjectId === sub.id &&
            (ex.chapter || "").trim().toLowerCase() ===
              (ch.name || "").trim().toLowerCase() &&
            ex.scores?.[activeStudent.id] !== undefined
        );
        const last3Pcts = chExams
          .slice(-3)
          .map((ex) => (ex.scores[activeStudent.id] / ex.maxMarks) * 100);

        const chapterScore = calculateChapterScore(prog, last3Pcts);
        const bestAttemptPct =
          last3Pcts.length > 0 ? Math.round(Math.max(...last3Pcts)) : null;

        return {
          section: ch.section || "General",
          name: ch.name,
          weight: ch.weight || 1,
          prog,
          bestAttemptPct,
          score: Math.round(chapterScore)
        };
      });

      const subjectPct = calculateSubjectScore(
        chapterRows.map((c) => ({ weight: c.weight, score: c.score })),
        mockPct
      );

      return {
        id: sub.id,
        name: sub.name,
        subjectPct: Math.round(subjectPct),
        mockPct: latestMock ? Math.round(mockPct) : null,
        chapters: chapterRows
      };
    });

    const subjectPctList =
      subjectBreakdowns.length > 0
        ? subjectBreakdowns.map((s) => s.subjectPct)
        : activeStudent.subjectScores || [];

    const rank = calculateUnifiedRank(
      subjectPctList,
      activeStudent.tutorBonus || 0
    );

    const visibleSubjectIds = new Set(visibleSubjects.map((s) => s.id));
    const relevantExams = sortedExams.filter(
      (ex) => !ex.subjectId || visibleSubjectIds.has(ex.subjectId)
    );

    const upcomingExams = relevantExams.filter(
      (ex) => ex.scores?.[activeStudent.id] === undefined
    );

    const gradedExams = relevantExams.filter(
      (ex) => ex.scores?.[activeStudent.id] !== undefined
    );
    const lastExamObj = gradedExams[gradedExams.length - 1] || null;
    const lastGradedExam = lastExamObj
      ? {
          ...lastExamObj,
          raw: lastExamObj.scores[activeStudent.id],
          pct: Math.round(
            (lastExamObj.scores[activeStudent.id] / lastExamObj.maxMarks) * 100
          )
        }
      : null;

    const insights = [];
    subjectBreakdowns.forEach((sub) => {
      sub.chapters.forEach((ch) => {
        if (ch.bestAttemptPct !== null && ch.bestAttemptPct < 80) {
          insights.push(
            `${sub.name} — ${ch.name}: Best exam is ${ch.bestAttemptPct}%. Retaking to hit 80%+ unlocks the top 30–40 pt tier.`
          );
        } else if (!ch.prog.masterNote && ch.weight >= 7) {
          insights.push(
            `${sub.name} — ${ch.name} (Weight ${ch.weight}): Complete & upload the Master Note for an easy +20 pts.`
          );
        }
      });
    });

    if (insights.length === 0) {
      insights.push(
        "All enrolled chapters are on pace! Keep consistent across upcoming mocks."
      );
    }

    return {
      subjectBreakdowns,
      rank,
      upcomingExams,
      lastGradedExam,
      insights: insights.slice(0, 4),
      uploadedNotes
    };
  }, [activeStudent, subjects, exams]);

  if (!activeStudent) {
    return (
      <div className="container">
        <div className="panel">
          <h2>No Student Profile Found</h2>
          <p className="muted">
            Add a student record in Tutor Tables first to preview their page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container student-page-stack">
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
        style={{ display: "none" }}
        onChange={handleNoteFileSelected}
      />

      {noteStatus.text && (
        <div
          className={noteStatus.type === "err" ? "alert-err" : "panel"}
          style={{
            padding: "10px 16px",
            borderColor: noteStatus.type === "err" ? undefined : "#22c55e",
            color: noteStatus.type === "err" ? undefined : "#86efac"
          }}
        >
          {noteStatus.text}
        </div>
      )}

      {/* Tutor Preview Switcher */}
      {canEditProgress && students.length > 0 && (
        <div className="preview-bar" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
          <div className="flex-row" style={{ gap: "12px" }}>
            <span className="muted-sm">Previewing Student Page:</span>
            <select
              className="input-box preview-select"
              value={activeStudent.id}
              onChange={(e) => setSearchParams({ id: e.target.value })}
            >
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name || s.email || s.id} ({s.level || "Student"})
                </option>
              ))}
            </select>
          </div>
          <span className="pill" style={{ textTransform: "none" }}>
            Tutor Edit Mode: Toggle steps or manage Master Notes
          </span>
        </div>
      )}

      {/* 1. Gradient Identity Card */}
      <section className="student-hero">
        <div>
          <span className="tier-badge">{computed.rank.rankTier}</span>
          <h1 className="hero-name">{activeStudent.name || "Student"}</h1>
          <p className="muted-sm">
            {activeStudent.level || "Candidate"} • Invite Code:{" "}
            <strong>{activeStudent.inviteCode || "—"}</strong>
          </p>
        </div>
        <div className="hero-score-box">
          <div className="hero-score">
            {computed.rank.totalScore} <span>/ 500</span>
          </div>
          <div className="muted-sm">Unified Standing</div>
        </div>
      </section>

      {/* 2. Top 2-Column Row: Upcoming Exams & Last Exam Result */}
      <div className="student-two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>Upcoming Exams</h2>
            <span className="muted-sm">{computed.upcomingExams.length} scheduled</span>
          </div>
          {computed.upcomingExams.length === 0 ? (
            <p className="muted-sm">No pending exams scheduled right now.</p>
          ) : (
            <div className="standings-list">
              {computed.upcomingExams.map((ex) => (
                <div key={ex.id} className="standing-row">
                  <div>
                    <div className="font-bold">{ex.title}</div>
                    <div className="muted-sm">
                      {ex.date || "TBA"} •{" "}
                      {ex.isMock ? "Subject Mock" : ex.chapter || "Chapter Exam"} (Max:{" "}
                      {ex.maxMarks})
                    </div>
                  </div>
                  <div className="standing-right">
                    {ex.qLink && (
                      <a href={ex.qLink} target="_blank" rel="noreferrer" className="btn-sm btn-link">
                        Paper
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Last Exam Result</h2>
            <span className="muted-sm">Latest Graded</span>
          </div>
          {!computed.lastGradedExam ? (
            <p className="muted-sm">No graded exams recorded yet.</p>
          ) : (
            <div className="last-exam-card">
              <div className="font-bold">{computed.lastGradedExam.title}</div>
              <div className="muted-sm">
                {computed.lastGradedExam.date} •{" "}
                {computed.lastGradedExam.isMock
                  ? "Subject Mock"
                  : computed.lastGradedExam.chapter}
              </div>
              <div className="last-exam-score">
                {computed.lastGradedExam.raw} / {computed.lastGradedExam.maxMarks}{" "}
                <span className="tier-badge">{computed.lastGradedExam.pct}%</span>
              </div>
              {computed.lastGradedExam.aLink && (
                <a
                  href={computed.lastGradedExam.aLink}
                  target="_blank"
                  rel="noreferrer"
                  className="btn-ghost btn-link"
                  style={{ marginTop: "10px", padding: "6px 12px", fontSize: "0.8rem" }}
                >
                  View Mark Scheme
                </a>
              )}
            </div>
          )}
        </section>
      </div>

      {/* 3. Expandable Subject & Chapter Mastery Cards */}
      <section className="panel">
        <div className="panel-head">
          <h2>Enrolled Subjects & Chapter Mastery</h2>
          <span className="muted-sm">
            {canEditProgress
              ? "Expand a subject to toggle steps or manage Master Notes"
              : "Click a subject to expand sections & chapters"}
          </span>
        </div>

        <div className="subject-cards-grid">
          {computed.subjectBreakdowns.map((sub) => {
            const isOpen = expandedSubjectId === sub.id;
            return (
              <div
                key={sub.id}
                className={`subject-card ${isOpen ? "expanded" : ""}`}
              >
                <div
                  className="subject-card-head"
                  onClick={() => setExpandedSubjectId(isOpen ? null : sub.id)}
                >
                  <div>
                    <div className="font-bold">{sub.name}</div>
                    <div className="muted-sm">
                      {sub.chapters.length} chapters • Mock:{" "}
                      {sub.mockPct !== null ? `${sub.mockPct}%` : "Pending"}
                    </div>
                  </div>
                  <div className="subject-pct-pill">{sub.subjectPct}%</div>
                </div>

                {isOpen && (
                  <div className="chapter-list">
                    {sub.chapters.length === 0 ? (
                      <div className="muted-sm">No chapters added yet.</div>
                    ) : (
                      sub.chapters.map((ch, idx) => {
                        const noteFile = ch.prog.masterNoteFile;
                        const isUploadingThis = uploadingChapter === ch.name;

                        return (
                          <div key={idx} className="chapter-row">
                            <div>
                              <div className="font-bold">
                                <span className="muted-sm">[{ch.section}] </span>
                                {ch.name}{" "}
                                <span className="muted-sm">(W: {ch.weight})</span>
                              </div>
                              <div className="step-pills">
                                {[
                                  { key: "basicConcept", label: "Concept" },
                                  { key: "basicQn", label: "Basic Q/N" },
                                  { key: "masterNote", label: "Master Note" }
                                ].map((step) => {
                                  const isDone = Boolean(ch.prog[step.key]);
                                  return canEditProgress ? (
                                    <button
                                      key={step.key}
                                      type="button"
                                      onClick={() => handleToggleStep(ch.name, step.key)}
                                      className={`step-tag ${isDone ? "done" : ""}`}
                                      style={{
                                        border: isDone
                                          ? "1px solid rgba(34, 197, 94, 0.45)"
                                          : "1px solid #334155",
                                        cursor: "pointer",
                                        fontFamily: "inherit"
                                      }}
                                    >
                                      {isDone ? "✓ " : "+ "}
                                      {step.label}
                                    </button>
                                  ) : (
                                    <span
                                      key={step.key}
                                      className={`step-tag ${isDone ? "done" : ""}`}
                                    >
                                      {isDone ? "✓ " : ""}
                                      {step.label}
                                    </span>
                                  );
                                })}

                                {canEditProgress && (
                                  <button
                                    type="button"
                                    disabled={Boolean(uploadingChapter)}
                                    onClick={() => handleTriggerNoteUpload(ch.name)}
                                    className="step-tag"
                                    style={{
                                      border: "1px solid #3b82f6",
                                      color: "#93c5fd",
                                      background: "rgba(59, 130, 246, 0.14)",
                                      cursor: "pointer",
                                      fontFamily: "inherit"
                                    }}
                                  >
                                    {isUploadingThis
                                      ? "Uploading..."
                                      : noteFile?.url
                                      ? "Replace Note"
                                      : "Upload Note"}
                                  </button>
                                )}

                                {noteFile?.url && (
                                  <a
                                    href={noteFile.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="step-tag done"
                                    style={{ textDecoration: "none" }}
                                    title={noteFile.name || "Open Master Note"}
                                  >
                                    View Note ({noteFile.name || "File"})
                                  </a>
                                )}

                                {canEditProgress && noteFile?.url && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteNote(ch.name)}
                                    className="step-tag"
                                    style={{
                                      border: "1px solid rgba(248, 113, 113, 0.45)",
                                      color: "#fca5a5",
                                      background: "rgba(127, 29, 29, 0.25)",
                                      cursor: "pointer",
                                      fontFamily: "inherit"
                                    }}
                                  >
                                    Delete Note
                                  </button>
                                )}

                                <span className="step-tag">
                                  Exam: {ch.bestAttemptPct !== null ? `${ch.bestAttemptPct}%` : "—"}
                                </span>
                              </div>
                            </div>
                            <strong className="text-blue-300">{ch.score} / 100</strong>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {computed.subjectBreakdowns.length === 0 && (
            <p className="muted-sm">No subjects enrolled yet.</p>
          )}
        </div>
      </section>

      {/* 4. Student Master Notes Vault + Focus Insights */}
      <div className="student-two-col">
        <section className="panel">
          <div className="panel-head">
            <h2>Master Notes</h2>
            <span className="muted-sm">{computed.uploadedNotes.length} file(s)</span>
          </div>
          {computed.uploadedNotes.length === 0 ? (
            <p className="muted-sm">No master notes uploaded yet.</p>
          ) : (
            <div className="standings-list">
              {computed.uploadedNotes.map((note, idx) => (
                <div key={idx} className="standing-row">
                  <div>
                    <div className="font-bold">{note.chapterName}</div>
                    <div className="muted-sm">
                      {note.subjectName} • {note.fileName}
                    </div>
                  </div>
                  <div className="standing-right">
                    <a
                      href={note.url}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-sm btn-link"
                    >
                      Open Note
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-head">
            <h2>Focus Insights</h2>
            <span className="muted-sm">Auto-updated</span>
          </div>
          <ul className="insight-list">
            {computed.insights.map((tip, idx) => (
              <li key={idx}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}