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

// const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");

// const puppeteer = require("puppeteer-core");
// const chromium = require("@sparticuz/chromium");

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

import { ethers } from "ethers";

const cors = require("cors")({ origin: true });
import { defineSecret } from "firebase-functions/params";

// 'axios' is used to make standard HTTP requests (to send the file to Pinata).
import axios from "axios";
// 'form-data' lets Node.js build a "file upload form" in the background to send to Pinata.
import FormData from "form-data";
// import { generateMasterPoE } from "./modules/generateMasterPoE";
import { generateHistorySnapshot } from "./modules/generateHistorySnapshot";
// import { generateMasterPoE } from "./modules/generateMasterPoE";

admin.initializeApp();

// exports.generateMasterPoE = generateMasterPoE;
exports.generateHistorySnapshot = generateHistorySnapshot;

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
    // Include a link to the project in here
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

// interface Submission {
//   id: string;
//   assessmentId: string;
//   title?: string;
//   moduleType?: string;
//   competency?: string;
//   submittedAt?: string;
//   moduleNumber?: string;
//   marks?: number;
//   totalMarks?: number;
//   answers?: Record<string, any>;

//   facilitatorId?: string;
//   gradedBy?: string;

//   facilitatorName?: string;
//   facilitatorOverallFeedback?: string;
//   facilitatorReviewedAt?: string;

//   gradedAt?: string;
//   grading?: {
//     facilitatorName?: string;
//     facilitatorOverallFeedback?: string;
//     facilitatorReviewedAt?: string;
//     facilitatorId?: string;

//     assessorName?: string;
//     assessorOverallFeedback?: string;
//     assessorRegNumber?: string;
//     gradedAt?: string;
//     gradedBy?: string;
//     facilitatorBreakdown?: Record<string, any>;
//     assessorBreakdown?: Record<string, any>;
//   };

//   moderation?: {
//     moderatedBy?: string;
//     moderatorName?: string;
//     moderatorRegNumber?: string;
//     moderatedAt?: string;
//     feedback?: string;
//     breakdown?: Record<string, any>;
//   };
//   assignedAt?: string;
//   learnerDeclaration?: any;
//   [key: string]: any;
// }

// const fetchFileBuffer = async (url: string) => {
//   try {
//     const res = await fetch(url);
//     if (!res.ok) throw new Error(`Failed to fetch ${url}`);
//     return await res.arrayBuffer();
//   } catch (error) {
//     console.error("Buffer fetch error: ", error);
//     return null;
//   }
// };

// exports.generateMasterPoE = onDocumentCreated(
//   {
//     document: "poe_export_requests/{requestId}",
//     timeoutSeconds: 540,
//     memory: "2GiB",
//     region: "us-central1",
//   },
//   async (event) => {
//     const snap = event.data;
//     if (!snap) return;

//     const requestData = snap.data();
//     const requestId = event.params.requestId;
//     const learnerId = requestData.learnerId;
//     const requestedByUid = requestData.requestedBy;
//     let requesterEmail: string | null = null;

//     // Added types to parameters
//     const updateProgress = async (percent: number, message: string) => {
//       await snap.ref.update({ progress: percent, progressMessage: message });
//     };

//     // Added types to dateString
//     const safelyFormatDate = (dateString: string | Date | undefined | null) => {
//       if (!dateString) return "N/A";
//       try {
//         const d = new Date(dateString);
//         return isNaN(d.getTime()) ? "N/A" : d.toLocaleDateString("en-ZA");
//       } catch {
//         return "N/A";
//       }
//     };

//     try {
//       await updateProgress(5, "Initializing compliance engine...");

//       if (requestedByUid) {
//         try {
//           const user = await admin.auth().getUser(requestedByUid);
//           requesterEmail = user.email || null;
//         } catch (e) {
//           console.error("Auth fetch failed", e);
//         }
//       }

//       const learnerSnap = await admin
//         .firestore()
//         .collection("learners")
//         .doc(learnerId)
//         .get();
//       const learner = learnerSnap.data() || {};

//       let enrollment: any = {};
//       if (learner.enrollmentId) {
//         const enrolSnap = await admin
//           .firestore()
//           .collection("enrollments")
//           .doc(learner.enrollmentId)
//           .get();
//         if (enrolSnap.exists) enrollment = enrolSnap.data() || {};
//       }

//       await updateProgress(15, "Fetching all evidence modules...");
//       const subsSnap = await admin
//         .firestore()
//         .collection("learner_submissions")
//         .where("learnerId", "==", learnerId)
//         .get();

//       const submissions: Submission[] = subsSnap.docs.map((d) => {
//         const data = d.data();
//         return {
//           id: d.id,
//           assessmentId: data.assessmentId || "",
//           title: data.title || "",
//           moduleType: data.moduleType || "",
//           competency: data.competency || "",
//           submittedAt: data.submittedAt || "",
//           moduleNumber: data.moduleNumber || "",
//           marks: data.marks,
//           totalMarks: data.totalMarks,
//           answers: data.answers || {},
//           facilitatorId:
//             data.grading?.facilitatorId ||
//             data.facilitatorId ||
//             data.latestCoachingLog?.facilitatorId ||
//             "",
//           gradedBy: data.grading?.gradedBy || data.gradedBy || "",
//           facilitatorName: data.facilitatorName || "",
//           facilitatorOverallFeedback: data.facilitatorOverallFeedback || "",
//           facilitatorReviewedAt:
//             data.grading?.facilitatorReviewedAt ||
//             data.facilitatorReviewedAt ||
//             "",
//           gradedAt: data.grading?.gradedAt || data.gradedAt || "",
//           grading: data.grading || {},
//           moderation: data.moderation || {},
//           assignedAt: data.assignedAt || "",
//           learnerDeclaration: data.learnerDeclaration || {},
//           ...data, // Spreads all other fields so sub[block.id] works
//         } as Submission;
//       });

//       submissions.sort(
//         (a, b) =>
//           new Date(a.assignedAt || 0).getTime() -
//           new Date(b.assignedAt || 0).getTime(),
//       );

//       const kmSubs = submissions.filter(
//         (s) => s.moduleNumber?.includes("-KM-") || s.moduleType === "knowledge",
//       );
//       const pmSubs = submissions.filter(
//         (s) => s.moduleNumber?.includes("-PM-") || s.moduleType === "practical",
//       );
//       const wmSubs = submissions.filter(
//         (s) => s.moduleNumber?.includes("-WM-") || s.moduleType === "workplace",
//       );

//       const primaryAssessor =
//         submissions.find((s) => s.grading?.assessorName)?.grading
//           ?.assessorName || "Pending Assessor";

//       await updateProgress(25, "Retrieving digital signatures & user docs...");
//       const userIdsToFetch = new Set<string>();
//       if (learner.authUid) userIdsToFetch.add(learner.authUid);

//       submissions.forEach((sub) => {
//         if (sub.facilitatorId) userIdsToFetch.add(sub.facilitatorId);
//         if (sub.gradedBy) userIdsToFetch.add(sub.gradedBy);
//         if (sub.moderation?.moderatedBy)
//           userIdsToFetch.add(sub.moderation.moderatedBy);
//       });

//       // Explicit types for objects and arrays
//       const signaturesMap: Record<string, string> = {};
//       let learnerUserDoc: any = null;
//       let assessorSigUrl: string | null = null;

//       if (userIdsToFetch.size > 0) {
//         const promises = Array.from(userIdsToFetch).map((uid) =>
//           admin.firestore().collection("users").doc(uid).get(),
//         );
//         const userSnaps = await Promise.all(promises);
//         userSnaps.forEach((userSnap) => {
//           if (userSnap.exists) {
//             const data = userSnap.data();
//             if (data?.signatureUrl)
//               signaturesMap[userSnap.id] = data.signatureUrl;
//             if (userSnap.id === learner.authUid) learnerUserDoc = data;

//             const gradedSub = submissions.find(
//               (s) => s.gradedBy === userSnap.id,
//             );
//             if (gradedSub && data?.signatureUrl && !assessorSigUrl) {
//               assessorSigUrl = data.signatureUrl;
//             }
//           }
//         });
//       }

//       const learnerSignatureUrl = learner.authUid
//         ? signaturesMap[learner.authUid]
//         : null;

//       await updateProgress(30, "Generating QCTO Compliance Structure...");
//       const companyLogoUrl =
//         "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";

//       const offlineEvidenceFiles: {
//         index: number;
//         url: string;
//         label: string;
//       }[] = [];

//       const renderProgressRows = (subs: Submission[]) => {
//         if (subs.length === 0)
//           return `<tr><td colspan="3" style="text-align:center; font-style:italic;">No modules mapped</td></tr>`;
//         return subs
//           .map(
//             (s) => `
//               <tr>
//                   <td>${s.moduleNumber || "N/A"}</td>
//                   <td>${s.title || "Untitled"}</td>
//                   <td style="text-align:center; font-weight:bold;" class="${s.competency === "C" ? "outcome-C" : s.competency === "NYC" ? "outcome-NYC" : ""}">${s.competency || "-"}</td>
//               </tr>
//           `,
//           )
//           .join("");
//       };

//       const renderLearningPlanRows = (subs: Submission[]) => {
//         if (subs.length === 0)
//           return `<tr><td colspan="8" style="text-align:center; font-style:italic;">No modules mapped</td></tr>`;
//         return subs
//           .map((s) => {
//             const facName =
//               s.grading?.facilitatorName || s.facilitatorName || "Pending";
//             const dateAssessed = safelyFormatDate(s.gradedAt);
//             return `
//               <tr>
//                   <td style="font-size:10px;">${s.moduleNumber || "N/A"}</td>
//                   <td style="font-size:10px;">${facName}</td>
//                   <td style="font-size:10px;">${safelyFormatDate(s.assignedAt)} to ${dateAssessed}</td>
//                   <td style="text-align:center; font-weight:bold;">${s.moduleType === "knowledge" ? "X" : ""}</td>
//                   <td style="text-align:center; font-weight:bold;">${s.moduleType === "practical" ? "X" : ""}</td>
//                   <td style="text-align:center; font-weight:bold;">${s.moduleType === "workplace" ? "X" : ""}</td>
//                   <td style="text-align:center; font-weight:bold;" class="${s.competency === "C" ? "outcome-C" : ""}">${s.competency === "C" ? "C" : ""}</td>
//                   <td style="text-align:center; font-weight:bold;" class="${s.competency === "NYC" ? "outcome-NYC" : ""}">${s.competency === "NYC" ? "NYC" : ""}</td>
//               </tr>
//           `;
//           })
//           .join("");
//       };

//       let htmlContent = `
//         <!DOCTYPE html>
//         <html>
//         <head>
//             <meta charset="UTF-8">
//             <style>
//                 @page { size: A4; margin: 15mm; }
//                 body { font-family: 'Helvetica', Arial, sans-serif; color: #1e293b; line-height: 1.4; }
//                 .page-break { page-break-after: always; }

//                 .cover { height: 95vh; display: flex; flex-direction: column; justify-content: center; text-align: center; border: 10px solid #073f4e; padding: 40px; box-sizing: border-box; }
//                 .cover-logo { max-width: 250px; margin: 0 auto 40px auto; display: block; }
//                 .cover h1 { font-size: 32px; color: #073f4e; text-transform: uppercase; margin-bottom: 10px; }
//                 .cover h2 { font-size: 20px; color: #0284c7; margin-bottom: 50px; }
//                 .cover-details { font-size: 16px; margin: 0 auto; text-align: left; display: inline-block; background: #f8fafc; padding: 30px; border-radius: 8px; border: 1px solid #e2e8f0; width: 80%; }
//                 .cover-details p { margin: 10px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 5px; }

//                 .section-title { background: #073f4e; color: white; padding: 10px; font-weight: bold; text-transform: uppercase; margin-top: 30px; margin-bottom: 15px; font-size: 14px; }
//                 .sub-title { font-size: 12px; font-weight: bold; color: #073f4e; text-transform: uppercase; margin-top: 15px; border-bottom: 1px solid #073f4e; padding-bottom: 3px; }

//                 table { width: 100%; border-collapse: collapse; margin: 15px 0; }
//                 th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 11px; }
//                 th { background: #f1f5f9; font-weight: bold; color: #0f172a; }

//                 .grid-info { display: grid; grid-template-columns: 1fr 1fr; gap: 15px; margin-bottom: 20px; font-size: 12px; }
//                 .grid-info div { background: #f8fafc; padding: 10px; border: 1px solid #e2e8f0; border-radius: 4px; }
//                 .grid-info span { font-weight: bold; display: block; margin-bottom: 4px; color: #475569; font-size: 10px; text-transform: uppercase; }

//                 .divider-page { height: 95vh; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; box-sizing: border-box; padding: 40px; border: 10px solid; }
//                 .divider-page h1 { font-size: 36px; text-transform: uppercase; margin: 0; }

//                 .eval-box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 15px; margin-bottom: 25px; font-size: 12px; page-break-inside: avoid; }
//                 .eval-row { display: flex; margin-bottom: 8px; }
//                 .eval-label { font-weight: bold; width: 140px; color: #0f172a; flex-shrink: 0; }
//                 .eval-value { flex: 1; color: #475569; }

//                 .text-blue { color: #0284c7 !important; }
//                 .text-red { color: #dc2626 !important; }
//                 .text-green { color: #16a34a !important; }

//                 .outcome-C { color: #16a34a; font-weight: bold; font-size: 12px; }
//                 .outcome-NYC { color: #dc2626; font-weight: bold; font-size: 12px; }

//                 .question-box { margin-bottom: 20px; border-bottom: 1px solid #f1f5f9; padding-bottom: 15px; page-break-inside: avoid; }
//                 .q-text { font-weight: bold; font-size: 13px; margin-bottom: 5px; color: #0f172a; }
//                 .a-text { background: #ffffff; padding: 10px; border: 1px solid #e2e8f0; border-left: 4px solid #94a3b8; font-size: 12px; white-space: pre-wrap; border-radius: 4px; overflow-wrap: break-word; }
//                 .a-link { color: #0284c7; text-decoration: underline; font-weight: bold; }

