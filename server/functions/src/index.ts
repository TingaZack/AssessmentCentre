/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";
import { HttpsError, onCall, onRequest } from "firebase-functions/https";
import * as logger from "firebase-functions/logger";

const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

// Start writing functions
// https://firebase.google.com/docs/functions/typescript

// For cost control, you can set the maximum number of containers that can be
// running at the same time. This helps mitigate the impact of unexpected
// traffic spikes by instead downgrading performance. This limit is a
// per-function limit. You can override the limit for each function using the
// `maxInstances` option in the function's options, e.g.
// `onRequest({ maxInstances: 5 }, (req, res) => { ... })`.
// NOTE: setGlobalOptions does not apply to functions using the v1 API. V1
// functions should each use functions.runWith({ maxInstances: 10 }) instead.
// In the v1 API, each function can only serve one request per container, so
// this will be the maximum concurrent request count.
setGlobalOptions({ maxInstances: 10 });

export const helloTryWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
});

import * as admin from "firebase-admin";
import * as nodemailer from "nodemailer";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/firestore";
import {
  buildMlabEmailHtml,
  buildMlabEmailPlainText,
} from "./utils/emailBuilder";

const cors = require("cors")({ origin: true });

admin.initializeApp();

// Configure the Transporter (using Gmail as an example)
// Note: For Gmail, you MUST use an 'App Password', not your login password.
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "brndkt@gmail.com",
    pass: "gwjy wcin rdpl lovi", // Generated App Password
  },
});

export const createStaffAccount = onCall(async (request) => {
  const {
    email,
    fullName,
    role,
    phone,
    employerId,
    assessorRegNumber,
    isSuperAdmin,
    privileges,
  } = request.data;

  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerUid = auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerUid)
    .get();

  if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Admins can provision staff accounts.",
    );
  }

  // Strict Domain Enforcement for Admins
  if (role === "admin" && !email.toLowerCase().endsWith("@mlab.co.za")) {
    throw new HttpsError(
      "permission-denied",
      "Security Policy Violation: Admin accounts can only be provisioned for official @mlab.co.za domains.",
    );
  }

  try {
    const userRecord = await admin.auth().createUser({
      email: email,
      displayName: fullName,
      emailVerified: true,
    });

    await admin.auth().setCustomUserClaims(userRecord.uid, {
      role: role,
      ...(role === "admin" && isSuperAdmin ? { isSuperAdmin: true } : {}),
    });

    const userData: any = {
      uid: userRecord.uid,
      fullName: fullName,
      email: email,
      role: role,
      phone: phone || "",
      status: "active",
      createdAt: new Date().toISOString(),
      signatureUrl: "",
    };

    if (role === "admin") {
      userData.isSuperAdmin = !!isSuperAdmin;
      if (!isSuperAdmin && privileges) {
        userData.privileges = privileges;
      }
    } else if (role === "mentor" && employerId) {
      userData.employerId = employerId;
    } else if (["assessor", "moderator"].includes(role) && assessorRegNumber) {
      userData.assessorRegNumber = assessorRegNumber;
    }

    await admin
      .firestore()
      .collection("users")
      .doc(userRecord.uid)
      .set(userData);

    const link = await admin.auth().generatePasswordResetLink(email);

    const displayRole =
      role === "admin" && isSuperAdmin
        ? "Super Administrator"
        : role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ");

    // USING THE MODULAR BUILDER
    const emailParams = {
      title: "Platform Access Granted",
      subtitle: "Secure your account to access your dashboard",
      recipientName: fullName,
      bodyHtml: `You have been securely provisioned as a <strong>${displayRole}</strong> on the mLab platform. Please click the button below to set your private password and access your dashboard.`,
      ctaText: "Set Password & Login",
      ctaLink: link,
      showStepIndicator: false, // Turn off the 3-step timeline for this specific email
    };

    const mailOptions = {
      from: '"mLab Assessment Platform" <brndkt@gmail.com>',
      to: email,
      subject: `Action Required: Access Granted - ${displayRole}`,
      text: buildMlabEmailPlainText(emailParams),
      html: buildMlabEmailHtml(emailParams),
    };

    await transporter.sendMail(mailOptions);

    return {
      success: true,
      message: `Account created securely for ${email}`,
      uid: userRecord.uid,
    };
  } catch (error: any) {
    console.error("Error creating staff:", error);
    throw new HttpsError(
      "internal",
      error.message || "Unable to create account.",
    );
  }
});

// export const createStaffAccount = onCall(async (request) => {
//   // 1. EXTRACT DATA & AUTH FROM THE SINGLE 'request' OBJECT
//   const { email, fullName, role, phone } = request.data;
//   const auth = request.auth;

//   // 2. Security Check: Ensure caller is Authenticated
//   if (!auth) {
//     throw new HttpsError("unauthenticated", "Authentication required.");
//   }

//   // 3. Security Check: Ensure caller is an Admin
//   const callerUid = auth.uid;
//   const callerDoc = await admin
//     .firestore()
//     .collection("users")
//     .doc(callerUid)
//     .get();

//   if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
//     throw new HttpsError(
//       "permission-denied",
//       "Only Admins can create staff accounts.",
//     );
//   }

//   try {
//     // 4. Create the User in Firebase Auth
//     const userRecord = await admin.auth().createUser({
//       email: email,
//       displayName: fullName,
//       emailVerified: true,
//     });

//     // 5. Create Firestore Profile
//     await admin.firestore().collection("users").doc(userRecord.uid).set({
//       uid: userRecord.uid,
//       fullName: fullName,
//       email: email,
//       role: role,
//       phone: phone,
//       createdAt: new Date().toISOString(),
//       signatureUrl: "", // Empty until they log in
//     });

//     // 6. Generate Password Reset Link
//     const link = await admin.auth().generatePasswordResetLink(email);

//     // 7. Send Email via Nodemailer
//     const mailOptions = {
//       from: '"mLab Admin" <brndkt@gmail.com>',
//       to: email,
//       subject: "Welcome to mLab Assessment Platform",
//       html: `
//         <h3>Welcome, ${fullName}!</h3>
//         <p>You have been registered as a <strong>${role}</strong>.</p>
//         <p>Please click the link below to set your password and access the dashboard:</p>
//         <a href="${link}" style="padding: 10px 20px; background-color: #94c73d; color: white; text-decoration: none; border-radius: 5px;">Set Password & Login</a>
//         <br /><br />
//         <p>Regards,<br/>mLab Admin Team</p>
//       `,
//     };

//     await transporter.sendMail(mailOptions);

//     return { success: true, message: `Account created for ${email}` };
//   } catch (error: any) {
//     console.error("Error creating staff:", error);
//     // Return a structured error to the client
//     throw new HttpsError(
//       "internal",
//       error.message || "Unable to create account.",
//     );
//   }
// });

// ================= CONFIGURATION =================
// I will replace this with my actual deployed URL
const APP_URL = "https://assessmentcentr.web.app/";

