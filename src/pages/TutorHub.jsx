/**
 * src/pages/TutorHub.jsx
 * Real-time Tutor Command Hub managing Subjects, Sections/Chapters, Student Enrollments/Progress, Exams, Resources & Schedule.
 */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import {
  collection, onSnapshot, doc, updateDoc, addDoc, deleteDoc, setDoc, query, orderBy
} from "firebase/firestore";
import { db } from "../firebase";
import { calculateUnifiedRank } from "../utils/scoring";

function generateInviteCode(length = 6) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

const DEFAULT_RESOURCES = {
  oLevel: [
    { label: "Book", url: "" },
    { label: "Master Notes", url: "" },
    { label: "Q/N Papers", url: "" },
    { label: "Previous Exam Questions", url: "" }
  ],
  aLevel: [
    { label: "Book", url: "" },
    { label: "Master Notes", url: "" },
    { label: "Q/N Papers", url: "" },
    { label: "Previous Exam Questions", url: "" }
  ]
};

const DEFAULT_TIME_SLOTS = [
  "4:00 - 6:00 PM",
  "6:00 - 8:00 PM",
  "8:00 - 9:30 PM"
];

const DEFAULT_SCHEDULE = [
  { day: "Saturday", slot1: "O-Level Maths", slot2: "A-Level Pure 1", slot3: "Doubt / Q&N" },
  { day: "Monday", slot1: "O-Level Physics", slot2: "A-Level Mechanics", slot3: "Doubt / Q&N" },
  { day: "Wednesday", slot1: "O-Level Add Maths", slot2: "A-Level Statistics", slot3: "Mock Review" }
];