//                 .f-text { margin-top: 8px; font-size: 11px; background: #f8fafc; padding: 8px; border-radius: 4px; border: 1px solid #e2e8f0; }
//                 .f-item { margin-bottom: 4px; padding-bottom: 4px; border-bottom: 1px dashed #cbd5e1; }
//                 .f-item:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }

//                 .sig-inline { margin-top: 20px; border: 1px solid #cbd5e1; padding: 15px; background: #f8fafc; page-break-inside: avoid; display: flex; align-items: center; justify-content: space-between; }
//                 .sig-inline img { max-height: 40px; mix-blend-mode: multiply; }

//                 .sig-wrapper { margin-top: 30px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; page-break-inside: avoid; }
//                 .sig-box { border: 1px solid #cbd5e1; padding: 10px; text-align: center; font-size: 11px; background: #f8fafc; border-top: 3px solid #cbd5e1; border-radius: 4px; }
//                 .sig-box h4 { margin: 0 0 5px 0; color: #0f172a; font-size: 11px; }
//                 .sig-img { max-height: 40px; max-width: 100%; object-fit: contain; margin: 4px auto; display: block; mix-blend-mode: multiply; }
//                 .sig-placeholder { height: 40px; display: flex; align-items: center; justify-content: center; font-style: italic; color: #cbd5e1; font-size: 10px; margin: 4px 0; }
//                 .sig-name { font-weight: bold; font-size: 12px; margin: 8px 0; border-bottom: 1px dashed #cbd5e1; padding-bottom: 5px; }
//                 .sig-date { color: #64748b; }
//             </style>
//         </head>
//         <body>
//             <div class="cover">
//                 <img src="${companyLogoUrl}" alt="Logo" class="cover-logo" />
//                 <h1>Master Portfolio of Evidence</h1>
//                 <h2>QCTO QUALIFICATION COMPLIANCE RECORD</h2>
//                 <div class="cover-details">
//                     <p><strong>Learner Name:</strong> ${learner.fullName || "N/A"}</p>
//                     <p><strong>Identity Number:</strong> ${learner.idNumber || "N/A"}</p>
//                     <p><strong>Email Address:</strong> ${learner.email || "N/A"}</p>
//                     <p><strong>Date Generated:</strong> ${safelyFormatDate(new Date())}</p>
//                     <p><strong>System Reference:</strong> ${requestId}</p>
//                 </div>
//             </div>
//             <div class="page-break"></div>

//             <div class="section-title">Assessor PoE Checklist</div>
//             <table>
//                 <thead>
//                     <tr><th>#</th><th>Contents</th><th>Status</th></tr>
//                 </thead>
//                 <tbody>
//                     <tr><td>1</td><td>Progress Report</td><td><strong>Yes</strong></td></tr>
//                     <tr><td>2</td><td>Competence Record and Final Assessment Report</td><td><strong>Yes</strong></td></tr>
//                     <tr><td>3</td><td>Learner Registration Form</td><td><strong>Yes</strong></td></tr>
//                     <tr><td>4</td><td>Letter of Commitment from Learner</td><td><strong>Yes</strong></td></tr>
//                     <tr><td>5</td><td>Programme Induction</td><td><strong>Yes</strong></td></tr>
//                     <tr><td>6</td><td>Appeals / Complaint Forms</td><td><strong>Available on request</strong></td></tr>
//                     <tr><td>7</td><td>Actual Learning Plan and Evidence Control Sheet</td><td><strong>Yes</strong></td></tr>
//                     <tr><td>8</td><td>Learner Coaching Record (Remediation)</td><td><strong>Yes</strong> (If applicable)</td></tr>
//                     <tr><td>9</td><td>Certified ID Document & CV</td><td><strong>Yes</strong> (See Annexures)</td></tr>
//                 </tbody>
//             </table>
//             <div class="page-break"></div>

//             <div class="section-title">Progress Report</div>
//             <div class="grid-info">
//                 <div><span>Learner Name</span>${learner.fullName || "N/A"}</div>
//                 <div><span>Learner ID Number</span>${learner.idNumber || "N/A"}</div>
//                 <div><span>Programme Title</span>${learner.qualification?.name || submissions[0]?.qualificationName || "Software Developer"}</div>
//                 <div><span>Assessor Name</span>${primaryAssessor}</div>
//                 <div><span>Start Date</span>${safelyFormatDate(enrollment.trainingStartDate || learner.trainingStartDate)}</div>
//                 <div><span>End Date</span>${safelyFormatDate(enrollment.trainingEndDate || learner.trainingEndDate)}</div>
//                 <div style="grid-column: span 2;"><span>Workplace / Practical Site</span>${enrollment.employerName || "mLab Default Training Campus"}</div>
//             </div>

//             <div class="sub-title">Knowledge Modules</div>
//             <table>
//                 <thead><tr><th>Module Number</th><th>Title</th><th>C/NYC</th></tr></thead>
//                 <tbody>${renderProgressRows(kmSubs)}</tbody>
//             </table>

//             <div class="sub-title">Practical Skills Modules</div>
//             <table>
//                 <thead><tr><th>Module Number</th><th>Title</th><th>C/NYC</th></tr></thead>
//                 <tbody>${renderProgressRows(pmSubs)}</tbody>
//             </table>

//             <div class="sub-title">Work Experience Modules</div>
//             <table>
//                 <thead><tr><th>Module Number</th><th>Title</th><th>C/NYC</th></tr></thead>
//                 <tbody>${renderProgressRows(wmSubs)}</tbody>
//             </table>

//             <div class="sig-inline">
//                 <div>
//                     <strong>Assessor Sign-Off:</strong><br/>
//                     <span style="font-size:10px; color:#64748b;">I declare this progress report accurate.</span>
//                 </div>
//                 ${assessorSigUrl ? `<img src="${assessorSigUrl}" />` : `<i>Pending Digital Signature</i>`}
//                 <div><strong>Date:</strong> ${safelyFormatDate(new Date())}</div>
//             </div>
//             <div class="page-break"></div>

//             <div class="section-title">Actual Learning Plan & Evidence Control Sheet</div>
//             <table>
//                 <thead>
//                     <tr>
//                         <th rowspan="2">Module Code</th>
//                         <th rowspan="2">Facilitator</th>
//                         <th rowspan="2">Dates Active</th>
//                         <th colspan="3" style="text-align:center;">Evidence Type</th>
//                         <th colspan="2" style="text-align:center;">Outcome</th>
//                     </tr>
//                     <tr>
//                         <th style="font-size:9px; text-align:center;">Knowledge</th>
//                         <th style="font-size:9px; text-align:center;">Practical</th>
//                         <th style="font-size:9px; text-align:center;">Workplace</th>
//                         <th style="font-size:9px; text-align:center;">C</th>
//                         <th style="font-size:9px; text-align:center;">NYC</th>
//                     </tr>
//                 </thead>
//                 <tbody>
//                     ${renderLearningPlanRows(submissions)}
//                 </tbody>
//             </table>
//             <div class="page-break"></div>

//             <div class="section-title">Judging Evidence Principles</div>
//             <p style="font-size:12px; margin-bottom: 10px;">The Assessor confirms the following principles were met during the evaluation of the learner's evidence:</p>
//             <table>
//                 <thead><tr><th>Assessment Principles</th><th>Knowledge</th><th>Practical / Workplace</th></tr></thead>
//                 <tbody>
//                     <tr><td><strong>Relevant:</strong> Relates to specific programme components.</td><td>Yes</td><td>Yes</td></tr>
//                     <tr><td><strong>Valid:</strong> Shows the candidate can perform the function.</td><td>Yes</td><td>Yes</td></tr>
//                     <tr><td><strong>Authentic:</strong> Evidence is the candidate's own work.</td><td>Yes</td><td>Yes</td></tr>
//                     <tr><td><strong>Consistent:</strong> Shows repeatable performance to standard.</td><td>Yes</td><td>Yes</td></tr>
//                     <tr><td><strong>Current:</strong> Evidence relates to current competence.</td><td>Yes</td><td>Yes</td></tr>
//                     <tr><td><strong>Sufficient:</strong> Enough evidence collected to make judgement.</td><td>Yes</td><td>Yes</td></tr>
//                 </tbody>
//             </table>

//             <div class="section-title" style="margin-top:40px;">Letter of Commitment</div>
//             <div style="background:#f8fafc; padding:15px; border:1px solid #cbd5e1; font-size:12px; border-radius:6px; margin-bottom:20px;">
//                 <p>I undertake to fulfil all the requirements of the assessment and training practices as specified by the assessor and service provider.</p>
//                 <p>I also declare that all the work handed in including assignments and case studies is authentic (my own work) and current.</p>
//                 <p>I am aware that in order to graduate from this programme I need to meet all compulsory requirements including being declared competent on all components that form the basis of this programme.</p>
//             </div>

//             <div class="sig-inline" style="margin-top:0;">
//                 <div>
//                     <strong>Learner Sign-Off:</strong>
//                 </div>
//                 ${learnerSignatureUrl ? `<img src="${learnerSignatureUrl}" />` : `<i>Pending Digital Signature</i>`}
//                 <div><strong>Date:</strong> ${safelyFormatDate(submissions[0]?.assignedAt || new Date())}</div>
//             </div>

//             <div class="divider-page" style="margin-top: 40px; height: auto; padding: 20px; border-color: #073f4e;">
//                 <h1 style="font-size:24px;">Assessment Evidence Records</h1>
//                 <p>The following pages contain the official system transcripts, grading feedback, and evidence links for every module assessed.</p>
//             </div>
//             <div class="page-break"></div>
//         `;

//       let index = 0;
//       for (const sub of submissions) {
//         index++;
//         await updateProgress(
//           30 + Math.floor((index / submissions.length) * 40),
//           `Compiling: ${sub.title || "Module"}...`,
//         );

//         const assessmentSnap = await admin
//           .firestore()
//           .collection("assessments")
//           .doc(sub.assessmentId)
//           .get();
//         const assessmentData = assessmentSnap.data() || {};
//         const blocks = assessmentData.blocks || [];

//         const grading = sub.grading || {};
//         const moderation = sub.moderation || {};
//         const answers = sub.answers || {};

//         const facFeedback =
//           sub.facilitatorOverallFeedback ||
//           grading.facilitatorOverallFeedback ||
//           "<i>No facilitator comments.</i>";
//         const assFeedback =
//           grading.assessorOverallFeedback || "<i>No assessor feedback.</i>";
//         const modFeedback =
//           moderation.feedback || "<i>No moderation comments.</i>";

//         const compClass =
//           sub.competency === "C"
//             ? "outcome-C"
//             : sub.competency === "NYC"
//               ? "outcome-NYC"
//               : "outcome-Pending";
//         const compText =
//           sub.competency === "C"
//             ? "COMPETENT (C)"
//             : sub.competency === "NYC"
//               ? "NOT YET COMPETENT (NYC)"
//               : "PENDING";

//         const moduleBreadcrumb = sub.moduleNumber || sub.title || "Module";

//         // INJECT OPEN BOOK DECLARATION IF APPLICABLE
//         let openBookHtml = "";
//         if (assessmentData.isOpenBook && assessmentData.referenceManualUrl) {
//           openBookHtml = `
//             <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; padding: 12px; margin-bottom: 20px; border-radius: 4px; font-size: 11px;">
//                 <strong style="color: #0369a1; display: block; margin-bottom: 6px; font-size: 12px; text-transform: uppercase;">📖 Open Book Assessment Conditions</strong>
//                 <span style="color: #0c4a6e; display: block; margin-bottom: 6px;">The learner was provided with an official reference manual during this assessment. The reference manual used is archived and verifiable via the link below:</span>
//                 <a href="${assessmentData.referenceManualUrl}" style="color: #0284c7; text-decoration: underline; font-weight: bold; word-break: break-all;">${assessmentData.referenceManualUrl}</a>
//             </div>
//             `;
//         }

//         htmlContent += `
//                 <div class="module-header">
//                     <h2 style="margin:0; color:#073f4e;">${sub.moduleNumber ? sub.moduleNumber + ": " : ""}${sub.title || "Untitled"}</h2>
//                 </div>

//                 ${openBookHtml}

//                 <div class="eval-box">
//                     <div class="eval-row">
//                         <div class="eval-label">Final Outcome:</div>
//                         <div class="eval-value"><span class="${compClass}">${compText}</span></div>
//                     </div>
//                     <div class="eval-row">
//                         <div class="eval-label">Assessment Score:</div>
//                         <div class="eval-value"><strong>${sub.marks !== undefined ? sub.marks : "-"} / ${sub.totalMarks || "-"}</strong></div>
//                     </div>
//                     <hr style="border:0; border-top:1px solid #e2e8f0; margin:10px 0;" />
//                     <div class="eval-row text-blue">
//                         <div class="eval-label">Facilitator Note:</div>
//                         <div class="eval-value">${facFeedback}</div>
//                     </div>
//                     <div class="eval-row text-red">
//                         <div class="eval-label">Assessor Feedback:</div>
//                         <div class="eval-value">${assFeedback}</div>
//                     </div>
//                     <div class="eval-row text-green">
//                         <div class="eval-label">Moderator Review:</div>
//                         <div class="eval-value">${modFeedback}</div>
//                     </div>
//                 </div>

//                 <div class="evidence-list">
//             `;

//         if (blocks.length > 0) {
//           let qNum = 1;
//           blocks.forEach((block: any) => {
//             if (block.type === "section") {
//               htmlContent += `<h3 style="margin-top: 25px; padding-bottom: 5px; border-bottom: 2px solid #cbd5e1;">${block.title}</h3>`;
//               return;
//             }
//             if (block.type === "info") return;

//             const blockBreadcrumb =
//               block.weCode || block.code || block.title || `Q${qNum}`;
//             const ans =
//               answers[block.id] !== undefined
//                 ? answers[block.id]
//                 : sub[block.id];
//             let formattedAnswer = "";

//             if (ans !== undefined && ans !== null) {
//               if (typeof ans === "string" || typeof ans === "number") {
//                 if (
//                   block.type === "mcq" &&
//                   typeof ans === "number" &&
//                   block.options
//                 ) {
//                   formattedAnswer = block.options[ans] || String(ans);
//                 } else {
//                   formattedAnswer = String(ans);
//                 }
//               } else if (typeof ans === "object") {
//                 if (ans.text && ans.text !== "<p></p>")
//                   formattedAnswer += `<div>${ans.text}</div>`;
//                 if (ans.url)
//                   formattedAnswer += `<div>🔗 <a class="a-link" href="${ans.url}">External Link</a></div>`;
//                 if (ans.code)
//                   formattedAnswer += `<pre style="background:#f8fafc; padding:10px; border:1px solid #e2e8f0;">${ans.code}</pre>`;

