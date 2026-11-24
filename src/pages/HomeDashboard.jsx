/**
 * src/pages/HomeDashboard.jsx
 * Live StatDeck Home dashboard showing / 500 standouts, enrolled subjects,
 * O-Level & A-Level resource links, and weekly class schedule.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { collection, doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { calculateUnifiedRank } from "../utils/scoring";

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

const DEFAULT_SCHEDULE = [
  { day: "Saturday", slot1: "O-Level Maths", slot2: "A-Level Pure 1", slot3: "Doubt / Q&N" },
  { day: "Monday", slot1: "O-Level Physics", slot2: "A-Level Mechanics", slot3: "Doubt / Q&N" },
  { day: "Wednesday", slot1: "O-Level Add Maths", slot2: "A-Level Statistics", slot3: "Mock Review" }
];

export default function HomeDashboard() {
  const [students, setStudents] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [exams, setExams] = useState([]);
  const [resources, setResources] = useState(DEFAULT_RESOURCES);
  const [schedule, setSchedule] = useState(DEFAULT_SCHEDULE);

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
    const unsubConfig = onSnapshot(doc(db, "settings", "hubConfig"), (snap) => {
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
        if (Array.isArray(data.schedule)) {
          setSchedule(data.schedule);
        }
      }
    });

    return () => {
      unsubStudents();
      unsubSubjects();
      unsubExams();
      unsubConfig();
    };
  }, []);

  const leaderboard = useMemo(() => {
    return students
      .map((stu) => {
        const rank = calculateUnifiedRank(
          stu.subjectScores || [],
          stu.tutorBonus || 0
        );
        const enrolledCount = Array.isArray(stu.enrolledSubjectIds)
          ? stu.enrolledSubjectIds.length
          : 0;

        return {
          ...stu,
          ...rank,
          enrolledCount
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }, [students]);

  const topScore = leaderboard[0]?.totalScore ?? 0;

  return (
    <div className="container dash-grid">
      {/* Top Left: StatDeck Standings */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>StatDeck Standings</h2>
            <span className="muted-sm">Unified / 500 live leaderboard</span>
          </div>
          <span className="pill">{leaderboard.length} Students</span>
        </div>

        {leaderboard.length === 0 ? (
          <p className="muted-sm">No students added yet. Create students in Tutor Tables.</p>
        ) : (
          <div className="standings-list">
            {leaderboard.map((stu, idx) => (
              <div key={stu.id} className="standing-row">
                <div>
                  <div className="font-bold">
                    #{idx + 1} {stu.name || stu.email || "Unnamed"}
                  </div>
                  <div className="muted-sm">
                    {stu.level || "Candidate"} • {stu.enrolledCount} subject(s) •{" "}
                    <span className="tier-badge">{stu.rankTier}</span>
                  </div>
                </div>
                <div className="standing-right">
                  <div className="font-bold text-blue-300">{stu.totalScore} / 500</div>
                  <Link
                    to={`/preview?id=${stu.id}`}
                    className="btn-sm btn-link"
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Top Right: Curriculum Overview */}
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Curriculum & Exams</h2>
            <span className="muted-sm">
              {subjects.length} subjects • {exams.length} exams • Top Score: {topScore}/500
            </span>
          </div>
        </div>

        <div className="stack" style={{ gap: "10px" }}>
          {subjects.map((sub) => (
            <div key={sub.id} className="standing-row">
              <div>
                <div className="font-bold">{sub.name}</div>
                <div className="muted-sm">
                  {sub.level || "All Levels"} • {(sub.chapters || []).length} chapters
                </div>
              </div>
              <span className="pill">{sub.level || "Subject"}</span>
            </div>
          ))}
          {subjects.length === 0 && (
            <p className="muted-sm">No subjects configured yet.</p>
          )}
        </div>
      </section>

      {/* Bottom Left: O-Level & A-Level Resources */}
      <section className="panel">
        <div className="panel-head">
          <h2>Resources</h2>
          <span className="muted-sm">Books, Notes & Past Papers</span>
        </div>

        <div className="grid-2" style={{ gap: "16px" }}>
          <div>
            <h3 className="font-bold" style={{ marginBottom: "8px" }}>O-Level</h3>
            <ul className="insight-list">
              {resources.oLevel.map((item, idx) => (
                <li key={idx}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-300">
                      {item.label || "Resource Link"}
                    </a>
                  ) : (
                    <span>{item.label || "Resource Link"}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="font-bold" style={{ marginBottom: "8px" }}>A-Level</h3>
            <ul className="insight-list">
              {resources.aLevel.map((item, idx) => (
                <li key={idx}>
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer" className="text-blue-300">
                      {item.label || "Resource Link"}
                    </a>
                  ) : (
                    <span>{item.label || "Resource Link"}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Bottom Right: Weekly Class Schedule */}
      <section className="panel">
        <div className="panel-head">
          <h2>Class Schedule</h2>
          <span className="muted-sm">Weekly Time Blocks</span>
        </div>

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Day</th>
                <th>4:00 – 6:00 PM</th>
                <th>6:00 – 8:00 PM</th>
                <th>8:00 – 9:30 PM</th>
              </tr>
            </thead>
            <tbody>
              {schedule.map((row, idx) => (
                <tr key={idx}>
                  <td className="font-bold">{row.day}</td>
                  <td>{row.slot1 || "—"}</td>
                  <td>{row.slot2 || "—"}</td>
                  <td>{row.slot3 || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}