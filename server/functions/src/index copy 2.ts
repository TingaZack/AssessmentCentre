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

setGlobalOptions({ maxInstances: 10 });

import * as admin from "firebase-admin";
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

import axios from "axios";
import FormData from "form-data"; // form-data v4.0.1
import Mailgun from "mailgun.js"; // mailgun.js v11.1.0

import { generateHistorySnapshot } from "./modules/generateHistorySnapshot";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

admin.initializeApp();

exports.generateHistorySnapshot = generateHistorySnapshot;

// ============================================================================
// MAILGUN CONFIGURATION
// ============================================================================
const mailgun = new Mailgun(FormData);
const mg = mailgun.client({
  username: "api",
  key: process.env.MAILGUN_API_KEY || "YOUR_API_KEY", // 👈 Replace or set via Firebase Env
});

const MAILGUN_DOMAIN = "sandbox68da903a7a994f779125eb7f3cb11291.mailgun.org";
const MAILGUN_FROM =
  "mLab Assessment Platform <postmaster@sandbox68da903a7a994f779125eb7f3cb11291.mailgun.org>";

// ================= CONFIGURATION =================
const APP_URL = "https://assessmentcentr.web.app/";

// ============================================================================
// GLOBAL EMAIL HELPER (MAILGUN)
// ============================================================================
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
    const response = await mg.messages.create(MAILGUN_DOMAIN, {
      from: MAILGUN_FROM,
      to: [to],
      subject: subject,
      html: html,
    });
    console.log(`✅ Mailgun Email sent to ${to}. ID: ${response.id}`);
  } catch (e) {
    console.error(`❌ Failed to send email to ${to} via Mailgun`, e);
  }
};

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

export const helloTryWorld = onRequest((request, response) => {
  logger.info("Hello logs!", { structuredData: true });
  response.send("Hello from Firebase!");
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

    const emailParams = {
      title: "Platform Access Granted",
      subtitle: "Secure your account to access your dashboard",
      recipientName: fullName,
      bodyHtml: `You have been securely provisioned as a <strong>${displayRole}</strong> on the mLab platform. Please click the button below to set your private password and access your dashboard.`,
      ctaText: "Set Password & Login",
      ctaLink: link,
      showStepIndicator: false,
    };

    // SEND VIA MAILGUN
    await mg.messages.create(MAILGUN_DOMAIN, {
      from: MAILGUN_FROM,
      to: [email],
      subject: `Action Required: Access Granted - ${displayRole}`,
      text: buildMlabEmailPlainText(emailParams),
      html: buildMlabEmailHtml(emailParams),
    });

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
      const [facDoc, assDoc, modDoc] = await Promise.all([
        admin.firestore().collection("users").doc(facilitatorId).get(),
        admin.firestore().collection("users").doc(assessorId).get(),
        admin.firestore().collection("users").doc(moderatorId).get(),
      ]);

      const facilitator = facDoc.data();
      const assessor = assDoc.data();
      const moderator = modDoc.data();

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

      if (learnerIds && learnerIds.length > 0) {
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
  return cors(req, res, async () => {
    try {
      if (req.method !== "POST") {
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
          throw error;
        }
      }

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

      const link = await admin.auth().generatePasswordResetLink(email);

      const htmlContent = `
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
        `;

      // SEND VIA MAILGUN
      await mg.messages.create(MAILGUN_DOMAIN, {
        from: MAILGUN_FROM,
        to: [email],
        subject: "Invitation to mLab Learner Portal",
        html: htmlContent,
      });

      return res.status(200).send({
        data: { success: true, uid: uid, wasNewlyCreated: isNewUser },
      });
    } catch (error: any) {
      console.error("Critical Error:", error);
      return res.status(500).send({
        data: { success: false, message: error.message },
      });
    }
  });
});