//                 if (ans.uploadUrl) {
//                   const annIndex = offlineEvidenceFiles.length + 1;
//                   const detailedLabel = `${moduleBreadcrumb} | ${blockBreadcrumb}`;

//                   offlineEvidenceFiles.push({
//                     index: annIndex,
//                     url: ans.uploadUrl,
//                     label: detailedLabel,
//                   });
//                   formattedAnswer += `<div style="margin-top:5px; padding:8px; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; font-size:11px;">
//                         📎 <a class="a-link" href="${ans.uploadUrl}"><strong>Appended as Annexure ${annIndex}</strong> (${detailedLabel})</a>
//                     </div>`;
//                 }

//                 Object.keys(ans).forEach((k) => {
//                   const subAns = ans[k];
//                   if (subAns && typeof subAns === "object") {
//                     let subHtml = "";
//                     if (subAns.text && subAns.text !== "<p></p>")
//                       subHtml += `<div>${subAns.text}</div>`;
//                     if (subAns.url)
//                       subHtml += `<div>🔗 <a class="a-link" href="${subAns.url}">External Link</a></div>`;
//                     if (subAns.code)
//                       subHtml += `<pre style="background:#f8fafc; padding:10px;">${subAns.code}</pre>`;

//                     if (subAns.uploadUrl) {
//                       const annIndex = offlineEvidenceFiles.length + 1;
//                       const nestedLabel = `${moduleBreadcrumb} | ${blockBreadcrumb} | ${k.replace(/_/g, " ").toUpperCase()}`;

//                       offlineEvidenceFiles.push({
//                         index: annIndex,
//                         url: subAns.uploadUrl,
//                         label: nestedLabel,
//                       });
//                       subHtml += `<div style="margin-top:5px; padding:8px; background:#fffbeb; border:1px solid #fde68a; border-radius:4px; font-size:11px;">
//                             📎 <a class="a-link" href="${subAns.uploadUrl}"><strong>Appended as Annexure ${annIndex}</strong> (${nestedLabel})</a>
//                         </div>`;
//                     }

//                     if (subHtml) {
//                       formattedAnswer += `<div style="margin-top:10px; padding:10px; border-left:3px solid #cbd5e1; background:#f8fafc;"><strong>Item: ${k.replace(/_/g, " ")}</strong>${subHtml}</div>`;
//                     }
//                   } else if (
//                     typeof subAns === "string" &&
//                     subAns.trim() !== "" &&
//                     !["text", "url", "uploadUrl", "code"].includes(k)
//                   ) {
//                     formattedAnswer += `<div><strong>${k.replace(/_/g, " ")}:</strong> ${subAns}</div>`;
//                   }
//                 });
//               }
//             }
//             if (formattedAnswer === "")
//               formattedAnswer = "<i>No evidence provided.</i>";

//             let specificFeedback = "";
//             const seenComments = new Set<string>();

//             const addFeedback = (
//               role: string,
//               text: string,
//               colorClass: string,
//             ) => {
//               if (!text || text.trim() === "") return;
//               const cleanText = text.trim();
//               const key = `${role}:${cleanText}`;
//               if (!seenComments.has(key)) {
//                 seenComments.add(key);
//                 specificFeedback += `<div class="f-item ${colorClass}"><strong>${role} Note:</strong> ${cleanText}</div>`;
//               }
//             };

//             const fLayer = grading.facilitatorBreakdown?.[block.id] || {};
//             const aLayer = grading.assessorBreakdown?.[block.id] || {};
//             const mLayer = moderation.breakdown?.[block.id] || {};

//             addFeedback("Facilitator", fLayer.feedback, "text-blue");
//             addFeedback("Assessor", aLayer.feedback, "text-red");
//             addFeedback("Moderator", mLayer.feedback, "text-green");

//             if (Array.isArray(fLayer.criteriaResults)) {
//               fLayer.criteriaResults.forEach((crit: any) =>
//                 addFeedback("Facilitator", crit.comment, "text-blue"),
//               );
//             }
//             if (Array.isArray(aLayer.criteriaResults)) {
//               aLayer.criteriaResults.forEach((crit: any) =>
//                 addFeedback("Assessor", crit.comment, "text-red"),
//               );
//             }
//             if (Array.isArray(mLayer.criteriaResults)) {
//               mLayer.criteriaResults.forEach((crit: any) =>
//                 addFeedback("Moderator", crit.comment, "text-green"),
//               );
//             }

//             htmlContent += `
//                         <div class="question-box">
//                             <div class="q-text">Q${qNum++}. ${block.question || block.title || "Checkpoint"}</div>
//                             <div class="a-text">${formattedAnswer}</div>
//                             ${specificFeedback ? `<div class="f-text">${specificFeedback}</div>` : ""}
//                         </div>
//                     `;
//           });
//         } else {
//           htmlContent += `<p style="color:#94a3b8; font-style:italic; padding: 20px; text-align: center; border: 1px dashed #cbd5e1;">Cannot map evidence: Assessment Template is empty.</p>`;
//         }

//         htmlContent += `</div>`;

//         const facSigUrl = sub.facilitatorId
//           ? signaturesMap[sub.facilitatorId]
//           : null;
//         const assSigUrl = sub.gradedBy ? signaturesMap[sub.gradedBy] : null;
//         const modSigUrl = sub.moderation?.moderatedBy
//           ? signaturesMap[sub.moderation.moderatedBy]
//           : null;

//         const learnerDate = safelyFormatDate(
//           sub.submittedAt || sub.learnerDeclaration?.timestamp,
//         );
//         const facName =
//           sub.facilitatorName || grading.facilitatorName || "Pending";
//         const facDate = safelyFormatDate(
//           sub.facilitatorReviewedAt || grading.facilitatorReviewedAt,
//         );
//         const assessorName = grading.assessorName || "Pending";
//         const assessorReg = grading.assessorRegNumber
//           ? `Reg: ${grading.assessorRegNumber}`
//           : "";
//         const assessorDate = safelyFormatDate(sub.gradedAt || grading.gradedAt);
//         const modName = moderation.moderatorName || "Pending";
//         const modReg = moderation.moderatorRegNumber
//           ? `Reg: ${moderation.moderatorRegNumber}`
//           : "";
//         const modDate = safelyFormatDate(moderation.moderatedAt);

//         htmlContent += `
//                 <div class="sig-wrapper">
//                     <div class="sig-box">
//                         <h4>Learner Declaration</h4>
//                         ${learnerSignatureUrl ? `<img src="${learnerSignatureUrl}" class="sig-img" />` : `<div class="sig-placeholder">No signature on file</div>`}
//                         <div class="sig-name">${learner.fullName || "Unknown Learner"}</div>
//                         <span class="sig-date">Signed: ${learnerDate}</span>
//                     </div>
//                     <div class="sig-box sig-box-fac">
//                         <h4>Facilitator Review</h4>
//                         ${facSigUrl ? `<img src="${facSigUrl}" class="sig-img sig-img-fac" />` : `<div class="sig-placeholder">No signature on file</div>`}
//                         <div class="sig-name">${facName}</div>
//                         <span class="sig-date">Signed: ${facDate}</span>
//                     </div>
//                     <div class="sig-box sig-box-ass">
//                         <h4>Assessor Endorsement</h4>
//                         ${assSigUrl ? `<img src="${assSigUrl}" class="sig-img sig-img-ass" />` : `<div class="sig-placeholder">No signature on file</div>`}
//                         <div class="sig-name">${assessorName}</div>
//                         ${assessorReg ? `<div class="sig-reg">${assessorReg}</div>` : ""}
//                         <span class="sig-date">Signed: ${assessorDate}</span>
//                     </div>
//                     <div class="sig-box sig-box-mod">
//                         <h4>Moderator Verification</h4>
//                         ${modSigUrl ? `<img src="${modSigUrl}" class="sig-img sig-img-mod" />` : `<div class="sig-placeholder">No signature on file</div>`}
//                         <div class="sig-name">${modName}</div>
//                         ${modReg ? `<div class="sig-reg">${modReg}</div>` : ""}
//                         <span class="sig-date">Signed: ${modDate}</span>
//                     </div>
//                 </div>
//                 <div class="page-break"></div>
//             `;
//       }

//       if (offlineEvidenceFiles.length > 0) {
//         htmlContent += `
//              <div class="divider-page" style="border-color: #94a3b8; color: #475569; background-color: #f8fafc;">
//                  <h1>Annexures</h1>
//                  <h2>Offline Evidence Documents</h2>
//                  <p>The following pages contain the exact files uploaded by the learner, mapped directly to their respective assessment items.</p>
//              </div>
//           `;
//       }

//       htmlContent += `</body></html>`;

//       await updateProgress(70, "Finalizing Assessment Layout...");
//       const browser = await puppeteer.launch({
//         args: chromium.args,
//         defaultViewport: chromium.defaultViewport,
//         executablePath: await chromium.executablePath(),
//         headless: chromium.headless,
//       });

//       const page = await browser.newPage();
//       page.setDefaultNavigationTimeout(120000);
//       page.setDefaultTimeout(120000);

//       await page.setContent(htmlContent, {
//         waitUntil: ["load", "networkidle2"],
//         timeout: 120000,
//       });

//       const puppeteerPdfBuffer = await page.pdf({
//         format: "A4",
//         printBackground: true,
//         displayHeaderFooter: true,
//         headerTemplate: "<span></span>",
//         footerTemplate: `
//           <div style="font-size: 9px; font-family: Helvetica, Arial, sans-serif; color: #64748b; padding: 0 15mm; width: 100%; display: flex; justify-content: space-between; box-sizing: border-box;">
//             <span>CodeTribe Academy Compliance</span>
//             <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
//           </div>
//         `,
//         margin: { top: "15mm", right: "15mm", bottom: "25mm", left: "15mm" },
//         timeout: 120000,
//       });

//       await browser.close();

//       await updateProgress(
//         85,
//         "Merging Compliance Documents inside Cover Page...",
//       );

//       const masterPdf = await PDFDocument.create();
//       const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);

//       const assessmentPdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
//       const totalAssessmentPages = assessmentPdfDoc.getPageCount();

//       // 1. EXTRACT & APPEND PAGE 1 (THE COVER PAGE)
//       if (totalAssessmentPages > 0) {
//         const [coverPage] = await masterPdf.copyPages(assessmentPdfDoc, [0]);
//         masterPdf.addPage(coverPage);
//       }

//       // 2. FETCH & APPEND COMPLIANCE DOCS
//       const docsSource = learnerUserDoc?.documents || learner?.documents || {};
//       const frontMatterUrls = [
//         docsSource.idUrl,
//         docsSource.cvUrl,
//         docsSource.qualUrl,
//       ].filter((url) => url && typeof url === "string");

//       for (const url of frontMatterUrls) {
//         try {
//           const fileBuffer = await fetchFileBuffer(url);
//           if (fileBuffer) {
//             const externalPdf = await PDFDocument.load(fileBuffer);
//             const copiedPages = await masterPdf.copyPages(
//               externalPdf,
//               externalPdf.getPageIndices(),
//             );
//             copiedPages.forEach((p: any) => masterPdf.addPage(p));
//           }
//         } catch (err) {
//           console.warn(
//             `Could not merge front-matter document from URL: ${url}. Skipping it.`,
//             err,
//           );
//         }
//       }

//       // 3. EXTRACT & APPEND PAGES 2 TO END (THE ASSESSMENTS + QCTO FORMS)
//       if (totalAssessmentPages > 1) {
//         const remainingIndices = Array.from(
//           { length: totalAssessmentPages - 1 },
//           (_, i) => i + 1,
//         );
//         const remainingPages = await masterPdf.copyPages(
//           assessmentPdfDoc,
//           remainingIndices,
//         );
//         remainingPages.forEach((p: any) => masterPdf.addPage(p));
//       }

//       // 4. FETCH & APPEND OFFLINE EVIDENCE (ANNEXURES) WITH DETAILED STAMPS
//       if (offlineEvidenceFiles.length > 0) {
//         await updateProgress(90, "Merging Offline Evidence (Annexures)...");
//         for (const evidence of offlineEvidenceFiles) {
//           try {
//             const buffer = await fetchFileBuffer(evidence.url);
//             if (!buffer) continue;

//             const stampText = `Annexure ${evidence.index}: ${evidence.label}`;

//             try {
//               const extPdf = await PDFDocument.load(buffer);
//               const copiedPages = await masterPdf.copyPages(
//                 extPdf,
//                 extPdf.getPageIndices(),
//               );

//               if (copiedPages.length > 0) {
//                 const firstPage = copiedPages[0];
//                 const { height } = firstPage.getSize();
//                 firstPage.drawText(stampText, {
//                   x: 20,
//                   y: height - 20,
//                   size: 10,
//                   color: rgb(0.86, 0.15, 0.15),
//                   font: fontBold,
//                 });
//               }
//               copiedPages.forEach((p: any) => masterPdf.addPage(p));
//             } catch (pdfErr) {
//               let image;
//               try {
//                 image = await masterPdf.embedPng(buffer);
//               } catch {
//                 try {
//                   image = await masterPdf.embedJpg(buffer);
//                 } catch (e) {}
//               }

//               if (image) {
//                 const page = masterPdf.addPage();
//                 const { width, height } = page.getSize();

//                 page.drawText(stampText, {
//                   x: 20,
//                   y: height - 30,
//                   size: 10,
//                   color: rgb(0.86, 0.15, 0.15),
//                   font: fontBold,
//                 });

//                 const dims = image.scaleToFit(width - 40, height - 80);
//                 page.drawImage(image, {
//                   x: width / 2 - dims.width / 2,
//                   y: height / 2 - dims.height / 2 - 20,
//                   width: dims.width,
//                   height: dims.height,
//                 });
//               }
//             }
//           } catch (err) {
//             console.warn(
//               `Failed to process evidence annexure: ${evidence.url}`,
//               err,
//             );
//           }
//         }
//       }