// Helper: Send Email with basic styling
const sendEmail = async (to: string, subject: string, htmlContent: string) => {
  const html = `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #073f4e; padding: 20px; text-align: center;">
        <h1 style="color: white; margin: 0;">mLab Assessment Platform</h1>
      </div>
      <div style="padding: 20px; border: 1px solid #ddd; border-top: none;">
        ${htmlContent}
      </div>
      <div style="text-align: center; padding: 10px; font-size: 12px; color: #777;">
        &copy; ${new Date().getFullYear()} mLab. All rights reserved.
      </div>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: '"mLab Team" <your-admin-email@gmail.com>',
      to,
      subject,
      html,
    });
    console.log(`Email sent to ${to}`);
  } catch (e) {
    console.error(`Failed to send email to ${to}`, e);
  }
};

// ================= TRIGGER: ON COHORT CREATED =================
export const onCohortCreated = onDocumentCreated(
  "cohorts/{cohortId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const cohort = snapshot.data();
    const cohortId = event.params.cohortId;
    const {
      name,
      startDate,
      endDate,
      facilitatorId,
      assessorId,
      moderatorId,
      learnerIds,
    } = cohort;

    console.log(`New Cohort Created: ${name} (${cohortId})`);

    try {
      // 1. Fetch Staff Details
      const [facDoc, assDoc, modDoc] = await Promise.all([
        admin.firestore().collection("users").doc(facilitatorId).get(),
        admin.firestore().collection("users").doc(assessorId).get(),
        admin.firestore().collection("users").doc(moderatorId).get(),
      ]);

      const facilitator = facDoc.data();
      const assessor = assDoc.data();
      const moderator = modDoc.data();

      // 2. Notify FACILITATOR
      if (facilitator?.email) {
        await sendEmail(
          facilitator.email,
          `Assignment: Facilitator for ${name}`,
          `<h3>Hello ${facilitator.fullName},</h3>
         <p>You have been assigned as the <strong>Facilitator</strong> for the class <strong>${name}</strong>.</p>
         <p><strong>Duration:</strong> ${startDate} to ${endDate}<br/>
            <strong>Learners:</strong> ${learnerIds.length} enrolled</p>
         <p>Please log in to view your class register and manage attendance.</p>
         <div style="text-align: center; margin-top: 20px;">
            <a href="${APP_URL}/login" style="background-color: #073f4e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Dashboard</a>
         </div>`,
        );
      }

      // 3. Notify ASSESSOR
      if (assessor?.email) {
        await sendEmail(
          assessor.email,
          `Assignment: Assessor for ${name}`,
          `<h3>Hello ${assessor.fullName},</h3>
         <p>You have been assigned as the <strong>Assessor (Red Pen)</strong> for <strong>${name}</strong>.</p>
         <p>You can now access learner Workbooks and POEs for grading.</p>
         <div style="text-align: center; margin-top: 20px;">
            <a href="${APP_URL}/login" style="background-color: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Assess</a>
         </div>`,
        );
      }

      // 4. Notify MODERATOR
      if (moderator?.email) {
        await sendEmail(
          moderator.email,
          `Assignment: Moderator for ${name}`,
          `<h3>Hello ${moderator.fullName},</h3>
         <p>You have been assigned as the <strong>Moderator (Green Pen)</strong> for <strong>${name}</strong>.</p>
         <p>You will be notified when batches are ready for moderation.</p>
         <div style="text-align: center; margin-top: 20px;">
            <a href="${APP_URL}/login" style="background-color: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Login to Moderate</a>
         </div>`,
        );
      }

      // 5. Notify LEARNERS
      if (learnerIds && learnerIds.length > 0) {
        // Fetch all learner documents
        const learnerDocs = await Promise.all(
          learnerIds.map((id: string) =>
            admin.firestore().collection("learners").doc(id).get(),
          ),
        );

        const emailPromises = learnerDocs.map((doc) => {
          const learner = doc.data();
          if (!learner?.email) return Promise.resolve();

          return sendEmail(
            learner.email,
            `Enrolled: ${name}`,
            `<h3>Hi ${learner.fullName},</h3>
           <p>You have been successfully enrolled in the class: <strong>${name}</strong>.</p>
           <p><strong>Your Team:</strong></p>
           <ul>
             <li>Facilitator: ${facilitator?.fullName || "TBD"}</li>
             <li>Assessor: ${assessor?.fullName || "TBD"}</li>
           </ul>
           <p>You can access your learning materials and submit assessments via the portal.</p>
           <div style="text-align: center; margin-top: 20px;">
              <a href="${APP_URL}/portal" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Access Learner Portal</a>
           </div>`,
          );
        });

        await Promise.all(emailPromises);
      }
    } catch (error) {
      console.error("Error sending cohort notifications:", error);
    }
  },
);

export const createLearnerAccount = onRequest((req, res) => {
  // We return the execution of the cors middleware
  return cors(req, res, async () => {
    try {
      // 1. Validation
      if (req.method !== "POST") {
        // Explicitly return the response call
        return res.status(405).send("Method Not Allowed");
      }

      const { email, fullName, role } = req.body.data || req.body;

      if (!email || !fullName) {
        return res
          .status(400)
          .send({ data: { success: false, message: "Missing email or name" } });
      }

      let uid: string;
      let isNewUser = false;

      // 2. Auth Check logic
      try {
        const existingUser = await admin.auth().getUserByEmail(email);
        uid = existingUser.uid;
      } catch (error: any) {
        if (error.code === "auth/user-not-found") {
          const newUser = await admin.auth().createUser({
            email,
            emailVerified: false,
            displayName: fullName,
          });
          uid = newUser.uid;
          isNewUser = true;
        } else {
          // Re-throw to be caught by the outer catch block
          throw error;
        }
      }

      // 3. Set Claims & Firestore User Doc
      await admin.auth().setCustomUserClaims(uid, { role: role || "learner" });

      const userRef = admin.firestore().collection("users").doc(uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) {
        await userRef.set({
          email,
          fullName,
          role: role || "learner",
          createdAt: new Date().toISOString(),
        });
      }

      // 4. Link the Learner Document (The "Bridge")
      const learnersRef = admin.firestore().collection("learners");
      const snapshot = await learnersRef.where("email", "==", email).get();

      if (!snapshot.empty) {
        const learnerDoc = snapshot.docs[0];
        await learnerDoc.ref.update({
          authUid: uid,
          status: "active",
          lastSynced: new Date().toISOString(),
        });
      }

      // 5. Email Logic
      const link = await admin.auth().generatePasswordResetLink(email);

      const mailOptions = {
        from: '"mLab Admin" <brndkt@gmail.com>',
        to: email,
        subject: "Invitation to mLab Learner Portal",
        // We inject the 'link' variable here
        html: `
            <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
                <h2 style="color: #0f172a;">Welcome, ${fullName}!</h2>
                <p>You have been registered as a <strong>Learner</strong> on the mLab Assessment Platform.</p>
                <p>Please click the button below to set your secure password and access your dashboard:</p>
                
                <div style="margin: 30px 0;">
                    <a href="${link}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
                        Set Password & Login
                    </a>
                </div>
                
                <p style="color: #64748b; font-size: 12px;">
                    If the button above doesn't work, copy and paste this link into your browser:<br/>
                    <a href="${link}">${link}</a>
                </p>
                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
                <p style="font-size: 12px; color: #94a3b8;">mLab Admin Team</p>
            </div>
        `,
      };

      await transporter.sendMail(mailOptions);
      await transporter.sendMail(mailOptions);

      // 6. Final Return for Success Path
      return res.status(200).send({
        data: { success: true, uid: uid, wasNewlyCreated: isNewUser },
      });
    } catch (error: any) {
      console.error("Critical Error:", error);
      // 7. Final Return for Error Path
      return res.status(500).send({
        data: { success: false, message: error.message },
      });
    }
  });
});

interface Submission {
  id: string;
  assessmentId: string;
  title?: string;
  moduleType?: string;
  competency?: string;
  submittedAt?: string;
  moduleNumber?: string;
  marks?: number;
  totalMarks?: number;
  answers?: Record<string, any>;

  facilitatorId?: string;
  gradedBy?: string;

  facilitatorName?: string;
  facilitatorOverallFeedback?: string;
  facilitatorReviewedAt?: string;

  gradedAt?: string;
  grading?: {
    facilitatorName?: string;
    facilitatorOverallFeedback?: string;
    facilitatorReviewedAt?: string;
    facilitatorId?: string;

    assessorName?: string;
    assessorOverallFeedback?: string;
    assessorRegNumber?: string;
    gradedAt?: string;
    gradedBy?: string;
    facilitatorBreakdown?: Record<string, any>;
    assessorBreakdown?: Record<string, any>;
  };

  moderation?: {
    moderatedBy?: string;
    moderatorName?: string;
    moderatorRegNumber?: string;
    moderatedAt?: string;
    feedback?: string;
    breakdown?: Record<string, any>;
  };
  assignedAt?: string;
  learnerDeclaration?: any;
  [key: string]: any;
}

const fetchFileBuffer = async (url: string) => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return await res.arrayBuffer();
  } catch (error) {
    console.error("Buffer fetch error: ", error);
    return null;
  }
};

exports.generateMasterPoE = onDocumentCreated(
  {
    document: "poe_export_requests/{requestId}",
    timeoutSeconds: 540,
    memory: "2GiB",
    region: "us-central1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const requestData = snap.data();
    const requestId = event.params.requestId;
    const learnerId = requestData.learnerId;
    const requestedByUid = requestData.requestedBy;
    let requesterEmail: string | null = null;

    // Added types to parameters
    const updateProgress = async (percent: number, message: string) => {
      await snap.ref.update({ progress: percent, progressMessage: message });
    };

    // Added types to dateString
    const safelyFormatDate = (dateString: string | Date | undefined | null) => {
      if (!dateString) return "N/A";
      try {
        const d = new Date(dateString);
        return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-ZA");
      } catch {
        return "N/A";
      }
    };

    try {
      await updateProgress(5, "Initializing compliance engine...");

      if (requestedByUid) {
        try {
          const user = await admin.auth().getUser(requestedByUid);
          requesterEmail = user.email || null;
        } catch (e) {
          console.error("Auth fetch failed", e);
        }
      }

      const learnerSnap = await admin
        .firestore()
        .collection("learners")
        .doc(learnerId)
        .get();
      const learner = learnerSnap.data() || {};

      let enrollment: any = {};
      if (learner.enrollmentId) {
        const enrolSnap = await admin
          .firestore()
          .collection("enrollments")
          .doc(learner.enrollmentId)
          .get();
        if (enrolSnap.exists) enrollment = enrolSnap.data() || {};
      }

      await updateProgress(15, "Fetching all evidence modules...");
      const subsSnap = await admin
        .firestore()
        .collection("learner_submissions")
        .where("learnerId", "==", learnerId)
        .get();

      const submissions: Submission[] = subsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          assessmentId: data.assessmentId || "",
          title: data.title || "",
          moduleType: data.moduleType || "",
          competency: data.competency || "",
          submittedAt: data.submittedAt || "",
          moduleNumber: data.moduleNumber || "",
          marks: data.marks,
          totalMarks: data.totalMarks,
          answers: data.answers || {},
          facilitatorId:
            data.grading?.facilitatorId ||
            data.facilitatorId ||
            data.latestCoachingLog?.facilitatorId ||
            "",
          gradedBy: data.grading?.gradedBy || data.gradedBy || "",
          facilitatorName: data.facilitatorName || "",
          facilitatorOverallFeedback: data.facilitatorOverallFeedback || "",
          facilitatorReviewedAt:
            data.grading?.facilitatorReviewedAt ||
            data.facilitatorReviewedAt ||
            "",
          gradedAt: data.grading?.gradedAt || data.gradedAt || "",
          grading: data.grading || {},
          moderation: data.moderation || {},
          assignedAt: data.assignedAt || "",
          learnerDeclaration: data.learnerDeclaration || {},
          ...data, // Spreads all other fields so sub[block.id] works
        } as Submission;
      });

      submissions.sort(
        (a, b) =>
          new Date(a.assignedAt || 0).getTime() -
          new Date(b.assignedAt || 0).getTime(),
      );

      const kmSubs = submissions.filter(
        (s) => s.moduleNumber?.includes("-KM-") || s.moduleType === "knowledge",
      );
      const pmSubs = submissions.filter(
        (s) => s.moduleNumber?.includes("-PM-") || s.moduleType === "practical",
      );
      const wmSubs = submissions.filter(
        (s) => s.moduleNumber?.includes("-WM-") || s.moduleType === "workplace",
      );

      const primaryAssessor =
        submissions.find((s) => s.grading?.assessorName)?.grading
          ?.assessorName || "Pending Assessor";

      await updateProgress(25, "Retrieving digital signatures & user docs...");
      const userIdsToFetch = new Set<string>();
      if (learner.authUid) userIdsToFetch.add(learner.authUid);

      submissions.forEach((sub) => {
        if (sub.facilitatorId) userIdsToFetch.add(sub.facilitatorId);
        if (sub.gradedBy) userIdsToFetch.add(sub.gradedBy);
        if (sub.moderation?.moderatedBy)
          userIdsToFetch.add(sub.moderation.moderatedBy);
      });

      // Explicit types for objects and arrays
      const signaturesMap: Record<string, string> = {};
      let learnerUserDoc: any = null;
      let assessorSigUrl: string | null = null;

      if (userIdsToFetch.size > 0) {
        const promises = Array.from(userIdsToFetch).map((uid) =>
          admin.firestore().collection("users").doc(uid).get(),
        );
        const userSnaps = await Promise.all(promises);
        userSnaps.forEach((userSnap) => {
          if (userSnap.exists) {
            const data = userSnap.data();
            if (data?.signatureUrl)
              signaturesMap[userSnap.id] = data.signatureUrl;
            if (userSnap.id === learner.authUid) learnerUserDoc = data;

            const gradedSub = submissions.find(
              (s) => s.gradedBy === userSnap.id,
            );
            if (gradedSub && data?.signatureUrl && !assessorSigUrl) {
              assessorSigUrl = data.signatureUrl;
            }
          }
        });
      }

      const learnerSignatureUrl = learner.authUid
        ? signaturesMap[learner.authUid]
        : null;

      await updateProgress(30, "Generating QCTO Compliance Structure...");
      const companyLogoUrl =
        "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";

      const offlineEvidenceFiles: {
        index: number;
        url: string;
        label: string;
      }[] = [];

      const renderProgressRows = (subs: Submission[]) => {
        if (subs.length === 0)
          return `<tr><td colspan="3" style="text-align:center; font-style:italic;">No modules mapped</td></tr>`;
        return subs
          .map(
            (s) => `
              <tr>
                  <td>${s.moduleNumber || "N/A"}</td>
                  <td>${s.title || "Untitled"}</td>
                  <td style="text-align:center; font-weight:bold;" class="${s.competency === "C" ? "outcome-C" : s.competency === "NYC" ? "outcome-NYC" : ""}">${s.competency || "-"}</td>
              </tr>
          `,
          )
          .join("");
      };

      const renderLearningPlanRows = (subs: Submission[]) => {
        if (subs.length === 0)
          return `<tr><td colspan="8" style="text-align:center; font-style:italic;">No modules mapped</td></tr>`;
        return subs
          .map((s) => {
            const facName =
              s.grading?.facilitatorName || s.facilitatorName || "Pending";
            const dateAssessed = safelyFormatDate(s.gradedAt);
            return `
              <tr>
                  <td style="font-size:10px;">${s.moduleNumber || "N/A"}</td>
                  <td style="font-size:10px;">${facName}</td>
                  <td style="font-size:10px;">${safelyFormatDate(s.assignedAt)} to ${dateAssessed}</td>
                  <td style="text-align:center; font-weight:bold;">${s.moduleType === "knowledge" ? "X" : ""}</td>
                  <td style="text-align:center; font-weight:bold;">${s.moduleType === "practical" ? "X" : ""}</td>
                  <td style="text-align:center; font-weight:bold;">${s.moduleType === "workplace" ? "X" : ""}</td>
                  <td style="text-align:center; font-weight:bold;" class="${s.competency === "C" ? "outcome-C" : ""}">${s.competency === "C" ? "C" : ""}</td>
                  <td style="text-align:center; font-weight:bold;" class="${s.competency === "NYC" ? "outcome-NYC" : ""}">${s.competency === "NYC" ? "NYC" : ""}</td>
              </tr>
          `;
          })
          .join("");
      };

      let htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="UTF-8">
            <style>
                @page { size: A4; margin: 15mm; }
                body { font-family: 'Helvetica', Arial, sans-serif; color: #1e293b; line-height: 1.4; }
                .page-break { page-break-after: always; }
                
                .cover { height: 95vh; display: flex; flex-direction: column; justify-content: center; text-align: center; border: 10px solid #073f4e; padding: 40px; box-sizing: border-box; }
                .cover-logo { max-width: 250px; margin: 0 auto 40px auto; display: block; }
                .cover h1 { font-size: 32px; color: #073f4e; text-transform: uppercase; margin-bottom: 10px; }
                .cover h2 { font-size: 20px; color: #0284c7; margin-bottom: 50px; }
                .cover-details { font-size: 16px; margin: 0 auto; text-align: left; display: inline-block; background: #f8fafc; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0; width: 80%; }
                .cover-details p { margin: 10px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }
                
                .section-title { background: #073f4e; color: white; padding: 10px; font-weight: bold; text-transform: uppercase; margin-top: 30px; margin-bottom: 15px; font-size: 14px; }
                .sub-title { font-size: 12px; font-weight: bold; color: #073f4e; text-transform: uppercase; margin-top: 15px; border-bottom: 1px solid #073f4e; padding-bottom: 3px; }
                
                table { width: 100%; border-collapse: collapse; margin: 15px 0; }
                th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; }
                th { background: #f1f5f9; font-weight: bold; color: #0f172a; }

                .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; font-size: 12px; }
                .grid-info div { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 4px; }
                .grid-info span { font-weight: bold; display: block; margin-bottom: 4px; color: #475569; font-size: 10px; text-transform: uppercase; }

                .divider-page { height: 95vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; box-sizing: border-box; padding: 40px; border: 10px solid; }
                .divider-page h1 { font-size: 36px; text-transform: uppercase; margin: 0; }

                .eval-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 15px; margin-bottom: 25px; font-size: 12px; page-break-inside: avoid; }
                .eval-row { display: flex; margin-bottom: 8px; }
                .eval-label { font-weight: bold; width: 140px; color: #0f172a; flex-shrink: 0; }
                .eval-value { flex: 1; color: #475569; }
                
                .text-blue { color: #0284c7 !important; }
                .text-red { color: #dc2626 !important; }
                .text-green { color: #16a34a !important; }

                .outcome-C { color: #16a34a; font-weight: bold; font-size: 12px; }
                .outcome-NYC { color: #dc2626; font-weight: bold; font-size: 12px; }

                .question-box { margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; page-break-inside: avoid; }
                .q-text { font-weight: bold; font-size: 13px; margin-bottom: 5px; color: #0f172a; }
                .a-text { background: #ffffff; padding: 10px; border: 1px solid #e2e8f0; border-left: 4px solid #94a3b8; font-size: 12px; white-space: pre-wrap; border-radius: 4px; overflow-wrap: break-word; }
                .a-link { color: #0284c7; text-decoration: underline; font-weight: bold; }
                
                .f-text { margin-top: 8px; font-size: 11px; background: #f8fafc; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0; }
                .f-item { margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed #cbd5e1; }
                .f-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
                
                .sig-inline { margin-top: 20px; border: 1px solid #cbd5e1; padding: 15px; background: #f8fafc; page-break-inside: avoid; display: flex; align-items: center; justify-content: space-between; }
                .sig-inline img { max-height: 40px; mix-blend-mode: multiply; }
                
                .sig-wrapper { margin-top: 30px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; page-break-inside: avoid; }
                .sig-box { border: 1px solid #cbd5e1; padding: 10px; text-align: center; font-size: 11px; background: #f8fafc; border-top: 3px solid #cbd5e1; border-radius: 4px; }
                .sig-box h4 { margin: 0 0 5px 0; color: #0f172a; font-size: 11px; }
                .sig-img { max-height: 40px; max-width: 100%; object-fit: contain; margin: 4px auto; display: block; mix-blend-mode: multiply; }
                .sig-placeholder { height: 40px; display: flex; align-items: center; justify-content: center; font-style: italic; color: #cbd5e1; font-size: 10px; margin: 4px 0; }
                .sig-name { font-weight: bold; font-size: 12px; margin: 8px 0; border-bottom: 1px dashed #cbd5e1; padding-bottom: 5px; }
                .sig-date { color: #64748b; }
            </style>
        </head>
        <body>
            <div class="cover">
                <img src="${companyLogoUrl}" alt="Logo" class="cover-logo" />
                <h1>Master Portfolio of Evidence</h1>
                <h2>QCTO QUALIFICATION COMPLIANCE RECORD</h2>
                <div class="cover-details">
                    <p><strong>Learner Name:</strong> ${learner.fullName || "N/A"}</p>
                    <p><strong>Identity Number:</strong> ${learner.idNumber || "N/A"}</p>
                    <p><strong>Email Address:</strong> ${learner.email || "N/A"}</p>
                    <p><strong>Date Generated:</strong> ${safelyFormatDate(new Date())}</p>
                    <p><strong>System Reference:</strong> ${requestId}</p>
                </div>
            </div>
            <div class="page-break"></div>

            <div class="section-title">Assessor PoE Checklist</div>
            <table>
                <thead>
                    <tr><th>#</th><th>Contents</th><th>Status</th></tr>
                </thead>
                <tbody>
                    <tr><td>1</td><td>Progress Report</td><td><strong>Yes</strong></td></tr>
                    <tr><td>2</td><td>Competence Record and Final Assessment Report</td><td><strong>Yes</strong></td></tr>
                    <tr><td>3</td><td>Learner Registration Form</td><td><strong>Yes</strong></td></tr>
                    <tr><td>4</td><td>Letter of Commitment from Learner</td><td><strong>Yes</strong></td></tr>
                    <tr><td>5</td><td>Programme Induction</td><td><strong>Yes</strong></td></tr>
                    <tr><td>6</td><td>Appeals / Complaint Forms</td><td><strong>Available on request</strong></td></tr>
                    <tr><td>7</td><td>Actual Learning Plan and Evidence Control Sheet</td><td><strong>Yes</strong></td></tr>
                    <tr><td>8</td><td>Learner Coaching Record (Remediation)</td><td><strong>Yes</strong> (If applicable)</td></tr>
                    <tr><td>9</td><td>Certified ID Document & CV</td><td><strong>Yes</strong> (See Annexures)</td></tr>
                </tbody>
            </table>
            <div class="page-break"></div>

            <div class="section-title">Progress Report</div>
            <div class="grid-info">
                <div><span>Learner Name</span>${learner.fullName || "N/A"}</div>
                <div><span>Learner ID Number</span>${learner.idNumber || "N/A"}</div>
                <div><span>Programme Title</span>${learner.qualification?.name || submissions[0]?.qualificationName || "Software Developer"}</div>
                <div><span>Assessor Name</span>${primaryAssessor}</div>
                <div><span>Start Date</span>${safelyFormatDate(enrollment.trainingStartDate || learner.trainingStartDate)}</div>
                <div><span>End Date</span>${safelyFormatDate(enrollment.trainingEndDate || learner.trainingEndDate)}</div>
                <div style="grid-column: span 2;"><span>Workplace / Practical Site</span>${enrollment.employerName || "mLab Default Training Campus"}</div>
            </div>

            <div class="sub-title">Knowledge Modules</div>
            <table>
                <thead><tr><th>Module Number</th><th>Title</th><th>C/NYC</th></tr></thead>
                <tbody>${renderProgressRows(kmSubs)}</tbody>
            </table>

            <div class="sub-title">Practical Skills Modules</div>
            <table>
                <thead><tr><th>Module Number</th><th>Title</th><th>C/NYC</th></tr></thead>
                <tbody>${renderProgressRows(pmSubs)}</tbody>
            </table>

            <div class="sub-title">Work Experience Modules</div>
            <table>
                <thead><tr><th>Module Number</th><th>Title</th><th>C/NYC</th></tr></thead>
                <tbody>${renderProgressRows(wmSubs)}</tbody>
            </table>
            
            <div class="sig-inline">
                <div>
                    <strong>Assessor Sign-Off:</strong><br/>
                    <span style="font-size:10px; color:#64748b;">I declare this progress report accurate.</span>
                </div>
                ${assessorSigUrl ? `<img src="${assessorSigUrl}" />` : `<i>Pending Digital Signature</i>`}
                <div><strong>Date:</strong> ${safelyFormatDate(new Date())}</div>
            </div>
            <div class="page-break"></div>

            <div class="section-title">Actual Learning Plan & Evidence Control Sheet</div>
            <table>
                <thead>
                    <tr>
                        <th rowspan="2">Module Code</th>
                        <th rowspan="2">Facilitator</th>
                        <th rowspan="2">Dates Active</th>
                        <th colspan="3" style="text-align:center;">Evidence Type</th>
                        <th colspan="2" style="text-align:center;">Outcome</th>
                    </tr>
                    <tr>
                        <th style="font-size:9px; text-align:center;">Knowledge</th>
                        <th style="font-size:9px; text-align:center;">Practical</th>
                        <th style="font-size:9px; text-align:center;">Workplace</th>
                        <th style="font-size:9px; text-align:center;">C</th>
                        <th style="font-size:9px; text-align:center;">NYC</th>
                    </tr>
                </thead>
                <tbody>
                    ${renderLearningPlanRows(submissions)}
                </tbody>
            </table>
            <div class="page-break"></div>

            <div class="section-title">Judging Evidence Principles</div>
            <p style="font-size:12px; margin-bottom: 10px;">The Assessor confirms the following principles were met during the evaluation of the learner's evidence:</p>
            <table>
                <thead><tr><th>Assessment Principles</th><th>Knowledge</th><th>Practical / Workplace</th></tr></thead>
                <tbody>
                    <tr><td><strong>Relevant:</strong> Relates to specific programme components.</td><td>Yes</td><td>Yes</td></tr>
                    <tr><td><strong>Valid:</strong> Shows the candidate can perform the function.</td><td>Yes</td><td>Yes</td></tr>
                    <tr><td><strong>Authentic:</strong> Evidence is the candidate's own work.</td><td>Yes</td><td>Yes</td></tr>
                    <tr><td><strong>Consistent:</strong> Shows repeatable performance to standard.</td><td>Yes</td><td>Yes</td></tr>
                    <tr><td><strong>Current:</strong> Evidence relates to current competence.</td><td>Yes</td><td>Yes</td></tr>
                    <tr><td><strong>Sufficient:</strong> Enough evidence collected to make judgement.</td><td>Yes</td><td>Yes</td></tr>
                </tbody>
            </table>

            <div class="section-title" style="margin-top:40px;">Letter of Commitment</div>
            <div style="background:#f8fafc; padding:15px; border:1px solid #cbd5e1; font-size:12px; border-radius:6px; margin-bottom:20px;">
                <p>I undertake to fulfil all the requirements of the assessment and training practices as specified by the assessor and service provider.</p>
                <p>I also declare that all the work handed in including assignments and case studies is authentic (my own work) and current.</p>
                <p>I am aware that in order to graduate from this programme I need to meet all compulsory requirements including being declared competent on all components that form the basis of this programme.</p>
            </div>
            
            <div class="sig-inline" style="margin-top:0;">
                <div>
                    <strong>Learner Sign-Off:</strong>
                </div>
                ${learnerSignatureUrl ? `<img src="${learnerSignatureUrl}" />` : `<i>Pending Digital Signature</i>`}
                <div><strong>Date:</strong> ${safelyFormatDate(submissions[0]?.assignedAt || new Date())}</div>
            </div>
            
            <div class="divider-page" style="margin-top: 40px; height: auto; padding: 20px; border-color: #073f4e;">
                <h1 style="font-size:24px;">Assessment Evidence Records</h1>
                <p>The following pages contain the official system transcripts, grading feedback, and evidence links for every module assessed.</p>
            </div>
            <div class="page-break"></div>
        `;

      let index = 0;
      for (const sub of submissions) {
        index++;
        await updateProgress(
          30 + Math.floor((index / submissions.length) * 40),
          `Compiling: ${sub.title || "Module"}...`,
        );

        const assessmentSnap = await admin
          .firestore()
          .collection("assessments")
          .doc(sub.assessmentId)
          .get();
        const assessmentData = assessmentSnap.data() || {};
        const blocks = assessmentData.blocks || [];

        const grading = sub.grading || {};
        const moderation = sub.moderation || {};
        const answers = sub.answers || {};

        const facFeedback =
          sub.facilitatorOverallFeedback ||
          grading.facilitatorOverallFeedback ||
          "<i>No facilitator comments.</i>";
        const assFeedback =
          grading.assessorOverallFeedback || "<i>No assessor feedback.</i>";
        const modFeedback =
          moderation.feedback || "<i>No moderation comments.</i>";

        const compClass =
          sub.competency === "C"
            ? "outcome-C"
            : sub.competency === "NYC"
              ? "outcome-NYC"
              : "outcome-Pending";
        const compText =
          sub.competency === "C"
            ? "COMPETENT (C)"
            : sub.competency === "NYC"
              ? "NOT YET COMPETENT (NYC)"
              : "PENDING";

        const moduleBreadcrumb = sub.moduleNumber || sub.title || "Module";

        // INJECT OPEN BOOK DECLARATION IF APPLICABLE
        let openBookHtml = "";
        if (assessmentData.isOpenBook && assessmentData.referenceManualUrl) {
          openBookHtml = `
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-size: 11px;">
                <strong style="color: #0369a1; display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase;">📖 Open Book Assessment Conditions</strong>
                <span style="color: #0c4a6e; display: block; margin-bottom: 6px;">The learner was provided with an official reference manual during this assessment. The reference manual used is archived and verifiable via the link below:</span>
                <a href="${assessmentData.referenceManualUrl}" style="color: #0284c7; text-decoration: underline; font-weight: bold; word-break: break-all;">${assessmentData.referenceManualUrl}</a>
            </div>
            `;
        }

        htmlContent += `
                <div class="module-header">
                    <h2 style="margin:0; color:#073f4e;">${sub.moduleNumber ? sub.moduleNumber + ": " : ""}${sub.title || "Untitled"}</h2>
                </div>
                
                ${openBookHtml}
                
                <div class="eval-box">
                    <div class="eval-row">
                        <div class="eval-label">Final Outcome:</div>
                        <div class="eval-value"><span class="${compClass}">${compText}</span></div>
                    </div>
                    <div class="eval-row">
                        <div class="eval-label">Assessment Score:</div>
                        <div class="eval-value"><strong>${sub.marks !== undefined ? sub.marks : "-"} / ${sub.totalMarks || "-"}</strong></div>
                    </div>
                    <hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;" />
                    <div class="eval-row text-blue">
                        <div class="eval-label">Facilitator Note:</div>
                        <div class="eval-value">${facFeedback}</div>
                    </div>
                    <div class="eval-row text-red">
                        <div class="eval-label">Assessor Feedback:</div>
                        <div class="eval-value">${assFeedback}</div>
                    </div>
                    <div class="eval-row text-green">
                        <div class="eval-label">Moderator Review:</div>
                        <div class="eval-value">${modFeedback}</div>
                    </div>
                </div>

                <div class="evidence-list">
            `;

        if (blocks.length > 0) {
          let qNum = 1;
          blocks.forEach((block: any) => {
            if (block.type === "section") {
              htmlContent += `<h3 style="margin-top: 25px; padding-bottom: 5px; border-bottom: 2px solid #cbd5e1;">${block.title}</h3>`;
              return;
            }
            if (block.type === "info") return;

            const blockBreadcrumb =
              block.weCode || block.code || block.title || `Q${qNum}`;
            const ans =
              answers[block.id] !== undefined
                ? answers[block.id]
                : sub[block.id];
            let formattedAnswer = "";

            if (ans !== undefined && ans !== null) {
              if (typeof ans === "string" || typeof ans === "number") {
                if (
                  block.type === "mcq" &&
                  typeof ans === "number" &&
                  block.options
                ) {
                  formattedAnswer = block.options[ans] || String(ans);
                } else {
                  formattedAnswer = String(ans);
                }
              } else if (typeof ans === "object") {
                if (ans.text && ans.text !== "<p></p>")
                  formattedAnswer += `<div>${ans.text}</div>`;
                if (ans.url)
                  formattedAnswer += `<div>🔗 <a class="a-link" href="${ans.url}">External Link</a></div>`;
                if (ans.code)
                  formattedAnswer += `<pre style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0;">${ans.code}</pre>`;

                if (ans.uploadUrl) {
                  const annIndex = offlineEvidenceFiles.length + 1;
                  const detailedLabel = `${moduleBreadcrumb} | ${blockBreadcrumb}`;

                  offlineEvidenceFiles.push({
                    index: annIndex,
                    url: ans.uploadUrl,
                    label: detailedLabel,
                  });
                  formattedAnswer += `<div style="margin-top:5px; padding:8px; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; font-size:11px;">
                        📎 <a class="a-link" href="${ans.uploadUrl}"><strong>Appended as Annexure ${annIndex}</strong> (${detailedLabel})</a>
                    </div>`;
                }

                Object.keys(ans).forEach((k) => {
                  const subAns = ans[k];
                  if (subAns && typeof subAns === "object") {
                    let subHtml = "";
                    if (subAns.text && subAns.text !== "<p></p>")
                      subHtml += `<div>${subAns.text}</div>`;
                    if (subAns.url)
                      subHtml += `<div>🔗 <a class="a-link" href="${subAns.url}">External Link</a></div>`;
                    if (subAns.code)
                      subHtml += `<pre style="background:#f8fafc; padding:10px;">${subAns.code}</pre>`;

                    if (subAns.uploadUrl) {
                      const annIndex = offlineEvidenceFiles.length + 1;
                      const nestedLabel = `${moduleBreadcrumb} | ${blockBreadcrumb} | ${k.replace(/_/g, " ").toUpperCase()}`;

                      offlineEvidenceFiles.push({
                        index: annIndex,
                        url: subAns.uploadUrl,
                        label: nestedLabel,
                      });
                      subHtml += `<div style="margin-top:5px; padding:8px; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; font-size:11px;">
                            📎 <a class="a-link" href="${subAns.uploadUrl}"><strong>Appended as Annexure ${annIndex}</strong> (${nestedLabel})</a>
                        </div>`;
                    }

                    if (subHtml) {
                      formattedAnswer += `<div style="margin-top:10px; padding:10px; border-left:3px solid #cbd5e1; background:#f8fafc;"><strong>Item: ${k.replace(/_/g, " ")}</strong>${subHtml}</div>`;
                    }
                  } else if (
                    typeof subAns === "string" &&
                    subAns.trim() !== "" &&
                    !["text", "url", "uploadUrl", "code"].includes(k)
                  ) {
                    formattedAnswer += `<div><strong>${k.replace(/_/g, " ")}:</strong> ${subAns}</div>`;
                  }
                });
              }
            }
            if (formattedAnswer === "")
              formattedAnswer = "<i>No evidence provided.</i>";

            let specificFeedback = "";
            const seenComments = new Set<string>();

            const addFeedback = (
              role: string,
              text: string,
              colorClass: string,
            ) => {
              if (!text || text.trim() === "") return;
              const cleanText = text.trim();
              const key = `${role}:${cleanText}`;
              if (!seenComments.has(key)) {
                seenComments.add(key);
                specificFeedback += `<div class="f-item ${colorClass}"><strong>${role} Note:</strong> ${cleanText}</div>`;
              }
            };

            const fLayer = grading.facilitatorBreakdown?.[block.id] || {};
            const aLayer = grading.assessorBreakdown?.[block.id] || {};
            const mLayer = moderation.breakdown?.[block.id] || {};

            addFeedback("Facilitator", fLayer.feedback, "text-blue");
            addFeedback("Assessor", aLayer.feedback, "text-red");
            addFeedback("Moderator", mLayer.feedback, "text-green");

            if (Array.isArray(fLayer.criteriaResults)) {
              fLayer.criteriaResults.forEach((crit: any) =>
                addFeedback("Facilitator", crit.comment, "text-blue"),
              );
            }
            if (Array.isArray(aLayer.criteriaResults)) {
              aLayer.criteriaResults.forEach((crit: any) =>
                addFeedback("Assessor", crit.comment, "text-red"),
              );
            }
            if (Array.isArray(mLayer.criteriaResults)) {
              mLayer.criteriaResults.forEach((crit: any) =>
                addFeedback("Moderator", crit.comment, "text-green"),
              );
            }

            htmlContent += `
                        <div class="question-box">
                            <div class="q-text">Q${qNum++}. ${block.question || block.title || "Checkpoint"}</div>
                            <div class="a-text">${formattedAnswer}</div>
                            ${specificFeedback ? `<div class="f-text">${specificFeedback}</div>` : ""}
                        </div>
                    `;
          });
        } else {
          htmlContent += `<p style="color:#94a3b8; font-style:italic; padding: 20px; text-align: center; border: 1px dashed #cbd5e1;">Cannot map evidence: Assessment Template is empty.</p>`;
        }

        htmlContent += `</div>`;

        const facSigUrl = sub.facilitatorId
          ? signaturesMap[sub.facilitatorId]
          : null;
        const assSigUrl = sub.gradedBy ? signaturesMap[sub.gradedBy] : null;
        const modSigUrl = sub.moderation?.moderatedBy
          ? signaturesMap[sub.moderation.moderatedBy]
          : null;

        const learnerDate = safelyFormatDate(
          sub.submittedAt || sub.learnerDeclaration?.timestamp,
        );
        const facName =
          sub.facilitatorName || grading.facilitatorName || "Pending";
        const facDate = safelyFormatDate(
          sub.facilitatorReviewedAt || grading.facilitatorReviewedAt,
        );
        const assessorName = grading.assessorName || "Pending";
        const assessorReg = grading.assessorRegNumber
          ? `Reg: ${grading.assessorRegNumber}`
          : "";
        const assessorDate = safelyFormatDate(sub.gradedAt || grading.gradedAt);
        const modName = moderation.moderatorName || "Pending";
        const modReg = moderation.moderatorRegNumber
          ? `Reg: ${moderation.moderatorRegNumber}`
          : "";
        const modDate = safelyFormatDate(moderation.moderatedAt);

        htmlContent += `
                <div class="sig-wrapper">
                    <div class="sig-box">
                        <h4>Learner Declaration</h4>
                        ${learnerSignatureUrl ? `<img src="${learnerSignatureUrl}" class="sig-img" />` : `<div class="sig-placeholder">No signature on file</div>`}
                        <div class="sig-name">${learner.fullName || "Unknown Learner"}</div>
                        <span class="sig-date">Signed: ${learnerDate}</span>
                    </div>
                    <div class="sig-box sig-box-fac">
                        <h4>Facilitator Review</h4>
                        ${facSigUrl ? `<img src="${facSigUrl}" class="sig-img sig-img-fac" />` : `<div class="sig-placeholder">No signature on file</div>`}
                        <div class="sig-name">${facName}</div>
                        <span class="sig-date">Signed: ${facDate}</span>
                    </div>
                    <div class="sig-box sig-box-ass">
                        <h4>Assessor Endorsement</h4>
                        ${assSigUrl ? `<img src="${assSigUrl}" class="sig-img sig-img-ass" />` : `<div class="sig-placeholder">No signature on file</div>`}
                        <div class="sig-name">${assessorName}</div>
                        ${assessorReg ? `<div class="sig-reg">${assessorReg}</div>` : ""}
                        <span class="sig-date">Signed: ${assessorDate}</span>
                    </div>
                    <div class="sig-box sig-box-mod">
                        <h4>Moderator Verification</h4>
                        ${modSigUrl ? `<img src="${modSigUrl}" class="sig-img sig-img-mod" />` : `<div class="sig-placeholder">No signature on file</div>`}
                        <div class="sig-name">${modName}</div>
                        ${modReg ? `<div class="sig-reg">${modReg}</div>` : ""}
                        <span class="sig-date">Signed: ${modDate}</span>
                    </div>
                </div>
                <div class="page-break"></div>
            `;
      }

      if (offlineEvidenceFiles.length > 0) {
        htmlContent += `
             <div class="divider-page" style="border-color: #94a3b8; color: #475569; background-color: #f8fafc;">
                 <h1>Annexures</h1>
                 <h2>Offline Evidence Documents</h2>
                 <p>The following pages contain the exact files uploaded by the learner, mapped directly to their respective assessment items.</p>
             </div>
          `;
      }

      htmlContent += `</body></html>`;

      await updateProgress(70, "Finalizing Assessment Layout...");
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(120000);
      page.setDefaultTimeout(120000);

      await page.setContent(htmlContent, {
        waitUntil: ["load", "networkidle2"],
        timeout: 120000,
      });

      const puppeteerPdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #64748b; padding: 0 15mm; width: 100%; display: flex; justify-content: space-between; box-sizing: border-box;">
            <span>CodeTribe Academy Compliance</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>
        `,
        margin: { top: "15mm", right: "15mm", bottom: "25mm", left: "15mm" },
        timeout: 120000,
      });

      await browser.close();

      await updateProgress(
        85,
        "Merging Compliance Documents inside Cover Page...",
      );

      const masterPdf = await PDFDocument.create();
      const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);

      const assessmentPdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
      const totalAssessmentPages = assessmentPdfDoc.getPageCount();

      // 1. EXTRACT & APPEND PAGE 1 (THE COVER PAGE)
      if (totalAssessmentPages > 0) {
        const [coverPage] = await masterPdf.copyPages(assessmentPdfDoc, [0]);
        masterPdf.addPage(coverPage);
      }

      // 2. FETCH & APPEND COMPLIANCE DOCS
      const docsSource = learnerUserDoc?.documents || learner?.documents || {};
      const frontMatterUrls = [
        docsSource.idUrl,
        docsSource.cvUrl,
        docsSource.qualUrl,
      ].filter((url) => url && typeof url === "string");

      for (const url of frontMatterUrls) {
        try {
          const fileBuffer = await fetchFileBuffer(url);
          if (fileBuffer) {
            const externalPdf = await PDFDocument.load(fileBuffer);
            const copiedPages = await masterPdf.copyPages(
              externalPdf,
              externalPdf.getPageIndices(),
            );
            copiedPages.forEach((p: any) => masterPdf.addPage(p));
          }
        } catch (err) {
          console.warn(
            `Could not merge front-matter document from URL: ${url}. Skipping it.`,
            err,
          );
        }
      }

      // 3. EXTRACT & APPEND PAGES 2 TO END (THE ASSESSMENTS + QCTO FORMS)
      if (totalAssessmentPages > 1) {
        const remainingIndices = Array.from(
          { length: totalAssessmentPages - 1 },
          (_, i) => i + 1,
        );
        const remainingPages = await masterPdf.copyPages(
          assessmentPdfDoc,
          remainingIndices,
        );
        remainingPages.forEach((p: any) => masterPdf.addPage(p));
      }

      // 4. FETCH & APPEND OFFLINE EVIDENCE (ANNEXURES) WITH DETAILED STAMPS
      if (offlineEvidenceFiles.length > 0) {
        await updateProgress(90, "Merging Offline Evidence (Annexures)...");
        for (const evidence of offlineEvidenceFiles) {
          try {
            const buffer = await fetchFileBuffer(evidence.url);
            if (!buffer) continue;

            const stampText = `Annexure ${evidence.index}: ${evidence.label}`;

            try {
              const extPdf = await PDFDocument.load(buffer);
              const copiedPages = await masterPdf.copyPages(
                extPdf,
                extPdf.getPageIndices(),
              );

              if (copiedPages.length > 0) {
                const firstPage = copiedPages[0];
                const { height } = firstPage.getSize();
                firstPage.drawText(stampText, {
                  x: 20,
                  y: height - 20,
                  size: 10,
                  color: rgb(0.86, 0.15, 0.15),
                  font: fontBold,
                });
              }
              copiedPages.forEach((p: any) => masterPdf.addPage(p));
            } catch (pdfErr) {
              let image;
              try {
                image = await masterPdf.embedPng(buffer);
              } catch {
                try {
                  image = await masterPdf.embedJpg(buffer);
                } catch (e) {}
              }

              if (image) {
                const page = masterPdf.addPage();
                const { width, height } = page.getSize();

                page.drawText(stampText, {
                  x: 20,
                  y: height - 30,
                  size: 10,
                  color: rgb(0.86, 0.15, 0.15),
                  font: fontBold,
                });

                const dims = image.scaleToFit(width - 40, height - 80);
                page.drawImage(image, {
                  x: width / 2 - dims.width / 2,
                  y: height / 2 - dims.height / 2 - 20,
                  width: dims.width,
                  height: dims.height,
                });
              }
            }
          } catch (err) {
            console.warn(
              `Failed to process evidence annexure: ${evidence.url}`,
              err,
            );
          }
        }
      }

      const finalPdfBytes = await masterPdf.save();
      const finalPdfBuffer = Buffer.from(finalPdfBytes);

      // STORAGE HOUSEKEEPING
      await updateProgress(
        95,
        "Cleaning up old records and saving to vault...",
      );
      const bucket = admin.storage().bucket();
      const dirPrefix = `poe_exports/${learnerId}/`;

      try {
        await bucket.deleteFiles({ prefix: dirPrefix });
      } catch (cleanupErr) {}

      const filePath = `${dirPrefix}Master_PoE_${requestId}.pdf`;
      const file = bucket.file(filePath);

      await file.save(finalPdfBuffer, {
        metadata: { contentType: "application/pdf" },
      });

      const [downloadUrl] = await file.getSignedUrl({
        action: "read",
        expires: "01-01-2100",
      });

      await snap.ref.update({
        status: "completed",
        progress: 100,
        progressMessage: "Done!",
        downloadUrl,
      });

      if (requesterEmail) {
        await transporter.sendMail({
          from: '"mLab Compliance" <noreply@mlab.co.za>',
          to: requesterEmail,
          subject: `✅ Master PoE Ready: ${learner.fullName}`,
          html: `<p>The full Master Portfolio for <b>${learner.fullName}</b> has been successfully generated.</p>
                 <p><a href="${downloadUrl}" style="padding:10px 20px; background:#16a34a; color:white; text-decoration:none; border-radius:5px;">Download Master PoE PDF</a></p>`,
        });
      }
    } catch (error: any) {
      console.error("Master PoE Generation Failed:", error);
      await snap.ref.update({
        status: "error",
        progressMessage: "Generation failed",
        errorMessage: error.message,
      });
    }
  },
);

exports.sendAdHocCertificate = onCall(async (request) => {
  // 1. V2 Security Check
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  // 2. Destructure from request.data
  const { email, recipientName, pdfUrl, awardTitle, courseName } = request.data;

  const mailOptions = {
    // from: '"mLab Southern Africa" <noreply@mlab.co.za>',
    from: '"mLab Admin" <brndkt@gmail.com>',
    to: email,
    subject: `Your Certificate: ${awardTitle} - ${courseName}`,
    html: `
            <div style="font-family: sans-serif; max-width: 600px; color: #073f4e;">
                <h2>Congratulations, ${recipientName}!</h2>
                <p>We are pleased to share your <strong>${awardTitle}</strong> for completing the <strong>${courseName}</strong>.</p>
                <div style="margin: 25px 0;">
                    <a href="${pdfUrl}" style="background: #94c73d; color: #073f4e; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">
                        Download Certificate (PDF)
                    </a>
                </div>
                <p>Best Regards,<br/>mLab Academic Management</p>
            </div>
        `,
  };

  try {
    await transporter.sendMail(mailOptions);
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Email Error:", error);
    throw new HttpsError("internal", "Failed to send email.");
  }
});

// ================= TRIGGER: ON SUBMISSION STATUS CHANGE =================
// Handles Alerts for Assessors, Moderators, and Learners during the grading lifecycle
export const onSubmissionStatusChange = onDocumentUpdated(
  "learner_submissions/{submissionId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();
    const submissionId = event.params.submissionId;

    if (!beforeData || !afterData) return;

    const db = admin.firestore();
    const learnerId = afterData.learnerId;
    const cohortId = afterData.cohortId;
    const moduleName =
      afterData.title || afterData.moduleNumber || "Assessment";

    // Helper to fetch user email by ID
    const getUserEmailAndName = async (uid: string) => {
      if (!uid) return null;
      const doc = await db.collection("users").doc(uid).get();
      if (!doc.exists) return null;
      return { email: doc.data()?.email, name: doc.data()?.fullName || "User" };
    };

    // Helper to fetch Learner email by ID
    const getLearnerEmailAndName = async (uid: string) => {
      if (!uid) return null;
      const doc = await db.collection("learners").doc(uid).get();
      if (!doc.exists) return null;
      return {
        email: doc.data()?.email,
        name: doc.data()?.fullName || "Learner",
      };
    };

    // Helper to get cohort staff IDs if not explicitly attached to the submission
    const getCohortStaff = async () => {
      if (!cohortId) return {};
      const cohortDoc = await db.collection("cohorts").doc(cohortId).get();
      return cohortDoc.data() || {};
    };

    try {
      const cohortStaff = await getCohortStaff();

      // 1. ASSESSOR & FACILITATOR ALERT: Learner uploads a new PoE
      if (
        beforeData.status !== "submitted" &&
        afterData.status === "submitted"
      ) {
        const assessorId = afterData.gradedBy || cohortStaff.assessorId;
        const facilitatorId = cohortStaff.facilitatorId;

        const assessor = await getUserEmailAndName(assessorId);
        const facilitator = await getUserEmailAndName(facilitatorId);
        const learner = await getLearnerEmailAndName(learnerId);

        // Alert the Assessor to grade it
        if (assessor?.email) {
          await sendEmail(
            assessor.email,
            `Action Required: New PoE Submitted for ${moduleName}`,
            `<h3>Hello ${assessor.name},</h3>
             <p><strong>${learner?.name}</strong> has just submitted their Portfolio of Evidence for <strong>${moduleName}</strong>.</p>
             <p>The submission is now waiting in your queue to be graded.</p>
             <div style="text-align: center; margin-top: 20px;">
                <a href="${APP_URL}/assessments/grade/${submissionId}" style="background-color: #ef4444; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Review & Grade</a>
             </div>`,
          );
        }

        // Alert the Facilitator of progress
        if (facilitator?.email) {
          await sendEmail(
            facilitator.email,
            `Progress Update: ${learner?.name} finished ${moduleName}`,
            `<h3>Hi ${facilitator.name},</h3>
             <p>Your learner, <strong>${learner?.name}</strong>, has successfully submitted their work for <strong>${moduleName}</strong>.</p>
             <p>The assessment has been routed to the cohort Assessor for grading. You can track the result on your class dashboard.</p>`,
          );
        }
      }

      // 2. MODERATOR ALERT & LEARNER ALERT: Assessor finalizes a grade
      if (beforeData.status !== "graded" && afterData.status === "graded") {
        const moderatorId =
          afterData.moderation?.moderatedBy || cohortStaff.moderatorId;
        const moderator = await getUserEmailAndName(moderatorId);
        const learner = await getLearnerEmailAndName(learnerId);
        const marks = afterData.marks || 0;
        const totalMarks = afterData.totalMarks || 100;
        const competency =
          afterData.competency === "C" ? "Competent" : "Not Yet Competent";

        // Alert Moderator to sample the grade
        if (moderator?.email) {
          await sendEmail(
            moderator.email,
            `Grading Finalized for Moderation: ${moduleName}`,
            `<h3>Hello ${moderator.name},</h3>
             <p>An Assessor has finalized the grading for <strong>${learner?.name}</strong> on <strong>${moduleName}</strong>.</p>
             <p>This submission is now available for your internal moderation and quality assurance review.</p>
             <div style="text-align: center; margin-top: 20px;">
                <a href="${APP_URL}/assessments/moderate/${submissionId}" style="background-color: #22c55e; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Moderate Grade</a>
             </div>`,
          );
        }

        // Alert Learner that their grade is published
        if (learner?.email) {
          await sendEmail(
            learner.email,
            `Assessment Graded: ${moduleName}`,
            `<h3>Hello ${learner.name},</h3>
             <p>Your assessment for <strong>${moduleName}</strong> has been graded!</p>
             <p><strong>Score:</strong> ${marks} / ${totalMarks}<br/>
                <strong>Outcome:</strong> ${competency}</p>
             <p>Log in to your portal to read your Assessor's feedback.</p>
             <div style="text-align: center; margin-top: 20px;">
                <a href="${APP_URL}/portal/assessments/${submissionId}" style="background-color: #0ea5e9; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Feedback</a>
             </div>`,
          );
        }
      }

      // 3. REWORK / REJECTION ALERT: Moderator rejects a grade back to Assessor
      const wasRejected =
        afterData.status === "rework" ||
        (afterData.moderation?.status === "rejected" &&
          beforeData.moderation?.status !== "rejected");

      if (wasRejected) {
        const assessorId = afterData.gradedBy || cohortStaff.assessorId;
        const assessor = await getUserEmailAndName(assessorId);
        const moderatorName =
          afterData.moderation?.moderatorName || "The Internal Moderator";

        if (assessor?.email) {
          await sendEmail(
            assessor.email,
            `Action Required: Moderation Rework on ${moduleName}`,
            `<h3>Hello ${assessor.name},</h3>
             <p>${moderatorName} has requested a rework on your grading for <strong>${moduleName}</strong>.</p>
             <p><strong>Moderator Notes:</strong><br/>
             <i>"${afterData.moderation?.feedback || "Please review the assessment again."}"</i></p>
             <p>Please log in immediately to apply the required corrective actions.</p>
             <div style="text-align: center; margin-top: 20px;">
                <a href="${APP_URL}/assessments/grade/${submissionId}" style="background-color: #f59e0b; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Correct Assessment</a>
             </div>`,
          );
        }
      }
    } catch (error) {
      console.error("Error processing submission notifications:", error);
    }
  },
);

// ================= TRIGGER: ON ASSESSMENT CREATED =================
// Notifies learners immediately when a new task is released or scheduled
export const onAssessmentCreated = onDocumentCreated(
  "assessments/{assessmentId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { title, cohortId, availableFrom, dueDate } = data;
    if (!cohortId) return;

    const db = admin.firestore();

    try {
      // Fetch the Cohort to get the list of enrolled learners
      const cohortSnap = await db.collection("cohorts").doc(cohortId).get();
      const cohortData = cohortSnap.data();
      if (!cohortData || !cohortData.learnerIds) return;

      const learnerIds = cohortData.learnerIds;

      // Loop through learners and send notifications
      const emailPromises = learnerIds.map(async (uid: string) => {
        const lSnap = await db.collection("learners").doc(uid).get();
        const learner = lSnap.data();
        if (!learner?.email) return;

        return sendEmail(
          learner.email,
          `New Assessment Available: ${title}`,
          `<h3>Hi ${learner.fullName},</h3>
           <p>A new assessment <strong>${title}</strong> has been assigned to your class.</p>
           
           <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; margin: 20px 0;">
              <p style="margin: 0; color: #475569;">
                ${availableFrom ? `📅 <b>Scheduled Start:</b> ${availableFrom}<br/>` : ""}
                ${dueDate ? `⏰ <b>Submission Deadline:</b> ${dueDate}` : ""}
              </p>
           </div>

           <p>Please log in to your learner portal to review the requirements and start your submission.</p>
           <div style="text-align: center; margin-top: 20px;">
              <a href="${APP_URL}/portal/assessments" style="background-color: #073f4e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">Go to Assessment</a>
           </div>`,
        );
      });

      await Promise.all(emailPromises);
      console.log(
        `Notifications sent to ${learnerIds.length} learners for assessment: ${title}`,
      );
    } catch (error) {
      console.error("Error sending new assessment alerts:", error);
    }
  },
);

// ================= TRIGGER: ON BLOCKCHAIN CERTIFICATION =================
// Handles Learner Alerts when their SoR is officially minted
export const onLearnerBlockchainVerified = onDocumentUpdated(
  "learners/{learnerId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // Check if isBlockchainVerified flipped from false to true
    if (!beforeData.isBlockchainVerified && afterData.isBlockchainVerified) {
      const email = afterData.email;
      const fullName = afterData.fullName || "Learner";
      const verificationCode = afterData.verificationCode;
      const qualName = afterData.qualification?.name || "Qualification";

      if (email && verificationCode) {
        try {
          await sendEmail(
            email,
            `🎉 Official Statement of Results Minted: ${qualName}`,
            `<h3>Congratulations ${fullName}!</h3>
             <p>Your official Statement of Results for <strong>${qualName}</strong> has been successfully minted to the blockchain.</p>
             <p>This means your academic credential is now permanently secured, immutable, and instantly verifiable by future employers.</p>
             
             <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; border: 1px solid #bbf7d0; margin: 20px 0;">
                <p style="margin: 0; color: #166534;"><strong>Your Verification ID:</strong> ${verificationCode}</p>
             </div>

             <p>You can view, download, and share your official digital credential using your public verification link below:</p>
             
             <div style="text-align: center; margin-top: 30px; margin-bottom: 30px;">
                <a href="${APP_URL}/sor/${verificationCode}" style="background-color: #073f4e; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold;">View Official Credential</a>
             </div>
             
             <p>Best Regards,<br/>mLab Academic Management Team</p>`,
          );
          console.log(`Blockchain verification email sent to ${email}`);
        } catch (error) {
          console.error("Error sending blockchain verification email:", error);
        }
      }
    }
  },
);

export const sendCustomVerificationEmail = onCall(async (request) => {
  const authCtx = request.auth;
  if (!authCtx) {
    throw new HttpsError(
      "unauthenticated",
      "Must be logged in to request a verification link.",
    );
  }

  const userEmail = authCtx.token.email;
  const uid = authCtx.uid;

  if (!userEmail) {
    throw new HttpsError("invalid-argument", "No email found for this user.");
  }

  try {
    // 1. DYNAMICALLY FETCH THE USER'S REAL NAME FROM FIRESTORE
    let userName = authCtx.token.name;

    if (!userName) {
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(uid)
        .get();
      if (userDoc.exists) {
        userName = userDoc.data()?.fullName;
      }
    }

    // Ultimate fallback if no name exists anywhere yet
    userName = userName || "there"; // Results in "Hi there,"

    const verificationLink = await admin
      .auth()
      .generateEmailVerificationLink(userEmail);
    const currentYear = new Date().getFullYear();

    /* ─────────────────────────────────────────────────────────────────────
       PLAIN TEXT FALLBACK
    ───────────────────────────────────────────────────────────────────── */
    const plainText = `
mLab Southern Africa — Email Verification

Hi ${userName},

Please verify your email address to secure your account and access the mLab Assessment Platform.

Verify here: ${verificationLink}

This link expires in 24 hours.
If you didn't create this account, you can safely ignore this email.

Privacy Policy: ${APP_URL}/privacy-policy
Terms of Service: ${APP_URL}/terms

© ${currentYear} Mobile Applications Laboratory NPC
Empowering the next generation of African tech talent.
    `.trim();

    /* ─────────────────────────────────────────────────────────────────────
       HTML EMAIL
    ───────────────────────────────────────────────────────────────────── */
    const htmlContent = `
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Verify Your Email — mLab Southern Africa</title>
  <style type="text/css">
    @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&display=swap');

    /* CLIENT RESETS */
    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td           { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img                 { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body                { margin: 0 !important; padding: 0 !important; width: 100% !important; }

    /* CTA HOVER */
    .ve-cta:hover {
      background-color: #0a5266 !important;
    }

    /* RESPONSIVE */
    @media only screen and (max-width: 600px) {
      .wrapper    { width: 100% !important; max-width: 100% !important; }
      .col-2      { display: block !important; width: 100% !important; }
      .hide-sm    { display: none !important; }
      .pad-sm     { padding: 28px 20px !important; }
      .title-sm   { font-size: 22px !important; }
      .heading-sm { font-size: 26px !important; }
      .cta-sm     { padding: 14px 24px !important; font-size: 13px !important; }
    }
  </style>
</head>
<body style="margin:0; padding:0; background-color:#e4edf0; font-family:'Trebuchet MS','Lucida Grande',Arial,sans-serif;">

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
         style="background-color:#e4edf0; min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <table class="wrapper" role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="width:580px; max-width:580px; background-color:#ffffff;
                      box-shadow:0 8px 32px rgba(7,63,78,0.18), 0 2px 8px rgba(7,63,78,0.08);">

          <tr>
            <td height="5" style="padding:0; line-height:5px; font-size:5px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="508" height="5" bgcolor="#073f4e" style="font-size:1px; line-height:1px;">&nbsp;</td>
                  <td width="72"  height="5" bgcolor="#94c73d" style="font-size:1px; line-height:1px;">&nbsp;</td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad-sm" align="center"
                style="background-color:#073f4e; padding:44px 40px 36px;
                       background-image:repeating-linear-gradient(-45deg,transparent,transparent 28px,rgba(255,255,255,0.02) 28px,rgba(255,255,255,0.02) 29px);">

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 22px;">
                <tr>
                  <td style="background:rgba(148,199,61,0.15); border:1px solid rgba(148,199,61,0.4); padding:5px 14px;">
                    <span style="color:#94c73d; font-family:'Oswald',sans-serif; font-size:10px; font-weight:700;
                                 letter-spacing:0.2em; text-transform:uppercase;">
                      &#x1F512;&nbsp; Secure Verification
                    </span>
                  </td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 18px;">
                <tr>
                  <td width="72" height="72" bgcolor="#0a5266" align="center" valign="middle"
                      style="border:2px solid rgba(148,199,61,0.45);">
                    <img src="https://img.icons8.com/ios-glyphs/48/94c73d/new-post.png"
                         alt="Email" width="36" height="36"
                         style="display:block; margin:auto;" />
                  </td>
                </tr>
              </table>

              <h1 class="title-sm"
                  style="color:#ffffff; margin:0 0 6px; font-family:'Oswald',sans-serif;
                         font-size:26px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase;
                         line-height:1.1;">
                Mobile Applications Laboratory NPC 
              </h1>
              <p style="color:rgba(255,255,255,0.45); margin:0; font-size:11px; font-family:'Trebuchet MS',sans-serif;
                        letter-spacing:0.08em; text-transform:uppercase;">
                Assessment &amp; Credentialing Platform
              </p>
            </td>
          </tr>

          <tr>
            <td align="center"
                style="background-color:#052e3a; padding:18px 40px; border-bottom:3px solid #94c73d;">
              <h2 class="heading-sm"
                  style="color:#ffffff; margin:0; font-family:'Oswald',sans-serif;
                         font-size:28px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">
                Verify Your Email
              </h2>
              <p style="color:rgba(255,255,255,0.45); margin:6px 0 0; font-size:12px;
                        font-family:'Trebuchet MS',sans-serif; letter-spacing:0.05em;">
                Secure your account to access your platform dashboard
              </p>
            </td>
          </tr>

          <tr>
            <td style="background-color:#f0f4f6; padding:16px 40px; border-bottom:1px solid #dde4e8;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" width="33%" style="padding:0 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td width="26" height="26" bgcolor="#94c73d" align="center" valign="middle"
                            style="border:2px solid #7aaa2e; font-family:'Oswald',sans-serif;
                                   font-size:10px; font-weight:700; color:#ffffff; letter-spacing:0;">
                          &#10003;
                        </td>
                      </tr>
                    </table>
                    <p style="margin:5px 0 0; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700;
                               letter-spacing:0.12em; text-transform:uppercase; color:#7aaa2e;">
                      Account Created
                    </p>
                  </td>

                  <td align="center" valign="middle" style="padding-bottom:18px;">
                    <div style="height:2px; background:#dde4e8; min-width:20px;">&nbsp;</div>
                  </td>

                  <td align="center" width="33%" style="padding:0 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td width="26" height="26" bgcolor="#073f4e" align="center" valign="middle"
                            style="border:2px solid #073f4e; font-family:'Oswald',sans-serif;
                                   font-size:10px; font-weight:700; color:#94c73d;">
                          &#9993;
                        </td>
                      </tr>
                    </table>
                    <p style="margin:5px 0 0; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700;
                               letter-spacing:0.12em; text-transform:uppercase; color:#073f4e;">
                      Verify Email
                    </p>
                  </td>

                  <td align="center" valign="middle" style="padding-bottom:18px;">
                    <div style="height:2px; background:#dde4e8; min-width:20px;">&nbsp;</div>
                  </td>

                  <td align="center" width="33%" style="padding:0 4px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
                      <tr>
                        <td width="26" height="26" bgcolor="#ffffff" align="center" valign="middle"
                            style="border:2px solid #dde4e8; font-family:'Oswald',sans-serif;
                                   font-size:10px; font-weight:700; color:#9b9b9b;">
                          3
                        </td>
                      </tr>
                    </table>
                    <p style="margin:5px 0 0; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700;
                               letter-spacing:0.12em; text-transform:uppercase; color:#9b9b9b;">
                      Access Dashboard
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td class="pad-sm" style="padding:36px 40px; background-color:#ffffff;">

              <p style="color:#6b6b6b; font-size:15px; line-height:1.7; margin:0 0 22px;
                        font-family:'Trebuchet MS',sans-serif;">
                Hi <strong style="color:#073f4e;">${userName}</strong>,
              </p>
              <p style="color:#6b6b6b; font-size:15px; line-height:1.7; margin:0 0 28px;
                        font-family:'Trebuchet MS',sans-serif;">
                Welcome to the mLab Assessment Platform. To secure your credentials and unlock
                your platform dashboard, please verify your email address by clicking the button below.
              </p>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin-bottom:28px; border:1px solid #dde4e8; border-left:4px solid #073f4e;">
                <tr>
                  <td style="padding:14px 18px; background-color:#e4edf0;">
                    <p style="margin:0 0 3px; font-family:'Oswald',sans-serif; font-size:9px; font-weight:700;
                               letter-spacing:0.18em; text-transform:uppercase; color:#9b9b9b;">
                      Verification Recipient
                    </p>
                    <p style="margin:0; color:#073f4e; font-size:16px; font-weight:700;
                               font-family:'Trebuchet MS',sans-serif; word-break:break-all;">
                      ${userEmail}
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${verificationLink}" class="ve-cta cta-sm"
                       style="display:inline-block; background-color:#073f4e; color:#ffffff;
                              padding:16px 40px; text-decoration:none;
                              font-family:'Oswald',sans-serif; font-weight:700; font-size:14px;
                              letter-spacing:0.14em; text-transform:uppercase;
                              border:2px solid #052e3a;
                              box-shadow:0 4px 12px rgba(7,63,78,0.25);">
                      &#x2192;&nbsp; Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin-bottom:28px; background-color:#fffbeb;
                            border:1px solid #fde68a; border-left:4px solid #d97706;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="color:#92400e; font-size:13px; line-height:1.6; margin:0 0 6px;
                               font-family:'Oswald',sans-serif; font-weight:700;
                               letter-spacing:0.06em; text-transform:uppercase;">
                      Button not working?
                    </p>
                    <p style="color:#78350f; font-size:12px; line-height:1.6; margin:0;
                               font-family:'Trebuchet MS',sans-serif;">
                      Copy and paste this link into your browser:<br />
                      <a href="${verificationLink}"
                         style="color:#0a5266; word-break:break-all; text-decoration:underline;">
                        ${verificationLink}
                      </a>
                    </p>
                  </td>
                </tr>
              </table>

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="border-top:1px solid #dde4e8; padding-top:20px;">
                <tr>
                  <td align="center" style="padding-top:20px;">
                    <p style="color:#9b9b9b; font-size:12px; line-height:1.6; margin:0;
                               font-family:'Trebuchet MS',sans-serif; text-align:center;">
                      This verification link expires in
                      <strong style="color:#073f4e;">24 hours</strong>.
                    </p>
                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <tr>
            <td style="background-color:#f0f4f6; padding:24px 40px; border-top:1px solid #dde4e8;">

              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
                     style="margin-bottom:20px;">
                <tr>
                  <td width="72" height="3" bgcolor="#94c73d" style="font-size:1px; line-height:1px;">&nbsp;</td>
                  <td height="3" bgcolor="#073f4e" style="font-size:1px; line-height:1px;">&nbsp;</td>
                </tr>
              </table>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 16px;">
                <tr>
                  <td style="padding:0 10px;">
                    <a href="${APP_URL}"
                       style="color:#073f4e; text-decoration:none; font-family:'Oswald',sans-serif;
                              font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">
                      Website
                    </a>
                  </td>
                  <td style="color:#dde4e8; padding:0 4px;">|</td>
                  <td style="padding:0 10px;">
                    <a href="mailto:support@mlab.co.za"
                       style="color:#073f4e; text-decoration:none; font-family:'Oswald',sans-serif;
                              font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">
                      Support
                    </a>
                  </td>
                  <td style="color:#dde4e8; padding:0 4px;">|</td>
                  <td style="padding:0 10px;">
                    <a href="${APP_URL}/privacy-policy"
                       style="color:#073f4e; text-decoration:none; font-family:'Oswald',sans-serif;
                              font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">
                      Privacy
                    </a>
                  </td>
                  <td style="color:#dde4e8; padding:0 4px;">|</td>
                  <td style="padding:0 10px;">
                    <a href="${APP_URL}/terms"
                       style="color:#073f4e; text-decoration:none; font-family:'Oswald',sans-serif;
                              font-size:11px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase;">
                      Terms
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#9b9b9b; font-size:11px; line-height:1.65; margin:0 0 6px;
                        font-family:'Trebuchet MS',sans-serif; text-align:center;">
                &copy; ${currentYear} Mobile Applications Laboratory NPC. All rights reserved.
              </p>
              <p style="color:#9b9b9b; font-size:11px; line-height:1.55; margin:0;
                        font-family:'Trebuchet MS',sans-serif; text-align:center;">
                If you didn&rsquo;t create this account, you can safely ignore this email.
              </p>
              <p style="margin:10px 0 0; text-align:center; font-size:11px;
                        font-family:'Trebuchet MS',sans-serif; color:#9b9b9b;">
                <span style="color:#94c73d;">&#9632;</span>
                Empowering the next generation of African tech talent.
              </p>

            </td>
          </tr>

        </table>
        <table role="presentation" width="580" cellpadding="0" cellspacing="0" border="0"
               style="max-width:580px; width:100%; margin-top:16px;">
          <tr>
            <td align="center">
              <p style="color:rgba(7,63,78,0.45); font-size:10px; margin:0;
                        font-family:'Trebuchet MS',sans-serif; letter-spacing:0.04em;">
                Automated message from the mLab Assessment Platform &middot; Do not reply to this email
              </p>
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>

</body>
</html>
    `.trim();

    /* ─── SEND ─────────────────────────────────────────────────────────── */
    const mailOptions = {
      from: '"mLab Assessment Platform" <brndkt@gmail.com>',
      to: userEmail,
      subject: "Verify Your mLab Account",
      text: plainText,
      html: htmlContent,
    };

    await transporter.sendMail(mailOptions);
    return { success: true, message: "Verification email sent." };
  } catch (error: any) {
    console.error("Email Error:", error);
    throw new HttpsError("internal", error.message || "Failed to send email");
  }
});