exports.sendAdHocCertificate = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError(
      "unauthenticated",
      "The function must be called while authenticated.",
    );
  }

  const { email, recipientName, pdfUrl, awardTitle, courseName } = request.data;

  const htmlContent = `
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
  `;

  try {
    // SEND VIA MAILGUN
    await mg.messages.create(MAILGUN_DOMAIN, {
      from: MAILGUN_FROM,
      to: [email],
      subject: `Your Certificate: ${awardTitle} - ${courseName}`,
      html: htmlContent,
    });
    return { success: true, message: "Email sent successfully" };
  } catch (error) {
    console.error("Email Error:", error);
    throw new HttpsError("internal", "Failed to send email.");
  }
});

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

    const getUserEmailAndName = async (uid: string) => {
      if (!uid) return null;
      const doc = await db.collection("users").doc(uid).get();
      if (!doc.exists) return null;
      return { email: doc.data()?.email, name: doc.data()?.fullName || "User" };
    };

    const getLearnerEmailAndName = async (uid: string) => {
      if (!uid) return null;
      const doc = await db.collection("learners").doc(uid).get();
      if (!doc.exists) return null;
      return {
        email: doc.data()?.email,
        name: doc.data()?.fullName || "Learner",
      };
    };

    const getCohortStaff = async () => {
      if (!cohortId) return {};
      const cohortDoc = await db.collection("cohorts").doc(cohortId).get();
      return cohortDoc.data() || {};
    };

    try {
      const cohortStaff = await getCohortStaff();

      if (
        beforeData.status !== "submitted" &&
        afterData.status === "submitted"
      ) {
        const assessorId = afterData.gradedBy || cohortStaff.assessorId;
        const facilitatorId = cohortStaff.facilitatorId;

        const assessor = await getUserEmailAndName(assessorId);
        const facilitator = await getUserEmailAndName(facilitatorId);
        const learner = await getLearnerEmailAndName(learnerId);

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

      if (beforeData.status !== "graded" && afterData.status === "graded") {
        const moderatorId =
          afterData.moderation?.moderatedBy || cohortStaff.moderatorId;
        const moderator = await getUserEmailAndName(moderatorId);
        const learner = await getLearnerEmailAndName(learnerId);
        const marks = afterData.marks || 0;
        const totalMarks = afterData.totalMarks || 100;
        const competency =
          afterData.competency === "C" ? "Competent" : "Not Yet Competent";

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

export const onAssessmentCreated = onDocumentCreated(
  "assessments/{assessmentId}",
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { title, cohortId, availableFrom, dueDate } = data;
    if (!cohortId) return;

    const db = admin.firestore();

    try {
      const cohortSnap = await db.collection("cohorts").doc(cohortId).get();
      const cohortData = cohortSnap.data();
      if (!cohortData || !cohortData.learnerIds) return;

      const learnerIds = cohortData.learnerIds;

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

export const onLearnerBlockchainVerified = onDocumentUpdated(
  "learners/{learnerId}",
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

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

    userName = userName || "there";

    const verificationLink = await admin
      .auth()
      .generateEmailVerificationLink(userEmail);
    const currentYear = new Date().getFullYear();

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

    body, table, td, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td            { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img                  { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
    body                 { margin: 0 !important; padding: 0 !important; width: 100% !important; }

    .ve-cta:hover { background-color: #0a5266 !important; }

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

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#e4edf0; min-height:100vh;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table class="wrapper" role="presentation" cellpadding="0" cellspacing="0" border="0"
               style="width:580px; max-width:580px; background-color:#ffffff; box-shadow:0 8px 32px rgba(7,63,78,0.18), 0 2px 8px rgba(7,63,78,0.08);">
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
                style="background-color:#073f4e; padding:44px 40px 36px; background-image:repeating-linear-gradient(-45deg,transparent,transparent 28px,rgba(255,255,255,0.02) 28px,rgba(255,255,255,0.02) 29px);">
              <h1 class="title-sm"
                  style="color:#ffffff; margin:0 0 6px; font-family:'Oswald',sans-serif; font-size:26px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; line-height:1.1;">
                Mobile Applications Laboratory NPC 
              </h1>
              <p style="color:rgba(255,255,255,0.45); margin:0; font-size:11px; font-family:'Trebuchet MS',sans-serif; letter-spacing:0.08em; text-transform:uppercase;">
                Assessment &amp; Credentialing Platform
              </p>
            </td>
          </tr>
          <tr>
            <td align="center" style="background-color:#052e3a; padding:18px 40px; border-bottom:3px solid #94c73d;">
              <h2 class="heading-sm"
                  style="color:#ffffff; margin:0; font-family:'Oswald',sans-serif; font-size:28px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">
                Verify Your Email
              </h2>
            </td>
          </tr>
          <tr>
            <td class="pad-sm" style="padding:36px 40px; background-color:#ffffff;">
              <p style="color:#6b6b6b; font-size:15px; line-height:1.7; margin:0 0 22px; font-family:'Trebuchet MS',sans-serif;">
                Hi <strong style="color:#073f4e;">${userName}</strong>,
              </p>
              <p style="color:#6b6b6b; font-size:15px; line-height:1.7; margin:0 0 28px; font-family:'Trebuchet MS',sans-serif;">
                Welcome to the mLab Assessment Platform. To secure your credentials and unlock your platform dashboard, please verify your email address by clicking the button below.
              </p>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px;">
                <tr>
                  <td align="center">
                    <a href="${verificationLink}" class="ve-cta cta-sm"
                       style="display:inline-block; background-color:#073f4e; color:#ffffff; padding:16px 40px; text-decoration:none; font-family:'Oswald',sans-serif; font-weight:700; font-size:14px; letter-spacing:0.14em; text-transform:uppercase; border:2px solid #052e3a; box-shadow:0 4px 12px rgba(7,63,78,0.25);">
                      &#x2192;&nbsp; Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px; background-color:#fffbeb; border:1px solid #fde68a; border-left:4px solid #d97706;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="color:#92400e; font-size:13px; line-height:1.6; margin:0 0 6px; font-family:'Oswald',sans-serif; font-weight:700; letter-spacing:0.06em; text-transform:uppercase;">
                      Button not working?
                    </p>
                    <p style="color:#78350f; font-size:12px; line-height:1.6; margin:0; font-family:'Trebuchet MS',sans-serif;">
                      Copy and paste this link into your browser:<br />
                      <a href="${verificationLink}" style="color:#0a5266; word-break:break-all; text-decoration:underline;">${verificationLink}</a>
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `.trim();

    // SEND VIA MAILGUN
    await mg.messages.create(MAILGUN_DOMAIN, {
      from: MAILGUN_FROM,
      to: [userEmail],
      subject: "Verify Your mLab Account",
      text: plainText,
      html: htmlContent,
    });

    return { success: true, message: "Verification email sent." };
  } catch (error: any) {
    console.error("Email Error:", error);
    throw new HttpsError("internal", error.message || "Failed to send email");
  }
});

const privateKeySecret = defineSecret("INSTITUTION_PRIVATE_KEY");
const RPC_URL =
  process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const PINATA_JWT = process.env.PINATA_JWT || "";

const contractABI = [
  "function issueCertificate(string certId, bytes32 dataFingerprint) public",
];

export const issueBlockchainCertificate = onCall(
  { secrets: [privateKeySecret] },
  async (request) => {
    const { data, auth } = request;

    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "You must be logged in to mint documents.",
      );
    }

    const {
      verificationCode,
      learnerName,
      idNumber,
      qualification,
      issueDate,
      eisaStatus,
      pdfBase64,
    } = data;

    if (!verificationCode || !pdfBase64 || !CONTRACT_ADDRESS || !PINATA_JWT) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required data or environment variables.",
      );
    }

    try {
      console.log(`Uploading ${verificationCode}.pdf to Pinata...`);

      const base64Data = pdfBase64.replace(
        /^data:application\/pdf;base64,/,
        "",
      );

      const pdfBuffer = Buffer.from(base64Data, "base64");
      const formData = new FormData();
      formData.append("file", pdfBuffer, {
        filename: `${verificationCode}.pdf`,
        contentType: "application/pdf",
      });

      const pinataResponse = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          headers: {
            Authorization: `Bearer ${PINATA_JWT}`,
            ...formData.getHeaders(),
          },
        },
      );

      const ipfsHash = pinataResponse.data.IpfsHash;
      console.log(`✅ Uploaded to IPFS! Hash: ${ipfsHash}`);

      console.log(`Minting to Sepolia...`);

      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(privateKeySecret.value(), provider);
      const contract = new ethers.Contract(
        CONTRACT_ADDRESS,
        contractABI,
        wallet,
      );

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

      const tx = await contract.issueCertificate(verificationCode, fingerprint);
      const receipt = await tx.wait();

      console.log(`✅ Minted successfully! TX: ${receipt.hash}`);

      return {
        success: true,
        ipfsHash: ipfsHash,
        fingerprint: fingerprint,
        transactionHash: receipt.hash,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      console.error("Cloud Function Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to process certificate",
      );
    }
  },
);

// ─── UTILITIES FOR MASTER POE ─────────────────────────────────────────────────

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

// ─── MASTER POE GENERATION ──────────────────────────────────────────────────
// Note: POE_STYLES, sigCell, dividerPage, sectionHeader, dc, outcomeBadge
// omitted here for brevity as they are untouched and purely HTML strings.
// Make sure to paste them back into your file above this function.

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

      // ... (Rest of your complex PDF generation logic remains exactly the same) ...

      // AT THE VERY END, REPLACE NODEMAILER WITH MAILGUN
      if (requesterEmail) {
        await mg.messages
          .create(MAILGUN_DOMAIN, {
            from: MAILGUN_FROM,
            to: [requesterEmail],
            subject: `Master PoE Ready — Learner Ref: ${learnerId}`,
            html: `
            <div style="font-family:'Trebuchet MS',sans-serif; max-width:560px; margin:0 auto; border-top:4px solid #073f4e;">
              <div style="background:#073f4e; padding:20px 24px;">
                <span style="font-family:'Oswald',sans-serif; font-size:18px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:#ffffff;">Mobile Applications Laboratory NPC</span>
              </div>
              <div style="padding:28px 24px; background:#ffffff;">
                <p style="font-size:15px; color:#1a2e35;">The Master Portfolio of Evidence has been generated successfully.</p>
                <p style="font-size:13px; color:#6b6b6b;">All sections, transcripts, and annexures have been compiled into a single QCTO-compliant PDF.</p>
                <div style="margin:24px 0;">
                  <a href="https://your-dashboard.com" style="display:inline-block; background:#073f4e; color:#ffffff; padding:13px 32px; text-decoration:none; font-family:'Oswald',sans-serif; font-weight:700; font-size:13px; letter-spacing:0.1em; text-transform:uppercase;">
                    &#x2193;&nbsp; Access Dashboard
                  </a>
                </div>
                <p style="font-size:11px; color:#9b9b9b;">Reference: ${requestId}</p>
              </div>
            </div>`,
          })
          .catch((err) => {
            console.warn(
              "Mailgun email failed to send, but PoE was generated. Did you add the recipient to your Mailgun Authorized Recipients list?",
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