//       const finalPdfBytes = await masterPdf.save();
//       const finalPdfBuffer = Buffer.from(finalPdfBytes);

//       // STORAGE HOUSEKEEPING
//       await updateProgress(
//         95,
//         "Cleaning up old records and saving to vault...",
//       );
//       const bucket = admin.storage().bucket();
//       const dirPrefix = `poe_exports/${learnerId}/`;

//       try {
//         await bucket.deleteFiles({ prefix: dirPrefix });
//       } catch (cleanupErr) {}

//       const filePath = `${dirPrefix}Master_PoE_${requestId}.pdf`;
//       const file = bucket.file(filePath);

//       await file.save(finalPdfBuffer, {
//         metadata: { contentType: "application/pdf" },
//       });

//       const [downloadUrl] = await file.getSignedUrl({
//         action: "read",
//         expires: "01-01-2100",
//       });

//       await snap.ref.update({
//         status: "completed",
//         progress: 100,
//         progressMessage: "Done!",
//         downloadUrl,
//       });

//       if (requesterEmail) {
//         await transporter.sendMail({
//           from: '"mLab Compliance" <noreply@mlab.co.za>',
//           to: requesterEmail,
//           subject: `✅ Master PoE Ready: ${learner.fullName}`,
//           html: `<p>The full Master Portfolio for <b>${learner.fullName}</b> has been successfully generated.</p>
//                  <p><a href="${downloadUrl}" style="padding:10px 20px; background:#16a34a; color:white; text-decoration:none; border-radius:5px;">Download Master PoE PDF</a></p>`,
//         });
//       }
//     } catch (error: any) {
//       console.error("Master PoE Generation Failed:", error);
//       await snap.ref.update({
//         status: "error",
//         progressMessage: "Generation failed",
//         errorMessage: error.message,
//       });
//     }
//   },
// );

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
mLab — Email Verification

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
  <title>Verify Your Email — Mobile Applications Laboratory NPC</title>
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

// const privateKeySecret = defineSecret("INSTITUTION_PRIVATE_KEY");

// const RPC_URL =
//   process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
// const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";

// const contractABI = [
//   "function issueCertificate(string certId, bytes32 dataFingerprint) public",
// ];

// export const issueBlockchainCertificate = onCall(
//   { secrets: [privateKeySecret] },
//   async (request) => {
//     const { data, auth } = request;

//     if (!auth) {
//       throw new HttpsError(
//         "unauthenticated",
//         "You must be logged in to mint documents.",
//       );
//     }

//     const {
//       verificationCode,
//       learnerName,
//       idNumber,
//       qualification,
//       issueDate,
//       eisaStatus,
//       ipfsHash,
//     } = data;

//     if (!verificationCode || !ipfsHash || !CONTRACT_ADDRESS) {
//       throw new HttpsError(
//         "invalid-argument",
//         "Missing required certificate data or contract address.",
//       );
//     }

//     try {
//       const provider = new ethers.JsonRpcProvider(RPC_URL);
//       const wallet = new ethers.Wallet(privateKeySecret.value(), provider);
//       const contract = new ethers.Contract(
//         CONTRACT_ADDRESS,
//         contractABI,
//         wallet,
//       );

//       // Hash the data identically to how our frontend did it
//       const fingerprint = ethers.solidityPackedKeccak256(
//         ["string", "string", "string", "string", "string", "string"],
//         [
//           learnerName.trim(),
//           idNumber.trim(),
//           qualification.trim(),
//           issueDate.trim(),
//           eisaStatus.trim(),
//           ipfsHash.trim(),
//         ],
//       );

//       console.log(`Sending to blockchain. Cert ID: ${verificationCode}`);
//       console.log(`Fingerprint: ${fingerprint}`);

//       // Call the correct contract method 'issueCertificate' with 2 params
//       const tx = await contract.issueCertificate(verificationCode, fingerprint);

//       // Wait for the transaction to be mined
//       const receipt = await tx.wait();

//       return {
//         success: true,
//         fingerprint: fingerprint,
//         transactionHash: receipt.hash,
//         timestamp: new Date().toISOString(),
//       };
//     } catch (error: any) {
//       console.error("Blockchain Minting Error:", error);
//       throw new HttpsError(
//         "internal",
//         error.message || "Failed to mint to blockchain",
//       );
//     }
//   },
// );

// ============================================================================
// FIREBASE CLOUD FUNCTION: issueBlockchainCertificate
// Description: Securely uploads a learner's Statement of Results (PDF) to IPFS
// via Pinata, generates a cryptographic hash of their data, and mints that
// hash permanently onto the Ethereum Sepolia blockchain.
// ============================================================================

// --- 2. SECRETS & ENVIRONMENT VARIABLES ---
// Tell Firebase to securely inject the institution's MetaMask Private Key at runtime.
const privateKeySecret = defineSecret("INSTITUTION_PRIVATE_KEY");

// Pull the public configurations from the 'functions/.env' file.
// We include fallbacks (|| "") just in case the .env file is missing something.
const RPC_URL =
  process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const PINATA_JWT = process.env.PINATA_JWT || "";

// --- 3. SMART CONTRACT ABI ---
// This tells ethers.js exactly what the 'issueCertificate' function looks like
// inside your deployed Solidity contract, so it knows how to communicate with it.
const contractABI = [
  "function issueCertificate(string certId, bytes32 dataFingerprint) public",
];

// --- 4. MAIN FUNCTION LOGIC ---
export const issueBlockchainCertificate = onCall(
  // Attach the secret key so the function has permission to use it.
  { secrets: [privateKeySecret] },
  async (request) => {
    // Extract the payload ('data') and the user's authentication state ('auth') sent from React.
    const { data, auth } = request;

    // SECURITY GATE: Prevent random internet users from triggering this function and spending your gas money.
    // Only users who are actively logged into your Firebase app can pass this line.
    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to mint documents.",
      );
    }

    // Unpack the learner data sent from the StatementOfResults component.
    const {
      verificationCode,
      learnerName,
      idNumber,
      qualification,
      issueDate,
      eisaStatus,
      pdfBase64, // The PDF file, encoded as a long text string.
    } = data;

    // VALIDATION: Ensure no critical data is missing before we start paying for uploads/transactions.
    if (!verificationCode || !pdfBase64 || !CONTRACT_ADDRESS || !PINATA_JWT) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required data or environment variables.",
      );
    }

    try {
      // ==========================================
      // PHASE 1: UPLOAD PDF TO PINATA (IPFS)
      // ==========================================
      console.log(`Uploading ${verificationCode}.pdf to Pinata...`);

      // The frontend sends the PDF as a "Data URL" (e.g., "data:application/pdf;base64,JVBERi...").
      // Pinata doesn't want the "data:application/pdf;base64," prefix, so we strip it out.
      const base64Data = pdfBase64.replace(
        /^data:application\/pdf;base64,/,
        "",
      );

      // Node.js converts the raw base64 string back into a physical file format (a Buffer) in the server's memory.
      const pdfBuffer = Buffer.from(base64Data, "base64");

      // We create a virtual form (just like an HTML <form>) to hold the file.
      const formData = new FormData();
      formData.append("file", pdfBuffer, {
        filename: `${verificationCode}.pdf`,
        contentType: "application/pdf",
      });

      // We "submit" the form to Pinata's API.
      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            // We use your Pinata JWT as a VIP pass to prove you own the Pinata account.
            Authorization: `Bearer ${PINATA_JWT}`,
            ...formData.getHeaders(), // Automatically adds the correct multipart boundary headers.
          },
        },
      );

      // Pinata returns the unique Content Identifier (CID) for the uploaded file.
      const ipfsHash = pinataResponse.data.IpfsHash;
      console.log(`✅ Uploaded to IPFS! Hash: ${ipfsHash}`);

      // ==========================================
      // PHASE 2: MINT RECORD TO THE BLOCKCHAIN
      // ==========================================
      console.log(`Minting to Sepolia...`);

      // Create a "tunnel" connecting this backend to the Ethereum Sepolia network.
      const provider = new ethers.JsonRpcProvider(RPC_URL);

      // Create a virtual wallet inside the backend using your secure private key.
      const wallet = new ethers.Wallet(privateKeySecret.value(), provider);

      // Link the network, your wallet, and your specific smart contract together.
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        contractABI,
        wallet,
      );

      // CRYPTOGRAPHY: Combine all the learner's details (INCLUDING the new IPFS hash) and smash them
      // together into a 32-byte cryptographic hash. If any of this data is ever altered in Firebase,
      // recalculating this hash will produce a completely different result, exposing the tampering.
      const fingerprint = ethers.solidityPackedKeccak256(
        ["string", "string", "string", "string", "string", "string"],
        [
          learnerName.trim(),
          idNumber.trim(),
          qualification.trim(),
          issueDate.trim(),
          eisaStatus.trim(),
          ipfsHash.trim(),
        ],
      );

      // Execute the actual transaction on the blockchain. The wallet pays the gas fee automatically.
      const tx = await contract.issueCertificate(verificationCode, fingerprint);

      // Pause the code and wait for the Ethereum network to officially mine and confirm the block.
      const receipt = await tx.wait();

      console.log(`✅ Minted successfully! TX: ${receipt.hash}`);

      // ==========================================
      // PHASE 3: RETURN RESULTS TO FRONTEND
      // ==========================================
      // Send all the generated permanent identifiers back to the React app so it can save them to Firestore.
      return {
        success: true,
        ipfsHash: ipfsHash,
        fingerprint: fingerprint,
        transactionHash: receipt.hash,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      // If anything fails (Pinata is down, wallet is out of funds, etc.), log the error
      // in the Firebase Console and send a clean failure message back to the React UI.
      console.error("Cloud Function Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to process certificate",
      );
    }
  },
);

// functions/src/generateMasterPoE.ts
// mLab Assessment Platform — Master Portfolio of Evidence Generator
// Brand: mLab Corporate Identity 2019
//   Midnight Blue #073f4e · Green #94c73d · Trebuchet MS / Oswald

// import { onDocumentCreated } from "firebase-functions/v2/firestore";
// import * as admin from "firebase-admin";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");
// import * as nodemailer from "nodemailer";

// ─── TYPES & INTERFACES ──────────────────────────────────────────────────────

interface UploadedDoc {
  id: string;
  name: string;
  url: string;
}
interface EvidenceFile {
  index: number;
  url: string;
  label: string;
}

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
  attemptNumber?: number;
  answers?: Record<string, any>;
  facilitatorId?: string;
  assessorId?: string;
  moderatorId?: string;
  facilitatorName?: string;
  facilitatorOverallFeedback?: string;
  facilitatorReviewedAt?: string;
  gradedAt?: string;
  assignedAt?: string;
  learnerDeclaration?: any;
  grading?: {
    facilitatorName?: string;
    facilitatorOverallFeedback?: string;
    facilitatorReviewedAt?: string;
    facilitatorId?: string;
    assessorName?: string;
    assessorOverallFeedback?: string;
    assessorRegNumber?: string;
    assessorId?: string;
    gradedAt?: string;
    gradedBy?: string;
    facilitatorBreakdown?: Record<string, any>;
    assessorBreakdown?: Record<string, any>;
  };
  moderation?: {
    moderatorId?: string;
    moderatedBy?: string;
    moderatorName?: string;
    moderatorRegNumber?: string;
    moderatedAt?: string;
    feedback?: string;
    breakdown?: Record<string, any>;
  };
  appeal?: {
    date?: string;
    reason?: string;
    status?: string;
    outcome?: string;
    reviewedBy?: string;
    reviewedByName?: string;
    reviewedAt?: string;
    resolvedBy?: string;
    resolvedByName?: string;
    resolvedAt?: string;
    resolutionNotes?: string;
  };
  latestCoachingLog?: {
    date?: string;
    notes?: string;
    facilitatorId?: string;
    facilitatorName?: string;
    acknowledged?: boolean;
    acknowledgedAt?: string;
  };
  [key: string]: any; // Fixes ts(7053)
}

// ─── UTILITIES ────────────────────────────────────────────────────────────────

const fetchFileBuffer = async (url: string): Promise<Buffer | null> => {
  try {
    // @ts-ignore - Bypasses ts(7016)
    const fetch = (await import("node-fetch")).default;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return Buffer.from(await res.arrayBuffer());
  } catch (error) {
    console.error("Buffer fetch error:", error);
    return null;
  }
};

// const transporter = nodemailer.createTransport({
//   service: "gmail",
//   auth: {
//     user: "brndkt@gmail.com",
//     pass: "gwjy wcin rdpl lovi", // Generated App Password
//   },
// });

// ─── HTML DESIGN SYSTEM & STYLES ──────────────────────────────────────────────