export default function TutorHub() {
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [feedback, setFeedback] = useState({ type: "", text: "" });
  const [selectedChapterByStudent, setSelectedChapterByStudent] = useState({});

  // Resources & Schedule Config State
  const [resources, setResources] = useState(DEFAULT_RESOURCES);
  const [timeSlots, setTimeSlots] = useState(DEFAULT_TIME_SLOTS);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);
  const [savingConfig, setSavingConfig] = useState(false);

  // Add Subject Modal State
  const [showSubjectModal, setShowSubjectModal] = useState(false);
  const [subjectForm, setSubjectForm] = useState({
    name: "",
    level: "O-Level",
    firstSection: "General",
    firstChapterName: "",
    firstChapterWeight: 10
  });

  // Multi-Chapter Modal State
  const [activeChapterSubject, setActiveChapterSubject] = useState(null);
  const [existingChaptersDraft, setExistingChaptersDraft] = useState([]);
  const [newChapterRows, setNewChapterRows] = useState([
    { section: "General", name: "", weight: 8 }
  ]);

  // Exam Event Modal State
  const [showEventModal, setShowEventModal] = useState(false);
  const [newEvent, setNewEvent] = useState({
    title: "",
    date: "",
    isMock: false,
    subjectId: "",
    chapter: "",
    maxMarks: 40,
    qLink: "",
    aLink: ""
  });

  // Add Student Modal State
  const [showStudentModal, setShowStudentModal] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: "",
    level: "O-Level",
    inviteCode: generateInviteCode(6),
    tutorBonus: 0,
    enrolledSubjectIds: []
  });
  const [copiedCodeId, setCopiedCodeId] = useState(null);

  const showNotice = (type, text) => {
    setFeedback({ type, text });
    setTimeout(() => setFeedback({ type: "", text: "" }), 3500);
  };

  // Real-time Data Sync
  useEffect(() => {
    const unsubSubjects = onSnapshot(
      collection(db, "subjects"),
      (snap) => setSubjects(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => showNotice("err", `Subjects sync error: ${err.message}`)
    );

    const unsubStudents = onSnapshot(
      collection(db, "students"),
      (snap) => setStudents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => showNotice("err", `Students sync error: ${err.message}`)
    );

    const examsRef = query(collection(db, "exams"), orderBy("date", "desc"));
    const unsubExams = onSnapshot(
      examsRef,
      (snap) => setExams(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      (err) => showNotice("err", `Exams sync error: ${err.message}`)
    );

    const unsubConfig = onSnapshot(
      doc(db, "settings", "hubConfig"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          if (data.resources) {
            setResources({
              oLevel: Array.isArray(data.resources.oLevel)
                ? data.resources.oLevel
                : DEFAULT_RESOURCES.oLevel,
              aLevel: Array.isArray(data.resources.aLevel)
                ? data.resources.aLevel
                : DEFAULT_RESOURCES.aLevel
            });
          }
          if (Array.isArray(data.timeSlots) && data.timeSlots.length >= 3) {
            setTimeSlots(data.timeSlots.slice(0, 3));
          }
          if (Array.isArray(data.schedule)) {
            setSchedule(data.schedule);
          }
        }
      },
      (err) => showNotice("err", `Config sync error: ${err.message}`)
    );

    return () => {
      unsubSubjects();
      unsubStudents();
      unsubExams();
      unsubConfig();
    };
  }, []);

  // --- 1. Subject, Section & Multi-Chapter Handlers ---
  const handleCreateSubject = async (e) => {
    e.preventDefault();
    const cleanedName = subjectForm.name.trim();
    if (!cleanedName) return;

    const initialChapters = [];
    if (subjectForm.firstChapterName.trim()) {
      const w = Math.max(1, Math.min(parseInt(subjectForm.firstChapterWeight, 10) || 10, 10));
      initialChapters.push({
        section: subjectForm.firstSection.trim() || "General",
        name: subjectForm.firstChapterName.trim(),
        weight: w
      });
    }

    try {
      await addDoc(collection(db, "subjects"), {
        name: cleanedName,
        level: subjectForm.level,
        chapters: initialChapters,
        createdAt: new Date().toISOString()
      });
      setSubjectForm({
        name: "",
        level: "O-Level",
        firstSection: "General",
        firstChapterName: "",
        firstChapterWeight: 10
      });
      setShowSubjectModal(false);
      showNotice("ok", `Added subject "${cleanedName}".`);
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to add subject: ${err.message}`);
    }
  };

  const openChaptersModal = (sub) => {
    const currentList = Array.isArray(sub.chapters) ? sub.chapters : [];
    const lastSection = currentList[currentList.length - 1]?.section || "General";
    setActiveChapterSubject(sub);
    setExistingChaptersDraft(
      currentList.map((ch) => ({
        section: ch.section || "General",
        name: ch.name || "",
        weight: ch.weight || 5
      }))
    );
    setNewChapterRows([{ section: lastSection, name: "", weight: 8 }]);
  };

  const addNewChapterRow = () => {
    const prevSec =
      newChapterRows[newChapterRows.length - 1]?.section ||
      existingChaptersDraft[existingChaptersDraft.length - 1]?.section ||
      "General";
    setNewChapterRows((prev) => [...prev, { section: prevSec, name: "", weight: 8 }]);
  };

  const updateNewChapterRow = (index, field, value) => {
    setNewChapterRows((prev) =>
      prev.map((row, idx) => (idx === index ? { ...row, [field]: value } : row))
    );
  };

  const removeNewChapterRow = (index) => {
    setNewChapterRows((prev) =>
      prev.length > 1 ? prev.filter((_, idx) => idx !== index) : prev
    );
  };

  const removeExistingChapter = (index) => {
    setExistingChaptersDraft((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSaveChapters = async (e) => {
    e.preventDefault();
    if (!activeChapterSubject) return;

    const validNew = newChapterRows
      .filter((row) => row.name.trim().length > 0)
      .map((row) => ({
        section: row.section.trim() || "General",
        name: row.name.trim(),
        weight: Math.max(1, Math.min(parseInt(row.weight, 10) || 5, 10))
      }));

    const finalChapters = [...existingChaptersDraft, ...validNew];

    try {
      await updateDoc(doc(db, "subjects", activeChapterSubject.id), {
        chapters: finalChapters
      });
      setActiveChapterSubject(null);
      showNotice(
        "ok",
        `Saved ${finalChapters.length} chapter(s) for "${activeChapterSubject.name}".`
      );
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to save chapters: ${err.message}`);
    }
  };

  const handleDeleteSubject = async (subjectId, subjectName) => {
    if (!window.confirm(`Delete subject "${subjectName}"?`)) return;
    try {
      await deleteDoc(doc(db, "subjects", subjectId));
      showNotice("ok", `Deleted "${subjectName}".`);
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to delete subject: ${err.message}`);
    }
  };

  // --- 2. Student Progress, Level-Locked Enrollment & Deletion Handlers ---
  const handleOpenStudentModal = () => {
    setNewStudent({
      name: "",
      level: "O-Level",
      inviteCode: generateInviteCode(6),
      tutorBonus: 0,
      enrolledSubjectIds: []
    });
    setShowStudentModal(true);
  };

  const toggleNewStudentSubject = (subjectId) => {
    setNewStudent((prev) => {
      const exists = prev.enrolledSubjectIds.includes(subjectId);
      return {
        ...prev,
        enrolledSubjectIds: exists
          ? prev.enrolledSubjectIds.filter((id) => id !== subjectId)
          : [...prev.enrolledSubjectIds, subjectId]
      };
    });
  };

  const handleCreateStudent = async (e) => {
    e.preventDefault();
    const cleanedName = newStudent.name.trim();
    const cleanedCode = newStudent.inviteCode.trim().toUpperCase();
    if (!cleanedName || !cleanedCode) return;

    const validSubjectIds = new Set(
      subjects
        .filter((s) => !s.level || s.level === newStudent.level)
        .map((s) => s.id)
    );
    const filteredEnrollments = newStudent.enrolledSubjectIds.filter((id) =>
      validSubjectIds.has(id)
    );

    const safeBonus = Math.max(0, Math.min(parseInt(newStudent.tutorBonus, 10) || 0, 50));

    try {
      await addDoc(collection(db, "students"), {
        name: cleanedName,
        level: newStudent.level,
        inviteCode: cleanedCode,
        tutorBonus: safeBonus,
        enrolledSubjectIds: filteredEnrollments,
        subjectScores: [],
        progress: {},
        authUid: null,
        email: null,
        createdAt: new Date().toISOString()
      });
      setShowStudentModal(false);
      showNotice("ok", `Created student "${cleanedName}" with code ${cleanedCode}.`);
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to add student: ${err.message}`);
    }
  };

  const handleDeleteStudent = async (studentId, studentName) => {
    if (!window.confirm(`Delete student "${studentName || "this student"}"?`)) return;
    try {
      await deleteDoc(doc(db, "students", studentId));
      showNotice("ok", `Deleted student "${studentName || studentId}".`);
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to delete student: ${err.message}`);
    }
  };

  const handleToggleStudentEnrollment = async (student, subjectId) => {
    const targetSub = subjects.find((s) => s.id === subjectId);
    if (targetSub?.level && student.level && targetSub.level !== student.level) {
      showNotice(
        "err",
        `Cannot enroll ${student.level} student in ${targetSub.level} subject.`
      );
      return;
    }

    const currentList = Array.isArray(student.enrolledSubjectIds)
      ? student.enrolledSubjectIds
      : [];
    const updatedList = currentList.includes(subjectId)
      ? currentList.filter((id) => id !== subjectId)
      : [...currentList, subjectId];

    try {
      await updateDoc(doc(db, "students", student.id), {
        enrolledSubjectIds: updatedList
      });
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to update enrollment: ${err.message}`);
    }
  };

  const handleCopyInviteCode = (studentId, code) => {
    if (!code) return;
    navigator.clipboard?.writeText(code);
    setCopiedCodeId(studentId);
    setTimeout(() => setCopiedCodeId(null), 1500);
  };

  const handleTutorBonusChange = async (studentId, rawValue) => {
    let bonus = parseInt(rawValue, 10) || 0;
    bonus = Math.max(0, Math.min(bonus, 50));
    await updateDoc(doc(db, "students", studentId), { tutorBonus: bonus });
  };

  const toggleChapterProgress = async (studentId, progressMap, chapterName, field) => {
    const current = progressMap || {};
    const chProgress = current[chapterName] || {
      basicConcept: false,
      basicQn: false,
      masterNote: false
    };

    const updated = {
      ...current,
      [chapterName]: { ...chProgress, [field]: !chProgress[field] }
    };

    await updateDoc(doc(db, "students", studentId), { progress: updated });
  };

  // --- 3. Exam & Event Handlers ---
  const handleCreateExam = async (e) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, "exams"), {
        ...newEvent,
        scores: {},
        status: "Active",
        createdAt: new Date().toISOString()
      });
      setShowEventModal(false);
      setNewEvent({
        title: "",
        date: "",
        isMock: false,
        subjectId: "",
        chapter: "",
        maxMarks: 40,
        qLink: "",
        aLink: ""
      });
      showNotice("ok", "Exam/Event created.");
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to create event: ${err.message}`);
    }
  };

  const handleScoreUpdate = async (examId, currentScores, studentId, rawMarks, maxMarks) => {
    let marks = parseFloat(rawMarks);
    if (isNaN(marks) || rawMarks === "") marks = null;
    if (marks !== null && marks > maxMarks) marks = maxMarks;

    const updatedScores = { ...currentScores };
    if (marks === null) {
      delete updatedScores[studentId];
    } else {
      updatedScores[studentId] = marks;
    }

    await updateDoc(doc(db, "exams", examId), { scores: updatedScores });
  };

  const handleDeleteExam = async (examId) => {
    if (window.confirm("Are you sure you want to delete this exam?")) {
      await deleteDoc(doc(db, "exams", examId));
    }
  };

  // --- 4. Resources & Class Schedule Handlers ---
  const handleResourceChange = (tier, idx, field, value) => {
    setResources((prev) => ({
      ...prev,
      [tier]: prev[tier].map((item, i) => (i === idx ? { ...item, [field]: value } : item))
    }));
  };

  const handleAddResourceRow = (tier) => {
    setResources((prev) => ({
      ...prev,
      [tier]: [...prev[tier], { label: "New Link", url: "" }]
    }));
  };

  const handleRemoveResourceRow = (tier, idx) => {
    setResources((prev) => ({
      ...prev,
      [tier]: prev[tier].filter((_, i) => i !== idx)
    }));
  };

  const handleTimeSlotChange = (idx, value) => {
    setTimeSlots((prev) => prev.map((slot, i) => (i === idx ? value : slot)));
  };

  const handleScheduleChange = (idx, field, value) => {
    setSchedule((prev) =>
      prev.map((row, i) => (i === idx ? { ...row, [field]: value } : row))
    );
  };

  const handleAddScheduleRow = () => {
    setSchedule((prev) => [
      ...prev,
      { day: "Thursday", slot1: "", slot2: "", slot3: "" }
    ]);
  };

  const handleRemoveScheduleRow = (idx) => {
    setSchedule((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveHubConfig = async () => {
    setSavingConfig(true);
    try {
      await setDoc(
        doc(db, "settings", "hubConfig"),
        {
          resources,
          timeSlots,
          schedule,
          updatedAt: new Date().toISOString()
        },
        { merge: true }
      );
      showNotice("ok", "Saved Resources & Class Schedule to Firestore.");
    } catch (err) {
      console.error(err);
      showNotice("err", `Failed to save config: ${err.message}`);
    } finally {
      setSavingConfig(false);
    }
  };

  const modalMatchingSubjects = subjects.filter(
    (sub) => !sub.level || sub.level === newStudent.level
  );

  return (
    <div
      className="container dash-grid"
      style={{
        gridTemplateAreas:
          '"subjects subjects" "students students" "exams exams" "config config"',
        gridTemplateColumns: "1fr"
      }}
    >
      {feedback.text && (
        <div
          className={feedback.type === "err" ? "alert-err" : "panel"}
          style={{
            gridColumn: "1 / -1",
            padding: "10px 16px",
            borderColor: feedback.type === "err" ? undefined : "#22c55e",
            color: feedback.type === "err" ? undefined : "#86efac"
          }}
        >
          {feedback.text}
        </div>
      )}

      {/* 1. Subjects, Sections & Chapters Table */}
      <section className="panel" style={{ gridArea: "subjects" }}>
        <div className="panel-head">
          <h2>Subjects, Sections & Chapters</h2>
          <button onClick={() => setShowSubjectModal(true)} className="btn-primary">
            + Add Subject
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Subject</th>
                <th>Section • Chapters & Weights</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((sub) => (
                <tr key={sub.id}>
                  <td className="font-bold">
                    {sub.name}
                    {sub.level && <div className="muted-sm text-xs">{sub.level}</div>}
                  </td>
                  <td>
                    <div className="flex-tags">
                      {(sub.chapters || []).map((ch, i) => (
                        <span key={i} className="pill" style={{ textTransform: "none" }}>
                          {ch.section ? `[${ch.section}] ` : ""}
                          {ch.name} (W: {ch.weight})
                        </span>
                      ))}
                      {(!sub.chapters || sub.chapters.length === 0) && (
                        <span className="muted-sm">No chapters yet</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="flex-row" style={{ gap: "8px" }}>
                      <button
                        type="button"
                        onClick={() => openChaptersModal(sub)}
                        className="btn-ghost"
                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      >
                        + Add / Edit Chapters
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSubject(sub.id, sub.name)}
                        className="btn-ghost text-red-400"
                        style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {subjects.length === 0 && (
                <tr>
                  <td colSpan="3" className="muted text-center">
                    No subjects added yet. Click &ldquo;+ Add Subject&rdquo; to create one.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2. Students Progress, Level-Locked Enrollment & Preview Table */}
      <section className="panel" style={{ gridArea: "students" }}>
        <div className="panel-head">
          <div>
            <h2>Students Progress & Standings</h2>
            <span className="muted-sm">
              Level-locked subject enrollment, bonus (0-50), enrolled chapter toggles, and preview
            </span>
          </div>
          <button onClick={handleOpenStudentModal} className="btn-primary">
            + Add Student
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Enrolled Subjects</th>
                <th>Invite Code</th>
                <th>Bonus (0-50)</th>
                <th>Score</th>
                <th>Rank Tier</th>
                <th>Progress Toggles</th>
                <th>Page</th>
              </tr>
            </thead>
            <tbody>
              {students.map((stu) => {
                const rank = calculateUnifiedRank(
                  stu.subjectScores || [],
                  stu.tutorBonus || 0
                );
                const matchingSubjects = subjects.filter(
                  (sub) => !sub.level || !stu.level || sub.level === stu.level
                );
                const enrolledIds = (
                  Array.isArray(stu.enrolledSubjectIds) ? stu.enrolledSubjectIds : []
                ).filter((id) => matchingSubjects.some((m) => m.id === id));

                const studentChapters = matchingSubjects
                  .filter((sub) => enrolledIds.includes(sub.id))
                  .flatMap((sub) => (sub.chapters || []).map((c) => c.name));

                const chosenCh = selectedChapterByStudent[stu.id];
                const activeCh =
                  chosenCh && studentChapters.includes(chosenCh)
                    ? chosenCh
                    : studentChapters[0] || "";
                const chProg = activeCh ? stu.progress?.[activeCh] || {} : {};

                return (
                  <tr key={stu.id}>
                    <td className="font-bold">
                      {stu.name || stu.email || "Unnamed"}
                      <div className="muted-sm text-xs">
                        {stu.level} • {stu.authUid ? "Linked" : "Pending Link"}
                      </div>
                    </td>
                    <td>
                      {matchingSubjects.length === 0 ? (
                        <span className="muted-sm">
                          No {stu.level || ""} subjects yet
                        </span>
                      ) : (
                        <div className="checkbox-group" style={{ flexWrap: "wrap", maxWidth: "240px" }}>
                          {matchingSubjects.map((sub) => (
                            <label key={sub.id}>
                              <input
                                type="checkbox"
                                checked={enrolledIds.includes(sub.id)}
                                onChange={() => handleToggleStudentEnrollment(stu, sub.id)}
                              />
                              {sub.name}
                            </label>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex-row" style={{ gap: "6px" }}>
                        <span className="pill" style={{ letterSpacing: "1.5px" }}>
                          {stu.inviteCode || "—"}
                        </span>
                        {stu.inviteCode && (
                          <button
                            type="button"
                            onClick={() => handleCopyInviteCode(stu.id, stu.inviteCode)}
                            className="btn-sm"
                          >
                            {copiedCodeId === stu.id ? "Copied" : "Copy"}
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <input
                        type="number"
                        className="input-box inline-input"
                        value={stu.tutorBonus || 0}
                        min="0"
                        max="50"
                        onChange={(e) => handleTutorBonusChange(stu.id, e.target.value)}
                      />
                    </td>
                    <td className="font-bold text-blue-300">{rank.totalScore} / 500</td>
                    <td>
                      <span className="tier-badge">{rank.rankTier}</span>
                    </td>
                    <td>
                      {studentChapters.length === 0 ? (
                        <span className="muted-sm">Enroll in a subject with chapters</span>
                      ) : (
                        <>
                          <select
                            className="input-box"
                            style={{
                              letterSpacing: "normal",
                              padding: "4px 6px",
                              fontSize: "0.75rem",
                              marginBottom: "6px",
                              maxWidth: "165px"
                            }}
                            value={activeCh}
                            onChange={(e) =>
                              setSelectedChapterByStudent((prev) => ({
                                ...prev,
                                [stu.id]: e.target.value
                              }))
                            }
                          >
                            {studentChapters.map((chName, idx) => (
                              <option key={`${chName}-${idx}`} value={chName}>
                                {chName}
                              </option>
                            ))}
                          </select>
                          <div className="checkbox-group">
                            <label>
                              <input
                                type="checkbox"
                                checked={chProg.basicConcept || false}
                                onChange={() =>
                                  toggleChapterProgress(
                                    stu.id,
                                    stu.progress,
                                    activeCh,
                                    "basicConcept"
                                  )
                                }
                              />
                              Concept
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={chProg.basicQn || false}
                                onChange={() =>
                                  toggleChapterProgress(stu.id, stu.progress, activeCh, "basicQn")
                                }
                              />
                              Q/N
                            </label>
                            <label>
                              <input
                                type="checkbox"
                                checked={chProg.masterNote || false}
                                onChange={() =>
                                  toggleChapterProgress(
                                    stu.id,
                                    stu.progress,
                                    activeCh,
                                    "masterNote"
                                  )
                                }
                              />
                              Note
                            </label>
                          </div>
                        </>
                      )}
                    </td>
                    <td>
                      <div className="flex-row" style={{ gap: "6px" }}>
                        <Link
                          to={`/preview?id=${stu.id}`}
                          className="btn-primary btn-link"
                          style={{ padding: "6px 12px", fontSize: "0.75rem" }}
                        >
                          Preview
                        </Link>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(stu.id, stu.name || stu.email)}
                          className="btn-ghost text-red-400"
                          style={{ padding: "6px 10px", fontSize: "0.75rem" }}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {students.length === 0 && (
                <tr>
                  <td colSpan="8" className="text-center muted">
                    No students added yet. Click &ldquo;+ Add Student&rdquo; to generate an invite code.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 3. Exams & Event Launcher */}
      <section className="panel" style={{ gridArea: "exams" }}>
        <div className="panel-head">
          <h2>Exams & Events</h2>
          <button onClick={() => setShowEventModal(true)} className="btn-primary">
            + Add Event
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type & Subject</th>
                <th>Max Marks</th>
                <th>Participant Scores (Raw Marks)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((ex) => (
                <tr key={ex.id}>
                  <td className="whitespace-nowrap">{ex.date}</td>
                  <td>
                    {ex.isMock ? (
                      <span className="tier-badge bg-purple-900 text-purple-200">MOCK</span>
                    ) : (
                      <span className="tier-badge">CHAPTER</span>
                    )}
                    <div className="font-bold mt-1">{ex.title}</div>
                    <div className="muted-sm">
                      {ex.isMock ? "Subject Mock (20%)" : `Chapter: ${ex.chapter} (40%)`}
                    </div>
                  </td>
                  <td className="text-center font-bold text-lg">{ex.maxMarks}</td>
                  <td>
                    <div className="score-grid">
                      {students.map((stu) => {
                        const raw = ex.scores?.[stu.id];
                        const pct = raw !== undefined ? Math.round((raw / ex.maxMarks) * 100) : null;

                        return (
                          <div key={stu.id} className="score-cell">
                            <span className="muted-sm truncate" style={{ width: "60px" }}>
                              {stu.name?.split(" ")[0]}
                            </span>
                            <input
                              type="number"
                              className="input-box inline-input small-input"
                              placeholder="-"
                              value={raw === undefined ? "" : raw}
                              onChange={(e) =>
                                handleScoreUpdate(ex.id, ex.scores || {}, stu.id, e.target.value, ex.maxMarks)
                              }
                            />
                            <span
                              className={`pct-badge ${
                                pct >= 80
                                  ? "text-green-400"
                                  : pct >= 40
                                  ? "text-yellow-400"
                                  : "text-red-400"
                              }`}
                            >
                              {pct !== null ? `${pct}%` : ""}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </td>
                  <td>
                    <button
                      onClick={() => handleDeleteExam(ex.id)}
                      className="btn-ghost text-red-400 border-red-900 hover:bg-red-900/30"
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {exams.length === 0 && (
                <tr>
                  <td colSpan="5" className="text-center muted">
                    No exams scheduled.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 4. Inline Resources & Class Schedule Editor */}
      <section className="panel" style={{ gridArea: "config" }}>
        <div className="panel-head">
          <div>
            <h2>Resources & Class Schedule Editor</h2>
            <span className="muted-sm">
              Updates Google Drive links, time slots & weekly schedule live on the Home dashboard
            </span>
          </div>
          <button
            type="button"
            onClick={handleSaveHubConfig}
            disabled={savingConfig}
            className="btn-primary"
          >
            {savingConfig ? "Saving..." : "Save Resources & Schedule"}
          </button>
        </div>

        <div className="grid-2" style={{ gap: "18px", marginBottom: "20px" }}>
          {/* O-Level Links */}
          <div style={{ background: "#0d121d", border: "1px solid #1f293d", borderRadius: "12px", padding: "14px" }}>
            <div className="panel-head" style={{ marginBottom: "10px" }}>
              <h3 style={{ fontSize: "0.95rem" }}>O-Level Resources</h3>
              <button
                type="button"
                onClick={() => handleAddResourceRow("oLevel")}
                className="btn-ghost"
                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
              >
                + Add Link
              </button>
            </div>
            <div className="stack" style={{ gap: "8px" }}>
              {resources.oLevel.map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr auto", gap: "8px" }}
                >
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "7px 10px", fontSize: "0.8rem" }}
                    placeholder="Label"
                    value={item.label}
                    onChange={(e) => handleResourceChange("oLevel", idx, "label", e.target.value)}
                  />
                  <input
                    type="url"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "7px 10px", fontSize: "0.8rem" }}
                    placeholder="https://drive.google.com/..."
                    value={item.url}
                    onChange={(e) => handleResourceChange("oLevel", idx, "url", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveResourceRow("oLevel", idx)}
                    className="btn-ghost text-red-400"
                    style={{ padding: "6px 10px" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* A-Level Links */}
          <div style={{ background: "#0d121d", border: "1px solid #1f293d", borderRadius: "12px", padding: "14px" }}>
            <div className="panel-head" style={{ marginBottom: "10px" }}>
              <h3 style={{ fontSize: "0.95rem" }}>A-Level Resources</h3>
              <button
                type="button"
                onClick={() => handleAddResourceRow("aLevel")}
                className="btn-ghost"
                style={{ padding: "4px 8px", fontSize: "0.75rem" }}
              >
                + Add Link
              </button>
            </div>
            <div className="stack" style={{ gap: "8px" }}>
              {resources.aLevel.map((item, idx) => (
                <div
                  key={idx}
                  style={{ display: "grid", gridTemplateColumns: "1fr 1.6fr auto", gap: "8px" }}
                >
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "7px 10px", fontSize: "0.8rem" }}
                    placeholder="Label"
                    value={item.label}
                    onChange={(e) => handleResourceChange("aLevel", idx, "label", e.target.value)}
                  />
                  <input
                    type="url"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "7px 10px", fontSize: "0.8rem" }}
                    placeholder="https://drive.google.com/..."
                    value={item.url}
                    onChange={(e) => handleResourceChange("aLevel", idx, "url", e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveResourceRow("aLevel", idx)}
                    className="btn-ghost text-red-400"
                    style={{ padding: "6px 10px" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Class Schedule Time Blocks & Editable Slot Headers */}
        <div className="panel-head" style={{ marginBottom: "10px" }}>
          <h3 style={{ fontSize: "0.95rem" }}>Weekly Class Schedule</h3>
          <button
            type="button"
            onClick={handleAddScheduleRow}
            className="btn-ghost"
            style={{ padding: "4px 10px", fontSize: "0.75rem" }}
          >
            + Add Day Row
          </button>
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                    value={timeSlots[0] || ""}
                    onChange={(e) => handleTimeSlotChange(0, e.target.value)}
                    placeholder="Slot 1 Time"
                  />
                </th>
                <th>
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                    value={timeSlots[1] || ""}
                    onChange={(e) => handleTimeSlotChange(1, e.target.value)}
                    placeholder="Slot 2 Time"
                  />
                </th>
                <th>
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                    value={timeSlots[2] || ""}
                    onChange={(e) => handleTimeSlotChange(2, e.target.value)}
                    placeholder="Slot 3 Time"
                  />
                </th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row, idx) => (
                <tr key={idx}>
                  <td>
                    <input
                      type="text"
                      className="input-box"
                      style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                      value={row.day}
                      onChange={(e) => handleScheduleChange(idx, "day", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-box"
                      style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                      value={row.slot1}
                      onChange={(e) => handleScheduleChange(idx, "slot1", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-box"
                      style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                      value={row.slot2}
                      onChange={(e) => handleScheduleChange(idx, "slot2", e.target.value)}
                    />
                  </td>
                  <td>
                    <input
                      type="text"
                      className="input-box"
                      style={{ letterSpacing: "normal", padding: "6px 8px", fontSize: "0.8rem" }}
                      value={row.slot3}
                      onChange={(e) => handleScheduleChange(idx, "slot3", e.target.value)}
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      onClick={() => handleRemoveScheduleRow(idx)}
                      className="btn-ghost text-red-400"
                      style={{ padding: "5px 9px" }}
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Add Subject Modal */}
      {showSubjectModal && (
        <div className="modal-overlay">
          <div className="modal-content auth-card">
            <h2>Add New Subject</h2>
            <p className="muted-sm">Create a subject, section, and optional starting chapter.</p>
            <form onSubmit={handleCreateSubject} className="stack mt-4">
              <input
                required
                type="text"
                className="input-box"
                style={{ letterSpacing: "normal" }}
                placeholder="Subject Name (e.g., O-Level Maths B)"
                value={subjectForm.name}
                onChange={(e) => setSubjectForm({ ...subjectForm, name: e.target.value })}
              />

              <div className="grid-2">
                <select
                  className="input-box"
                  style={{ letterSpacing: "normal" }}
                  value={subjectForm.level}
                  onChange={(e) => setSubjectForm({ ...subjectForm, level: e.target.value })}
                >
                  <option value="O-Level">O-Level</option>
                  <option value="A-Level">A-Level</option>
                </select>

                <input
                  type="text"
                  className="input-box"
                  style={{ letterSpacing: "normal" }}
                  placeholder="Section (e.g., Paper 1)"
                  value={subjectForm.firstSection}
                  onChange={(e) => setSubjectForm({ ...subjectForm, firstSection: e.target.value })}
                />
              </div>

              <div className="grid-2">
                <input
                  type="text"
                  className="input-box"
                  style={{ letterSpacing: "normal" }}
                  placeholder="First Chapter (optional)"
                  value={subjectForm.firstChapterName}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, firstChapterName: e.target.value })
                  }
                />
                <input
                  type="number"
                  min="1"
                  max="10"
                  className="input-box"
                  style={{ letterSpacing: "normal" }}
                  placeholder="Weight (1-10)"
                  value={subjectForm.firstChapterWeight}
                  onChange={(e) =>
                    setSubjectForm({ ...subjectForm, firstChapterWeight: e.target.value })
                  }
                />
              </div>

              <div className="flex-row mt-4" style={{ gap: "10px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Subject
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowSubjectModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Chapter & Section Modal */}
      {activeChapterSubject && (
        <div className="modal-overlay">
          <div className="modal-content auth-card" style={{ maxWidth: "620px" }}>
            <h2>Chapters — {activeChapterSubject.name}</h2>
            <p className="muted-sm">
              Add one or multiple chapters at once with Section and Weight (1–10).
            </p>

            {existingChaptersDraft.length > 0 && (
              <div style={{ marginTop: "12px" }}>
                <span className="muted-sm" style={{ display: "block", marginBottom: "6px" }}>
                  Current Chapters ({existingChaptersDraft.length}):
                </span>
                <div className="flex-tags">
                  {existingChaptersDraft.map((ch, idx) => (
                    <span key={idx} className="pill" style={{ textTransform: "none" }}>
                      [{ch.section}] {ch.name} (W: {ch.weight}){" "}
                      <button
                        type="button"
                        onClick={() => removeExistingChapter(idx)}
                        style={{
                          marginLeft: "6px",
                          background: "none",
                          border: "none",
                          color: "#fca5a5",
                          cursor: "pointer",
                          fontWeight: 700
                        }}
                        title="Remove chapter"
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <form onSubmit={handleSaveChapters} className="stack mt-4">
              <span className="muted-sm">Add New Chapters:</span>
              {newChapterRows.map((row, idx) => (
                <div
                  key={idx}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1.5fr 75px auto",
                    gap: "8px",
                    alignItems: "center"
                  }}
                >
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "8px 10px" }}
                    placeholder="Section"
                    value={row.section}
                    onChange={(e) => updateNewChapterRow(idx, "section", e.target.value)}
                  />
                  <input
                    type="text"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "8px 10px" }}
                    placeholder={`Chapter ${idx + 1} name`}
                    value={row.name}
                    onChange={(e) => updateNewChapterRow(idx, "name", e.target.value)}
                  />
                  <input
                    type="number"
                    min="1"
                    max="10"
                    className="input-box"
                    style={{ letterSpacing: "normal", padding: "8px 8px", textAlign: "center" }}
                    value={row.weight}
                    onChange={(e) => updateNewChapterRow(idx, "weight", e.target.value)}
                  />
                  {newChapterRows.length > 1 && (
                    <button
                      type="button"
                      className="btn-ghost text-red-400"
                      style={{ padding: "8px 10px" }}
                      onClick={() => removeNewChapterRow(idx)}
                    >
                      ×
                    </button>
                  )}
                </div>
              ))}

              <button
                type="button"
                onClick={addNewChapterRow}
                className="btn-ghost"
                style={{ alignSelf: "flex-start", padding: "6px 12px", fontSize: "0.8rem" }}
              >
                + Add Another Chapter Row
              </button>

              <div className="flex-row mt-4" style={{ gap: "10px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Chapters
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setActiveChapterSubject(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Student Modal */}
      {showStudentModal && (
        <div className="modal-overlay">
          <div className="modal-content auth-card">
            <h2>Add New Student</h2>
            <p className="muted-sm">
              Choose level first, enroll in matching subjects, and share the 6-character invite code.
            </p>
            <form onSubmit={handleCreateStudent} className="stack mt-4">
              <input
                required
                type="text"
                className="input-box"
                style={{ letterSpacing: "normal" }}
                placeholder="Student Full Name"
                value={newStudent.name}
                onChange={(e) => setNewStudent({ ...newStudent, name: e.target.value })}
              />

              <div className="grid-2">
                <select
                  className="input-box"
                  style={{ letterSpacing: "normal" }}
                  value={newStudent.level}
                  onChange={(e) =>
                    setNewStudent({
                      ...newStudent,
                      level: e.target.value,
                      enrolledSubjectIds: []
                    })
                  }
                >
                  <option value="O-Level">O-Level</option>
                  <option value="A-Level">A-Level</option>
                </select>

                <input
                  type="number"
                  min="0"
                  max="50"
                  className="input-box"
                  style={{ letterSpacing: "normal" }}
                  placeholder="Tutor Bonus (0-50)"
                  value={newStudent.tutorBonus}
                  onChange={(e) => setNewStudent({ ...newStudent, tutorBonus: e.target.value })}
                />
              </div>

              <div>
                <span className="muted-sm" style={{ display: "block", marginBottom: "6px" }}>
                  Enroll in {newStudent.level} Subjects:
                </span>
                {modalMatchingSubjects.length === 0 ? (
                  <span className="muted-sm">
                    No {newStudent.level} subjects created yet.
                  </span>
                ) : (
                  <div className="checkbox-group" style={{ flexWrap: "wrap" }}>
                    {modalMatchingSubjects.map((sub) => (
                      <label key={sub.id}>
                        <input
                          type="checkbox"
                          checked={newStudent.enrolledSubjectIds.includes(sub.id)}
                          onChange={() => toggleNewStudentSubject(sub.id)}
                        />
                        {sub.name}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex-row" style={{ gap: "8px" }}>
                <input
                  required
                  type="text"
                  maxLength={10}
                  className="input-box"
                  value={newStudent.inviteCode}
                  onChange={(e) =>
                    setNewStudent({ ...newStudent, inviteCode: e.target.value.toUpperCase() })
                  }
                />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() =>
                    setNewStudent({ ...newStudent, inviteCode: generateInviteCode(6) })
                  }
                >
                  New Code
                </button>
              </div>

              <div className="flex-row mt-4" style={{ gap: "10px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Save Student
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowStudentModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Event Modal */}
      {showEventModal && (
        <div className="modal-overlay">
          <div className="modal-content auth-card">
            <h2>Launch New Exam / Event</h2>
            <form onSubmit={handleCreateExam} className="stack mt-4">
              <div className="flex-row">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={newEvent.isMock}
                    onChange={(e) =>
                      setNewEvent({ ...newEvent, isMock: e.target.checked, chapter: "" })
                    }
                  />
                  <strong>Subject Mock Exam</strong> (Disables Chapter Selection)
                </label>
              </div>

              <input
                required
                type="text"
                className="input-box"
                placeholder="Event Title (e.g., Mid-Term Mock)"
                value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
              />

              <div className="grid-2">
                <input
                  required
                  type="date"
                  className="input-box"
                  value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                />
                <input
                  required
                  type="number"
                  min="1"
                  className="input-box"
                  placeholder="Max Marks"
                  value={newEvent.maxMarks}
                  onChange={(e) =>
                    setNewEvent({ ...newEvent, maxMarks: parseInt(e.target.value, 10) })
                  }
                />
              </div>

              <select
                required
                className="input-box"
                value={newEvent.subjectId}
                onChange={(e) => setNewEvent({ ...newEvent, subjectId: e.target.value })}
              >
                <option value="" disabled>
                  Select Subject...
                </option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} {s.level ? `(${s.level})` : ""}
                  </option>
                ))}
              </select>

              {!newEvent.isMock && (
                <input
                  required
                  type="text"
                  className="input-box"
                  placeholder="Chapter Name (e.g., Ch 1: Functions)"
                  value={newEvent.chapter}
                  onChange={(e) => setNewEvent({ ...newEvent, chapter: e.target.value })}
                />
              )}

              <input
                type="url"
                className="input-box"
                placeholder="Question Paper Link (Google Drive)"
                value={newEvent.qLink}
                onChange={(e) => setNewEvent({ ...newEvent, qLink: e.target.value })}
              />
              <input
                type="url"
                className="input-box"
                placeholder="Answer / Mark Scheme Link"
                value={newEvent.aLink}
                onChange={(e) => setNewEvent({ ...newEvent, aLink: e.target.value })}
              />

              <div className="flex-row mt-4" style={{ gap: "10px" }}>
                <button type="submit" className="btn-primary" style={{ flex: 1 }}>
                  Create Event
                </button>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => setShowEventModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}