# StatDeck

Academic analytics and tutoring management platform built with React, Vite, Firebase (Authentication, Cloud Firestore, and Firebase Hosting), and Google Apps Script for Google Drive note management[cite: 2, 10, 11].

## Features

- **Role-Based Access & Student Linking:** Google Sign-In with tutor-restricted management and student invite-code linking.
- **Tutor Command Hub (`TutorHub`):** Manage subjects, sections, weighted chapters, level-locked student enrollments, tutor bonuses (`0–50`), exam/mock scores, resource links, and editable weekly schedule time slots.
- **Cohort & Home Dashboard (`HomeDashboard`):** Real-time `/ 500` unified standings, curriculum overview, O-Level and A-Level resource links, and dynamic weekly class schedule.
- **Student Progress Page (`StudentPage` & `Preview`):** Track chapter mastery (`Concept`, `Basic Q/N`, `Master Note`), view exam results and insights, and upload, replace, view, or delete Master Notes stored in Google Drive via Apps Script[cite: 1, 2, 3].

## Tech Stack

- **Frontend:** React, Vite, React Router[cite: 2]
- **Backend / Hosting:** Firebase Authentication, Cloud Firestore, Firebase Hosting[cite: 2]
- **File Storage Bridge:** Google Apps Script Web App (`DriveApp`) + Google Drive[cite: 1, 2, 3]

## Environment Variables

Create a `.env` file in the project root (do not commit `.env` to Git)[cite: 2]:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_DRIVE_UPLOAD_URL=[https://script.google.com/macros/s/your_deployment_id/exec](https://script.google.com/macros/s/your_deployment_id/exec)