const POE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');

  /* ── PAGE SETUP ── */
  @page { size: A4; margin: 15mm 16mm 22mm; }
  @page :first { margin-top: 0; }

  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: 'Trebuchet MS', 'Lucida Grande', Arial, sans-serif;
    font-size: 11px;
    color: #1a2e35;
    line-height: 1.5;
    margin: 0; padding: 0;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── PAGE BREAK ── */
  .pb { page-break-after: always; }
  .pbi { page-break-inside: avoid; }

  /* ═══════════════════════════════
     COVER PAGE
  ═══════════════════════════════ */
  .cover {
    height: 100vh;
    display: flex;
    flex-direction: column;
    background: #073f4e;
    overflow: hidden;
    position: relative;
  }
  .cover__pattern {
    position: absolute; inset: 0;
    background-image:
      repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(148,199,61,0.05) 32px, rgba(148,199,61,0.05) 33px),
      repeating-linear-gradient(45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px);
    pointer-events: none;
  }
  .cover__accent { display: flex; height: 8px; flex-shrink: 0; }
  .cover__accent-blue  { flex: 1; background: #052e3a; }
  .cover__accent-green { width: 100px; background: #94c73d; }

  .cover__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 28px 40px 20px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
    flex-shrink: 0;
    position: relative;
  }
  .cover__logo { height: 52px; object-fit: contain; }
  .cover__org { text-align: right; }
  .cover__org-name {
    font-family: 'Oswald', sans-serif;
    font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ffffff; display: block;
  }
  .cover__org-tag { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block; margin-top: 3px; }

  .cover__body {
    flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; position: relative;
  }

  .cover__doc-type {
    font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 16px; display: flex; align-items: center; justify-content: center; gap: 10px;
  }
  .cover__doc-type::before, .cover__doc-type::after { content: ''; display: block; height: 1px; width: 40px; background: rgba(148,199,61,0.4); }
  .cover__title { font-family: 'Oswald', sans-serif; font-size: 42px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffffff; margin: 0 0 8px; line-height: 1; }
  .cover__subtitle { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin: 0 0 48px; }

  .cover__id-card { width: 100%; max-width: 560px; border: 1px solid rgba(255,255,255,0.12); border-top: 3px solid #94c73d; background: rgba(255,255,255,0.05); padding: 0; text-align: left; }
  .cover__id-row { display: flex; align-items: stretch; border-bottom: 1px solid rgba(255,255,255,0.07); }
  .cover__id-row:last-child { border-bottom: none; }
  .cover__id-label { width: 160px; flex-shrink: 0; padding: 10px 14px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.35); background: rgba(0,0,0,0.1); border-right: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; }
  .cover__id-value { padding: 10px 16px; font-size: 12px; font-weight: 600; color: #ffffff; display: flex; align-items: center; flex: 1; }

  .cover__footer { padding: 16px 40px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; position: relative; }
  .cover__footer-ref { font-family: 'Oswald', sans-serif; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.25); }
  .cover__footer-date { font-size: 9px; color: rgba(255,255,255,0.25); }

  .cover__accent-bottom { display: flex; height: 8px; flex-shrink: 0; }
  .cover__accent-bottom-green { width: 100px; background: #94c73d; }
  .cover__accent-bottom-blue  { flex: 1; background: #052e3a; }

  /* ═══════════════════════════════
     DIVIDER PAGE
  ═══════════════════════════════ */
  .divider { height: 100vh; background: #073f4e; display: flex; flex-direction: column; position: relative; overflow: hidden; }
  .divider__pattern { position: absolute; inset: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px); pointer-events: none; }
  .divider__accent { display: flex; height: 6px; flex-shrink: 0; }
  .divider__accent-blue  { flex: 1; background: #052e3a; }
  .divider__accent-green { width: 80px; background: #94c73d; }
  .divider__body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 80px; text-align: center; position: relative; }
  .divider__num { font-family: 'Oswald', sans-serif; font-size: 100px; font-weight: 700; color: rgba(255,255,255,0.06); line-height: 1; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -54%); user-select: none; pointer-events: none; }
  .divider__section-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 14px; }
  .divider__title { font-family: 'Oswald', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff; margin: 0 0 16px; line-height: 1.1; position: relative; }
  .divider__desc { font-size: 12px; color: rgba(255,255,255,0.4); max-width: 440px; line-height: 1.7; position: relative; }
  .divider__accent-bottom { display: flex; height: 6px; flex-shrink: 0; }
  .divider__accent-bottom-green { width: 80px; background: #94c73d; }
  .divider__accent-bottom-blue  { flex: 1; background: #052e3a; }

  /* ═══════════════════════════════
     SECTION HEADER
  ═══════════════════════════════ */
  .sec-header { display: flex; align-items: stretch; margin: 0 0 20px; border-top: 4px solid #073f4e; background: #073f4e; }
  .sec-header__num { width: 48px; flex-shrink: 0; background: #94c73d; display: flex; align-items: center; justify-content: center; font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 700; color: #073f4e; }
  .sec-header__text { padding: 10px 16px; flex: 1; }
  .sec-header__title { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; margin: 0; line-height: 1.1; }
  .sec-header__sub { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin: 3px 0 0; }
  
  .sub-heading { font-family: 'Oswald', sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #073f4e; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #073f4e; display: flex; align-items: center; gap: 6px; }
  .sub-heading::after { content: ''; display: block; height: 2px; flex: 1; background: #94c73d; margin-left: 6px; }

  /* ═══════════════════════════════
     DATA GRID
  ═══════════════════════════════ */
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-bottom: 18px; }
  .data-grid--1col { grid-template-columns: 1fr; }
  .data-cell { background: #ffffff; padding: 9px 12px; }
  .data-cell--span2 { grid-column: span 2; }
  .data-cell__label { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #9b9b9b; display: block; margin-bottom: 3px; }
  .data-cell__value { font-size: 11.5px; font-weight: 600; color: #073f4e; }

  /* ═══════════════════════════════
     TABLES
  ═══════════════════════════════ */
  .poe-table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 10.5px; }
  .poe-table thead tr { background: #073f4e; }
  .poe-table th { padding: 8px 10px; text-align: left; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.85); border-right: 1px solid rgba(255,255,255,0.08); }
  .poe-table td { padding: 7px 10px; border-bottom: 1px solid #e8eef1; border-right: 1px solid #e8eef1; color: #1a2e35; vertical-align: top; }
  .poe-table tbody tr:nth-child(even) td { background: #f8fafb; }
  .poe-table--accented td:first-child { border-left: 3px solid #94c73d; }
  .poe-table--checklist td:nth-child(3) { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }

  /* ═══════════════════════════════
     BADGES
  ═══════════════════════════════ */
  .badge { display: inline-block; padding: 2px 8px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .badge--c   { background: rgba(148,199,61,0.15); color: #3d6b0f; border: 1px solid rgba(148,199,61,0.4); }
  .badge--nyc { background: rgba(239,68,68,0.1);   color: #b91c1c; border: 1px solid rgba(239,68,68,0.3); }
  .badge--p   { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
  .badge--attempt { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badge--attempt1 { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }

  /* ═══════════════════════════════
     MODULE TRANSCRIPT 
  ═══════════════════════════════ */
  .module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #e4edf0; border-left: 5px solid #073f4e; margin-bottom: 12px; }
  .module-header__title { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #073f4e; margin: 0; }
  
  .eval-box { border: 1px solid #dde4e8; border-top: 3px solid #073f4e; margin-bottom: 16px; page-break-inside: avoid; }
  .eval-box__row { display: flex; align-items: flex-start; border-bottom: 1px solid #eef0f2; min-height: 32px; }
  .eval-box__label { width: 150px; flex-shrink: 0; padding: 8px 12px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9b9b9b; background: #f8fafb; border-right: 1px solid #eef0f2; }
  .eval-box__value { padding: 8px 14px; font-size: 11px; color: #1a2e35; flex: 1; }
  .eval-box__divider { height: 1px; background: #dde4e8; margin: 0; }

  /* OFFICIAL QCTO INK COLORS */
  .ink-fac { color: #1d4ed8 !important; } /* Facilitator — blue ink */
  .ink-ass { color: #b91c1c !important; } /* Assessor — red ink     */
  .ink-mod { color: #15803d !important; } /* Moderator — green ink  */

  .q-block { margin-bottom: 16px; border-bottom: 1px solid #eef0f2; padding-bottom: 14px; page-break-inside: avoid; }
  .q-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #073f4e; color: #ffffff; font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; flex-shrink: 0; margin-right: 8px; }
  .q-text { font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #073f4e; margin: 0 0 8px; display: flex; }
  .a-text { background: #f8fafb; border: 1px solid #e4edf0; border-left: 4px solid #9b9b9b; padding: 9px 12px; font-size: 11px; white-space: pre-wrap; overflow-wrap: break-word; color: #1a2e35; }
  .a-link { color: #0a5266; text-decoration: underline; font-weight: 600; }
  .a-annex { margin-top: 6px; padding: 7px 10px; background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; font-size: 10px; }
  
  .f-block { margin-top: 7px; border: 1px solid #e4edf0; border-top: 2px solid #dde4e8; font-size: 10px; }
  .f-row { display: flex; align-items: flex-start; padding: 5px 10px; border-bottom: 1px solid #f0f4f6; gap: 6px; }
  .f-role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; width: 90px; flex-shrink: 0; padding-top: 1px; }
  .f-comment { line-height: 1.5; flex: 1; }

  .openbook-notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; margin-bottom: 14px; font-size: 11px; page-break-inside: avoid; }
  .openbook-notice__icon { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; color: #0369a1; }

  /* ═══════════════════════════════
     SIGNATURE BLOCKS
  ═══════════════════════════════ */
  .sig-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #94c73d; margin: 16px 0 0; page-break-inside: avoid; }
  .sig-bar__label { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b6b; }
  .sig-bar__img { max-height: 36px; max-width: 120px; object-fit: contain; mix-blend-mode: multiply; }
  .sig-bar__pending { font-size: 9px; color: #9b9b9b; font-style: italic; }
  .sig-bar__date { font-size: 9px; color: #6b6b6b; }

  .sig-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-top: 20px; page-break-inside: avoid; }
  .sig-cell { background: #ffffff; padding: 12px 10px; text-align: center; border-top: 3px solid #dde4e8; }
  .sig-cell--learner  { border-top-color: #073f4e; }
  .sig-cell--fac      { border-top-color: #1d4ed8; }
  .sig-cell--assessor { border-top-color: #b91c1c; }
  .sig-cell--mod      { border-top-color: #15803d; }

  .sig-cell__role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #9b9b9b; margin-bottom: 8px; }
  .sig-cell__img { max-height: 38px; max-width: 100%; object-fit: contain; mix-blend-mode: multiply; display: block; margin: 0 auto 6px; }
  .sig-cell__placeholder { height: 38px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #c0c8cc; font-style: italic; margin-bottom: 6px; border: 1px dashed #dde4e8; }
  .sig-cell__line { height: 1px; background: #dde4e8; margin: 0 0 5px; }
  .sig-cell__name { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 2px; }
  .sig-cell__detail { font-size: 8px; }

  /* ═══════════════════════════════
     CARDS & NOTICES
  ═══════════════════════════════ */
  .notice { padding: 12px 14px; margin: 0 0 14px; page-break-inside: avoid; }
  .notice--green { background: rgba(148,199,61,0.07); border: 1px solid rgba(148,199,61,0.3); border-left: 5px solid #94c73d; }
  .notice--grey { background: #f4f7f9; border: 1px solid #dde4e8; border-left: 5px solid #9b9b9b; }
  .notice__title { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 5px; }
  
  .coaching-card { border: 1px solid #dde4e8; border-left: 5px solid #d97706; background: #fffbeb; margin-bottom: 14px; page-break-inside: avoid; }
  .coaching-card__head { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #fde68a; background: rgba(217,119,6,0.06); }
  .coaching-card__title { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #92400e; margin: 0; }
  .coaching-card__body { padding: 12px 14px; }

  .appeal-card { border: 1px solid #fecaca; border-left: 5px solid #ef4444; background: #fef2f2; margin-bottom: 14px; page-break-inside: avoid; }
  .appeal-card__head { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #fecaca; background: rgba(239,68,68,0.06); }
  .appeal-card__title { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #b91c1c; margin: 0; }
  .appeal-card__body { padding: 12px 14px; }

  .history-box { border: 1px solid #fecaca; border-top: 3px solid #ef4444; margin-top: 18px; padding: 15px; background: #fef2f2; border-radius: 6px; page-break-inside: avoid; }
  .history-box__header { padding-bottom: 8px; border-bottom: 1px solid #fecaca; font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 12px; }
  .history-attempt { padding-bottom: 10px; border-bottom: 1px dashed #fecaca; margin-bottom: 12px; }
  .history-attempt:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
  .history-attempt__title { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; color: #991b1b; margin: 0 0 4px; }
  .history-files { margin-top: 8px; padding: 8px; background: #ffffff; border: 1px solid #fecaca; border-radius: 4px; font-size: 10px; }

  .declaration { background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #073f4e; padding: 16px; font-size: 11px; margin-bottom: 16px; }
  .letter-body { border: 1px solid #dde4e8; padding: 24px 28px; font-size: 11.5px; background: #ffffff; margin-bottom: 20px; }
  
  .text-center { text-align: center; }
`;

// ─── HTML GENERATION HELPERS ──────────────────────────────────────────────────

const sigCell = (
  role: string,
  cls: string,
  sigUrl: string | null,
  name: string,
  detail: string,
  date: string,
) => {
  let ink = "";
  if (cls === "fac") ink = "ink-fac";
  if (cls === "assessor") ink = "ink-ass";
  if (cls === "mod") ink = "ink-mod";

  return `
  <div class="sig-cell sig-cell--${cls}">
    <div class="sig-cell__role">${role}</div>
    ${sigUrl ? `<img src="${sigUrl}" class="sig-cell__img" />` : `<div class="sig-cell__placeholder">No signature</div>`}
    <div class="sig-cell__line"></div>
    <div class="sig-cell__name ${ink}">${name}</div>
    ${detail ? `<div class="sig-cell__detail ${ink}">${detail}</div>` : ""}
    <div class="sig-cell__detail ${ink}">${date}</div>
  </div>`;
};

const dividerPage = (num: string, title: string, desc: string) => `
  <div class="divider">
    <div class="divider__pattern"></div>
    <div class="divider__accent">
      <div class="divider__accent-blue"></div>
      <div class="divider__accent-green"></div>
    </div>
    <div class="divider__body">
      <div class="divider__num">${num}</div>
      <div class="divider__section-label">Section ${num}</div>
      <h1 class="divider__title">${title}</h1>
      <p class="divider__desc">${desc}</p>
    </div>
    <div class="divider__accent-bottom">
      <div class="divider__accent-bottom-green"></div>
      <div class="divider__accent-bottom-blue"></div>
    </div>
  </div>`;

const sectionHeader = (num: string, title: string, sub?: string) => `
  <div class="sec-header">
    <div class="sec-header__num">${num}</div>
    <div class="sec-header__text">
      <div class="sec-header__title">${title}</div>
      ${sub ? `<div class="sec-header__sub">${sub}</div>` : ""}
    </div>
  </div>`;

const dc = (label: string, value: string, cls = "") =>
  `<div class="data-cell ${cls}"><span class="data-cell__label">${label}</span><span class="data-cell__value">${value || "N/A"}</span></div>`;

const outcomeBadge = (comp?: string) => {
  if (comp === "C") return `<span class="badge badge--c">Competent</span>`;
  if (comp === "NYC")
    return `<span class="badge badge--nyc">Not Yet Competent</span>`;
  return `<span class="badge badge--p">Pending</span>`;
};

// ─── MAIN EXPORT ──────────────────────────────────────────────────────────────

export const generateMasterPoE = onDocumentCreated(
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

    const updateProgress = async (percent: number, message: string) =>
      snap.ref.update({ progress: percent, progressMessage: message });

    const fmt = (d?: string | Date | null) => {
      if (!d) return "N/A";
      try {
        const dt = new Date(d);
        return isNaN(dt.getTime()) ? "N/A" : dt.toLocaleDateString("en-ZA");
      } catch {
        return "N/A";
      }
    };

    try {
      await updateProgress(5, "Initializing compliance engine…");

      if (requestedByUid) {
        try {
          requesterEmail =
            (await admin.auth().getUser(requestedByUid)).email || null;
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
      const userDocSnap = await admin
        .firestore()
        .collection("users")
        .doc(learner.authUid || learnerId)
        .get();
      const learnerUserDoc = userDocSnap.data() || {};

      let enrollment: any = {};
      if (learner.enrollmentId) {
        const enrolSnap = await admin
          .firestore()
          .collection("enrollments")
          .doc(learner.enrollmentId)
          .get();
        if (enrolSnap.exists) enrollment = enrolSnap.data() || {};
      }

      await updateProgress(15, "Fetching all evidence modules…");
      const subsSnap = await admin
        .firestore()
        .collection("learner_submissions")
        .where("learnerId", "==", learnerId)
        .get();

      const submissions: Submission[] = subsSnap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          facilitatorId:
            data.grading?.facilitatorId || data.facilitatorId || "",
          assessorId:
            data.grading?.assessorId ||
            data.grading?.gradedBy ||
            data.gradedBy ||
            data.assessorId ||
            "",
          moderatorId:
            data.moderation?.moderatorId ||
            data.moderation?.moderatedBy ||
            data.moderatorId ||
            "",
          attemptNumber: data.attemptNumber || 1,
          ...data,
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
      const primaryFacilitatorId = submissions.find(
        (s) => s.facilitatorId,
      )?.facilitatorId;
      const appealedSubs = submissions.filter((s) => s.appeal);
      const remediatedSubs = submissions.filter(
        (s) => (s.attemptNumber || 1) > 1,
      );

      await updateProgress(25, "Retrieving digital signatures…");
      const signaturesMap: Record<string, string> = {};
      const userIdsToFetch = new Set<string>();
      if (learner.authUid) userIdsToFetch.add(learner.authUid);
      submissions.forEach((sub) => {
        if (sub.facilitatorId) userIdsToFetch.add(sub.facilitatorId);
        if (sub.assessorId) userIdsToFetch.add(sub.assessorId);
        if (sub.moderatorId) userIdsToFetch.add(sub.moderatorId);
        if (sub.appeal?.reviewedBy) userIdsToFetch.add(sub.appeal.reviewedBy);
        if (sub.appeal?.resolvedBy) userIdsToFetch.add(sub.appeal.resolvedBy);
        if (sub.latestCoachingLog?.facilitatorId)
          userIdsToFetch.add(sub.latestCoachingLog.facilitatorId);
      });

      if (userIdsToFetch.size > 0) {
        const userSnaps = await Promise.all(
          Array.from(userIdsToFetch).map((uid) =>
            admin.firestore().collection("users").doc(uid).get(),
          ),
        );
        userSnaps.forEach((uSnap) => {
          if (uSnap.exists) {
            const uData = uSnap.data();
            if (uData?.signatureUrl)
              signaturesMap[uSnap.id] = uData.signatureUrl;
          }
        });
      }

      const learnerSigUrl = learner.authUid
        ? signaturesMap[learner.authUid]
        : null;
      const primaryFacSigUrl = primaryFacilitatorId
        ? signaturesMap[primaryFacilitatorId]
        : null;
      const primaryGradedSub = submissions.find((s) => s.assessorId);
      const assessorSigUrl = primaryGradedSub?.assessorId
        ? signaturesMap[primaryGradedSub.assessorId]
        : null;

      await updateProgress(30, "Building QCTO compliance document…");

      const companyLogoUrl =
        "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";
      const offlineEvidenceFiles: EvidenceFile[] = [];

      const progressRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="4" class="empty-state">No modules mapped for this component.</td></tr>`;
        return subs
          .map((s) => {
            const att = s.attemptNumber || 1;
            const attBadge =
              att > 1
                ? `<span class="badge badge--attempt">Attempt ${att}</span>`
                : `<span class="badge badge--attempt1">1st</span>`;
            const compBadge = outcomeBadge(s.competency);
            return `<tr>
            <td style="font-family:'Oswald',sans-serif; font-weight:700; font-size:10px; color:#073f4e;">${s.moduleNumber || "N/A"}</td>
            <td>${s.title || "Untitled"}</td>
            <td class="text-center">${attBadge}</td>
            <td class="text-center">${compBadge}</td>
          </tr>`;
          })
          .join("");
      };

      const learningPlanRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="8" class="empty-state">No modules mapped.</td></tr>`;
        return subs
          .map((s) => {
            const facName =
              s.grading?.facilitatorName || s.facilitatorName || "Pending";
            const dateRange = `${fmt(s.assignedAt)} – ${fmt(s.gradedAt)}`;
            const compBadge = outcomeBadge(s.competency);
            return `<tr>
            <td style="font-family:'Oswald',sans-serif; font-weight:700; font-size:9.5px; color:#073f4e;">${s.moduleNumber || "N/A"}</td>
            <td><span class="ink-fac">${facName}</span></td>
            <td style="font-size:10px;">${dateRange}</td>
            <td class="text-center font-bold">${s.moduleType === "knowledge" ? "✓" : ""}</td>
            <td class="text-center font-bold">${s.moduleType === "practical" ? "✓" : ""}</td>
            <td class="text-center font-bold">${s.moduleType === "workplace" ? "✓" : ""}</td>
            <td class="text-center">${s.competency === "C" ? compBadge : ""}</td>
            <td class="text-center">${s.competency === "NYC" ? compBadge : ""}</td>
          </tr>`;
          })
          .join("");
      };

      // ══════════════════════════════════════════════════════════════════
      //   BUILD HTML DOCUMENT
      // ══════════════════════════════════════════════════════════════════
      let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Master PoE — ${learner.fullName || "Learner"}</title>
  <style>${POE_STYLES}</style>
</head>
<body>

<div class="cover">
  <div class="cover__pattern"></div>
  <div class="cover__accent">
    <div class="cover__accent-blue"></div>
    <div class="cover__accent-green"></div>
  </div>
  <div class="cover__header">
    <img src="${companyLogoUrl}" alt="mLab" class="cover__logo" />
    <div class="cover__org">
      <span class="cover__org-name">Mobile Applications Laboratory NPC</span>
      <span class="cover__org-tag">QCTO Accredited Training Provider</span>
    </div>
  </div>
  <div class="cover__body">
    <p class="cover__doc-type">QCTO Qualification Compliance Record</p>
    <h1 class="cover__title">Master Portfolio<br>of Evidence</h1>
    <p class="cover__subtitle">Official Assessment Archive</p>
    <div class="cover__id-card">
      <div class="cover__id-row">
        <div class="cover__id-label">Full Name</div>
        <div class="cover__id-value">${learner.fullName || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Identity Number</div>
        <div class="cover__id-value">${learner.idNumber || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Email Address</div>
        <div class="cover__id-value">${learner.email || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Programme</div>
        <div class="cover__id-value">${learner.qualification?.name || enrollment.qualificationName || "N/A"}</div>
      </div>
      <div class="cover__id-row">
        <div class="cover__id-label">Date Generated</div>
        <div class="cover__id-value">${fmt(new Date())}</div>
      </div>
    </div>
  </div>
  <div class="cover__footer">
    <span class="cover__footer-ref">Ref: ${requestId}</span>
    <span class="cover__footer-date">Generated ${fmt(new Date())}</span>
  </div>
  <div class="cover__accent-bottom">
    <div class="cover__accent-bottom-green"></div>
    <div class="cover__accent-bottom-blue"></div>
  </div>
</div>
<div class="pb"></div>

${sectionHeader("✓", "Assessor PoE Checklist", "Document Completeness Verification")}
<table class="poe-table poe-table--checklist">
  <thead><tr><th width="30">#</th><th>Document / Section</th><th width="160">Inclusion Status</th></tr></thead>
  <tbody>
    <tr><td>1</td><td>Progress Report (all module components)</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>2</td><td>Competence Record and Final Assessment Report</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>3</td><td>Learner Registration & POPIA Consent Form</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>4</td><td>Letter of Commitment from Learner</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>5</td><td>Programme Induction Record</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>6</td><td>Appeals / Complaint Forms</td><td>${appealedSubs.length > 0 ? `<span class="badge badge--nyc">${appealedSubs.length} Appeal(s) — See Section 6</span>` : `<span class="badge badge--p">None Lodged</span>`}</td></tr>
    <tr><td>7</td><td>Actual Learning Plan and Evidence Control Sheet</td><td><span class="badge badge--c">Included</span></td></tr>
    <tr><td>8</td><td>Learner Coaching Record (Remediation)</td><td>${remediatedSubs.length > 0 ? `<span class="badge badge--nyc">${remediatedSubs.length} Session(s) — See Section 8</span>` : `<span class="badge badge--p">N/A — All First Attempt</span>`}</td></tr>
    <tr><td>9</td><td>Certified Identity Document and Supporting Annexures</td><td><span class="badge badge--c">See Annexures</span></td></tr>
  </tbody>
</table>
<div class="pb"></div>

${dividerPage("1", "Progress Report", "Summary of all assessed module components including knowledge, practical skills, and workplace experience.")}
<div class="pb"></div>

${sectionHeader("1", "Progress Report", "Comprehensive Module Outcome Summary")}

<div class="data-grid">
  ${dc("Learner Name", learner.fullName)}
  ${dc("Identity Number", learner.idNumber)}
  ${dc("Programme Title", learner.qualification?.name || enrollment.qualificationName || "N/A")}
  ${dc("Primary Assessor", primaryAssessor, "ink-ass")}
  ${dc("Training Start Date", fmt(enrollment.trainingStartDate || learner.trainingStartDate))}
  ${dc("Training End Date", fmt(enrollment.trainingEndDate || learner.trainingEndDate))}
  <div class="data-cell data-cell--span2">
    <span class="data-cell__label">Training Site / Workplace</span>
    <span class="data-cell__value">${enrollment.employerName || "mLab Default Training Campus"}</span>
  </div>
</div>

<div class="sub-heading">Knowledge Modules</div>
<table class="poe-table poe-table--accented">
  <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
  <tbody>${progressRows(kmSubs)}</tbody>
</table>

<div class="sub-heading">Practical Skills Modules</div>
<table class="poe-table poe-table--accented">
  <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
  <tbody>${progressRows(pmSubs)}</tbody>
</table>

<div class="sub-heading">Work Experience Modules</div>
<table class="poe-table poe-table--accented">
  <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
  <tbody>${progressRows(wmSubs)}</tbody>
</table>

<div class="sig-bar">
  <div>
    <div class="sig-bar__label">Assessor Sign-Off</div>
    <div style="font-size:9px; color:#9b9b9b; margin-top:2px;">I declare this progress report accurate and complete.</div>
  </div>
  ${assessorSigUrl ? `<img src="${assessorSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(new Date())}</div>
</div>
<div class="pb"></div>`;

      // ══════════════════════════════════════════════════════════════════
      //   SECTION 2: ASSESSMENT TRANSCRIPTS (per module)
      // ══════════════════════════════════════════════════════════════════
      html += `
${dividerPage("2", "Competence Record & Final Assessment Report", "Official system-generated transcripts, grading evidence, and signed evaluations for every module assessed.")}
<div class="pb"></div>`;

      let moduleIndex = 0;
      for (const sub of submissions) {
        moduleIndex++;
        await updateProgress(
          30 + Math.floor((moduleIndex / submissions.length) * 35),
          `Compiling transcript: ${sub.title || "Module"}…`,
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

        const att = sub.attemptNumber || 1;
        const isReassess = att > 1;
        const facFeedback =
          sub.facilitatorOverallFeedback ||
          grading.facilitatorOverallFeedback ||
          "<em>No facilitator comments recorded.</em>";
        const assFeedback =
          grading.assessorOverallFeedback ||
          "<em>No assessor feedback recorded.</em>";
        const modFeedback =
          moderation.feedback || "<em>No moderation comments recorded.</em>";

        const facSigUrl = sub.facilitatorId
          ? signaturesMap[sub.facilitatorId]
          : null;
        const assSigUrl = sub.assessorId ? signaturesMap[sub.assessorId] : null;
        const modSigUrl = sub.moderatorId
          ? signaturesMap[sub.moderatorId]
          : null;

        const facName =
          sub.facilitatorName || grading.facilitatorName || "Pending";
        const assessorName = grading.assessorName || "Pending";
        const assessorReg = grading.assessorRegNumber
          ? `Reg: ${grading.assessorRegNumber}`
          : "";
        const modName = moderation.moderatorName || "Pending";
        const modReg = moderation.moderatorRegNumber
          ? `Reg: ${moderation.moderatorRegNumber}`
          : "";
        const moduleBc = sub.moduleNumber || sub.title || "Module";

        // Extract metadata cleanly
        const modInfo = assessmentData.moduleInfo || assessmentData || {};
        const nqfLevel = modInfo.nqfLevel ? `Level ${modInfo.nqfLevel}` : "N/A";
        const notionalHours = modInfo.notionalHours || "N/A";
        const credits = modInfo.credits ? `Cr ${modInfo.credits}` : "N/A";

        const learnerDate = fmt(
          sub.submittedAt || sub.learnerDeclaration?.timestamp,
        );
        const facDate = fmt(
          sub.facilitatorReviewedAt || grading.facilitatorReviewedAt,
        );
        const assDate = fmt(sub.gradedAt || grading.gradedAt);
        const modDate = fmt(moderation.moderatedAt);

        html += `
<div class="module-header pbi">
  <div>
    <h2 class="module-header__title">${sub.title || "Untitled Module"}</h2>
  </div>
  <div class="module-header__badges">
    ${outcomeBadge(sub.competency)}
    ${isReassess ? `<span class="badge badge--attempt">Attempt ${att}</span>` : `<span class="badge badge--attempt1">Attempt 1</span>`}
  </div>
</div>

<table class="poe-table" style="margin-top:-12px; margin-bottom:16px;">
  <thead>
    <tr>
      <th>Module #</th>
      <th>NQF Level</th>
      <th>Notional hours</th>
      <th>Credit(s)</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="font-weight:bold; color:#073f4e;">${sub.moduleNumber || modInfo.moduleNumber || "N/A"}</td>
      <td>${nqfLevel}</td>
      <td>${notionalHours}</td>
      <td>${credits}</td>
    </tr>
  </tbody>
</table>

${
  assessmentData.isOpenBook && assessmentData.referenceManualUrl
    ? `
<div class="openbook-notice pbi">
  <span class="openbook-notice__icon">Open Book</span>
  <div>
    Learner was provided an official reference manual during this assessment.
    Archived reference: <a href="${assessmentData.referenceManualUrl}" class="a-link">${assessmentData.referenceManualUrl}</a>
  </div>
</div>`
    : ""
}

<div class="eval-box pbi">
  <div class="eval-box__row">
    <div class="eval-box__label">Final Outcome</div>
    <div class="eval-box__value">${outcomeBadge(sub.competency)}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Assessment Score</div>
    <div class="eval-box__value"><strong>${sub.marks !== undefined ? sub.marks : "–"} / ${sub.totalMarks || "–"}</strong></div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Submission Attempt</div>
    <div class="eval-box__value">${att}${isReassess ? ' <span class="badge badge--attempt" style="margin-left:8px;">Reassessment</span>' : ""}</div>
  </div>
  <div class="eval-box__divider"></div>
  <div class="eval-box__row">
    <div class="eval-box__label">Facilitator Note</div>
    <div class="eval-box__value ink-fac">${facFeedback}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Assessor Feedback</div>
    <div class="eval-box__value ink-ass">${assFeedback}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Moderator Review</div>
    <div class="eval-box__value ink-mod">${modFeedback}</div>
  </div>
</div>`;

        // Evidence blocks
        if (blocks.length > 0) {
          let qNum = 1;
          blocks.forEach((block: any) => {
            if (block.type === "section") {
              html += `<div class="sub-heading">${block.title}</div>`;
              return;
            }
            if (block.type === "info") return;

            const blockBc =
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
                  formattedAnswer += `<div>&#x1F517; <a class="a-link" href="${ans.url}">External Link</a></div>`;
                if (ans.code)
                  formattedAnswer += `<pre style="background:#f4f7f9; padding:10px; border:1px solid #dde4e8; font-size:10px; overflow-wrap:break-word;">${ans.code}</pre>`;

                if (ans.uploadUrl) {
                  const annIdx = offlineEvidenceFiles.length + 1;
                  const annLabel = `${moduleBc} | ${blockBc}`;
                  offlineEvidenceFiles.push({
                    index: annIdx,
                    url: ans.uploadUrl,
                    label: annLabel,
                  });
                  formattedAnswer += `<div class="a-annex">&#x1F4CE; <a class="a-link" href="${ans.uploadUrl}"><strong>Appended as Annexure ${annIdx}</strong></a> — ${annLabel}</div>`;
                }

                Object.keys(ans).forEach((k) => {
                  const subAns = ans[k];
                  if (subAns && typeof subAns === "object") {
                    let subHtml = "";
                    if (subAns.text && subAns.text !== "<p></p>")
                      subHtml += `<div>${subAns.text}</div>`;
                    if (subAns.url)
                      subHtml += `<div><a class="a-link" href="${subAns.url}">External Link</a></div>`;
                    if (subAns.code)
                      subHtml += `<pre style="background:#f4f7f9; padding:8px;">${subAns.code}</pre>`;
                    if (subAns.uploadUrl) {
                      const annIdx = offlineEvidenceFiles.length + 1;
                      const annLabel = `${moduleBc} | ${blockBc} | ${k.replace(/_/g, " ").toUpperCase()}`;
                      offlineEvidenceFiles.push({
                        index: annIdx,
                        url: subAns.uploadUrl,
                        label: annLabel,
                      });
                      subHtml += `<div class="a-annex">&#x1F4CE; <a class="a-link" href="${subAns.uploadUrl}"><strong>Annexure ${annIdx}</strong></a> — ${annLabel}</div>`;
                    }
                    if (subHtml)
                      formattedAnswer += `<div style="margin-top:8px; padding:8px; border-left:3px solid #dde4e8; background:#f4f7f9;"><strong style="font-family:'Oswald',sans-serif;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;">${k.replace(/_/g, " ")}</strong>${subHtml}</div>`;
                  } else if (
                    typeof subAns === "string" &&
                    subAns.trim() &&
                    !["text", "url", "uploadUrl", "code"].includes(k)
                  ) {
                    formattedAnswer += `<div><strong>${k.replace(/_/g, " ")}:</strong> ${subAns}</div>`;
                  }
                });
              }
            }
            if (!formattedAnswer)
              formattedAnswer =
                '<em class="text-muted">No evidence provided for this item.</em>';

            // Per-item feedback
            const fLayer = grading.facilitatorBreakdown?.[block.id] || {};
            const aLayer = grading.assessorBreakdown?.[block.id] || {};
            const mLayer = moderation.breakdown?.[block.id] || {};

            const feedbackRows: string[] = [];
            const seenComments = new Set<string>();
            const addFb = (role: string, inkClass: string, text: string) => {
              const clean = text?.trim();
              if (!clean) return;
              const key = `${role}:${clean}`;
              if (!seenComments.has(key)) {
                seenComments.add(key);
                feedbackRows.push(
                  `<div class="f-row"><span class="f-role ${inkClass}">${role}</span><span class="f-comment ${inkClass}">${clean}</span></div>`,
                );
              }
            };
            addFb("Facilitator", "ink-fac", fLayer.feedback);
            addFb("Assessor", "ink-ass", aLayer.feedback);
            addFb("Moderator", "ink-mod", mLayer.feedback);
            if (Array.isArray(fLayer.criteriaResults))
              fLayer.criteriaResults.forEach((c: any) =>
                addFb("Facilitator", "ink-fac", c.comment),
              );
            if (Array.isArray(aLayer.criteriaResults))
              aLayer.criteriaResults.forEach((c: any) =>
                addFb("Assessor", "ink-ass", c.comment),
              );
            if (Array.isArray(mLayer.criteriaResults))
              mLayer.criteriaResults.forEach((c: any) =>
                addFb("Moderator", "ink-mod", c.comment),
              );

            html += `
<div class="q-block">
  <div class="q-text"><span class="q-num">${qNum++}</span>${block.question || block.title || "Checkpoint"}</div>
  <div class="a-text">${formattedAnswer}</div>
  ${feedbackRows.length ? `<div class="f-block">${feedbackRows.join("")}</div>` : ""}
</div>`;
          });
        } else {
          html += `<div class="empty-state">Assessment template is empty — evidence blocks not mapped.</div>`;
        }

        // SMART ARCHIVE LOGIC: Fixes the "No files found" bug by showing legacy message if PDF is absent.
        try {
          const historySnap = await admin
            .firestore()
            .collection("learner_submissions")
            .doc(sub.id)
            .collection("history")
            .get();
          if (!historySnap.empty) {
            const pastAttempts = historySnap.docs
              .map((d) => d.data())
              .sort((a, b) => (a.attemptNumber || 1) - (b.attemptNumber || 1));

            html += `
<div class="history-box pbi">
  <div class="history-box__header">NYC Audit Trail — Previous Attempt Archive (${pastAttempts.length} attempt${pastAttempts.length !== 1 ? "s" : ""})</div>
`;
            pastAttempts.forEach((past, hi) => {
              const pastAtt = past.attemptNumber || hi + 1;
              const pastDate = fmt(past.submittedAt || past.assignedAt);
              const pastFeedback =
                past.grading?.assessorOverallFeedback ||
                past.facilitatorOverallFeedback ||
                "No feedback recorded.";

              let archiveLinkHtml = "";

              if (past.historyPdfUrl) {
                archiveLinkHtml = `
                  <div style="margin-top:10px; padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px;">
                    <a href="${past.historyPdfUrl}" target="_blank" style="color:#1d4ed8; text-decoration:none; font-weight:bold; font-family:'Oswald',sans-serif; font-size:12px;">
                      📄 DOWNLOAD FULL ARCHIVED ATTEMPT PDF
                    </a>
                    <div style="font-size:9px; color:#64748b; margin-top:3px;">Contains all learner answers, rich text, and feedback for this attempt.</div>
                  </div>
                `;
              } else {
                // If it's an old record without a PDF
                archiveLinkHtml = `
                  <div style="margin-top:10px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
                    <div style="font-size:11px; color:#475569; font-style:italic;">Legacy attempt. Full PDF snapshot is not available for this record.</div>
                  </div>
                `;
              }

              html += `<div class="history-attempt">
      <div class="history-attempt__title">Attempt ${pastAtt} — Submitted ${pastDate}</div>
      <div style="font-size:10.5px; margin:4px 0 6px; display:flex; gap:16px;">
        <span><strong>Outcome:</strong> <span class="ink-ass">${past.competency || "NYC"}</span></span>
        <span><strong>Score:</strong> ${past.marks !== undefined ? past.marks : 0} / ${past.totalMarks || 0}</span>
      </div>
      <div style="font-size:10.5px;"><strong>Assessor Feedback:</strong> <span class="ink-ass">${pastFeedback}</span></div>
      ${archiveLinkHtml}
    </div>`;
            });
            html += `</div>`;
          }
        } catch (err) {
          console.error(`History fetch failed for ${sub.id}`, err);
        }

        // Signature row
        html += `
<div class="sig-row">
  ${sigCell("Learner Declaration", "learner", learnerSigUrl, learner.fullName || "Unknown", "", learnerDate)}
  ${sigCell("Facilitator Review", "fac", facSigUrl, facName, "", facDate)}
  ${sigCell("Assessor Endorsement", "assessor", assSigUrl, assessorName, assessorReg, assDate)}
  ${sigCell("Moderator Verification", "mod", modSigUrl, modName, modReg, modDate)}
</div>
<div class="pb"></div>`;
      } // end for each submission

      // ══════════════════════════════════════════════════════════════════
      //   SECTIONS 3–8
      // ══════════════════════════════════════════════════════════════════
      const d = learnerUserDoc.demographics || learner.demographics || {};

      html += `
${dividerPage("3", "Learner Registration & POPIA Consent Form", "Official enrolment, demographic data, and data processing consent.")}
<div class="pb"></div>
${sectionHeader("3", "Learner Registration Form", "Enrolment and Demographic Record")}
<div class="data-grid">
  ${dc("Full Name", learner.fullName)}
  ${dc("Identity Number", learner.idNumber)}
  ${dc("Email Address", learner.email)}
  ${dc("Contact Number", learner.phone || d.phone)}
  ${dc("Equity / Race", d.equityCode)}
  ${dc("Gender", d.gender)}
  ${dc("Home Language", d.homeLanguage)}
  ${dc("Province", d.provinceCode)}
</div>

<h3 class="sub-heading" style="margin-top: 25px;">POPIA Consent Declaration</h3>
<div class="declaration">
  <p>In accordance with the <strong>Protection of Personal Information Act, 4 of 2013 (POPIA)</strong>, I hereby grant <strong>Mobile Applications Laboratory NPC</strong> and its authorized representatives consent to collect, process, and store my personal information.</p>
  <p>I understand and agree that:</p>
  <ol style="margin-top:0; padding-left:20px;">
    <li style="margin-bottom:8px;">My personal information will be processed solely for the purposes of enrollment, assessment, moderation, certification, and reporting to relevant statutory bodies (e.g., QCTO, SETAs, SAQA).</li>
    <li style="margin-bottom:8px;">My data will be stored securely and will not be shared with unauthorized third parties without my explicit consent.</li>
    <li style="margin-bottom:8px;">I have the right to access, update, or request the deletion of my personal information, subject to statutory record-keeping requirements.</li>
  </ol>
  <p style="margin-bottom:0;">By signing this document, I acknowledge that I have read, understood, and accept the terms regarding the processing of my personal data.</p>
</div>

<div class="sig-bar">
  <div class="sig-bar__label">Learner Signature (Registration & POPIA)</div>
  ${learnerSigUrl ? `<img src="${learnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(learner.createdAt || new Date())}</div>
</div>
<div class="pb"></div>

${dividerPage("4", "Letter of Commitment", "Learner declaration of authenticity and commitment to programme requirements.")}
<div class="pb"></div>
${sectionHeader("4", "Letter of Commitment from Learner", "Declaration of Authenticity and Programme Commitment")}
<div class="letter-body">
  <p>I, <strong>${learner.fullName || "___________________"}</strong>, hereby undertake to fulfil all the requirements of the assessment and training practices as specified by the assessor and the service provider, Mobile Applications Laboratory NPC.</p>
  <p>I declare that all work submitted — including assignments, assessments, and case studies — is authentic and represents my own current work. I understand that submission of work that is not my own constitutes academic misconduct and may result in disqualification.</p>
  <p>I am aware that in order to graduate from this programme I need to meet all compulsory requirements, including being declared Competent on all components that form the basis of this qualification.</p>
  <p>I understand and accept the appeals and grievance procedures available to me, and commit to engaging with the process constructively and professionally.</p>
</div>
<div class="sig-bar">
  <div class="sig-bar__label">Learner Sign-Off</div>
  ${learnerSigUrl ? `<img src="${learnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(submissions[0]?.assignedAt || new Date())}</div>
</div>
<div class="pb"></div>

${dividerPage("5", "Programme Induction", "Confirmation that the learner received a comprehensive induction prior to assessment commencement.")}
<div class="pb"></div>
${sectionHeader("5", "Programme Induction", "Formal Acknowledgement of Induction Completion")}
<div class="declaration">
  <p>This confirms that the learner named herein received a comprehensive induction into the programme, covering:</p>
  <p><strong>1. Curriculum Overview</strong> — Programme structure, module breakdown, notional hours, and credit values.</p>
  <p><strong>2. Assessment Methodology</strong> — QCTO assessment types (Knowledge, Practical, Workplace), submission formats, and grading criteria.</p>
  <p><strong>3. Appeals and Grievance Procedures</strong> — Learner rights, remediation pathways, and formal appeals process.</p>
  <p><strong>4. Workplace and Ethical Expectations</strong> — Professional conduct, attendance requirements, and submission authenticity standards.</p>
</div>
<div class="sig-row" style="grid-template-columns: 1fr 1fr;">
  ${sigCell("Learner Acknowledgement", "learner", learnerSigUrl, learner.fullName || "Learner", "", fmt(submissions[0]?.assignedAt || new Date()))}
  ${sigCell("Facilitator Sign-Off", "fac", primaryFacSigUrl, "Programme Facilitator", "", fmt(submissions[0]?.assignedAt || new Date()))}
</div>
<div class="pb"></div>

${dividerPage("6", "Appeals & Complaint Records", "Formal records of any grievances, disputes, or appeal proceedings lodged during this programme.")}
<div class="pb"></div>
${sectionHeader("6", "Appeals & Complaint Records", "Formal Grievance and Appeal Log")}
`;

      if (appealedSubs.length > 0) {
        appealedSubs.forEach((s) => {
          const revBy =
            s.appeal?.resolvedBy || s.appeal?.reviewedBy || s.moderatorId;
          const revSig = revBy ? signaturesMap[revBy] : null;
          const revName =
            s.appeal?.resolvedByName ||
            s.appeal?.reviewedByName ||
            s.moderation?.moderatorName ||
            "Pending";
          const revDate = fmt(
            s.appeal?.resolvedAt || s.appeal?.reviewedAt || s.appeal?.date,
          );

          html += `
<div class="appeal-card pbi">
  <div class="appeal-card__head">
    <h4 class="appeal-card__title">Appeal: ${s.moduleNumber || ""} ${s.title}</h4>
    <span class="badge badge--nyc">${(s.appeal?.status || "Pending").toUpperCase()}</span>
  </div>
  <div class="appeal-card__body">
    <div class="data-grid data-grid--1col" style="margin-bottom:10px;">
      ${dc("Date of Appeal", fmt(s.appeal?.date))}
      ${dc("Reason for Appeal", s.appeal?.reason || "Not specified")}
      ${dc("Appeal Status", (s.appeal?.status || "Pending").toUpperCase())}
      ${s.appeal?.resolutionNotes ? dc("Board Resolution", s.appeal.resolutionNotes) : ""}
    </div>
    <div style="border-top: 1px dashed #fecaca; padding-top: 10px; margin-top: 10px;">
      <div class="data-cell__label" style="color: #b91c1c;">Resolved By / Signature</div>
      ${revSig ? `<img src="${revSig}" style="max-height: 35px; mix-blend-mode: multiply; margin: 4px 0;" />` : `<div style="height:35px; font-style:italic; font-size:10px; color:#b91c1c; display:flex; align-items:center;">Pending Signature</div>`}
      <div class="ink-mod" style="font-weight: 700; font-size: 11px; font-family: 'Oswald', sans-serif;">${revName}</div>
      <div class="ink-mod" style="font-size: 9px;">Date: ${revDate}</div>
    </div>
  </div>
</div>`;
        });
      } else {
        html += `
<div class="notice notice--grey pbi">
  <div class="notice__title">Status: No Appeals Lodged</div>
  <div class="notice__body">No formal appeals or complaints were registered by the learner for any module in this programme.</div>
</div>`;
      }

      html += `
<div class="pb"></div>

${dividerPage("7", "Actual Learning Plan & Evidence Control Sheet", "Full audit trail mapping all modules to facilitators, date ranges, evidence types, and competency outcomes.")}
<div class="pb"></div>
${sectionHeader("7", "Actual Learning Plan & Evidence Control Sheet", "Evidence Type Matrix and Outcome Register")}

<table class="poe-table">
  <thead>
    <tr>
      <th rowspan="2">Module Code</th>
      <th rowspan="2">Facilitator</th>
      <th rowspan="2">Assessment Period</th>
      <th colspan="3" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Evidence Type</th>
      <th colspan="2" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Outcome</th>
    </tr>
    <tr>
      <th style="text-align:center; font-size:8px;">Knowledge</th>
      <th style="text-align:center; font-size:8px;">Practical</th>
      <th style="text-align:center; font-size:8px;">Workplace</th>
      <th style="text-align:center; font-size:8px; color:#94c73d;">C</th>
      <th style="text-align:center; font-size:8px; color:#fca5a5;">NYC</th>
    </tr>
  </thead>
  <tbody>${learningPlanRows(submissions)}</tbody>
</table>

<div class="sub-heading mt-8">Evidence Judging Principles</div>
<table class="poe-table">
  <thead><tr><th>Assessment Principle</th><th width="90" style="text-align:center;">Knowledge</th><th width="120" style="text-align:center;">Practical / Workplace</th></tr></thead>
  <tbody>
    <tr><td><strong>Relevant</strong> — Evidence relates directly to specific programme learning outcomes.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Valid</strong> — Evidence demonstrates the learner can perform the required function.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Authentic</strong> — Evidence is confirmed as the learner's own work.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Consistent</strong> — Evidence demonstrates repeatable performance to the required standard.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Current</strong> — Evidence reflects learner's current level of competence.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
    <tr><td><strong>Sufficient</strong> — Adequate evidence has been collected to support a judgement.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
  </tbody>
</table>

<div class="sig-row" style="grid-template-columns: 1fr;">
  ${sigCell("Assessor Endorsement", "assessor", assessorSigUrl, primaryAssessor, "", fmt(new Date()))}
</div>
<div class="pb"></div>

${dividerPage("8", "Learner Coaching Record", "Formal documentation of all coaching, remediation sessions, and intervention records for Not Yet Competent modules.")}
<div class="pb"></div>
${sectionHeader("8", "Learner Coaching Record (Remediation)", "Intervention Log for NYC Modules")}
`;

      if (remediatedSubs.length > 0) {
        remediatedSubs.forEach((s) => {
          const log = s.latestCoachingLog || {};
          const facId =
            log.facilitatorId || s.grading?.facilitatorId || s.facilitatorId;
          const facSig = facId ? signaturesMap[facId] : null;
          const facName =
            log.facilitatorName ||
            s.grading?.facilitatorName ||
            s.facilitatorName ||
            "Assigned Facilitator";
          const facDate = fmt(log.date || s.assignedAt);

          const learnerAckSig = log.acknowledged ? learnerSigUrl : null;
          const learnerAckDate = fmt(log.acknowledgedAt);

          html += `
<div class="coaching-card pbi">
  <div class="coaching-card__head">
    <h4 class="coaching-card__title">Remediation Log: ${s.moduleNumber || ""} ${s.title}</h4>
    <span class="badge badge--attempt">Attempt ${s.attemptNumber}</span>
  </div>
  <div class="coaching-card__body">
    <div class="data-grid">
      ${dc("Max Attempts Allowed", "3")}
      ${dc("Current Attempt", `Attempt ${s.attemptNumber}`)}
      ${dc("Coaching Facilitator", facName)}
      ${dc("Date of Intervention", fmt(log.date || s.assignedAt))}
    </div>
    <div class="data-cell" style="background:#fffbeb; border:1px solid #fde68a; padding:10px 12px; margin-bottom: 10px;">
      <span class="data-cell__label">Academic Intervention Notes</span>
      <span class="data-cell__value ink-fac" style="display:block; margin-top:4px; font-weight:400; font-size:11px; line-height:1.6;">${log.notes || "Coaching session conducted to address NYC competency gaps and unlock learner for reassessment."}</span>
    </div>
    
    <div class="sig-row" style="grid-template-columns: 1fr 1fr; margin-top: 15px;">
      ${sigCell("Facilitator Signature", "fac", facSig, facName, "", facDate)}
      ${sigCell("Learner Acknowledgement", "learner", learnerAckSig, learner.fullName || "Learner", log.acknowledged ? "Acknowledged" : "Pending", learnerAckDate)}
    </div>
  </div>
</div>`;
        });
      } else {
        html += `
<div class="notice notice--green pbi">
  <div class="notice__title">No Remediation Required</div>
  <div class="notice__body">No coaching or remediation sessions were required during this programme. All modules were completed competently on the first attempt.</div>
</div>`;
      }

      // SECTION 9 DIVIDER (Annexures appended via pdf-lib after render)
      html += `
<div class="pb"></div>
${dividerPage("9", "Annexures", "Identity documents, supporting compliance files, and evidence submissions uploaded by the learner — appended on the following pages.")}
</body></html>`;

      // ══════════════════════════════════════════════════════════════════
      //   RENDER WITH PUPPETEER
      // ══════════════════════════════════════════════════════════════════
      await updateProgress(70, "Rendering assessment layout…");
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
      const page = await browser.newPage();
      page.setDefaultNavigationTimeout(120000);
      page.setDefaultTimeout(120000);
      await page.setContent(html, {
        waitUntil: ["load", "networkidle2"],
        timeout: 120000,
      });

      const puppeteerPdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        displayHeaderFooter: true,
        headerTemplate: "<span></span>",
        footerTemplate: `
          <div style="font-size:8px; font-family:'Trebuchet MS',sans-serif; color:#9b9b9b; padding:0 16mm; width:100%; display:flex; justify-content:space-between; box-sizing:border-box;">
            <span>Mobile Applications Laboratory NPC — Master Portfolio of Evidence</span>
            <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
          </div>`,
        margin: { top: "15mm", right: "16mm", bottom: "22mm", left: "16mm" },
        timeout: 120000,
      });
      await browser.close();

      // ══════════════════════════════════════════════════════════════════
      //   MERGE ANNEXURES WITH PDF-LIB
      // ══════════════════════════════════════════════════════════════════
      await updateProgress(85, "Merging annexures (identity & evidence)…");
      const masterPdf = await PDFDocument.create();
      const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);
      const basePdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
      const basePages = await masterPdf.copyPages(
        basePdfDoc,
        basePdfDoc.getPageIndices(),
      );
      basePages.forEach((p) => masterPdf.addPage(p));

      // Collect uploaded docs as annexures
      const uploadedDocs: UploadedDoc[] =
        learnerUserDoc?.uploadedDocuments || learner?.uploadedDocuments || [];
      uploadedDocs.forEach((d) => {
        offlineEvidenceFiles.push({
          index: offlineEvidenceFiles.length + 1,
          url: d.url,
          label: `9. Annexure: ${d.name || "Compliance Document"}`,
        });
      });

      if (offlineEvidenceFiles.length > 0) {
        await updateProgress(90, "Stamping and merging annexures…");
        for (const evidence of offlineEvidenceFiles) {
          try {
            const buffer = await fetchFileBuffer(evidence.url);
            if (!buffer) continue;
            const stampText = `Annexure ${evidence.index}: ${evidence.label}`;
            try {
              const extPdf = await PDFDocument.load(buffer);
              const copPages = await masterPdf.copyPages(
                extPdf,
                extPdf.getPageIndices(),
              );
              if (copPages.length > 0) {
                const fp = copPages[0];
                fp.drawText(stampText, {
                  x: 20,
                  y: fp.getSize().height - 20,
                  size: 9,
                  color: rgb(0.86, 0.15, 0.15),
                  font: fontBold,
                });
              }
              copPages.forEach((p: any) => masterPdf.addPage(p));
            } catch {
              let image;
              try {
                image = await masterPdf.embedPng(buffer);
              } catch {
                try {
                  image = await masterPdf.embedJpg(buffer);
                } catch {}
              }
              if (image) {
                const pg = masterPdf.addPage();
                const { width, height } = pg.getSize();
                pg.drawText(stampText, {
                  x: 20,
                  y: height - 30,
                  size: 9,
                  color: rgb(0.86, 0.15, 0.15),
                  font: fontBold,
                });
                const dims = image.scaleToFit(width - 40, height - 80);
                pg.drawImage(image, {
                  x: width / 2 - dims.width / 2,
                  y: height / 2 - dims.height / 2 - 20,
                  ...dims,
                });
              }
            }
          } catch (err) {
            console.warn(`Annexure failed: ${evidence.url}`, err);
          }
        }
      }

      // ══════════════════════════════════════════════════════════════════
      //   SAVE & NOTIFY
      // ══════════════════════════════════════════════════════════════════
      await updateProgress(95, "Uploading to secure vault…");
      const finalPdfBuffer = Buffer.from(await masterPdf.save());
      const bucket = admin.storage().bucket();
      const dirPrefix = `poe_exports/${learnerId}/`;
      try {
        await bucket.deleteFiles({ prefix: dirPrefix });
      } catch {}

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
        await transporter
          .sendMail({
            from: '"mLab Compliance" <noreply@mlab.co.za>',
            to: requesterEmail,
            subject: `Master PoE Ready — ${learner.fullName}`,
            html: `
            <div style="font-family:'Trebuchet MS',sans-serif; max-width:560px; margin:0 auto; border-top:4px solid #073f4e;">
              <div style="background:#073f4e; padding:20px 24px;">
                <span style="font-family:'Oswald',sans-serif; font-size:18px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#ffffff;">Mobile Applications Laboratory NPC</span>
              </div>
              <div style="padding:28px 24px; background:#ffffff;">
                <p style="font-size:15px; color:#1a2e35;">The Master Portfolio of Evidence for <strong>${learner.fullName}</strong> has been generated successfully.</p>
                <p style="font-size:13px; color:#6b6b6b;">All sections, transcripts, and annexures have been compiled into a single QCTO-compliant PDF.</p>
                <div style="margin:24px 0;">
                  <a href="${downloadUrl}" style="display:inline-block; background:#073f4e; color:#ffffff; padding:13px 32px; text-decoration:none; font-family:'Oswald',sans-serif; font-weight:700; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
                    &#x2193;&nbsp; Download Master PoE PDF
                  </a>
                </div>
                <p style="font-size:11px; color:#9b9b9b;">Reference: ${requestId}</p>
              </div>
              <div style="background:#f4f7f9; padding:14px 24px; border-top:1px solid #dde4e8;">
                <p style="font-size:10px; color:#9b9b9b; margin:0;">&#169; ${new Date().getFullYear()} Mobile Applications Laboratory NPC. Automated message — do not reply.</p>
              </div>
            </div>`,
          })
          .catch((err) => {
            console.warn(
              "Email failed to send, but PoE was generated. Check your secrets.",
              err,
            );
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
