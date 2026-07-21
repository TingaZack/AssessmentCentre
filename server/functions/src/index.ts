/**
 * Import function triggers from their respective submodules:
 *
 * import {onCall} from "firebase-functions/v2/https";
 * import {onDocumentWritten} from "firebase-functions/v2/firestore";
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */

import { setGlobalOptions } from "firebase-functions";
import {
  CallableRequest,
  HttpsError,
  onCall,
  onRequest,
} from "firebase-functions/https";
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
import { defineSecret } from "firebase-functions/params";

// import { google } from "googleapis";

const cors = require("cors")({ origin: true });

import axios from "axios";
import FormData from "form-data";
import { generateHistorySnapshot } from "./modules/generateHistorySnapshot";

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

import { onSchedule } from "firebase-functions/v2/scheduler";
import { FieldValue } from "firebase-admin/firestore";
import OpenAI from "openai";

import * as crypto from "crypto";

admin.initializeApp();
// ================= CONFIGURATION & SECRETS =================
// // ZARD
// const ZARD_APP_URL = "https://assessmentcentr.web.app";
// MLAB
// const APP_URL = "https://mlabassessmentcenter.web.app";
// const APP_URL = "http://localhost:5173";

// Auto-detects if running locally or in production
// firebase emulators:start (The Sandbox) and irebase deploy --only functions ( Live)
const APP_URL =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? "http://localhost:5173"
    : "https://mlabassessmentcenter.web.app";

const mailgunSecret = defineSecret("MAILGUN_API_KEY");
const privateKeySecret = defineSecret("INSTITUTION_PRIVATE_KEY");
const encryptionKeySecret = defineSecret("ENCRYPTION_KEY");
const mapsApiKey = defineSecret("GOOGLE_MAPS_API_KEY");

// const openAISecret = defineSecret("OPENAI_API_KEY");

// ============================================================================
// REUSABLE MAILGUN EMAIL HELPER
// ============================================================================

const getMailgunConfig = () => {
  let apiKey = "";
  try {
    const secretValue = mailgunSecret.value();
    if (secretValue) apiKey = secretValue;
  } catch (e) {}

  if (!apiKey) {
    apiKey = process.env.MAILGUN_API_KEY || "";
  }

  if (!apiKey) {
    throw new Error(
      "MAILGUN_API_KEY not found in Secret Manager or .env variables.",
    );
  }

  const domain = process.env.MAILGUN_DOMAIN;
  if (!domain) {
    throw new Error("MAILGUN_DOMAIN not found in .env variables.");
  }

  return { apiKey, domain };
};

export const sendMailgunEmail = async ({
  to,
  subject,
  text,
  html,
  attachment,
}: {
  to: string;
  subject: string;
  text?: string;
  html?: string;
  attachment?: any[];
}) => {
  const { apiKey, domain } = getMailgunConfig();

  const form = new FormData();
  form.append("from", `mLab Assessment Platform <noreply@${domain}>`);
  form.append("to", to);
  form.append("subject", subject);

  if (text) form.append("text", text);
  if (html) form.append("html", html);
  if (html && !text) {
    form.append("text", "Please view this email in an HTML-compatible client.");
  }

  // Safely append file buffers to the form data
  if (attachment && attachment.length > 0) {
    attachment.forEach((file) => {
      form.append("attachment", file.data, {
        filename: file.filename,
        contentType: file.contentType,
      });
    });
  }

  try {
    const res = await axios.post(
      `https://api.mailgun.net/v3/${domain}/messages`,
      form,
      {
        headers: {
          Authorization:
            "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
          ...form.getHeaders(), // 🚀 CRITICAL FIX: Injects multipart/form-data boundary headers dynamically!
        },
      },
    );
    return res.data;
  } catch (error: any) {
    throw new Error(
      `Mailgun API Error: ${error.response?.data?.message || error.message}`,
    );
  }
};

// export const sendMailgunEmail = async ({
//   to,
//   subject,
//   text,
//   html,
//   attachment,
// }: {
//   to: string;
//   subject: string;
//   text?: string;
//   html?: string;
//   attachment?: any[];
// }) => {
//   const { apiKey, domain } = getMailgunConfig();

//   const form = new FormData();
//   form.append("from", `mLab Assessment Platform <noreply@${domain}>`);
//   form.append("to", to);
//   form.append("subject", subject);

//   if (text) form.append("text", text);
//   if (html) form.append("html", html);
//   if (html && !text)
//     form.append("text", "Please view this email in an HTML-compatible client.");

//   // Safely append file buffers to the form data
//   if (attachment && attachment.length > 0) {
//     attachment.forEach((file) => {
//       form.append("attachment", file.data, {
//         filename: file.filename,
//         contentType: file.contentType,
//       });
//     });
//   }

//   try {
//     const res = await axios.post(
//       `https://api.mailgun.net/v3/${domain}/messages`,
//       form,
//       {
//         headers: {
//           Authorization:
//             "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
//           ...form.getHeaders(),
//         },
//       },
//     );
//     return res.data;
//   } catch (error: any) {
//     throw new Error(
//       `Mailgun API Error: ${error.response?.data?.message || error.message}`,
//     );
//   }
// };

// export const sendMailgunEmail = async ({
//   to,
//   subject,
//   text,
//   html,
// }: {
//   to: string;
//   subject: string;
//   text?: string;
//   html?: string;
// }) => {
//   const { apiKey, domain } = getMailgunConfig();

//   const params = new URLSearchParams();
//   params.append("from", `mLab Assessment Platform <noreply@${domain}>`);
//   params.append("to", to);
//   params.append("subject", subject);

//   if (text) params.append("text", text);
//   if (html) params.append("html", html);
//   if (html && !text)
//     params.append(
//       "text",
//       "Please view this email in an HTML-compatible client.",
//     );

//   const res = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
//     method: "POST",
//     headers: {
//       Authorization: "Basic " + Buffer.from(`api:${apiKey}`).toString("base64"),
//     },
//     body: params,
//   });

//   const data = await res.json();

//   if (!res.ok) {
//     throw new Error(`Mailgun API Error: ${data.message || res.statusText}`);
//   }

//   return data;
// };

// ============================================================================
// CLOUD FUNCTIONS
// ============================================================================

exports.generateHistorySnapshot = generateHistorySnapshot;

export const helloTryrld = onRequest(
  { secrets: [mailgunSecret] },
  async (request, response) => {
    try {
      const emailParams = {
        title: "Test Successful",
        subtitle: "System Operational",
        recipientName: "Zack",
        bodyHtml: `
          <p>You have successfully triggered the reusable Mailgun helper function with a secure domain.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #94c73d; margin: 20px 0;">
              <p style="margin: 0; color: #073f4e; font-size: 13px;"><strong>System Status:</strong> 100% Operational ✅</p>
              <p style="margin: 6px 0 0; color: #475569; font-size: 12px;"><strong>Routing Domain:</strong> mg.mlab.co.za</p>
          </div>
          <p>This HTML template perfectly matches your corporate identity and is ready to be reused!</p>
        `,
        ctaText: "Return to Dashboard",
        ctaLink: APP_URL,
        showStepIndicator: false,
      };

      const data = await sendMailgunEmail({
        to: "Zack <zakhele@mlab.co.za>",
        subject: "mLab System Test Successful",
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });

      logger.info("Email sent successfully!", { data });
      response.status(200).send(data);
    } catch (error: any) {
      logger.error("Failed to send email", error);
      response
        .status(500)
        .send({ error: error.message || "Failed to send email" });
    }
  },
);

export const createStaffAccount = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
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

    console.log(
      `[createStaffAccount] 🟢 INITIATED: Request received to create ${role} account for ${email}`,
    );

    // Authorization Checks
    if (!auth) {
      console.error("[createStaffAccount] ❌ ERROR: Unauthenticated request.");
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(auth.uid)
      .get();

    if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
      console.error(
        `[createStaffAccount] ❌ ERROR: Permission denied for UID: ${auth.uid}`,
      );
      throw new HttpsError(
        "permission-denied",
        "Only Admins can provision staff accounts.",
      );
    }

    if (role === "admin" && !email.toLowerCase().endsWith("@mlab.co.za")) {
      console.error(
        `[createStaffAccount] ❌ ERROR: Domain policy violation for email: ${email}`,
      );
      throw new HttpsError(
        "permission-denied",
        "Security Policy Violation: Admin accounts can only be provisioned for official @mlab.co.za domains.",
      );
    }

    console.log(
      "[createStaffAccount] ✅ Validation passed. Proceeding with Auth creation...",
    );

    try {
      // 1. Create User in Firebase Auth
      const userRecord = await admin
        .auth()
        .createUser({ email, displayName: fullName, emailVerified: true });

      console.log(
        `[createStaffAccount] ✅ Firebase Auth user created successfully. UID: ${userRecord.uid}`,
      );

      // 2. Set Custom Claims (Role-based access)
      await admin.auth().setCustomUserClaims(userRecord.uid, {
        role,
        ...(role === "admin" && isSuperAdmin ? { isSuperAdmin: true } : {}),
      });
      console.log("[createStaffAccount] ✅ Custom claims set.");

      // 3. Prepare Firestore Data
      const userData: any = {
        uid: userRecord.uid,
        fullName,
        email,
        role,
        phone: phone || "",
        status: "active",
        createdAt: new Date().toISOString(),
        signatureUrl: "",
      };

      if (role === "admin") {
        userData.isSuperAdmin = !!isSuperAdmin;
        if (!isSuperAdmin && privileges) userData.privileges = privileges;
      } else if (role === "mentor" && employerId) {
        userData.employerId = employerId;
      } else if (
        ["assessor", "moderator"].includes(role) &&
        assessorRegNumber
      ) {
        userData.assessorRegNumber = assessorRegNumber;
      }

      // 4. Save to Firestore
      await admin
        .firestore()
        .collection("users")
        .doc(userRecord.uid)
        .set(userData);

      console.log(`[createStaffAccount] ✅ User profile written to Firestore.`);

      // ==========================================
      // ISOLATED EMAIL LOGIC
      // ==========================================
      let emailSent = true;
      let emailErrorMsg = "";

      try {
        console.log(
          "[createStaffAccount] 📧 Generating password reset link...",
        );

        // Generate Secure Reset Link & Extract oobCode
        const defaultFirebaseLink = await admin
          .auth()
          .generatePasswordResetLink(email);

        const urlObj = new URL(defaultFirebaseLink);
        const oobCode = urlObj.searchParams.get("oobCode");

        // Construct the clean mLab React Link
        const customReactLink = `${APP_URL}/reset-password?oobCode=${oobCode}`;

        // Format Role for Email Display
        const displayRole =
          role === "admin" && isSuperAdmin
            ? "Super Administrator"
            : role.charAt(0).toUpperCase() + role.slice(1).replace("_", " ");

        const emailParams = {
          title: "Welcome to mLab",
          subtitle: "Action Required: Activate your account",
          recipientName: fullName,
          bodyHtml: `
            <p>Welcome to the <strong>mLab Assessment Platform</strong>! Your account has been successfully provisioned, and you have been granted access as a <strong>${displayRole}</strong>.</p>
            
            <p>For security reasons, we do not auto-generate passwords. To gain access to the platform and your dashboard, you must first create your own private password. Please follow these steps carefully:</p>
            
            <ol style="margin-top: 15px; margin-bottom: 25px; padding-left: 20px; color: #475569; line-height: 1.6;">
                <li style="margin-bottom: 8px;">Click the <strong>Create My Password</strong> button below to open the secure setup page.</li>
                <li style="margin-bottom: 8px;">Enter and confirm a strong password that you will remember.</li>
                <li style="margin-bottom: 8px;">Once saved, you will be redirected to the main login screen. Use your email address and your new password to sign in.</li>
            </ol>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                <p style="margin: 0; color: #475569; font-size: 13px;"><strong>Bookmark Your Portal:</strong><br/> 
                After your password is created, you can access your dashboard directly at any time by visiting:<br/>
                <a href="${APP_URL}/login" style="color: #0ea5e9; font-weight: bold; text-decoration: none;">${APP_URL}/login</a></p>
            </div>

            <p>If you require any assistance getting started, please reach out to your mLab system administrator.</p>
          `,
          ctaText: "Create My Password",
          ctaLink: customReactLink,
          showStepIndicator: false,
        };

        console.log("[createStaffAccount] 📧 Sending request to Mailgun...");
        await sendMailgunEmail({
          to: email,
          subject: `Action Required: Access Granted - ${displayRole}`,
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        });

        console.log(
          "[createStaffAccount] ✅ Email successfully dispatched via Mailgun.",
        );
      } catch (emailError: any) {
        // We catch the email error so it doesn't crash the whole function
        console.error(
          "[createStaffAccount] ⚠️ MAILGUN ERROR: Failed to send welcome email:",
          emailError,
        );
        emailSent = false;
        emailErrorMsg = emailError.message || "Unknown mailer error";
      }

      // Return a successful response regardless of email success,
      // but inform the frontend if the email failed to send.
      console.log(
        `[createStaffAccount] 🏁 COMPLETE. Success: true. Email Sent: ${emailSent}`,
      );
      return {
        success: true,
        message:
          `Account created successfully.` +
          (!emailSent
            ? ` However, the welcome email failed to send: ${emailErrorMsg}`
            : ""),
        uid: userRecord.uid,
        emailSent: emailSent,
      };
    } catch (error: any) {
      console.error(
        "[createStaffAccount] ❌ FATAL ERROR during account creation:",
        error,
      );
      throw new HttpsError(
        "internal",
        error.message || "Unable to create account.",
      );
    }
  },
);

export const createLearnerAccount = onRequest(
  { secrets: [mailgunSecret] },
  (req, res) => {
    return cors(req, res, async () => {
      try {
        if (req.method !== "POST")
          return res.status(405).send("Method Not Allowed");

        const { email, fullName, role } = req.body.data || req.body;

        if (!email || !fullName)
          return res.status(400).send({
            data: { success: false, message: "Missing email or name" },
          });

        let uid: string;
        let isNewUser = false;

        // Create or Fetch the Auth User
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
          } else throw error;
        }

        // Set Custom User Claims
        await admin
          .auth()
          .setCustomUserClaims(uid, { role: role || "learner" });

        // 3. Create or Update the Global 'users' Document
        const userRef = admin.firestore().collection("users").doc(uid);
        const userDoc = await userRef.get();
        if (!userDoc.exists)
          await userRef.set({
            email,
            fullName,
            role: role || "learner",
            createdAt: new Date().toISOString(),
          });

        // Link Auth UID to the existing 'learners' collection document
        const snapshot = await admin
          .firestore()
          .collection("learners")
          .where("email", "==", email)
          .get();

        if (!snapshot.empty)
          await snapshot.docs[0].ref.update({
            authUid: uid,
            status: "active",
            lastSynced: new Date().toISOString(),
          });

        // Generate Secure Reset Link & Extract oobCode
        const defaultFirebaseLink = await admin
          .auth()
          .generatePasswordResetLink(email);
        const urlObj = new URL(defaultFirebaseLink);
        const oobCode = urlObj.searchParams.get("oobCode");

        // Construct the clean mLab React Link
        const customReactLink = `${APP_URL}/reset-password?oobCode=${oobCode}`;

        const emailParams = {
          title: "Welcome to mLab",
          subtitle: "Action Required: Activate your learner portal",
          recipientName: fullName,
          bodyHtml: `
            <p>Welcome to the <strong>mLab Assessment Platform</strong>! You have been officially registered as a <strong>Learner</strong>.</p>
            
            <p>This platform is where you will access your learning materials, submit your Portfolios of Evidence (PoE), and track your academic progress.</p>
            
            <p>Before you can log in to see your enrolled modules, you need to set up your account credentials. Please follow these instructions:</p>
            
            <ol style="margin-top: 15px; margin-bottom: 25px; padding-left: 20px; color: #475569; line-height: 1.6;">
                <li style="margin-bottom: 8px;">Click the <strong>Create My Password</strong> button below.</li>
                <li style="margin-bottom: 8px;">Type in a secure password and save it.</li>
                <li style="margin-bottom: 8px;">Return to the login screen and sign in using your email address and your newly created password.</li>
            </ol>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                <p style="margin: 0; color: #475569; font-size: 13px;"><strong>Bookmark Your Learner Portal:</strong><br/> 
                Always use this official link to log in to your account moving forward:<br/>
                <a href="${APP_URL}/login" style="color: #0ea5e9; font-weight: bold; text-decoration: none;">${APP_URL}/login</a></p>
            </div>
          `,
          ctaText: "Create My Password",
          ctaLink: customReactLink,
          showStepIndicator: true,
        };

        await sendMailgunEmail({
          to: email,
          subject: "Welcome to mLab - Activate Your Account",
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        });

        return res.status(200).send({
          data: { success: true, uid: uid, wasNewlyCreated: isNewUser },
        });
      } catch (error: any) {
        console.error("Critical Error:", error);
        return res
          .status(500)
          .send({ data: { success: false, message: error.message } });
      }
    });
  },
);

export const deleteStaffAccount = onCall(async (request) => {
  const { uid } = request.data;
  const auth = request.auth;

  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(auth.uid)
    .get();

  if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Admins can permanently delete staff accounts.",
    );
  }

  if (!uid) {
    throw new HttpsError("invalid-argument", "Target UID is required.");
  }

  // Prevent accidental self-deletion
  if (auth.uid === uid) {
    throw new HttpsError(
      "invalid-argument",
      "You cannot delete your own active session.",
    );
  }

  try {
    // Delete from Firebase Authentication
    try {
      await admin.auth().deleteUser(uid);
    } catch (authErr: any) {
      // If they are already deleted from auth, just log it and proceed to clean up Firestore
      if (authErr.code !== "auth/user-not-found") throw authErr;
    }

    // Delete from Firestore
    await admin.firestore().collection("users").doc(uid).delete();

    return { success: true, message: "Staff member permanently deleted." };
  } catch (error: any) {
    console.error("Error deleting staff:", error);
    throw new HttpsError(
      "internal",
      error.message || "Failed to fully delete staff account.",
    );
  }
});

export const sendCustomPasswordReset = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
    const { email } = request.data;

    if (!email) {
      throw new HttpsError("invalid-argument", "Email address is required.");
    }

    try {
      // Check if user exists in Firebase Auth
      const userRecord = await admin.auth().getUserByEmail(email);

      // Fetch the actual name from the Firestore 'users' collection
      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userRecord.uid)
        .get();
      const userData = userDoc.data();
      const actualName =
        userData?.fullName || userRecord.displayName || "Member";

      // Generate the standard Firebase link
      // (We still need to generate this so Firebase creates the valid oobCode in the backend)
      const defaultFirebaseLink = await admin
        .auth()
        .generatePasswordResetLink(email);

      // Extract the secret "oobCode" from the Firebase link
      const urlObj = new URL(defaultFirebaseLink);
      const oobCode = urlObj.searchParams.get("oobCode");

      // Construct your 100% Custom React Link pointing to your new ResetPassword.tsx page
      const customReactLink = `${APP_URL}/reset-password?oobCode=${oobCode}`;

      // Prepare the custom mLab branded email
      const emailParams = {
        title: "Password Reset Request",
        subtitle: "Securely regain access to your account",
        recipientName: actualName,
        bodyHtml: `
          <p>A request has been made to reset the password for your account on the <strong>mLab Assessment Platform</strong>.</p>
          <p>To proceed with the reset, please click the secure button below.</p>
          
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
              <p style="margin: 0; color: #475569; font-size: 13px;"><strong>Platform Access:</strong><br/> 
              Once your password is reset, you can access your dashboard at any time by visiting:<br/>
              <a href="${APP_URL}" style="color: #0ea5e9; font-weight: bold; text-decoration: none;">${APP_URL}</a></p>
          </div>

          <p>If you did not initiate this request, you can safely ignore this email. Your password will remain unchanged.</p>
        `,
        ctaText: "Reset My Password",
        ctaLink: customReactLink,
        showStepIndicator: false,
      };

      await sendMailgunEmail({
        to: email,
        subject: "Action Required: Reset Your Password",
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });

      return { success: true, message: "Custom reset email sent." };
    } catch (error: any) {
      logger.error("Password Reset Error:", error);

      if (error.code === "auth/user-not-found") {
        throw new HttpsError("not-found", "No account found with that email.");
      }

      throw new HttpsError("internal", error.message);
    }
  },
);

export const onCohortCreated = onDocumentCreated(
  { document: "cohorts/{cohortId}", secrets: [mailgunSecret] },
  async (event) => {
    const cohort = event.data?.data();
    if (!cohort) return;

    const {
      name,
      startDate,
      endDate,
      facilitatorId,
      assessorId,
      moderatorId,
      learnerIds,
    } = cohort;

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
        const params = {
          title: `Assignment: Facilitator`,
          subtitle: name,
          recipientName: facilitator.fullName,
          bodyHtml: `<p>You have been assigned as the <strong>Facilitator</strong> for the class <strong>${name}</strong>.</p>
                     <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                        <p style="margin: 0; color: #475569;"><strong>Duration:</strong> ${startDate} to ${endDate}<br/><strong>Learners:</strong> ${learnerIds.length} enrolled</p>
                     </div>
                     <p>Please log in to view your class register and manage attendance.</p>`,
          ctaText: "Login to Dashboard",
          ctaLink: `${APP_URL}/login`,
          showStepIndicator: false,
        };
        await sendMailgunEmail({
          to: facilitator.email,
          subject: `Assignment: Facilitator for ${name}`,
          text: buildMlabEmailPlainText(params),
          html: buildMlabEmailHtml(params),
        });
      }

      if (assessor?.email) {
        const params = {
          title: `Assignment: Assessor`,
          subtitle: name,
          recipientName: assessor.fullName,
          bodyHtml: `<p>You have been assigned as the <strong>Assessor (Red Pen)</strong> for <strong>${name}</strong>.</p>
                     <p>You can now access learner Workbooks and POEs for grading.</p>`,
          ctaText: "Login to Assess",
          ctaLink: `${APP_URL}/login`,
          showStepIndicator: false,
        };
        await sendMailgunEmail({
          to: assessor.email,
          subject: `Assignment: Assessor for ${name}`,
          text: buildMlabEmailPlainText(params),
          html: buildMlabEmailHtml(params),
        });
      }

      if (moderator?.email) {
        const params = {
          title: `Assignment: Moderator`,
          subtitle: name,
          recipientName: moderator.fullName,
          bodyHtml: `<p>You have been assigned as the <strong>Moderator (Green Pen)</strong> for <strong>${name}</strong>.</p>
                     <p>You will be notified when batches are ready for moderation.</p>`,
          ctaText: "Login to Moderate",
          ctaLink: `${APP_URL}/login`,
          showStepIndicator: false,
        };
        await sendMailgunEmail({
          to: moderator.email,
          subject: `Assignment: Moderator for ${name}`,
          text: buildMlabEmailPlainText(params),
          html: buildMlabEmailHtml(params),
        });
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

          const params = {
            title: `Enrolled in Class`,
            subtitle: name,
            recipientName: learner.fullName,
            bodyHtml: `<p>You have been successfully enrolled in the class: <strong>${name}</strong>.</p>
                       <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #94c73d; margin: 20px 0;">
                          <p style="margin: 0; color: #475569;"><strong>Your Team:</strong><br/>Facilitator: ${facilitator?.fullName || "TBD"}<br/>Assessor: ${assessor?.fullName || "TBD"}</p>
                       </div>
                       <p>You can access your learning materials and submit assessments via the portal.</p>`,
            ctaText: "Access Learner Portal",
            ctaLink: `${APP_URL}/portal`,
            showStepIndicator: false,
          };
          return sendMailgunEmail({
            to: learner.email,
            subject: `Enrolled: ${name}`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        });
        await Promise.all(emailPromises);
      }
    } catch (error) {
      console.error("Error sending cohort notifications:", error);
    }
  },
);

export const sendAdHocCertificate = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
    if (!request.auth)
      throw new HttpsError("unauthenticated", "Authentication required.");
    const { email, recipientName, pdfUrl, awardTitle, courseName } =
      request.data;

    const emailParams = {
      title: `Your Certificate: ${awardTitle}`,
      subtitle: courseName,
      recipientName: recipientName,
      bodyHtml: `<p>We are pleased to share your certificate of <strong>${awardTitle}</strong> for <strong>${courseName}</strong>.</p>`,
      ctaText: "Download Certificate (PDF)",
      ctaLink: pdfUrl,
      showStepIndicator: false,
    };

    try {
      await sendMailgunEmail({
        to: email,
        subject: `Your Certificate: ${awardTitle} - ${courseName}`,
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });
      return { success: true, message: "Email sent successfully" };
    } catch (error: any) {
      console.error("Email Error:", error);
      throw new HttpsError("internal", error);
    }
  },
);

export const onAssessmentCollaboratorAdded = onDocumentUpdated(
  { document: "assessments/{assessmentId}", secrets: [mailgunSecret] },
  async (event) => {
    // Safety check to ensure data exists
    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (!beforeData || !afterData) return;

    const beforeCollabs = beforeData.collaboratorIds || [];
    const afterCollabs = afterData.collaboratorIds || [];

    // Find newly added collaborators
    const newCollabs = afterCollabs.filter(
      (id: string) => !beforeCollabs.includes(id),
    );

    // If no new collaborators were added, stop running to save compute time
    if (newCollabs.length === 0) return;

    const db = admin.firestore();
    const batch = db.batch();

    // In v2, wildcards are accessed via event.params
    const assessmentId = event.params.assessmentId;
    const workbookTitle = afterData.title || "Untitled Workbook";
    const workbookLink = `${APP_URL}/facilitator/assessments/builder/${assessmentId}`;

    const emailPromises: Promise<any>[] = [];

    for (const userId of newCollabs) {
      // Fetch the INVITER (who made the change)
      let inviterName = "A colleague";
      if (afterData.lastUpdatedBy) {
        const inviterDoc = await db
          .collection("users")
          .doc(afterData.lastUpdatedBy)
          .get();
        if (inviterDoc.exists) {
          inviterName = inviterDoc.data()?.fullName || inviterName;
        }
      }

      // Fetch the INVITED USER (to get their email and name)
      const invitedDoc = await db.collection("users").doc(userId).get();
      if (!invitedDoc.exists) continue; // Skip if user no longer exists

      const invitedData = invitedDoc.data();
      const invitedEmail = invitedData?.email;
      const invitedName = invitedData?.fullName || "Staff Member";

      // Create the In-App Notification Document
      const notifRef = db
        .collection("users")
        .doc(userId)
        .collection("notifications")
        .doc();

      batch.set(notifRef, {
        id: notifRef.id,
        title: "New Collaboration Invite",
        message: `<strong>${inviterName}</strong> added you as a collaborator on: "${workbookTitle}"`,
        type: "collaboration",
        link: `/facilitator/assessments/builder/${assessmentId}`,
        isRead: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Queue the Mailgun Email if they have an email address
      if (invitedEmail) {
        const emailParams = {
          title: "Collaboration Invite",
          subtitle: workbookTitle,
          recipientName: invitedName,
          bodyHtml: `
            <p><strong>${inviterName}</strong> has invited you to collaborate on a curriculum workbook in the mLab Assessment Center.</p>
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #94c73d; margin: 20px 0;">
                <p style="margin: 0; color: #073f4e; font-size: 13px;"><strong>Role:</strong> Authorized Collaborator</p>
            </div>
            <p>You now have full access to view, edit, and update the criteria for this assessment block.</p>
          `,
          ctaText: "Open Workbook",
          ctaLink: workbookLink,
          showStepIndicator: false,
        };

        emailPromises.push(
          sendMailgunEmail({
            to: invitedEmail,
            subject: `Collaboration Invite: ${workbookTitle}`,
            text: buildMlabEmailPlainText(emailParams),
            html: buildMlabEmailHtml(emailParams),
          }),
        );
      }
    }

    // Commit notifications to DB, then send all queued emails
    await batch.commit();
    await Promise.all(emailPromises).catch((err) =>
      logger.error("Failed to send collaborator invite emails", err),
    );
  },
);

export const onSubmissionStatusChange = onDocumentUpdated(
  { document: "learner_submissions/{submissionId}", secrets: [mailgunSecret] },
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

    const getUser = async (uid: string) =>
      uid ? (await db.collection("users").doc(uid).get()).data() : null;
    const getLearner = async (uid: string) =>
      uid ? (await db.collection("learners").doc(uid).get()).data() : null;
    const getCohortStaff = async () =>
      cohortId
        ? (await db.collection("cohorts").doc(cohortId).get()).data() || {}
        : {};

    try {
      const cohortStaff = await getCohortStaff();

      if (
        beforeData.status !== "submitted" &&
        afterData.status === "submitted"
      ) {
        const assessor = await getUser(
          afterData.gradedBy || cohortStaff.assessorId,
        );
        const facilitator = await getUser(cohortStaff.facilitatorId);
        const learner = await getLearner(learnerId);

        if (assessor?.email) {
          const params = {
            title: `New PoE Submitted`,
            subtitle: moduleName,
            recipientName: assessor.fullName || "Assessor",
            bodyHtml: `<p><strong>${learner?.fullName}</strong> has just submitted their Portfolio of Evidence for <strong>${moduleName}</strong>.</p>
                       <p>The submission is now waiting in your queue to be graded.</p>`,
            ctaText: "Review & Grade",
            ctaLink: `${APP_URL}/assessments/grade/${submissionId}`,
            showStepIndicator: false,
          };
          await sendMailgunEmail({
            to: assessor.email,
            subject: `Action Required: New PoE Submitted`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        }

        if (facilitator?.email) {
          const params = {
            title: `Learner Progress Update`,
            subtitle: moduleName,
            recipientName: facilitator.fullName || "Facilitator",
            bodyHtml: `<p>Your learner, <strong>${learner?.fullName}</strong>, has successfully submitted their work for <strong>${moduleName}</strong>.</p>
                       <p>The assessment has been routed to the cohort Assessor for grading.</p>`,
            ctaText: "View Class Progress",
            ctaLink: `${APP_URL}/cohorts/${cohortId}`,
            showStepIndicator: false,
          };
          await sendMailgunEmail({
            to: facilitator.email,
            subject: `Progress Update: ${learner?.fullName}`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        }
      }

      if (beforeData.status !== "graded" && afterData.status === "graded") {
        const moderator = await getUser(
          afterData.moderation?.moderatedBy || cohortStaff.moderatorId,
        );
        const learner = await getLearner(learnerId);
        const marks = afterData.marks || 0;
        const totalMarks = afterData.totalMarks || 100;
        const competency =
          afterData.competency === "C" ? "Competent" : "Not Yet Competent";

        if (moderator?.email) {
          const params = {
            title: `Grading Finalized for Moderation`,
            subtitle: moduleName,
            recipientName: moderator.fullName || "Moderator",
            bodyHtml: `<p>An Assessor has finalized the grading for <strong>${learner?.fullName}</strong> on <strong>${moduleName}</strong>.</p>
                       <p>This submission is now available for your internal moderation and quality assurance review.</p>`,
            ctaText: "Moderate Grade",
            ctaLink: `${APP_URL}/assessments/moderate/${submissionId}`,
            showStepIndicator: false,
          };
          await sendMailgunEmail({
            to: moderator.email,
            subject: `Grading Finalized: ${moduleName}`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        }

        if (learner?.email) {
          const params = {
            title: `Assessment Graded`,
            subtitle: moduleName,
            recipientName: learner.fullName || "Learner",
            bodyHtml: `<p>Your assessment for <strong>${moduleName}</strong> has been graded!</p>
                       <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                          <p style="margin: 0; color: #475569;"><strong>Score:</strong> ${marks} / ${totalMarks}<br/><strong>Outcome:</strong> ${competency}</p>
                       </div>
                       <p>Log in to your portal to read your Assessor's feedback.</p>`,
            ctaText: "View Feedback",
            ctaLink: `${APP_URL}/portal/assessments/${submissionId}`,
            showStepIndicator: false,
          };
          await sendMailgunEmail({
            to: learner.email,
            subject: `Assessment Graded: ${moduleName}`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        }
      }

      const wasRejected =
        afterData.status === "rework" ||
        (afterData.moderation?.status === "rejected" &&
          beforeData.moderation?.status !== "rejected");

      if (wasRejected) {
        const assessor = await getUser(
          afterData.gradedBy || cohortStaff.assessorId,
        );
        const moderatorName =
          afterData.moderation?.moderatorName || "The Internal Moderator";

        if (assessor?.email) {
          const params = {
            title: `Action Required: Moderation Rework`,
            subtitle: moduleName,
            recipientName: assessor.fullName || "Assessor",
            bodyHtml: `<p>${moderatorName} has requested a rework on your grading for <strong>${moduleName}</strong>.</p>
                       <div style="background-color: #fffbeb; padding: 15px; border-radius: 6px; border: 1px solid #fde68a; border-left: 4px solid #f59e0b; margin: 20px 0;">
                          <p style="margin: 0; color: #92400e;"><strong>Moderator Notes:</strong><br/><i>"${afterData.moderation?.feedback || "Please review the assessment again."}"</i></p>
                       </div>
                       <p>Please log in immediately to apply the required corrective actions.</p>`,
            ctaText: "Correct Assessment",
            ctaLink: `${APP_URL}/assessments/grade/${submissionId}`,
            showStepIndicator: false,
          };
          await sendMailgunEmail({
            to: assessor.email,
            subject: `Action Required: Moderation Rework`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        }
      }
    } catch (error) {
      console.error("Error processing submission notifications:", error);
    }
  },
);

export const onAssessmentCreated = onDocumentCreated(
  { document: "assessments/{assessmentId}", secrets: [mailgunSecret] },
  async (event) => {
    const data = event.data?.data();
    if (!data || !data.cohortId) return;

    const { title, cohortId, availableFrom, dueDate } = data;
    const db = admin.firestore();

    try {
      const cohortSnap = await db.collection("cohorts").doc(cohortId).get();
      const cohortData = cohortSnap.data();
      if (!cohortData || !cohortData.learnerIds) return;

      const emailPromises = cohortData.learnerIds.map(async (uid: string) => {
        const lSnap = await db.collection("learners").doc(uid).get();
        const learner = lSnap.data();
        if (!learner?.email) return;

        const params = {
          title: `New Assessment Available`,
          subtitle: title,
          recipientName: learner.fullName || "Learner",
          bodyHtml: `<p>A new assessment <strong>${title}</strong> has been assigned to your class.</p>
                     <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #e2e8f0; border-left: 4px solid #073f4e; margin: 20px 0;">
                        <p style="margin: 0; color: #475569;">
                          ${availableFrom ? `📅 <b>Scheduled Start:</b> ${availableFrom}<br/>` : ""}
                          ${dueDate ? `⏰ <b>Submission Deadline:</b> ${dueDate}` : ""}
                        </p>
                     </div>
                     <p>Please log in to your learner portal to review the requirements and start your submission.</p>`,
          ctaText: "Go to Assessment",
          ctaLink: `${APP_URL}/portal/assessments`,
          showStepIndicator: false,
        };

        return sendMailgunEmail({
          to: learner.email,
          subject: `New Assessment: ${title}`,
          text: buildMlabEmailPlainText(params),
          html: buildMlabEmailHtml(params),
        });
      });

      await Promise.all(emailPromises);
    } catch (error) {
      console.error("Error sending new assessment alerts:", error);
    }
  },
);

export const onLearnerBlockchainVerified = onDocumentUpdated(
  { document: "learners/{learnerId}", secrets: [mailgunSecret] },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    if (!beforeData.isBlockchainVerified && afterData.isBlockchainVerified) {
      const { email, fullName, verificationCode } = afterData;
      const qualName = afterData.qualification?.name || "Qualification";

      if (email && verificationCode) {
        const params = {
          title: `Official Credential Minted`,
          subtitle: qualName,
          recipientName: fullName || "Learner",
          bodyHtml: `<p>Your official Statement of Results for <strong>${qualName}</strong> has been successfully minted to the blockchain.</p>
                     <p>This means your academic credential is now permanently secured, immutable, and instantly verifiable by future employers.</p>
                     <div style="background-color: #f0fdf4; padding: 15px; border-radius: 6px; border: 1px solid #bbf7d0; border-left: 4px solid #16a34a; margin: 20px 0;">
                        <p style="margin: 0; color: #166534;"><strong>Your Verification ID:</strong> ${verificationCode}</p>
                     </div>
                     <p>You can view, download, and share your official digital credential using your public verification link below:</p>`,
          ctaText: "View Official Credential",
          ctaLink: `${APP_URL}/sor/${verificationCode}`,
          showStepIndicator: false,
        };

        try {
          await sendMailgunEmail({
            to: email,
            subject: `🎉 Official Credential Minted: ${qualName}`,
            text: buildMlabEmailPlainText(params),
            html: buildMlabEmailHtml(params),
          });
        } catch (error) {
          console.error("Error sending blockchain verification email:", error);
        }
      }
    }
  },
);

export const sendCustomVerificationEmail = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
    const authCtx = request.auth;
    if (!authCtx) throw new HttpsError("unauthenticated", "Must be logged in.");

    const userEmail = authCtx.token.email;
    const uid = authCtx.uid;
    if (!userEmail)
      throw new HttpsError("invalid-argument", "No email found for this user.");

    try {
      let userName = authCtx.token.name;
      if (!userName) {
        const userDoc = await admin
          .firestore()
          .collection("users")
          .doc(uid)
          .get();
        if (userDoc.exists) userName = userDoc.data()?.fullName;
      }
      userName = userName || "there";

      const verificationLink = await admin
        .auth()
        .generateEmailVerificationLink(userEmail);

      const emailParams = {
        title: "Verify Your Email",
        subtitle: "Secure your account to access your platform dashboard",
        recipientName: userName,
        bodyHtml: `<p>Welcome to the mLab Assessment Platform. To secure your credentials and unlock your platform dashboard, please verify your email address by clicking the button below.</p>
                   <div style="margin: 20px 0; padding: 14px 18px; background-color: #e4edf0; border: 1px solid #dde4e8; border-left: 4px solid #073f4e;">
                      <p style="margin: 0; font-size: 9px; font-weight: bold; text-transform: uppercase; color: #9b9b9b;">Verification Recipient</p>
                      <p style="margin: 0; font-size: 16px; font-weight: bold; color: #073f4e;">${userEmail}</p>
                   </div>`,
        ctaText: "Verify Email Address",
        ctaLink: verificationLink,
        showStepIndicator: true,
      };

      await sendMailgunEmail({
        to: userEmail,
        subject: "Verify Your mLab Account",
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });

      return { success: true, message: "Verification email sent." };
    } catch (error: any) {
      console.error("Email Error:", error);
      throw new HttpsError("internal", error.message || "Failed to send email");
    }
  },
);

// ============================================================================
// BLOCKCHAIN LOGIC
// ============================================================================
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
      console.log(`Uploaded to IPFS! Hash: ${ipfsHash}`);
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

      console.log(`Minted successfully! TX: ${receipt.hash}`);

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

// // ============================================================================
// // PDF GENERATION LOGIC (generateMasterPoE)
// // ============================================================================

// interface UploadedDoc {
//   id: string;
//   name: string;
//   url: string;
// }
// interface EvidenceFile {
//   index: number;
//   url: string;
//   label: string;
// }
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
//   attemptNumber?: number;
//   answers?: Record<string, any>;
//   facilitatorId?: string;
//   assessorId?: string;
//   moderatorId?: string;
//   facilitatorName?: string;
//   facilitatorOverallFeedback?: string;
//   facilitatorReviewedAt?: string;
//   gradedAt?: string;
//   assignedAt?: string;
//   learnerDeclaration?: {
//     learnerName?: string;
//     learnerIdNumber?: string;
//     learnerAuthUid?: string;
//     timestamp?: string;
//     signatureUrl?: string; // SNAPSHOT FIELD
//   };
//   grading?: {
//     facilitatorName?: string;
//     facilitatorOverallFeedback?: string;
//     facilitatorReviewedAt?: string;
//     facilitatorId?: string;
//     facilitatorSignatureUrl?: string; // SNAPSHOT FIELD
//     assessorName?: string;
//     assessorOverallFeedback?: string;
//     assessorRegNumber?: string;
//     assessorId?: string;
//     assessorSignatureUrl?: string; // SNAPSHOT FIELD
//     gradedAt?: string;
//     gradedBy?: string;
//     facilitatorBreakdown?: Record<string, any>;
//     assessorBreakdown?: Record<string, any>;
//   };
//   moderation?: {
//     moderatorId?: string;
//     moderatedBy?: string;
//     moderatorName?: string;
//     moderatorRegNumber?: string;
//     moderatedAt?: string;
//     moderatorSignatureUrl?: string; // SNAPSHOT FIELD
//     feedback?: string;
//     breakdown?: Record<string, any>;
//   };
//   appeal?: {
//     date?: string;
//     reason?: string;
//     status?: string;
//     outcome?: string;
//     reviewedBy?: string;
//     reviewedByName?: string;
//     reviewedAt?: string;
//     resolvedBy?: string;
//     resolvedByName?: string;
//     resolvedBySignatureUrl?: string; // SNAPSHOT FIELD
//     resolvedAt?: string;
//     resolutionNotes?: string;
//   };
//   latestCoachingLog?: {
//     date?: string;
//     notes?: string;
//     facilitatorId?: string;
//     facilitatorName?: string;
//     facilitatorSignatureUrl?: string; // SNAPSHOT FIELD
//     acknowledged?: boolean;
//     acknowledgedAt?: string;
//     learnerSignatureUrl?: string; // SNAPSHOT FIELD
//   };
//   [key: string]: any;
// }

// const fetchFileBuffer = async (url: string): Promise<Buffer | null> => {
//   try {
//     // @ts-ignore - Bypasses ts(7016)
//     const fetch = (await import("node-fetch")).default;
//     const res = await fetch(url);
//     if (!res.ok) throw new Error(`Failed to fetch ${url}`);
//     return Buffer.from(await res.arrayBuffer());
//   } catch (error) {
//     console.error("Buffer fetch error:", error);
//     return null;
//   }
// };

// const POE_STYLES = `
//   @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');
//   @page { size: A4; margin: 15mm 16mm 22mm; }
//   @page :first { margin-top: 0; }
//   *, *::before, *::after { box-sizing: border-box; }
//   body {
//     font-family: 'Trebuchet MS', 'Lucida Grande', Arial, sans-serif;
//     font-size: 11px;
//     color: #1a2e35;
//     line-height: 1.5;
//     margin: 0; padding: 0;
//     background: #ffffff;
//     -webkit-print-color-adjust: exact;
//     print-color-adjust: exact;
//   }
//   .pb { page-break-after: always; }
//   .pbi { page-break-inside: avoid; }
//   .cover { height: 100vh; display: flex; flex-direction: column; background: #073f4e; overflow: hidden; position: relative; }
//   .cover__pattern { position: absolute; inset: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(148,199,61,0.05) 32px, rgba(148,199,61,0.05) 33px), repeating-linear-gradient(45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px); pointer-events: none; }
//   .cover__accent { display: flex; height: 8px; flex-shrink: 0; }
//   .cover__accent-blue  { flex: 1; background: #052e3a; }
//   .cover__accent-green { width: 100px; background: #94c73d; }
//   .cover__header { display: flex; align-items: center; justify-content: space-between; padding: 28px 40px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; position: relative; }
//   .cover__logo { height: 52px; object-fit: contain; }
//   .cover__org { text-align: right; }
//   .cover__org-name { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ffffff; display: block; }
//   .cover__org-tag { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block; margin-top: 3px; }
//   .cover__body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; position: relative; }
//   .cover__doc-type { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
//   .cover__doc-type::before, .cover__doc-type::after { content: ''; display: block; height: 1px; width: 40px; background: rgba(148,199,61,0.4); }
//   .cover__title { font-family: 'Oswald', sans-serif; font-size: 42px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #ffffff; margin: 0 0 8px; line-height: 1; }
//   .cover__subtitle { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 400; letter-spacing: 0.2em; text-transform: uppercase; color: rgba(255,255,255,0.45); margin: 0 0 48px; }
//   .cover__id-card { width: 100%; max-width: 560px; border: 1px solid rgba(255,255,255,0.12); border-top: 3px solid #94c73d; background: rgba(255,255,255,0.05); padding: 0; text-align: left; }
//   .cover__id-row { display: flex; align-items: stretch; border-bottom: 1px solid rgba(255,255,255,0.07); }
//   .cover__id-row:last-child { border-bottom: none; }
//   .cover__id-label { width: 160px; flex-shrink: 0; padding: 10px 14px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: rgba(255,255,255,0.35); background: rgba(0,0,0,0.1); border-right: 1px solid rgba(255,255,255,0.06); display: flex; align-items: center; }
//   .cover__id-value { padding: 10px 16px; font-size: 12px; font-weight: 600; color: #ffffff; display: flex; align-items: center; flex: 1; }
//   .cover__footer { padding: 16px 40px; border-top: 1px solid rgba(255,255,255,0.06); display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; position: relative; }
//   .cover__footer-ref { font-family: 'Oswald', sans-serif; font-size: 8px; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.25); }
//   .cover__footer-date { font-size: 9px; color: rgba(255,255,255,0.25); }
//   .cover__accent-bottom { display: flex; height: 8px; flex-shrink: 0; }
//   .cover__accent-bottom-green { width: 100px; background: #94c73d; }
//   .cover__accent-bottom-blue  { flex: 1; background: #052e3a; }
//   .divider { height: 100vh; background: #073f4e; display: flex; flex-direction: column; position: relative; overflow: hidden; }
//   .divider__pattern { position: absolute; inset: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px); pointer-events: none; }
//   .divider__accent { display: flex; height: 6px; flex-shrink: 0; }
//   .divider__accent-blue  { flex: 1; background: #052e3a; }
//   .divider__accent-green { width: 80px; background: #94c73d; }
//   .divider__body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 60px 80px; text-align: center; position: relative; }
//   .divider__num { font-family: 'Oswald', sans-serif; font-size: 100px; font-weight: 700; color: rgba(255,255,255,0.06); line-height: 1; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -54%); user-select: none; pointer-events: none; }
//   .divider__section-label { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 14px; }
//   .divider__title { font-family: 'Oswald', sans-serif; font-size: 36px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #ffffff; margin: 0 0 16px; line-height: 1.1; position: relative; }
//   .divider__desc { font-size: 12px; color: rgba(255,255,255,0.4); max-width: 440px; line-height: 1.7; position: relative; }
//   .divider__accent-bottom { display: flex; height: 6px; flex-shrink: 0; }
//   .divider__accent-bottom-green { width: 80px; background: #94c73d; }
//   .divider__accent-bottom-blue  { flex: 1; background: #052e3a; }
//   .sec-header { display: flex; align-items: stretch; margin: 0 0 20px; border-top: 4px solid #073f4e; background: #073f4e; }
//   .sec-header__num { width: 48px; flex-shrink: 0; background: #94c73d; display: flex; align-items: center; justify-content: center; font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 700; color: #073f4e; }
//   .sec-header__text { padding: 10px 16px; flex: 1; }
//   .sec-header__title { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; margin: 0; line-height: 1.1; }
//   .sec-header__sub { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin: 3px 0 0; }
//   .sub-heading { font-family: 'Oswald', sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #073f4e; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #073f4e; display: flex; align-items: center; gap: 6px; }
//   .sub-heading::after { content: ''; display: block; height: 2px; flex: 1; background: #94c73d; margin-left: 6px; }
//   .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-bottom: 18px; }
//   .data-grid--1col { grid-template-columns: 1fr; }
//   .data-cell { background: #ffffff; padding: 9px 12px; }
//   .data-cell--span2 { grid-column: span 2; }
//   .data-cell__label { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #9b9b9b; display: block; margin-bottom: 3px; }
//   .data-cell__value { font-size: 11.5px; font-weight: 600; color: #073f4e; }
//   .poe-table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 10.5px; }
//   .poe-table thead tr { background: #073f4e; }
//   .poe-table th { padding: 8px 10px; text-align: left; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.85); border-right: 1px solid rgba(255,255,255,0.08); }
//   .poe-table td { padding: 7px 10px; border-bottom: 1px solid #e8eef1; border-right: 1px solid #e8eef1; color: #1a2e35; vertical-align: top; }
//   .poe-table tbody tr:nth-child(even) td { background: #f8fafb; }
//   .poe-table--accented td:first-child { border-left: 3px solid #94c73d; }
//   .poe-table--checklist td:nth-child(3) { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
//   .badge { display: inline-block; padding: 2px 8px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
//   .badge--c   { background: rgba(148,199,61,0.15); color: #3d6b0f; border: 1px solid rgba(148,199,61,0.4); }
//   .badge--nyc { background: rgba(239,68,68,0.1);   color: #b91c1c; border: 1px solid rgba(239,68,68,0.3); }
//   .badge--p   { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
//   .badge--attempt { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
//   .badge--attempt1 { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
//   .module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #e4edf0; border-left: 5px solid #073f4e; margin-bottom: 12px; }
//   .module-header__title { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #073f4e; margin: 0; }
//   .eval-box { border: 1px solid #dde4e8; border-top: 3px solid #073f4e; margin-bottom: 16px; page-break-inside: avoid; }
//   .eval-box__row { display: flex; align-items: flex-start; border-bottom: 1px solid #eef0f2; min-height: 32px; }
//   .eval-box__label { width: 150px; flex-shrink: 0; padding: 8px 12px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9b9b9b; background: #f8fafb; border-right: 1px solid #eef0f2; }
//   .eval-box__value { padding: 8px 14px; font-size: 11px; color: #1a2e35; flex: 1; }
//   .eval-box__divider { height: 1px; background: #dde4e8; margin: 0; }
//   .ink-fac { color: #1d4ed8 !important; }
//   .ink-ass { color: #b91c1c !important; }
//   .ink-mod { color: #15803d !important; }
//   .q-block { margin-bottom: 16px; border-bottom: 1px solid #eef0f2; padding-bottom: 14px; page-break-inside: avoid; }
//   .q-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #073f4e; color: #ffffff; font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; flex-shrink: 0; margin-right: 8px; }
//   .q-text { font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #073f4e; margin: 0 0 8px; display: flex; }
//   .a-text { background: #f8fafb; border: 1px solid #e4edf0; border-left: 4px solid #9b9b9b; padding: 9px 12px; font-size: 11px; white-space: pre-wrap; overflow-wrap: break-word; color: #1a2e35; }
//   .a-link { color: #0a5266; text-decoration: underline; font-weight: 600; }
//   .a-annex { margin-top: 6px; padding: 7px 10px; background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; font-size: 10px; }
//   .f-block { margin-top: 7px; border: 1px solid #e4edf0; border-top: 2px solid #dde4e8; font-size: 10px; }
//   .f-row { display: flex; align-items: flex-start; padding: 5px 10px; border-bottom: 1px solid #f0f4f6; gap: 6px; }
//   .f-role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; width: 90px; flex-shrink: 0; padding-top: 1px; }
//   .f-comment { line-height: 1.5; flex: 1; }
//   .openbook-notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; margin-bottom: 14px; font-size: 11px; page-break-inside: avoid; }
//   .openbook-notice__icon { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; color: #0369a1; }
//   .sig-bar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #94c73d; margin: 16px 0 0; page-break-inside: avoid; }
//   .sig-bar__label { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #6b6b6b; }
//   .sig-bar__img { max-height: 36px; max-width: 120px; object-fit: contain; mix-blend-mode: multiply; }
//   .sig-bar__pending { font-size: 9px; color: #9b9b9b; font-style: italic; }
//   .sig-bar__date { font-size: 9px; color: #6b6b6b; }
//   .sig-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-top: 20px; page-break-inside: avoid; }
//   .sig-cell { background: #ffffff; padding: 12px 10px; text-align: center; border-top: 3px solid #dde4e8; }
//   .sig-cell--learner  { border-top-color: #073f4e; }
//   .sig-cell--fac      { border-top-color: #1d4ed8; }
//   .sig-cell--assessor { border-top-color: #b91c1c; }
//   .sig-cell--mod      { border-top-color: #15803d; }
//   .sig-cell__role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #9b9b9b; margin-bottom: 8px; }
//   .sig-cell__img { max-height: 38px; max-width: 100%; object-fit: contain; mix-blend-mode: multiply; display: block; margin: 0 auto 6px; }
//   .sig-cell__placeholder { height: 38px; display: flex; align-items: center; justify-content: center; font-size: 9px; color: #c0c8cc; font-style: italic; margin-bottom: 6px; border: 1px dashed #dde4e8; }
//   .sig-cell__line { height: 1px; background: #dde4e8; margin: 0 0 5px; }
//   .sig-cell__name { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.04em; margin-bottom: 2px; }
//   .sig-cell__detail { font-size: 8px; }
//   .notice { padding: 12px 14px; margin: 0 0 14px; page-break-inside: avoid; }
//   .notice--green { background: rgba(148,199,61,0.07); border: 1px solid rgba(148,199,61,0.3); border-left: 5px solid #94c73d; }
//   .notice--grey { background: #f4f7f9; border: 1px solid #dde4e8; border-left: 5px solid #9b9b9b; }
//   .notice__title { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; margin: 0 0 5px; }
//   .coaching-card { border: 1px solid #dde4e8; border-left: 5px solid #d97706; background: #fffbeb; margin-bottom: 14px; page-break-inside: avoid; }
//   .coaching-card__head { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #fde68a; background: rgba(217,119,6,0.06); }
//   .coaching-card__title { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #92400e; margin: 0; }
//   .coaching-card__body { padding: 12px 14px; }
//   .appeal-card { border: 1px solid #fecaca; border-left: 5px solid #ef4444; background: #fef2f2; margin-bottom: 14px; page-break-inside: avoid; }
//   .appeal-card__head { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #fecaca; background: rgba(239,68,68,0.06); }
//   .appeal-card__title { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #b91c1c; margin: 0; }
//   .appeal-card__body { padding: 12px 14px; }
//   .history-box { border: 1px solid #fecaca; border-top: 3px solid #ef4444; margin-top: 18px; padding: 15px; background: #fef2f2; border-radius: 6px; page-break-inside: avoid; }
//   .history-box__header { padding-bottom: 8px; border-bottom: 1px solid #fecaca; font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; color: #b91c1c; text-transform: uppercase; margin-bottom: 12px; }
//   .history-attempt { padding-bottom: 10px; border-bottom: 1px dashed #fecaca; margin-bottom: 12px; }
//   .history-attempt:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
//   .history-attempt__title { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; color: #991b1b; margin: 0 0 4px; }
//   .history-files { margin-top: 8px; padding: 8px; background: #ffffff; border: 1px solid #fecaca; border-radius: 4px; font-size: 10px; }
//   .declaration { background: #f4f7f9; border: 1px solid #dde4e8; border-top: 3px solid #073f4e; padding: 16px; font-size: 11px; margin-bottom: 16px; }
//   .letter-body { border: 1px solid #dde4e8; padding: 24px 28px; font-size: 11.5px; background: #ffffff; margin-bottom: 20px; }
//   .text-center { text-align: center; }
// `;

// const sigCell = (
//   role: string,
//   cls: string,
//   sigUrl: string | null,
//   name: string,
//   detail: string,
//   date: string,
// ) => {
//   let ink = "";
//   if (cls === "fac") ink = "ink-fac";
//   if (cls === "assessor") ink = "ink-ass";
//   if (cls === "mod") ink = "ink-mod";

//   return `
//   <div class="sig-cell sig-cell--${cls}">
//     <div class="sig-cell__role">${role}</div>
//     ${sigUrl ? `<img src="${sigUrl}" class="sig-cell__img" />` : `<div class="sig-cell__placeholder">No signature</div>`}
//     <div class="sig-cell__line"></div>
//     <div class="sig-cell__name ${ink}">${name}</div>
//     ${detail ? `<div class="sig-cell__detail ${ink}">${detail}</div>` : ""}
//     <div class="sig-cell__detail ${ink}">${date}</div>
//   </div>`;
// };

// const dividerPage = (num: string, title: string, desc: string) => `
//   <div class="divider">
//     <div class="divider__pattern"></div>
//     <div class="divider__accent">
//       <div class="divider__accent-blue"></div>
//       <div class="divider__accent-green"></div>
//     </div>
//     <div class="divider__body">
//       <div class="divider__num">${num}</div>
//       <div class="divider__section-label">Section ${num}</div>
//       <h1 class="divider__title">${title}</h1>
//       <p class="divider__desc">${desc}</p>
//     </div>
//     <div class="divider__accent-bottom">
//       <div class="divider__accent-bottom-green"></div>
//       <div class="divider__accent-bottom-blue"></div>
//     </div>
//   </div>`;

// const sectionHeader = (num: string, title: string, sub?: string) => `
//   <div class="sec-header">
//     <div class="sec-header__num">${num}</div>
//     <div class="sec-header__text">
//       <div class="sec-header__title">${title}</div>
//       ${sub ? `<div class="sec-header__sub">${sub}</div>` : ""}
//     </div>
//   </div>`;

// const dc = (label: string, value: string, cls = "") =>
//   `<div class="data-cell ${cls}"><span class="data-cell__label">${label}</span><span class="data-cell__value">${value || "N/A"}</span></div>`;

// const outcomeBadge = (comp?: string) => {
//   if (comp === "C") return `<span class="badge badge--c">Competent</span>`;
//   if (comp === "NYC")
//     return `<span class="badge badge--nyc">Not Yet Competent</span>`;
//   return `<span class="badge badge--p">Pending</span>`;
// };

// export const generateMasterPoE = onDocumentCreated(
//   {
//     document: "poe_export_requests/{requestId}",
//     timeoutSeconds: 540,
//     memory: "2GiB",
//     region: "us-central1",
//     secrets: [mailgunSecret],
//   },
//   async (event) => {
//     const snap = event.data;
//     if (!snap) return;

//     const requestData = snap.data();
//     const requestId = event.params.requestId;
//     const learnerId = requestData.learnerId;
//     const requestedByUid = requestData.requestedBy;
//     let requesterEmail: string | null = null;

//     const updateProgress = async (percent: number, message: string) =>
//       snap.ref.update({ progress: percent, progressMessage: message });

//     const fmt = (d?: string | Date | null) => {
//       if (!d) return "N/A";
//       try {
//         const dt = new Date(d);
//         return isNaN(dt.getTime()) ? "N/A" : dt.toLocaleDateString("en-ZA");
//       } catch {
//         return "N/A";
//       }
//     };

//     try {
//       await updateProgress(5, "Initializing compliance engine…");

//       if (requestedByUid) {
//         try {
//           requesterEmail =
//             (await admin.auth().getUser(requestedByUid)).email || null;
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
//       const userDocSnap = await admin
//         .firestore()
//         .collection("users")
//         .doc(learner.authUid || learnerId)
//         .get();
//       const learnerUserDoc = userDocSnap.data() || {};

//       let enrollment: any = {};
//       if (learner.enrollmentId) {
//         const enrolSnap = await admin
//           .firestore()
//           .collection("enrollments")
//           .doc(learner.enrollmentId)
//           .get();
//         if (enrolSnap.exists) enrollment = enrolSnap.data() || {};
//       }

//       await updateProgress(15, "Fetching all evidence modules…");
//       const subsSnap = await admin
//         .firestore()
//         .collection("learner_submissions")
//         .where("learnerId", "==", learnerId)
//         .get();

//       const submissions: Submission[] = subsSnap.docs.map((d) => {
//         const data = d.data();
//         return {
//           id: d.id,
//           facilitatorId:
//             data.grading?.facilitatorId || data.facilitatorId || "",
//           assessorId:
//             data.grading?.assessorId ||
//             data.grading?.gradedBy ||
//             data.gradedBy ||
//             data.assessorId ||
//             "",
//           moderatorId:
//             data.moderation?.moderatorId ||
//             data.moderation?.moderatedBy ||
//             data.moderatorId ||
//             "",
//           attemptNumber: data.attemptNumber || 1,
//           ...data,
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
//       const primaryFacilitatorId = submissions.find(
//         (s) => s.facilitatorId,
//       )?.facilitatorId;
//       const appealedSubs = submissions.filter((s) => s.appeal);
//       const remediatedSubs = submissions.filter(
//         (s) => (s.attemptNumber || 1) > 1,
//       );

//       await updateProgress(25, "Retrieving digital signatures…");
//       const signaturesMap: Record<string, string> = {};
//       const userIdsToFetch = new Set<string>();
//       if (learner.authUid) userIdsToFetch.add(learner.authUid);
//       submissions.forEach((sub) => {
//         if (sub.facilitatorId) userIdsToFetch.add(sub.facilitatorId);
//         if (sub.assessorId) userIdsToFetch.add(sub.assessorId);
//         if (sub.moderatorId) userIdsToFetch.add(sub.moderatorId);
//         if (sub.appeal?.reviewedBy) userIdsToFetch.add(sub.appeal.reviewedBy);
//         if (sub.appeal?.resolvedBy) userIdsToFetch.add(sub.appeal.resolvedBy);
//         if (sub.latestCoachingLog?.facilitatorId)
//           userIdsToFetch.add(sub.latestCoachingLog.facilitatorId);
//       });

//       if (userIdsToFetch.size > 0) {
//         const userSnaps = await Promise.all(
//           Array.from(userIdsToFetch).map((uid) =>
//             admin.firestore().collection("users").doc(uid).get(),
//           ),
//         );
//         userSnaps.forEach((uSnap) => {
//           if (uSnap.exists) {
//             const uData = uSnap.data();
//             if (uData?.signatureUrl)
//               signaturesMap[uSnap.id] = uData.signatureUrl;
//           }
//         });
//       }

//       // =========================================================================================
//       // GLOBAL SIGNATURE RESOLUTION
//       // =========================================================================================
//       const latestSub = submissions[submissions.length - 1];
//       const primaryGradedSub = submissions.find((s) => s.assessorId);

//       // 1. THE "DAY 1" SIGNATURE (For POPIA, Induction, and Commitment)
//       let dayOneLearnerSigUrl = null;
//       if (
//         learnerUserDoc?.signatureHistory &&
//         learnerUserDoc.signatureHistory.length > 0
//       ) {
//         // Sort history by date ascending to get the oldest one
//         const sortedHistory = [...learnerUserDoc.signatureHistory].sort(
//           (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
//         );
//         dayOneLearnerSigUrl = sortedHistory[0].url;
//       } else {
//         dayOneLearnerSigUrl = learner.authUid
//           ? signaturesMap[learner.authUid]
//           : null;
//       }

//       // 2. THE "LATEST" SIGNATURE (For the Progress Report cover)
//       const latestLearnerSigUrl =
//         latestSub?.learnerDeclaration?.signatureUrl ||
//         (learner.authUid ? signaturesMap[learner.authUid] : null);

//       const primaryFacSigUrl =
//         submissions[0]?.grading?.facilitatorSignatureUrl ||
//         (primaryFacilitatorId ? signaturesMap[primaryFacilitatorId] : null);

//       const globalAssessorSigUrl =
//         primaryGradedSub?.grading?.assessorSignatureUrl ||
//         (primaryGradedSub?.assessorId
//           ? signaturesMap[primaryGradedSub.assessorId]
//           : null);

//       await updateProgress(30, "Building QCTO compliance document…");

//       const companyLogoUrl =
//         "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";
//       const offlineEvidenceFiles: EvidenceFile[] = [];

//       const progressRows = (subs: Submission[]) => {
//         if (!subs.length)
//           return `<tr><td colspan="4" class="empty-state">No modules mapped for this component.</td></tr>`;
//         return subs
//           .map((s) => {
//             const att = s.attemptNumber || 1;
//             const attBadge =
//               att > 1
//                 ? `<span class="badge badge--attempt">Attempt ${att}</span>`
//                 : `<span class="badge badge--attempt1">1st</span>`;
//             const compBadge = outcomeBadge(s.competency);
//             return `<tr>
//             <td style="font-family:'Oswald',sans-serif; font-weight:700; font-size:10px; color:#073f4e;">${s.moduleNumber || "N/A"}</td>
//             <td>${s.title || "Untitled"}</td>
//             <td class="text-center">${attBadge}</td>
//             <td class="text-center">${compBadge}</td>
//           </tr>`;
//           })
//           .join("");
//       };

//       const learningPlanRows = (subs: Submission[]) => {
//         if (!subs.length)
//           return `<tr><td colspan="8" class="empty-state">No modules mapped.</td></tr>`;
//         return subs
//           .map((s) => {
//             const facName =
//               s.grading?.facilitatorName || s.facilitatorName || "Pending";
//             const dateRange = `${fmt(s.assignedAt)} – ${fmt(s.gradedAt)}`;
//             const compBadge = outcomeBadge(s.competency);
//             return `<tr>
//             <td style="font-family:'Oswald',sans-serif; font-weight:700; font-size:9.5px; color:#073f4e;">${s.moduleNumber || "N/A"}</td>
//             <td><span class="ink-fac">${facName}</span></td>
//             <td style="font-size:10px;">${dateRange}</td>
//             <td class="text-center font-bold">${s.moduleType === "knowledge" ? "✓" : ""}</td>
//             <td class="text-center font-bold">${s.moduleType === "practical" ? "✓" : ""}</td>
//             <td class="text-center font-bold">${s.moduleType === "workplace" ? "✓" : ""}</td>
//             <td class="text-center">${s.competency === "C" ? compBadge : ""}</td>
//             <td class="text-center">${s.competency === "NYC" ? compBadge : ""}</td>
//           </tr>`;
//           })
//           .join("");
//       };

//       let html = `<!DOCTYPE html>
// <html lang="en">
// <head>
//   <meta charset="UTF-8">
//   <title>Master PoE — ${learner.fullName || "Learner"}</title>
//   <style>${POE_STYLES}</style>
// </head>
// <body>

// <div class="cover">
//   <div class="cover__pattern"></div>
//   <div class="cover__accent">
//     <div class="cover__accent-blue"></div>
//     <div class="cover__accent-green"></div>
//   </div>
//   <div class="cover__header">
//     <img src="${companyLogoUrl}" alt="mLab" class="cover__logo" />
//     <div class="cover__org">
//       <span class="cover__org-name">Mobile Applications Laboratory NPC</span>
//       <span class="cover__org-tag">QCTO Accredited Training Provider</span>
//     </div>
//   </div>
//   <div class="cover__body">
//     <p class="cover__doc-type">QCTO Qualification Compliance Record</p>
//     <h1 class="cover__title">Master Portfolio<br>of Evidence</h1>
//     <p class="cover__subtitle">Official Assessment Archive</p>
//     <div class="cover__id-card">
//       <div class="cover__id-row">
//         <div class="cover__id-label">Full Name</div>
//         <div class="cover__id-value">${learner.fullName || "N/A"}</div>
//       </div>
//       <div class="cover__id-row">
//         <div class="cover__id-label">Identity Number</div>
//         <div class="cover__id-value">${learner.idNumber || "N/A"}</div>
//       </div>
//       <div class="cover__id-row">
//         <div class="cover__id-label">Email Address</div>
//         <div class="cover__id-value">${learner.email || "N/A"}</div>
//       </div>
//       <div class="cover__id-row">
//         <div class="cover__id-label">Programme</div>
//         <div class="cover__id-value">${learner.qualification?.name || enrollment.qualificationName || "N/A"}</div>
//       </div>
//       <div class="cover__id-row">
//         <div class="cover__id-label">Date Generated</div>
//         <div class="cover__id-value">${fmt(new Date())}</div>
//       </div>
//     </div>
//   </div>
//   <div class="cover__footer">
//     <span class="cover__footer-ref">Ref: ${requestId}</span>
//     <span class="cover__footer-date">Generated ${fmt(new Date())}</span>
//   </div>
//   <div class="cover__accent-bottom">
//     <div class="cover__accent-bottom-green"></div>
//     <div class="cover__accent-bottom-blue"></div>
//   </div>
// </div>
// <div class="pb"></div>

// ${sectionHeader("✓", "Assessor PoE Checklist", "Document Completeness Verification")}
// <table class="poe-table poe-table--checklist">
//   <thead><tr><th width="30">#</th><th>Document / Section</th><th width="160">Inclusion Status</th></tr></thead>
//   <tbody>
//     <tr><td>1</td><td>Progress Report (all module components)</td><td><span class="badge badge--c">Included</span></td></tr>
//     <tr><td>2</td><td>Competence Record and Final Assessment Report</td><td><span class="badge badge--c">Included</span></td></tr>
//     <tr><td>3</td><td>Learner Registration & POPIA Consent Form</td><td><span class="badge badge--c">Included</span></td></tr>
//     <tr><td>4</td><td>Letter of Commitment from Learner</td><td><span class="badge badge--c">Included</span></td></tr>
//     <tr><td>5</td><td>Programme Induction Record</td><td><span class="badge badge--c">Included</span></td></tr>
//     <tr><td>6</td><td>Appeals / Complaint Forms</td><td>${appealedSubs.length > 0 ? `<span class="badge badge--nyc">${appealedSubs.length} Appeal(s) — See Section 6</span>` : `<span class="badge badge--p">None Lodged</span>`}</td></tr>
//     <tr><td>7</td><td>Actual Learning Plan and Evidence Control Sheet</td><td><span class="badge badge--c">Included</span></td></tr>
//     <tr><td>8</td><td>Learner Coaching Record (Remediation)</td><td>${remediatedSubs.length > 0 ? `<span class="badge badge--nyc">${remediatedSubs.length} Session(s) — See Section 8</span>` : `<span class="badge badge--p">N/A — All First Attempt</span>`}</td></tr>
//     <tr><td>9</td><td>Certified Identity Document and Supporting Annexures</td><td><span class="badge badge--c">See Annexures</span></td></tr>
//   </tbody>
// </table>
// <div class="pb"></div>

// ${dividerPage("1", "Progress Report", "Summary of all assessed module components including knowledge, practical skills, and workplace experience.")}
// <div class="pb"></div>

// ${sectionHeader("1", "Progress Report", "Comprehensive Module Outcome Summary")}

// <div class="data-grid">
//   ${dc("Learner Name", learner.fullName)}
//   ${dc("Identity Number", learner.idNumber)}
//   ${dc("Programme Title", learner.qualification?.name || enrollment.qualificationName || "N/A")}
//   ${dc("Primary Assessor", primaryAssessor, "ink-ass")}
//   ${dc("Training Start Date", fmt(enrollment.trainingStartDate || learner.trainingStartDate))}
//   ${dc("Training End Date", fmt(enrollment.trainingEndDate || learner.trainingEndDate))}
//   <div class="data-cell data-cell--span2">
//     <span class="data-cell__label">Training Site / Workplace</span>
//     <span class="data-cell__value">${enrollment.employerName || "mLab Default Training Campus"}</span>
//   </div>
// </div>

// <div class="sub-heading">Knowledge Modules</div>
// <table class="poe-table poe-table--accented">
//   <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
//   <tbody>${progressRows(kmSubs)}</tbody>
// </table>

// <div class="sub-heading">Practical Skills Modules</div>
// <table class="poe-table poe-table--accented">
//   <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
//   <tbody>${progressRows(pmSubs)}</tbody>
// </table>

// <div class="sub-heading">Work Experience Modules</div>
// <table class="poe-table poe-table--accented">
//   <thead><tr><th>Module Code</th><th>Module Title</th><th width="80">Attempts</th><th width="120">Outcome</th></tr></thead>
//   <tbody>${progressRows(wmSubs)}</tbody>
// </table>

// <div class="sig-bar">
//   <div>
//     <div class="sig-bar__label">Assessor Sign-Off</div>
//     <div style="font-size:9px; color:#9b9b9b; margin-top:2px;">I declare this progress report accurate and complete.</div>
//   </div>
//   ${globalAssessorSigUrl ? `<img src="${globalAssessorSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
//   <div class="sig-bar__date">Date: ${fmt(new Date())}</div>
// </div>
// <div class="pb"></div>`;

//       html += `
// ${dividerPage("2", "Competence Record & Final Assessment Report", "Official system-generated transcripts, grading evidence, and signed evaluations for every module assessed.")}
// <div class="pb"></div>`;

//       let moduleIndex = 0;
//       for (const sub of submissions) {
//         moduleIndex++;
//         await updateProgress(
//           30 + Math.floor((moduleIndex / submissions.length) * 35),
//           `Compiling transcript: ${sub.title || "Module"}…`,
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

//         const att = sub.attemptNumber || 1;
//         const isReassess = att > 1;
//         const facFeedback =
//           sub.facilitatorOverallFeedback ||
//           grading.facilitatorOverallFeedback ||
//           "<em>No facilitator comments recorded.</em>";
//         const assFeedback =
//           grading.assessorOverallFeedback ||
//           "<em>No assessor feedback recorded.</em>";
//         const modFeedback =
//           moderation.feedback || "<em>No moderation comments recorded.</em>";

//         // =========================================================================================
//         // SIGNATURE SNAPSHOT RESOLUTION (PER MODULE)
//         // =========================================================================================
//         const learnerSigUrl =
//           sub.learnerDeclaration?.signatureUrl ||
//           (learner.authUid ? signaturesMap[learner.authUid] : null);
//         const facSigUrl =
//           sub.grading?.facilitatorSignatureUrl ||
//           (sub.facilitatorId ? signaturesMap[sub.facilitatorId] : null);
//         const assSigUrl =
//           sub.grading?.assessorSignatureUrl ||
//           (sub.assessorId ? signaturesMap[sub.assessorId] : null);
//         const modSigUrl =
//           sub.moderation?.moderatorSignatureUrl ||
//           (sub.moderatorId ? signaturesMap[sub.moderatorId] : null);

//         const facName =
//           sub.facilitatorName || grading.facilitatorName || "Pending";
//         const assessorName = grading.assessorName || "Pending";
//         const assessorReg = grading.assessorRegNumber
//           ? `Reg: ${grading.assessorRegNumber}`
//           : "";
//         const modName = moderation.moderatorName || "Pending";
//         const modReg = moderation.moderatorRegNumber
//           ? `Reg: ${moderation.moderatorRegNumber}`
//           : "";
//         const moduleBc = sub.moduleNumber || sub.title || "Module";

//         const modInfo = assessmentData.moduleInfo || assessmentData || {};
//         const nqfLevel = modInfo.nqfLevel ? `Level ${modInfo.nqfLevel}` : "N/A";
//         const notionalHours = modInfo.notionalHours || "N/A";
//         const credits = modInfo.credits ? `Cr ${modInfo.credits}` : "N/A";

//         const learnerDate = fmt(
//           sub.submittedAt || sub.learnerDeclaration?.timestamp,
//         );
//         const facDate = fmt(
//           sub.facilitatorReviewedAt || grading.facilitatorReviewedAt,
//         );
//         const assDate = fmt(sub.gradedAt || grading.gradedAt);
//         const modDate = fmt(moderation.moderatedAt);

//         html += `
// <div class="module-header pbi">
//   <div>
//     <h2 class="module-header__title">${sub.title || "Untitled Module"}</h2>
//   </div>
//   <div class="module-header__badges">
//     ${outcomeBadge(sub.competency)}
//     ${isReassess ? `<span class="badge badge--attempt">Attempt ${att}</span>` : `<span class="badge badge--attempt1">Attempt 1</span>`}
//   </div>
// </div>

// <table class="poe-table" style="margin-top:-12px; margin-bottom:16px;">
//   <thead>
//     <tr>
//       <th>Module #</th>
//       <th>NQF Level</th>
//       <th>Notional hours</th>
//       <th>Credit(s)</th>
//     </tr>
//   </thead>
//   <tbody>
//     <tr>
//       <td style="font-weight:bold; color:#073f4e;">${sub.moduleNumber || modInfo.moduleNumber || "N/A"}</td>
//       <td>${nqfLevel}</td>
//       <td>${notionalHours}</td>
//       <td>${credits}</td>
//     </tr>
//   </tbody>
// </table>

// ${
//   assessmentData.isOpenBook && assessmentData.referenceManualUrl
//     ? `
// <div class="openbook-notice pbi">
//   <span class="openbook-notice__icon">Open Book</span>
//   <div>
//     Learner was provided an official reference manual during this assessment.
//     Archived reference: <a href="${assessmentData.referenceManualUrl}" class="a-link">${assessmentData.referenceManualUrl}</a>
//   </div>
// </div>`
//     : ""
// }

// <div class="eval-box pbi">
//   <div class="eval-box__row">
//     <div class="eval-box__label">Final Outcome</div>
//     <div class="eval-box__value">${outcomeBadge(sub.competency)}</div>
//   </div>
//   <div class="eval-box__row">
//     <div class="eval-box__label">Assessment Score</div>
//     <div class="eval-box__value"><strong>${sub.marks !== undefined ? sub.marks : "–"} / ${sub.totalMarks || "–"}</strong></div>
//   </div>
//   <div class="eval-box__row">
//     <div class="eval-box__label">Submission Attempt</div>
//     <div class="eval-box__value">${att}${isReassess ? ' <span class="badge badge--attempt" style="margin-left:8px;">Reassessment</span>' : ""}</div>
//   </div>
//   <div class="eval-box__divider"></div>
//   <div class="eval-box__row">
//     <div class="eval-box__label">Facilitator Note</div>
//     <div class="eval-box__value ink-fac">${facFeedback}</div>
//   </div>
//   <div class="eval-box__row">
//     <div class="eval-box__label">Assessor Feedback</div>
//     <div class="eval-box__value ink-ass">${assFeedback}</div>
//   </div>
//   <div class="eval-box__row">
//     <div class="eval-box__label">Moderator Review</div>
//     <div class="eval-box__value ink-mod">${modFeedback}</div>
//   </div>
// </div>`;

//         if (blocks.length > 0) {
//           let qNum = 1;
//           blocks.forEach((block: any) => {
//             if (block.type === "section") {
//               html += `<div class="sub-heading">${block.title}</div>`;
//               return;
//             }
//             if (block.type === "info") return;

//             const blockBc =
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
//                   formattedAnswer += `<div>&#x1F517; <a class="a-link" href="${ans.url}">External Link</a></div>`;
//                 if (ans.code)
//                   formattedAnswer += `<pre style="background:#f4f7f9; padding:10px; border:1px solid #dde4e8; font-size:10px; overflow-wrap:break-word;">${ans.code}</pre>`;

//                 if (ans.uploadUrl) {
//                   const annIdx = offlineEvidenceFiles.length + 1;
//                   const annLabel = `${moduleBc} | ${blockBc}`;
//                   offlineEvidenceFiles.push({
//                     index: annIdx,
//                     url: ans.uploadUrl,
//                     label: annLabel,
//                   });
//                   formattedAnswer += `<div class="a-annex">&#x1F4CE; <a class="a-link" href="${ans.uploadUrl}"><strong>Appended as Annexure ${annIdx}</strong></a> — ${annLabel}</div>`;
//                 }

//                 Object.keys(ans).forEach((k) => {
//                   const subAns = ans[k];
//                   if (subAns && typeof subAns === "object") {
//                     let subHtml = "";
//                     if (subAns.text && subAns.text !== "<p></p>")
//                       subHtml += `<div>${subAns.text}</div>`;
//                     if (subAns.url)
//                       subHtml += `<div><a class="a-link" href="${subAns.url}">External Link</a></div>`;
//                     if (subAns.code)
//                       subHtml += `<pre style="background:#f4f7f9; padding:8px;">${subAns.code}</pre>`;
//                     if (subAns.uploadUrl) {
//                       const annIdx = offlineEvidenceFiles.length + 1;
//                       const annLabel = `${moduleBc} | ${blockBc} | ${k.replace(/_/g, " ").toUpperCase()}`;
//                       offlineEvidenceFiles.push({
//                         index: annIdx,
//                         url: subAns.uploadUrl,
//                         label: annLabel,
//                       });
//                       subHtml += `<div class="a-annex">&#x1F4CE; <a class="a-link" href="${subAns.uploadUrl}"><strong>Annexure ${annIdx}</strong></a> — ${annLabel}</div>`;
//                     }
//                     if (subHtml)
//                       formattedAnswer += `<div style="margin-top:8px; padding:8px; border-left:3px solid #dde4e8; background:#f4f7f9;"><strong style="font-family:'Oswald',sans-serif;font-size:9px;letter-spacing:0.1em;text-transform:uppercase;">${k.replace(/_/g, " ")}</strong>${subHtml}</div>`;
//                   } else if (
//                     typeof subAns === "string" &&
//                     subAns.trim() &&
//                     !["text", "url", "uploadUrl", "code"].includes(k)
//                   ) {
//                     formattedAnswer += `<div><strong>${k.replace(/_/g, " ")}:</strong> ${subAns}</div>`;
//                   }
//                 });
//               }
//             }
//             if (!formattedAnswer)
//               formattedAnswer =
//                 '<em class="text-muted">No evidence provided for this item.</em>';

//             const fLayer = grading.facilitatorBreakdown?.[block.id] || {};
//             const aLayer = grading.assessorBreakdown?.[block.id] || {};
//             const mLayer = moderation.breakdown?.[block.id] || {};

//             const feedbackRows: string[] = [];
//             const seenComments = new Set<string>();
//             const addFb = (role: string, inkClass: string, text: string) => {
//               const clean = text?.trim();
//               if (!clean) return;
//               const key = `${role}:${clean}`;
//               if (!seenComments.has(key)) {
//                 seenComments.add(key);
//                 feedbackRows.push(
//                   `<div class="f-row"><span class="f-role ${inkClass}">${role}</span><span class="f-comment ${inkClass}">${clean}</span></div>`,
//                 );
//               }
//             };
//             addFb("Facilitator", "ink-fac", fLayer.feedback);
//             addFb("Assessor", "ink-ass", aLayer.feedback);
//             addFb("Moderator", "ink-mod", mLayer.feedback);
//             if (Array.isArray(fLayer.criteriaResults))
//               fLayer.criteriaResults.forEach((c: any) =>
//                 addFb("Facilitator", "ink-fac", c.comment),
//               );
//             if (Array.isArray(aLayer.criteriaResults))
//               aLayer.criteriaResults.forEach((c: any) =>
//                 addFb("Assessor", "ink-ass", c.comment),
//               );
//             if (Array.isArray(mLayer.criteriaResults))
//               mLayer.criteriaResults.forEach((c: any) =>
//                 addFb("Moderator", "ink-mod", c.comment),
//               );

//             html += `
// <div class="q-block">
//   <div class="q-text"><span class="q-num">${qNum++}</span>${block.question || block.title || "Checkpoint"}</div>
//   <div class="a-text">${formattedAnswer}</div>
//   ${feedbackRows.length ? `<div class="f-block">${feedbackRows.join("")}</div>` : ""}
// </div>`;
//           });
//         } else {
//           html += `<div class="empty-state">Assessment template is empty — evidence blocks not mapped.</div>`;
//         }

//         try {
//           const historySnap = await admin
//             .firestore()
//             .collection("learner_submissions")
//             .doc(sub.id)
//             .collection("history")
//             .get();
//           if (!historySnap.empty) {
//             const pastAttempts = historySnap.docs
//               .map((d) => d.data())
//               .sort((a, b) => (a.attemptNumber || 1) - (b.attemptNumber || 1));

//             html += `
// <div class="history-box pbi">
//   <div class="history-box__header">NYC Audit Trail — Previous Attempt Archive (${pastAttempts.length} attempt${pastAttempts.length !== 1 ? "s" : ""})</div>
// `;
//             pastAttempts.forEach((past, hi) => {
//               const pastAtt = past.attemptNumber || hi + 1;
//               const pastDate = fmt(past.submittedAt || past.assignedAt);
//               const pastFeedback =
//                 past.grading?.assessorOverallFeedback ||
//                 past.facilitatorOverallFeedback ||
//                 "No feedback recorded.";

//               let archiveLinkHtml = "";

//               if (past.historyPdfUrl) {
//                 archiveLinkHtml = `
//                   <div style="margin-top:10px; padding:10px; background:#eff6ff; border:1px solid #bfdbfe; border-radius:4px;">
//                     <a href="${past.historyPdfUrl}" target="_blank" style="color:#1d4ed8; text-decoration:none; font-weight:bold; font-family:'Oswald',sans-serif; font-size:12px;">
//                       📄 DOWNLOAD FULL ARCHIVED ATTEMPT PDF
//                     </a>
//                     <div style="font-size:9px; color:#64748b; margin-top:3px;">Contains all learner answers, rich text, and feedback for this attempt.</div>
//                   </div>
//                 `;
//               } else {
//                 archiveLinkHtml = `
//                   <div style="margin-top:10px; padding:10px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:4px;">
//                     <div style="font-size:11px; color:#475569; font-style:italic;">Legacy attempt. Full PDF snapshot is not available for this record.</div>
//                   </div>
//                 `;
//               }

//               html += `<div class="history-attempt">
//        <div class="history-attempt__title">Attempt ${pastAtt} — Submitted ${pastDate}</div>
//        <div style="font-size:10.5px; margin:4px 0 6px; display:flex; gap:16px;">
//          <span><strong>Outcome:</strong> <span class="ink-ass">${past.competency || "NYC"}</span></span>
//          <span><strong>Score:</strong> ${past.marks !== undefined ? past.marks : 0} / ${past.totalMarks || 0}</span>
//        </div>
//        <div style="font-size:10.5px;"><strong>Assessor Feedback:</strong> <span class="ink-ass">${pastFeedback}</span></div>
//        ${archiveLinkHtml}
//      </div>`;
//             });
//             html += `</div>`;
//           }
//         } catch (err) {
//           console.error(`History fetch failed for ${sub.id}`, err);
//         }

//         html += `
// <div class="sig-row">
//   ${sigCell("Learner Declaration", "learner", learnerSigUrl, learner.fullName || "Unknown", "", learnerDate)}
//   ${sigCell("Facilitator Review", "fac", facSigUrl, facName, "", facDate)}
//   ${sigCell("Assessor Endorsement", "assessor", assSigUrl, assessorName, assessorReg, assDate)}
//   ${sigCell("Moderator Verification", "mod", modSigUrl, modName, modReg, modDate)}
// </div>
// <div class="pb"></div>`;
//       }

//       const d = learnerUserDoc.demographics || learner.demographics || {};

//       html += `
// ${dividerPage("3", "Learner Registration & POPIA Consent Form", "Official enrolment, demographic data, and data processing consent.")}
// <div class="pb"></div>
// ${sectionHeader("3", "Learner Registration Form", "Enrolment and Demographic Record")}
// <div class="data-grid">
//   ${dc("Full Name", learner.fullName)}
//   ${dc("Identity Number", learner.idNumber)}
//   ${dc("Email Address", learner.email)}
//   ${dc("Contact Number", learner.phone || d.phone)}
//   ${dc("Equity / Race", d.equityCode)}
//   ${dc("Gender", d.gender)}
//   ${dc("Home Language", d.homeLanguage)}
//   ${dc("Province", d.provinceCode)}
// </div>

// <h3 class="sub-heading" style="margin-top: 25px;">POPIA Consent Declaration</h3>
// <div class="declaration">
//   <p>In accordance with the <strong>Protection of Personal Information Act, 4 of 2013 (POPIA)</strong>, I hereby grant <strong>Mobile Applications Laboratory NPC</strong> and its authorized representatives consent to collect, process, and store my personal information.</p>
//   <p>I understand and agree that:</p>
//   <ol style="margin-top:0; padding-left:20px;">
//     <li style="margin-bottom:8px;">My personal information will be processed solely for the purposes of enrollment, assessment, moderation, certification, and reporting to relevant statutory bodies (e.g., QCTO, SETAs, SAQA).</li>
//     <li style="margin-bottom:8px;">My data will be stored securely and will not be shared with unauthorized third parties without my explicit consent.</li>
//     <li style="margin-bottom:8px;">I have the right to access, update, or request the deletion of my personal information, subject to statutory record-keeping requirements.</li>
//   </ol>
//   <p style="margin-bottom:0;">By signing this document, I acknowledge that I have read, understood, and accept the terms regarding the processing of my personal data.</p>
// </div>

// <div class="sig-bar">
//   <div class="sig-bar__label">Learner Signature (Registration & POPIA)</div>
//   ${dayOneLearnerSigUrl ? `<img src="${dayOneLearnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
//   <div class="sig-bar__date">Date: ${fmt(learner.createdAt || new Date())}</div>
// </div>
// <div class="pb"></div>

// ${dividerPage("4", "Letter of Commitment", "Learner declaration of authenticity and commitment to programme requirements.")}
// <div class="pb"></div>
// ${sectionHeader("4", "Letter of Commitment from Learner", "Declaration of Authenticity and Programme Commitment")}
// <div class="letter-body">
//   <p>I, <strong>${learner.fullName || "___________________"}</strong>, hereby undertake to fulfil all the requirements of the assessment and training practices as specified by the assessor and the service provider, Mobile Applications Laboratory NPC.</p>
//   <p>I declare that all work submitted — including assignments, assessments, and case studies — is authentic and represents my own current work. I understand that submission of work that is not my own constitutes academic misconduct and may result in disqualification.</p>
//   <p>I am aware that in order to graduate from this programme I need to meet all compulsory requirements, including being declared Competent on all components that form the basis of this qualification.</p>
//   <p>I understand and accept the appeals and grievance procedures available to me, and commit to engaging with the process constructively and professionally.</p>
// </div>
// <div class="sig-bar">
//   <div class="sig-bar__label">Learner Sign-Off</div>
//   ${dayOneLearnerSigUrl ? `<img src="${dayOneLearnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
//   <div class="sig-bar__date">Date: ${fmt(submissions[0]?.assignedAt || new Date())}</div>
// </div>
// <div class="pb"></div>

// ${dividerPage("5", "Programme Induction", "Confirmation that the learner received a comprehensive induction prior to assessment commencement.")}
// <div class="pb"></div>
// ${sectionHeader("5", "Programme Induction", "Formal Acknowledgement of Induction Completion")}
// <div class="declaration">
//   <p>This confirms that the learner named herein received a comprehensive induction into the programme, covering:</p>
//   <p><strong>1. Curriculum Overview</strong> — Programme structure, module breakdown, notional hours, and credit values.</p>
//   <p><strong>2. Assessment Methodology</strong> — QCTO assessment types (Knowledge, Practical, Workplace), submission formats, and grading criteria.</p>
//   <p><strong>3. Appeals and Grievance Procedures</strong> — Learner rights, remediation pathways, and formal appeals process.</p>
//   <p><strong>4. Workplace and Ethical Expectations</strong> — Professional conduct, attendance requirements, and submission authenticity standards.</p>
// </div>
// <div class="sig-row" style="grid-template-columns: 1fr 1fr;">
//   ${sigCell("Learner Acknowledgement", "learner", dayOneLearnerSigUrl, learner.fullName || "Learner", "", fmt(submissions[0]?.assignedAt || new Date()))}
//   ${sigCell("Facilitator Sign-Off", "fac", primaryFacSigUrl, "Programme Facilitator", "", fmt(submissions[0]?.assignedAt || new Date()))}
// </div>
// <div class="pb"></div>

// ${dividerPage("6", "Appeals & Complaint Records", "Formal records of any grievances, disputes, or appeal proceedings lodged during this programme.")}
// <div class="pb"></div>
// ${sectionHeader("6", "Appeals & Complaint Records", "Formal Grievance and Appeal Log")}
// `;

//       if (appealedSubs.length > 0) {
//         appealedSubs.forEach((s) => {
//           const revBy =
//             s.appeal?.resolvedBy || s.appeal?.reviewedBy || s.moderatorId;

//           // Prefer snapshot saved on appeal, fallback to live profile map
//           const revSig =
//             s.appeal?.resolvedBySignatureUrl ||
//             (revBy ? signaturesMap[revBy] : null);

//           const revName =
//             s.appeal?.resolvedByName ||
//             s.appeal?.reviewedByName ||
//             s.moderation?.moderatorName ||
//             "Pending";
//           const revDate = fmt(
//             s.appeal?.resolvedAt || s.appeal?.reviewedAt || s.appeal?.date,
//           );

//           html += `
// <div class="appeal-card pbi">
//   <div class="appeal-card__head">
//     <h4 class="appeal-card__title">Appeal: ${s.moduleNumber || ""} ${s.title}</h4>
//     <span class="badge badge--nyc">${(s.appeal?.status || "Pending").toUpperCase()}</span>
//   </div>
//   <div class="appeal-card__body">
//     <div class="data-grid data-grid--1col" style="margin-bottom:10px;">
//       ${dc("Date of Appeal", fmt(s.appeal?.date))}
//       ${dc("Reason for Appeal", s.appeal?.reason || "Not specified")}
//       ${dc("Appeal Status", (s.appeal?.status || "Pending").toUpperCase())}
//       ${s.appeal?.resolutionNotes ? dc("Board Resolution", s.appeal.resolutionNotes) : ""}
//     </div>
//     <div style="border-top: 1px dashed #fecaca; padding-top: 10px; margin-top: 10px;">
//       <div class="data-cell__label" style="color: #b91c1c;">Resolved By / Signature</div>
//       ${revSig ? `<img src="${revSig}" style="max-height: 35px; mix-blend-mode: multiply; margin: 4px 0;" />` : `<div style="height:35px; font-style:italic; font-size:10px; color:#b91c1c; display:flex; align-items:center;">Pending Signature</div>`}
//       <div class="ink-mod" style="font-weight: 700; font-size: 11px; font-family: 'Oswald', sans-serif;">${revName}</div>
//       <div class="ink-mod" style="font-size: 9px;">Date: ${revDate}</div>
//     </div>
//   </div>
// </div>`;
//         });
//       } else {
//         html += `
// <div class="notice notice--grey pbi">
//   <div class="notice__title">Status: No Appeals Lodged</div>
//   <div class="notice__body">No formal appeals or complaints were registered by the learner for any module in this programme.</div>
// </div>`;
//       }

//       html += `
// <div class="pb"></div>

// ${dividerPage("7", "Actual Learning Plan & Evidence Control Sheet", "Full audit trail mapping all modules to facilitators, date ranges, evidence types, and competency outcomes.")}
// <div class="pb"></div>
// ${sectionHeader("7", "Actual Learning Plan & Evidence Control Sheet", "Evidence Type Matrix and Outcome Register")}

// <table class="poe-table">
//   <thead>
//     <tr>
//       <th rowspan="2">Module Code</th>
//       <th rowspan="2">Facilitator</th>
//       <th rowspan="2">Assessment Period</th>
//       <th colspan="3" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Evidence Type</th>
//       <th colspan="2" style="text-align:center; border-bottom:1px solid rgba(255,255,255,0.15);">Outcome</th>
//     </tr>
//     <tr>
//       <th style="text-align:center; font-size:8px;">Knowledge</th>
//       <th style="text-align:center; font-size:8px;">Practical</th>
//       <th style="text-align:center; font-size:8px;">Workplace</th>
//       <th style="text-align:center; font-size:8px; color:#94c73d;">C</th>
//       <th style="text-align:center; font-size:8px; color:#fca5a5;">NYC</th>
//     </tr>
//   </thead>
//   <tbody>${learningPlanRows(submissions)}</tbody>
// </table>

// <div class="sub-heading mt-8">Evidence Judging Principles</div>
// <table class="poe-table">
//   <thead><tr><th>Assessment Principle</th><th width="90" style="text-align:center;">Knowledge</th><th width="120" style="text-align:center;">Practical / Workplace</th></tr></thead>
//   <tbody>
//     <tr><td><strong>Relevant</strong> — Evidence relates directly to specific programme learning outcomes.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
//     <tr><td><strong>Valid</strong> — Evidence demonstrates the learner can perform the required function.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
//     <tr><td><strong>Authentic</strong> — Evidence is confirmed as the learner's own work.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
//     <tr><td><strong>Consistent</strong> — Evidence demonstrates repeatable performance to the required standard.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
//     <tr><td><strong>Current</strong> — Evidence reflects learner's current level of competence.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
//     <tr><td><strong>Sufficient</strong> — Adequate evidence has been collected to support a judgement.</td><td class="text-center"><span class="badge badge--c">Met</span></td><td class="text-center"><span class="badge badge--c">Met</span></td></tr>
//   </tbody>
// </table>

// <div class="sig-row" style="grid-template-columns: 1fr;">
//   ${sigCell("Assessor Endorsement", "assessor", globalAssessorSigUrl, primaryAssessor, "", fmt(new Date()))}
// </div>
// <div class="pb"></div>

// ${dividerPage("8", "Learner Coaching Record", "Formal documentation of all coaching, remediation sessions, and intervention records for Not Yet Competent modules.")}
// <div class="pb"></div>
// ${sectionHeader("8", "Learner Coaching Record (Remediation)", "Intervention Log for NYC Modules")}
// `;

//       if (remediatedSubs.length > 0) {
//         remediatedSubs.forEach((s) => {
//           const log = s.latestCoachingLog || {};
//           const facId =
//             log.facilitatorId || s.grading?.facilitatorId || s.facilitatorId;

//           // Prefer snapshot, fallback to live profile map
//           const facSig =
//             log.facilitatorSignatureUrl ||
//             (facId ? signaturesMap[facId] : null);

//           // Using the latestLearnerSigUrl instead of globalLearnerSigUrl
//           const learnerAckSig =
//             log.learnerSignatureUrl ||
//             (log.acknowledged ? latestLearnerSigUrl : null);

//           const facName =
//             log.facilitatorName ||
//             s.grading?.facilitatorName ||
//             s.facilitatorName ||
//             "Assigned Facilitator";
//           const facDate = fmt(log.date || s.assignedAt);
//           const learnerAckDate = fmt(log.acknowledgedAt);

//           html += `
// <div class="coaching-card pbi">
//   <div class="coaching-card__head">
//     <h4 class="coaching-card__title">Remediation Log: ${s.moduleNumber || ""} ${s.title}</h4>
//     <span class="badge badge--attempt">Attempt ${s.attemptNumber}</span>
//   </div>
//   <div class="coaching-card__body">
//     <div class="data-grid">
//       ${dc("Max Attempts Allowed", "3")}
//       ${dc("Current Attempt", `Attempt ${s.attemptNumber}`)}
//       ${dc("Coaching Facilitator", facName)}
//       ${dc("Date of Intervention", fmt(log.date || s.assignedAt))}
//     </div>
//     <div class="data-cell" style="background:#fffbeb; border:1px solid #fde68a; padding:10px 12px; margin-bottom: 10px;">
//       <span class="data-cell__label">Academic Intervention Notes</span>
//       <span class="data-cell__value ink-fac" style="display:block; margin-top:4px; font-weight:400; font-size:11px; line-height:1.6;">${log.notes || "Coaching session conducted to address NYC competency gaps and unlock learner for reassessment."}</span>
//     </div>

//     <div class="sig-row" style="grid-template-columns: 1fr 1fr; margin-top: 15px;">
//       ${sigCell("Facilitator Signature", "fac", facSig, facName, "", facDate)}
//       ${sigCell("Learner Acknowledgement", "learner", learnerAckSig, learner.fullName || "Learner", log.acknowledged ? "Acknowledged" : "Pending", learnerAckDate)}
//     </div>
//   </div>
// </div>`;
//         });
//       } else {
//         html += `
// <div class="notice notice--green pbi">
//   <div class="notice__title">No Remediation Required</div>
//   <div class="notice__body">No coaching or remediation sessions were required during this programme. All modules were completed competently on the first attempt.</div>
// </div>`;
//       }

//       html += `
// <div class="pb"></div>
// ${dividerPage("9", "Annexures", "Identity documents, supporting compliance files, and evidence submissions uploaded by the learner — appended on the following pages.")}
// </body></html>`;

//       await updateProgress(70, "Rendering assessment layout…");
//       const browser = await puppeteer.launch({
//         args: chromium.args,
//         defaultViewport: chromium.defaultViewport,
//         executablePath: await chromium.executablePath(),
//         headless: chromium.headless,
//       });
//       const page = await browser.newPage();
//       page.setDefaultNavigationTimeout(120000);
//       page.setDefaultTimeout(120000);
//       await page.setContent(html, {
//         waitUntil: ["load", "networkidle2"],
//         timeout: 120000,
//       });

//       const puppeteerPdfBuffer = await page.pdf({
//         format: "A4",
//         printBackground: true,
//         displayHeaderFooter: true,
//         headerTemplate: "<span></span>",
//         footerTemplate: `
//           <div style="font-size:8px; font-family:'Trebuchet MS',sans-serif; color:#9b9b9b; padding:0 16mm; width:100%; display:flex; justify-content:space-between; box-sizing:border-box;">
//             <span>Mobile Applications Laboratory NPC — Master Portfolio of Evidence</span>
//             <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
//           </div>`,
//         margin: { top: "15mm", right: "16mm", bottom: "22mm", left: "16mm" },
//         timeout: 120000,
//       });
//       await browser.close();

//       await updateProgress(85, "Merging annexures (identity & evidence)…");
//       const masterPdf = await PDFDocument.create();
//       const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);
//       const basePdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
//       const basePages = await masterPdf.copyPages(
//         basePdfDoc,
//         basePdfDoc.getPageIndices(),
//       );
//       basePages.forEach((p) => masterPdf.addPage(p));

//       const uploadedDocs: UploadedDoc[] =
//         learnerUserDoc?.uploadedDocuments || learner?.uploadedDocuments || [];
//       uploadedDocs.forEach((d) => {
//         offlineEvidenceFiles.push({
//           index: offlineEvidenceFiles.length + 1,
//           url: d.url,
//           label: `9. Annexure: ${d.name || "Compliance Document"}`,
//         });
//       });

//       if (offlineEvidenceFiles.length > 0) {
//         await updateProgress(90, "Stamping and merging annexures…");
//         for (const evidence of offlineEvidenceFiles) {
//           try {
//             const buffer = await fetchFileBuffer(evidence.url);
//             if (!buffer) continue;
//             const stampText = `Annexure ${evidence.index}: ${evidence.label}`;
//             try {
//               const extPdf = await PDFDocument.load(buffer);
//               const copPages = await masterPdf.copyPages(
//                 extPdf,
//                 extPdf.getPageIndices(),
//               );
//               if (copPages.length > 0) {
//                 const fp = copPages[0];
//                 fp.drawText(stampText, {
//                   x: 20,
//                   y: fp.getSize().height - 20,
//                   size: 9,
//                   color: rgb(0.86, 0.15, 0.15),
//                   font: fontBold,
//                 });
//               }
//               copPages.forEach((p: any) => masterPdf.addPage(p));
//             } catch {
//               let image;
//               try {
//                 image = await masterPdf.embedPng(buffer);
//               } catch {
//                 try {
//                   image = await masterPdf.embedJpg(buffer);
//                 } catch {}
//               }
//               if (image) {
//                 const pg = masterPdf.addPage();
//                 const { width, height } = pg.getSize();
//                 pg.drawText(stampText, {
//                   x: 20,
//                   y: height - 30,
//                   size: 9,
//                   color: rgb(0.86, 0.15, 0.15),
//                   font: fontBold,
//                 });
//                 const dims = image.scaleToFit(width - 40, height - 80);
//                 pg.drawImage(image, {
//                   x: width / 2 - dims.width / 2,
//                   y: height / 2 - dims.height / 2 - 20,
//                   ...dims,
//                 });
//               }
//             }
//           } catch (err) {
//             console.warn(`Annexure failed: ${evidence.url}`, err);
//           }
//         }
//       }

//       await updateProgress(95, "Uploading to secure vault…");
//       const finalPdfBuffer = Buffer.from(await masterPdf.save());
//       const bucket = admin.storage().bucket();
//       const dirPrefix = `poe_exports/${learnerId}/`;
//       try {
//         await bucket.deleteFiles({ prefix: dirPrefix });
//       } catch {}

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
//         const emailParams = {
//           title: "Master PoE Ready",
//           subtitle: learner.fullName,
//           recipientName: "Admin",
//           bodyHtml: `<p>The Master Portfolio of Evidence for <strong>${learner.fullName}</strong> has been generated successfully.</p>
//                      <p>All sections, transcripts, and annexures have been compiled into a single QCTO-compliant PDF.</p>
//                      <p style="font-size:11px; color:#9b9b9b;">Reference: ${requestId}</p>`,
//           ctaText: "Download Master PoE PDF",
//           ctaLink: downloadUrl,
//           showStepIndicator: false,
//         };

//         await sendMailgunEmail({
//           to: requesterEmail,
//           subject: `Master PoE Ready — ${learner.fullName}`,
//           text: buildMlabEmailPlainText(emailParams),
//           html: buildMlabEmailHtml(emailParams),
//         }).catch((err) => {
//           console.warn("Email failed to send, but PoE was generated.", err);
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

// ============================================================================
// PDF GENERATION LOGIC (generateMasterPoE)
// ============================================================================

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
  type?: string; // e.g. Formative, Summative, Practice Set
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
  learnerDeclaration?: {
    learnerName?: string;
    learnerIdNumber?: string;
    learnerAuthUid?: string;
    timestamp?: string;
    signatureUrl?: string; // SNAPSHOT FIELD
  };
  grading?: {
    facilitatorName?: string;
    facilitatorOverallFeedback?: string;
    facilitatorReviewedAt?: string;
    facilitatorId?: string;
    facilitatorSignatureUrl?: string; // SNAPSHOT FIELD
    assessorName?: string;
    assessorOverallFeedback?: string;
    assessorRegNumber?: string;
    assessorId?: string;
    assessorSignatureUrl?: string; // SNAPSHOT FIELD
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
    moderatorSignatureUrl?: string; // SNAPSHOT FIELD
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
    resolvedBySignatureUrl?: string; // SNAPSHOT FIELD
    resolvedAt?: string;
    resolutionNotes?: string;
  };
  latestCoachingLog?: {
    date?: string;
    notes?: string;
    facilitatorId?: string;
    facilitatorName?: string;
    facilitatorSignatureUrl?: string; // SNAPSHOT FIELD
    acknowledged?: boolean;
    acknowledgedAt?: string;
    learnerSignatureUrl?: string; // SNAPSHOT FIELD
  };
  [key: string]: any;
}

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

// ─── HELPER: CLEAN RICH TEXT (FIXES THE WORD-BREAK BUG IN PDF) ───────────────
const cleanRichText = (html?: string) => {
  if (!html) return "";
  return html.replace(/&nbsp;/g, " ");
};

const POE_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@300;400;500;600;700&display=swap');
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
  .pb { page-break-after: always; }
  .pbi { page-break-inside: avoid; }
  .cover { height: 100vh; display: flex; flex-direction: column; background: #073f4e; overflow: hidden; position: relative; }
  .cover__pattern { position: absolute; inset: 0; background-image: repeating-linear-gradient(-45deg, transparent, transparent 32px, rgba(148,199,61,0.05) 32px, rgba(148,199,61,0.05) 33px), repeating-linear-gradient(45deg, transparent, transparent 32px, rgba(255,255,255,0.02) 32px, rgba(255,255,255,0.02) 33px); pointer-events: none; }
  .cover__accent { display: flex; height: 8px; flex-shrink: 0; }
  .cover__accent-blue  { flex: 1; background: #052e3a; }
  .cover__accent-green { width: 100px; background: #94c73d; }
  .cover__header { display: flex; align-items: center; justify-content: space-between; padding: 28px 40px 20px; border-bottom: 1px solid rgba(255,255,255,0.08); flex-shrink: 0; position: relative; }
  .cover__logo { height: 52px; object-fit: contain; }
  .cover__org { text-align: right; }
  .cover__org-name { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: #ffffff; display: block; }
  .cover__org-tag { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); display: block; margin-top: 3px; }
  .cover__body { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center; position: relative; }
  .cover__doc-type { font-family: 'Oswald', sans-serif; font-size: 10px; font-weight: 700; letter-spacing: 0.28em; text-transform: uppercase; color: #94c73d; margin: 0 0 16px; display: flex; align-items: center; justify-content: center; gap: 10px; }
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
  .sec-header { display: flex; align-items: stretch; margin: 0 0 20px; border-top: 4px solid #073f4e; background: #073f4e; }
  .sec-header__num { width: 48px; flex-shrink: 0; background: #94c73d; display: flex; align-items: center; justify-content: center; font-family: 'Oswald', sans-serif; font-size: 18px; font-weight: 700; color: #073f4e; }
  .sec-header__text { padding: 10px 16px; flex: 1; }
  .sec-header__title { font-family: 'Oswald', sans-serif; font-size: 13px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #ffffff; margin: 0; line-height: 1.1; }
  .sec-header__sub { font-size: 9px; letter-spacing: 0.06em; text-transform: uppercase; color: rgba(255,255,255,0.4); margin: 3px 0 0; }
  .sub-heading { font-family: 'Oswald', sans-serif; font-size: 9.5px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #073f4e; margin: 22px 0 8px; padding-bottom: 5px; border-bottom: 2px solid #073f4e; display: flex; align-items: center; gap: 6px; }
  .sub-heading::after { content: ''; display: block; height: 2px; flex: 1; background: #94c73d; margin-left: 6px; }
  .data-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: #dde4e8; border: 1px solid #dde4e8; margin-bottom: 18px; }
  .data-grid--1col { grid-template-columns: 1fr; }
  .data-cell { background: #ffffff; padding: 9px 12px; }
  .data-cell--span2 { grid-column: span 2; }
  .data-cell__label { font-family: 'Oswald', sans-serif; font-size: 8px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #9b9b9b; display: block; margin-bottom: 3px; }
  .data-cell__value { font-size: 11.5px; font-weight: 600; color: #073f4e; }
  .poe-table { width: 100%; border-collapse: collapse; margin: 0 0 18px; font-size: 10.5px; }
  .poe-table thead tr { background: #073f4e; }
  .poe-table th { padding: 8px 10px; text-align: left; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: rgba(255,255,255,0.85); border-right: 1px solid rgba(255,255,255,0.08); }
  .poe-table td { padding: 7px 10px; border-bottom: 1px solid #e8eef1; border-right: 1px solid #e8eef1; color: #1a2e35; vertical-align: top; }
  .poe-table tbody tr:nth-child(even) td { background: #f8fafb; }
  .poe-table--accented td:first-child { border-left: 3px solid #94c73d; }
  .poe-table--checklist td:nth-child(3) { font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; }
  .badge { display: inline-block; padding: 2px 8px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; }
  .badge--type { display: inline-block; padding: 2px 5px; background: #e2e8f0; color: #475569; border-radius: 3px; font-size: 7px; text-transform: uppercase; margin-right: 6px; vertical-align: middle; }
  .badge--c   { background: rgba(148,199,61,0.15); color: #3d6b0f; border: 1px solid rgba(148,199,61,0.4); }
  .badge--nyc { background: rgba(239,68,68,0.1);   color: #b91c1c; border: 1px solid rgba(239,68,68,0.3); }
  .badge--p   { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
  .badge--attempt { background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; }
  .badge--attempt1 { background: #f0f4f6; color: #6b6b6b; border: 1px solid #dde4e8; }
  .mod-header-row td { background-color: #f1f5f9 !important; border-top: 2px solid #cbd5e1 !important; border-bottom: 1px solid #cbd5e1 !important; }
  .mod-header-text { font-family: 'Oswald', sans-serif; font-size: 10px; color: #073f4e; letter-spacing: 0.05em; text-transform: uppercase; font-weight: 700; }
  .module-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; padding: 12px 16px; background: #e4edf0; border-left: 5px solid #073f4e; margin-bottom: 12px; }
  .module-header__title { font-family: 'Oswald', sans-serif; font-size: 14px; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: #073f4e; margin: 0; }
  .eval-box { border: 1px solid #dde4e8; border-top: 3px solid #073f4e; margin-bottom: 16px; page-break-inside: avoid; }
  .eval-box__row { display: flex; align-items: flex-start; border-bottom: 1px solid #eef0f2; min-height: 32px; }
  .eval-box__label { width: 150px; flex-shrink: 0; padding: 8px 12px; font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #9b9b9b; background: #f8fafb; border-right: 1px solid #eef0f2; }
  .eval-box__value { padding: 8px 14px; font-size: 11px; color: #1a2e35; flex: 1; }
  .eval-box__divider { height: 1px; background: #dde4e8; margin: 0; }
  .ink-fac { color: #1d4ed8 !important; }
  .ink-ass { color: #b91c1c !important; }
  .ink-mod { color: #15803d !important; }
  .q-block { margin-bottom: 16px; border-bottom: 1px solid #eef0f2; padding-bottom: 14px; page-break-inside: avoid; }
  .q-num { display: inline-flex; align-items: center; justify-content: center; width: 20px; height: 20px; background: #073f4e; color: #ffffff; font-family: 'Oswald', sans-serif; font-size: 9px; font-weight: 700; flex-shrink: 0; margin-right: 8px; }
  .q-text { font-family: 'Oswald', sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.02em; color: #073f4e; margin: 0 0 8px; display: flex; }
  .a-text { background: #f8fafb; border: 1px solid #e4edf0; border-left: 4px solid #9b9b9b; padding: 9px 12px; font-size: 11px; white-space: normal; overflow-wrap: break-word; color: #1a2e35; }
  .a-link { color: #0a5266; text-decoration: underline; font-weight: 600; }
  .a-annex { margin-top: 6px; padding: 7px 10px; background: #fffbeb; border: 1px solid #fde68a; border-left: 4px solid #d97706; font-size: 10px; }
  .f-block { margin-top: 7px; border: 1px solid #e4edf0; border-top: 2px solid #dde4e8; font-size: 10px; }
  .f-row { display: flex; align-items: flex-start; padding: 5px 10px; border-bottom: 1px solid #f0f4f6; gap: 6px; }
  .f-role { font-family: 'Oswald', sans-serif; font-size: 7.5px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; width: 90px; flex-shrink: 0; padding-top: 1px; }
  .f-comment { line-height: 1.5; flex: 1; }
  .openbook-notice { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; background: #f0f9ff; border: 1px solid #bae6fd; border-left: 4px solid #0ea5e9; margin-bottom: 14px; font-size: 11px; page-break-inside: avoid; }
  .openbook-notice__icon { font-family: 'Oswald', sans-serif; font-size: 8.5px; font-weight: 700; color: #0369a1; }
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

export const generateMasterPoE = onDocumentCreated(
  {
    document: "poe_export_requests/{requestId}",
    timeoutSeconds: 540,
    memory: "2GiB",
    region: "us-central1",
    secrets: [mailgunSecret],
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

      // =========================================================================================
      // GLOBAL SIGNATURE RESOLUTION
      // =========================================================================================
      const latestSub = submissions[submissions.length - 1];
      const primaryGradedSub = submissions.find((s) => s.assessorId);

      // THE "DAY 1" SIGNATURE (For POPIA, Induction, and Commitment)
      let dayOneLearnerSigUrl = null;
      if (
        learnerUserDoc?.signatureHistory &&
        learnerUserDoc.signatureHistory.length > 0
      ) {
        // Sort history by date ascending to get the oldest one
        const sortedHistory = [...learnerUserDoc.signatureHistory].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        );
        dayOneLearnerSigUrl = sortedHistory[0].url;
      } else {
        dayOneLearnerSigUrl = learner.authUid
          ? signaturesMap[learner.authUid]
          : null;
      }

      // THE "LATEST" SIGNATURE (For the Progress Report cover)
      const latestLearnerSigUrl =
        latestSub?.learnerDeclaration?.signatureUrl ||
        (learner.authUid ? signaturesMap[learner.authUid] : null);

      const primaryFacSigUrl =
        submissions[0]?.grading?.facilitatorSignatureUrl ||
        (primaryFacilitatorId ? signaturesMap[primaryFacilitatorId] : null);

      const globalAssessorSigUrl =
        primaryGradedSub?.grading?.assessorSignatureUrl ||
        (primaryGradedSub?.assessorId
          ? signaturesMap[primaryGradedSub.assessorId]
          : null);

      await updateProgress(30, "Building QCTO compliance document…");

      const companyLogoUrl =
        "https://firebasestorage.googleapis.com/v0/b/testpro-8f08c.appspot.com/o/Mlab-Grey-variation-1.png?alt=media&token=e85e0473-97cc-431d-8c08-7a3445806983";
      const offlineEvidenceFiles: EvidenceFile[] = [];

      // Groups assessments logically under their module header!
      const progressRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="4" class="empty-state">No modules mapped for this component.</td></tr>`;

        const groups: Record<string, Submission[]> = {};
        subs.forEach((s) => {
          const mod = s.moduleNumber || "Unlinked Assessments";
          if (!groups[mod]) groups[mod] = [];
          groups[mod].push(s);
        });

        let html = "";
        Object.keys(groups)
          .sort()
          .forEach((mod) => {
            html += `<tr class="mod-header-row">
                <td colspan="4">
                    <span class="mod-header-text">MODULE: ${mod}</span>
                </td>
            </tr>`;

            groups[mod]
              .sort(
                (a, b) =>
                  new Date(a.assignedAt || 0).getTime() -
                  new Date(b.assignedAt || 0).getTime(),
              )
              .forEach((s) => {
                const att = s.attemptNumber || 1;
                const attBadge =
                  att > 1
                    ? `<span class="badge badge--attempt">Attempt ${att}</span>`
                    : `<span class="badge badge--attempt1">1st</span>`;
                const compBadge = outcomeBadge(s.competency);
                const typeLabel = s.type
                  ? `<span class="badge--type">${s.type}</span>`
                  : "";

                html += `<tr>
                  <td></td>
                  <td style="padding-top:6px; padding-bottom:6px;">${typeLabel}<span style="vertical-align:middle;">${s.title || "Untitled"}</span></td>
                  <td class="text-center" style="vertical-align:middle;">${attBadge}</td>
                  <td class="text-center" style="vertical-align:middle;">${compBadge}</td>
                </tr>`;
              });
          });
        return html;
      };

      // Learning Plan Rows also grouped by Module Code!
      const learningPlanRows = (subs: Submission[]) => {
        if (!subs.length)
          return `<tr><td colspan="8" class="empty-state">No modules mapped.</td></tr>`;

        const groups: Record<string, Submission[]> = {};
        subs.forEach((s) => {
          const mod = s.moduleNumber || "Unlinked Assessments";
          if (!groups[mod]) groups[mod] = [];
          groups[mod].push(s);
        });

        let html = "";
        Object.keys(groups)
          .sort()
          .forEach((mod) => {
            html += `<tr class="mod-header-row">
                <td colspan="8">
                    <span class="mod-header-text">MODULE: ${mod}</span>
                </td>
            </tr>`;

            groups[mod]
              .sort(
                (a, b) =>
                  new Date(a.assignedAt || 0).getTime() -
                  new Date(b.assignedAt || 0).getTime(),
              )
              .forEach((s) => {
                const facName =
                  s.grading?.facilitatorName || s.facilitatorName || "Pending";
                const dateRange = `${fmt(s.assignedAt)} – ${fmt(s.gradedAt)}`;
                const compBadge = outcomeBadge(s.competency);
                const typeLabel = s.type
                  ? `<span class="badge--type">${s.type}</span>`
                  : "";

                html += `<tr>
                  <td class="nested-cell">${typeLabel}<span style="vertical-align:middle;">${s.title || "Untitled"}</span></td>
                  <td><span class="ink-fac">${facName}</span></td>
                  <td style="font-size:10px;">${dateRange}</td>
                  <td class="text-center font-bold">${s.moduleType === "knowledge" ? "✓" : ""}</td>
                  <td class="text-center font-bold">${s.moduleType === "practical" ? "✓" : ""}</td>
                  <td class="text-center font-bold">${s.moduleType === "workplace" ? "✓" : ""}</td>
                  <td class="text-center">${s.competency === "C" ? compBadge : ""}</td>
                  <td class="text-center">${s.competency === "NYC" ? compBadge : ""}</td>
                </tr>`;
              });
          });
        return html;
      };

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
  ${globalAssessorSigUrl ? `<img src="${globalAssessorSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
  <div class="sig-bar__date">Date: ${fmt(new Date())}</div>
</div>
<div class="pb"></div>`;

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

        // =========================================================================================
        // SIGNATURE SNAPSHOT RESOLUTION (PER MODULE)
        // =========================================================================================
        const learnerSigUrl =
          sub.learnerDeclaration?.signatureUrl ||
          (learner.authUid ? signaturesMap[learner.authUid] : null);
        const facSigUrl =
          sub.grading?.facilitatorSignatureUrl ||
          (sub.facilitatorId ? signaturesMap[sub.facilitatorId] : null);
        const assSigUrl =
          sub.grading?.assessorSignatureUrl ||
          (sub.assessorId ? signaturesMap[sub.assessorId] : null);
        const modSigUrl =
          sub.moderation?.moderatorSignatureUrl ||
          (sub.moderatorId ? signaturesMap[sub.moderatorId] : null);

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

        // PROMINENTLY DISPLAY THE TYPE OF ASSESSMENT
        html += `
<div class="module-header pbi">
  <div>
    <h2 class="module-header__title">${sub.title || "Untitled Module"}</h2>
    <div style="font-size:9px; color:#64748b; text-transform:uppercase; margin-top:3px; letter-spacing:0.05em; font-family:'Oswald', sans-serif;">
      ${sub.type || "Assessment Component"}
    </div>
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
    <div class="eval-box__value ink-fac">${cleanRichText(facFeedback)}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Assessor Feedback</div>
    <div class="eval-box__value ink-ass">${cleanRichText(assFeedback)}</div>
  </div>
  <div class="eval-box__row">
    <div class="eval-box__label">Moderator Review</div>
    <div class="eval-box__value ink-mod">${cleanRichText(modFeedback)}</div>
  </div>
</div>`;

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
                  formattedAnswer = cleanRichText(String(ans));
                }
              } else if (typeof ans === "object") {
                if (ans.text && ans.text !== "<p></p>")
                  formattedAnswer += `<div>${cleanRichText(ans.text)}</div>`;
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
                      subHtml += `<div>${cleanRichText(subAns.text)}</div>`;
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
                    formattedAnswer += `<div><strong>${k.replace(/_/g, " ")}:</strong> ${cleanRichText(subAns)}</div>`;
                  }
                });
              }
            }
            if (!formattedAnswer)
              formattedAnswer =
                '<em class="text-muted">No evidence provided for this item.</em>';

            const fLayer = grading.facilitatorBreakdown?.[block.id] || {};
            const aLayer = grading.assessorBreakdown?.[block.id] || {};
            const mLayer = moderation.breakdown?.[block.id] || {};

            const feedbackRows: string[] = [];
            const seenComments = new Set<string>();
            const addFb = (role: string, inkClass: string, text: string) => {
              const clean = cleanRichText(text?.trim());
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
  <div class="q-text"><span class="q-num">${qNum++}</span>${cleanRichText(block.question || block.title || "Checkpoint")}</div>
  <div class="a-text">${formattedAnswer}</div>
  ${feedbackRows.length ? `<div class="f-block">${feedbackRows.join("")}</div>` : ""}
</div>`;
          });
        } else {
          html += `<div class="empty-state">Assessment template is empty — evidence blocks not mapped.</div>`;
        }

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
      <div style="font-size:10.5px;"><strong>Assessor Feedback:</strong> <span class="ink-ass">${cleanRichText(pastFeedback)}</span></div>
      ${archiveLinkHtml}
    </div>`;
            });
            html += `</div>`;
          }
        } catch (err) {
          console.error(`History fetch failed for ${sub.id}`, err);
        }

        html += `
<div class="sig-row">
  ${sigCell("Learner Declaration", "learner", learnerSigUrl, learner.fullName || "Unknown", "", learnerDate)}
  ${sigCell("Facilitator Review", "fac", facSigUrl, facName, "", facDate)}
  ${sigCell("Assessor Endorsement", "assessor", assSigUrl, assessorName, assessorReg, assDate)}
  ${sigCell("Moderator Verification", "mod", modSigUrl, modName, modReg, modDate)}
</div>
<div class="pb"></div>`;
      }

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
  ${dayOneLearnerSigUrl ? `<img src="${dayOneLearnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
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
  ${dayOneLearnerSigUrl ? `<img src="${dayOneLearnerSigUrl}" class="sig-bar__img" />` : `<span class="sig-bar__pending">Pending digital signature</span>`}
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
  ${sigCell("Learner Acknowledgement", "learner", dayOneLearnerSigUrl, learner.fullName || "Learner", "", fmt(submissions[0]?.assignedAt || new Date()))}
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

          // Prefer snapshot saved on appeal, fallback to live profile map
          const revSig =
            s.appeal?.resolvedBySignatureUrl ||
            (revBy ? signaturesMap[revBy] : null);

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
      ${dc("Reason for Appeal", cleanRichText(s.appeal?.reason || "Not specified"))}
      ${dc("Appeal Status", (s.appeal?.status || "Pending").toUpperCase())}
      ${s.appeal?.resolutionNotes ? dc("Board Resolution", cleanRichText(s.appeal.resolutionNotes)) : ""}
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
  ${sigCell("Assessor Endorsement", "assessor", globalAssessorSigUrl, primaryAssessor, "", fmt(new Date()))}
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

          // Prefer snapshot, fallback to live profile map
          const facSig =
            log.facilitatorSignatureUrl ||
            (facId ? signaturesMap[facId] : null);

          // Using the latestLearnerSigUrl instead of globalLearnerSigUrl
          const learnerAckSig =
            log.learnerSignatureUrl ||
            (log.acknowledged ? latestLearnerSigUrl : null);

          const facName =
            log.facilitatorName ||
            s.grading?.facilitatorName ||
            s.facilitatorName ||
            "Assigned Facilitator";
          const facDate = fmt(log.date || s.assignedAt);
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
      <span class="data-cell__value ink-fac" style="display:block; margin-top:4px; font-weight:400; font-size:11px; line-height:1.6;">${cleanRichText(log.notes) || "Coaching session conducted to address NYC competency gaps and unlock learner for reassessment."}</span>
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

      html += `
<div class="pb"></div>
${dividerPage("9", "Annexures", "Identity documents, supporting compliance files, and evidence submissions uploaded by the learner — appended on the following pages.")}
</body></html>`;

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

      await updateProgress(85, "Merging annexures (identity & evidence)…");
      const masterPdf = await PDFDocument.create();
      const fontBold = await masterPdf.embedFont(StandardFonts.HelveticaBold);
      const basePdfDoc = await PDFDocument.load(puppeteerPdfBuffer);
      const basePages = await masterPdf.copyPages(
        basePdfDoc,
        basePdfDoc.getPageIndices(),
      );
      basePages.forEach((p) => masterPdf.addPage(p));

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
        const emailParams = {
          title: "Master PoE Ready",
          subtitle: learner.fullName,
          recipientName: "Admin",
          bodyHtml: `<p>The Master Portfolio of Evidence for <strong>${learner.fullName}</strong> has been generated successfully.</p>
                     <p>All sections, transcripts, and annexures have been compiled into a single QCTO-compliant PDF.</p>
                     <p style="font-size:11px; color:#9b9b9b;">Reference: ${requestId}</p>`,
          ctaText: "Download Master PoE PDF",
          ctaLink: downloadUrl,
          showStepIndicator: false,
        };

        await sendMailgunEmail({
          to: requesterEmail,
          subject: `Master PoE Ready — ${learner.fullName}`,
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        }).catch((err) => {
          console.warn("Email failed to send, but PoE was generated.", err);
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

// 1. Define exactly what data to expect from the frontend
interface InvitePayload {
  assessmentId: string;
  title: string;
  scheduledDate: string;
  timeLimit: number;
  cohortIds: string[];
  platformLink: string;
  moduleType?: string;
  assessmentType?: string;
  moduleNumber?: string;
  qualificationTitle?: string;
}

export const sendAssessmentCalendarInvites = onCall(
  { secrets: [mailgunSecret] },
  async (request: CallableRequest<InvitePayload>) => {
    logger.info("BACKEND: sendAssessmentCalendarInvites triggered.");

    const auth = request.auth;
    if (!auth) {
      logger.error("BACKEND: Unauthenticated request.");
      throw new HttpsError("unauthenticated", "Authentication required.");
    }

    const {
      assessmentId,
      title,
      scheduledDate,
      timeLimit,
      cohortIds,
      platformLink,
      moduleType,
      assessmentType,
      moduleNumber,
      qualificationTitle,
    } = request.data;

    logger.info(
      `BACKEND: Processing notifications for Assessment ID: ${assessmentId}`,
    );

    if (!cohortIds || !Array.isArray(cohortIds) || cohortIds.length === 0) {
      throw new HttpsError("invalid-argument", "Missing required parameters.");
    }

    try {
      const db = admin.firestore();
      const learnersMap = new Map<
        string,
        { email: string; fullName: string }
      >();

      for (const cohortId of cohortIds) {
        const enrollmentsSnap = await db
          .collection("enrollments")
          .where("cohortId", "==", cohortId)
          .get();
        for (const doc of enrollmentsSnap.docs) {
          const learnerId = doc.data().learnerId;
          const learnerSnap = await db
            .collection("learners")
            .doc(learnerId)
            .get();
          if (learnerSnap.exists) {
            const data = learnerSnap.data();
            if (data?.email) {
              learnersMap.set(data.email, {
                email: data.email,
                fullName: data.fullName || "Learner",
              });
            }
          }
        }
      }

      if (learnersMap.size === 0) {
        return { success: true, message: "No learner emails found." };
      }

      // DYNAMIC TERMINOLOGY BUILDER
      const formatLabel = (str?: string) =>
        str ? str.charAt(0).toUpperCase() + str.slice(1).toLowerCase() : "";
      let assessmentDescriptor = "Assessment / Activity";

      if (assessmentType && moduleType) {
        assessmentDescriptor = `${formatLabel(assessmentType)} ${formatLabel(moduleType)} Assessment`;
      } else if (assessmentType) {
        assessmentDescriptor = `${formatLabel(assessmentType)} Assessment`;
      } else if (moduleType) {
        assessmentDescriptor =
          moduleType.toLowerCase() === "workplace"
            ? "Workplace Logbook"
            : `${formatLabel(moduleType)} Module`;
      } else {
        assessmentDescriptor = "Practice Set / Activity";
      }

      const moduleMetaHtml =
        moduleNumber || qualificationTitle
          ? `
          <div style="margin-top: 10px; color: #475569; font-size: 13px;">
              ${moduleNumber ? `<strong>Module Code:</strong> ${moduleNumber} <br/>` : ""}
              ${qualificationTitle ? `<strong>Programme:</strong> ${qualificationTitle}` : ""}
          </div>
      `
          : "";

      const isScheduled = !!scheduledDate;
      let googleCalendarLink = "";
      let icsAttachment: any = null;
      let startDate: Date | null = null;
      let saastFormattedDate = "";

      if (isScheduled) {
        startDate = new Date(scheduledDate);
        const endDate = new Date(
          startDate.getTime() + (timeLimit || 60) * 60000,
        );

        // FORCE SERVER TO FORMAT DATE IN SOUTH AFRICAN TIME (SAST)
        saastFormattedDate = new Intl.DateTimeFormat("en-ZA", {
          timeZone: "Africa/Johannesburg",
          dateStyle: "full",
          timeStyle: "short",
        }).format(startDate);

        // UTC ISO string format required by Calendar/ICS: YYYYMMDDTHHmmSSZ
        const formatICSDate = (date: Date) =>
          date.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const dtStart = formatICSDate(startDate);
        const dtEnd = formatICSDate(endDate);
        const dtStamp = formatICSDate(new Date());

        // Web Link Fallback (Only supports default notifications)
        const eventTitle = encodeURIComponent(`mLab: ${title}`);
        const eventDetails = encodeURIComponent(
          `Your secure assessment module is scheduled.\n\nAccess Link: ${platformLink}`,
        );
        googleCalendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}`;

        //  STRICT .ICS FILE WITH 3 ALARMS
        const icsString = [
          "BEGIN:VCALENDAR",
          "VERSION:2.0",
          "PRODID:-//mLab//AssessmentPortal//EN",
          "CALSCALE:GREGORIAN",
          "METHOD:REQUEST",
          "BEGIN:VEVENT",
          `UID:assmnt-${assessmentId}-${Date.now()}@mlab.co.za`,
          `DTSTAMP:${dtStamp}`,
          `DTSTART:${dtStart}`,
          `DTEND:${dtEnd}`,
          `SUMMARY:mLab ${assessmentDescriptor}: ${title}`,
          `DESCRIPTION:Your assessment module is scheduled.\\n\\nAccess Link: ${platformLink}`,
          `URL:${platformLink}`,
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:mLab Assessment in 1 Day",
          "TRIGGER:-PT1440M", // 1440 mins = 1 day (More universally accepted than -P1D)
          "END:VALARM",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:mLab Assessment in 1 Hour",
          "TRIGGER:-PT60M", // 60 mins = 1 hour
          "END:VALARM",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:mLab Assessment starting soon!",
          "TRIGGER:-PT10M", // 10 mins
          "END:VALARM",
          "END:VEVENT",
          "END:VCALENDAR",
        ].join("\r\n");

        icsAttachment = {
          filename: `mLab_Assessment_${assessmentId}.ics`,
          data: Buffer.from(icsString, "utf-8"),
          contentType: "text/calendar",
        };
      }

      const emailPromises = Array.from(learnersMap.values()).map((learner) => {
        const emailParams = {
          title: isScheduled
            ? `${assessmentDescriptor} Scheduled`
            : `New ${assessmentDescriptor} Assigned`,
          subtitle: title,
          recipientName: learner.fullName,
          bodyHtml: isScheduled
            ? `
              <p>You have been scheduled for a new <strong>${assessmentDescriptor}</strong>: <em>${title}</em>.</p>
              ${moduleMetaHtml}
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                  <p style="margin: 0; color: #073f4e; font-size: 13px;"><strong>Scheduled Start:</strong> ${saastFormattedDate}</p>
              </div>
              <p><strong>Add to your calendar:</strong> For accurate reminders (1 day, 1 hour, and 10 minutes before), please open and save the attached <strong>.ics calendar file</strong>.</p>
              <p>Alternatively, click here to add it manually: <a href="${googleCalendarLink}" target="_blank" style="color: #0ea5e9; text-decoration: underline;">Google Calendar Web Link</a> <em>(Note: Web link only sets default reminders)</em></p>
              <p style="margin-top: 15px;">When the time comes, use the button below to access the platform.</p>
            `
            : `
              <p>A new <strong>${assessmentDescriptor}</strong> has been assigned to your class: <em>${title}</em>.</p>
              ${moduleMetaHtml}
              <p>It is now available in your portal. Please log in at your earliest convenience to review the requirements and begin.</p>
            `,
          ctaText: isScheduled
            ? "Go to Assessment Portal"
            : `Start ${assessmentDescriptor} Now`,
          ctaLink: platformLink,
          showStepIndicator: false,
        };

        const emailSubject = isScheduled
          ? `Action Required: Scheduled ${assessmentDescriptor} - ${title}`
          : `📚 New ${assessmentDescriptor} Assigned: ${title}`;

        const mailgunPayload: any = {
          to: learner.email,
          // to: "codetribe@mlab.co.za",
          subject: emailSubject,
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        };

        // Inject the attachment into the Mailgun payload if scheduled
        if (icsAttachment) {
          mailgunPayload.attachment = [icsAttachment];
        }

        return sendMailgunEmail(mailgunPayload)
          .then((res) => res)
          .catch((err) => {
            logger.error(`BACKEND: Mailgun FAILED for ${learner.email}:`, err);
            throw err;
          });
      });

      await Promise.all(emailPromises);

      return {
        success: true,
        message: `Notifications sent to ${learnersMap.size} learners.`,
      };
    } catch (error: any) {
      logger.error(
        "BACKEND: Critical error in sendAssessmentCalendarInvites:",
        error,
      );
      throw new HttpsError("internal", "Failed to process and send invites.");
    }
  },
);

// ============================================================================
// AUTOMATED ASSESSMENT SWEEPER (GOOGLE CLOUD TASKS)
// ============================================================================
import { CloudTasksClient } from "@google-cloud/tasks";

// This is an internal callable function your frontend will hit when publishing a scheduled exam
export const scheduleAssessmentSweep = onCall(
  async (
    request: CallableRequest<{
      assessmentId: string;
      scheduledEndTimeISO: string;
    }>,
  ) => {
    const auth = request.auth;
    if (!auth || auth.token.role === "learner") {
      throw new HttpsError(
        "permission-denied",
        "Unauthorized scheduling request.",
      );
    }

    const { assessmentId, scheduledEndTimeISO } = request.data;
    if (!assessmentId || !scheduledEndTimeISO) {
      throw new HttpsError("invalid-argument", "Missing required parameters.");
    }

    const scheduledEndTime = new Date(scheduledEndTimeISO);

    // Safety check: Don't schedule tasks in the past
    if (scheduledEndTime.getTime() <= Date.now()) {
      throw new HttpsError(
        "invalid-argument",
        "Cannot schedule an automated sweep in the past.",
      );
    }

    try {
      const client = new CloudTasksClient();

      // Safely extract the Google Cloud Project ID (works in both emulators and production)
      const project =
        process.env.GCLOUD_PROJECT ||
        JSON.parse(process.env.FIREBASE_CONFIG || "{}").projectId;
      const location = "us-central1"; // MUST match your Cloud Tasks Queue location
      const queue = "exam-sweeper-queue"; // MUST create this queue in GCP Console

      if (!project)
        throw new Error("Could not extract Firebase Project ID from config.");

      // The URL Google Cloud will call when the timer hits zero
      const targetUrl = `https://${location}-${project}.cloudfunctions.net/executeAssessmentSweep`;

      const parent = client.queuePath(project, location, queue);

      const task = {
        httpRequest: {
          httpMethod: "POST" as const,
          url: targetUrl,
          body: Buffer.from(JSON.stringify({ assessmentId })).toString(
            "base64",
          ),
          headers: { "Content-Type": "application/json" },
        },
        // Google Cloud Tasks expects seconds, not milliseconds
        scheduleTime: {
          seconds: Math.floor(scheduledEndTime.getTime() / 1000),
        },
      };

      const [response] = await client.createTask({ parent, task });
      logger.info(
        `Successfully scheduled auto-sweep task for assessment ${assessmentId}`,
      );

      return { success: true, taskId: response.name };
    } catch (error: any) {
      logger.error(
        " Failed to schedule Assessment Sweep to Google Cloud Tasks:",
        error,
      );
      throw new HttpsError(
        "internal",
        "Failed to schedule automated assessment closure.",
      );
    }
  },
);

// This is the safety-net HTTP endpoint that Google Cloud Tasks calls when the clock runs out
export const executeAssessmentSweep = onRequest((req, res) => {
  // Wrap in your existing CORS setup to ensure Cloud Run Health Checks pass
  return cors(req, res, async () => {
    if (req.method !== "POST") {
      res.status(405).send("Method Not Allowed");
      return;
    }

    const { assessmentId } = req.body;
    if (!assessmentId) {
      logger.error("Sweep Failed: Missing assessmentId in payload.");
      res.status(400).send("Bad Request: Missing assessmentId");
      return;
    }

    const db = admin.firestore();

    try {
      logger.info(` Executing Assessment Auto-Sweep for ${assessmentId}...`);

      // THE SAFETY NET: Check the Master Assessment
      const assessmentSnap = await db
        .collection("assessments")
        .doc(assessmentId)
        .get();
      if (!assessmentSnap.exists) {
        logger.warn(
          `Sweep Aborted: Assessment ${assessmentId} no longer exists.`,
        );
        res.status(200).send("Aborted: Assessment not found.");
        return;
      }

      const assessmentData = assessmentSnap.data();

      // If the assessment was cancelled, unpublished, or paused, DO NOT execute the sweep!
      if (
        assessmentData?.status !== "active" &&
        assessmentData?.status !== "completed" &&
        assessmentData?.status !== "scheduled"
      ) {
        logger.warn(
          `Sweep Aborted: Assessment ${assessmentId} is not active (Current status: ${assessmentData?.status}).`,
        );
        res.status(200).send("Aborted: Assessment is not active.");
        return;
      }

      // THE SWEEP: Find ghost learners
      const submissionsSnap = await db
        .collection("learner_submissions")
        .where("assessmentId", "==", assessmentId)
        .where("status", "==", "not_started")
        .get();

      if (submissionsSnap.empty) {
        logger.info(
          `Sweep Complete: No absent learners found for ${assessmentId}.`,
        );
        res.status(200).send("Complete: No missed submissions.");
        return;
      }

      // THE EXECUTION: Mark them as missed
      const batch = db.batch();
      let sweptCount = 0;

      submissionsSnap.docs.forEach((docSnap) => {
        const subData = docSnap.data();

        // Double-check the overrideUnlock flag for deferred access
        if (subData.overrideUnlock === true) {
          logger.info(
            `Skipping Learner ${subData.learnerId} - They have deferred access granted.`,
          );
          return;
        }

        batch.update(docSnap.ref, {
          status: "missed",
          lastStaffEditAt: new Date().toISOString(),
          systemNote:
            "Auto-swept: Learner failed to start assessment within the scheduled window.",
        });
        sweptCount++;
      });

      if (sweptCount > 0) {
        await batch.commit();
        logger.info(
          `Successfully swept ${sweptCount} ghost submissions to 'missed' for assessment ${assessmentId}`,
        );
      } else {
        logger.info(
          `Sweep Complete: All pending learners had deferred access overrides.`,
        );
      }

      res.status(200).send(`Swept ${sweptCount} submissions.`);
    } catch (error) {
      logger.error(
        ` Critical error during assessment sweep for ${assessmentId}:`,
        error,
      );
      res.status(500).send("Internal Server Error during sweep.");
    }
  });
});

export const cancelAssessmentSweep = onCall(
  async (request: CallableRequest<{ taskId: string }>) => {
    const auth = request.auth;
    if (!auth || auth.token.role === "learner") {
      throw new HttpsError(
        "permission-denied",
        "Unauthorized cancellation request.",
      );
    }

    const { taskId } = request.data;
    if (!taskId) return { success: true, message: "No task ID provided." };

    try {
      const client = new CloudTasksClient();
      await client.deleteTask({ name: taskId });
      logger.info(`Successfully cancelled Google Cloud Task: ${taskId}`);
      return { success: true, message: "Scheduled sweep cancelled." };
    } catch (error: any) {
      if (error.code === 5) {
        logger.info(
          `Task ${taskId} not found. Likely already executed or deleted.`,
        );
        return { success: true, message: "Task already executed or deleted." };
      }
      logger.error(` Failed to cancel task ${taskId}:`, error);
      throw new HttpsError("internal", "Failed to cancel scheduled task.");
    }
  },
);

// ============================================================================
// GEMINI AI: SESSION REPORT GENERATORS (DEBUG / TEST MODE)
// ============================================================================

const openAISecret = defineSecret("OPENAI_API_KEY");

export const draftSessionReport = onCall(
  { secrets: [openAISecret] },
  async (request) => {
    logger.info("BACKEND: draftSessionReport triggered using OpenAI.");
    const auth = request.auth;

    if (!auth || !["facilitator", "admin"].includes(auth.token.role)) {
      throw new HttpsError("permission-denied", "Unauthorized access.");
    }

    const {
      topics,
      moduleNames,
      programmeName,
      nqfLevel,
      saqaId,
      qctoId,
      credits,
      facilitatorName,
      preferences,
    } = request.data;

    const apiKey = openAISecret.value();

    if (!apiKey) {
      throw new HttpsError(
        "internal",
        "Server configuration error: Missing OpenAI API Key.",
      );
    }

    try {
      const openai = new OpenAI({ apiKey });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an elite, strict QCTO (Quality Council for Trades and Occupations) and SETA compliance administrator and master educational facilitator in South Africa. You strictly utilize South African outcomes-based education terminology. Maintain a highly formal, academic, and audit-ready tone. Output ONLY valid HTML. Do not include markdown blocks like ```html.",
          },
          {
            role: "user",
            content: `
            Draft a highly professional Session Report for:
            - Facilitator: ${facilitatorName}
            - Programme: ${programmeName} (NQF: ${nqfLevel}, SAQA ID: ${saqaId}, QCTO ID: ${qctoId}, Credits: ${credits})
            - Modules: ${moduleNames}
            - Topics Covered: ${topics.map((t: any) => t.title).join(", ")}
            - Facilitation Style/Preferences: ${preferences || "Interactive lecture with practical lab exercises."}

            Requirements:
            1. Expand on the topics to create realistic Learning Outcomes and Objectives.
            2. Describe the Teaching Activities using the Facilitator's Style.
            3. Keep the tone formal, academic, and audit-ready.
            4. Output ONLY clean HTML. Do not include markdown blocks.
            5. ALL text and headers MUST use inline styles for pure black ink: style="color: #000000;"

            Use exactly this structure:
            <h3 style="color: #000000;">1. Programme & Module Information</h3>
            <p style="color: #000000;"><strong>Programme:</strong> ${programmeName}</p>
            <p style="color: #000000;"><strong>SAQA ID:</strong> ${saqaId} | <strong>QCTO / Curriculum ID:</strong> ${qctoId}</p>
            <p style="color: #000000;"><strong>NQF Level:</strong> ${nqfLevel} | <strong>Total Credits:</strong> ${credits}</p>
            <p style="color: #000000;"><strong>Module(s) Covered:</strong> ${moduleNames}</p>
            
            <h3 style="color: #000000;">2 & 3. Outcomes & Objectives</h3>
            [List here]
            <h3 style="color: #000000;">4. Content / Key Learning Areas</h3>
            [List here]
            <h3 style="color: #000000;">5 & 10. Teaching Activities & Facilitation Approach</h3>
            [Paragraph here]
            <h3 style="color: #000000;">6. Resources & Materials</h3>
            [Paragraph here]
            <h3 style="color: #000000;">7. Time Allocation</h3>
            [List here]
            <h3 style="color: #000000;">8 & 9. Assessment Strategy & Evidence</h3>
            [Paragraph here]
            <h3 style="color: #000000;">11. Learner Support & Remediation</h3>
            [Paragraph here]
            <h3 style="color: #000000;">12. Evaluation & Reflection</h3>
            <p style="color: #000000;"><em>[Facilitator to add reflection notes here]</em></p>
            <h3 style="color: #000000;">13. Alignment to Workplace</h3>
            [Paragraph here]
            <hr />
            <p style="color: #000000;"><strong>14. Compliance Sign-Off</strong></p>
            <p style="color: #000000;"><strong>Delivered By:</strong> ${facilitatorName}</p>
            <p style="color: #000000;"><strong>Date Logged:</strong> ${new Date().toLocaleDateString()}</p>
            <p style="color: #000000;"><em>Digitally Authenticated by mLab Assessment Centre</em></p>
          `,
          },
        ],
        temperature: 0.7,
      });

      let htmlResponse = completion.choices[0].message.content || "";
      htmlResponse = htmlResponse
        .replace(/```html/g, "")
        .replace(/```/g, "")
        .trim();

      return { success: true, html: htmlResponse };
    } catch (error: any) {
      logger.error("OpenAI API Error:", error);
      throw new HttpsError(
        "internal",
        `AI Error: ${error.message || "Failed to generate report."}`,
      );
    }
  },
);

export const enhanceText = onCall(
  { secrets: [openAISecret] },
  async (request) => {
    logger.info("BACKEND: enhanceText triggered.");
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "Unauthorized access.");

    const { text } = request.data;

    const apiKey = openAISecret.value();

    if (!apiKey) {
      throw new HttpsError(
        "internal",
        "Server configuration error: Missing AI API Key.",
      );
    }

    try {
      const openai = new OpenAI({ apiKey });

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an elite, strict QCTO (Quality Council for Trades and Occupations) and SETA compliance administrator and master educational facilitator in South Africa. Your ONLY purpose is to draft, review, and enhance formal Session Reports, Lesson Plans, and academic reflections. You must strictly utilize South African outcomes-based education terminology. Maintain a highly formal, academic, and audit-ready tone. Output ONLY the rewritten text with no markdown formatting.",
          },
          {
            role: "user",
            content: `Rewrite the following text to sound highly professional, academic, and suitable for a formal QCTO compliance audit document. Expand it slightly if it is too brief, but keep the core meaning exactly the same. Text to enhance: "${text}"`,
          },
        ],
      });

      return {
        success: true,
        text: completion.choices[0].message.content?.trim(),
      };
    } catch (error: any) {
      logger.error("OpenAI Enhance Error:", error);
      throw new HttpsError("internal", `AI Enhance Error: ${error.message}`);
    }
  },
);
// ============================================================================
// AUTOMATED COMPLIANCE SWEEPERS (HOURLY CRON JOBS)
// ============================================================================

export const enforceProfessionalismScores = onSchedule(
  "every 1 hours",
  async (event) => {
    const db = admin.firestore();
    const now = new Date();

    try {
      logger.info("⏳ Running Professionalism Score Sweeper...");

      // Find all curriculum logs where the 48hr deadline has passed
      const expiredLogsSnap = await db
        .collection("curriculum_logs")
        .where("deadlineAt", "<", now.toISOString())
        .get();

      if (expiredLogsSnap.empty) return;

      const batch = db.batch();
      let penaltyCount = 0;

      for (const logDoc of expiredLogsSnap.docs) {
        const logData = logDoc.data();
        const cohortId = logData.cohortId;
        const acknowledgedBy = logData.acknowledgedBy || [];
        const penalizedLearners = logData.penalizedLearners || [];

        // Get all active learners in this cohort
        const enrollmentsSnap = await db
          .collection("enrollments")
          .where("cohortId", "==", cohortId)
          .where("status", "==", "active")
          .get();

        const allLearnerIds = enrollmentsSnap.docs.map(
          (d) => d.data().learnerId,
        );

        // Figure out who DID NOT acknowledge it, and hasn't been penalized for this specific log yet
        const stragglers = allLearnerIds.filter(
          (id) =>
            !acknowledgedBy.includes(id) && !penalizedLearners.includes(id),
        );

        if (stragglers.length > 0) {
          for (const learnerId of stragglers) {
            const learnerRef = db.collection("learners").doc(learnerId);
            // Deduct 2 points, reset streak to 0
            batch.update(learnerRef, {
              professionalismScore: FieldValue.increment(-2),
              professionalismStreak: 0,
              lastPenaltyAt: now.toISOString(),
            });
            penaltyCount++;
          }

          // Add stragglers to the penalized list to prevent double-charging
          batch.update(logDoc.ref, {
            penalizedLearners: FieldValue.arrayUnion(...stragglers),
          });
        }
      }

      if (penaltyCount > 0) {
        await batch.commit();
        logger.info(
          `🚨 Sweeper executed. Deducted points from ${penaltyCount} stragglers.`,
        );
      }
    } catch (error) {
      logger.error(" Critical error in Professionalism Sweeper:", error);
    }
  },
);

export const autoLockSessionReports = onSchedule(
  "every 1 hours",
  async (event) => {
    const db = admin.firestore();
    const now = new Date();
    // 48 hours ago
    const cutoff = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();

    try {
      logger.info("⏳ Running Session Report Auto-Locker...");

      // Find drafts where the dateLogged was more than 48 hours ago
      const expiredDraftsSnap = await db
        .collection("session_reports")
        .where("status", "==", "draft")
        .where("dateLogged", "<", cutoff)
        .get();

      if (expiredDraftsSnap.empty) return;

      const batch = db.batch();

      expiredDraftsSnap.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          status: "final",
          lockedAt: now.toISOString(),
          systemNote: "Auto-locked after 48-hour draft window expired.",
        });
      });

      await batch.commit();
      logger.info(
        `🔒 Auto-locked ${expiredDraftsSnap.size} expired session reports.`,
      );
    } catch (error) {
      logger.error(" Critical error in Session Report Auto-Locker:", error);
    }
  },
);

// ============================================================================
// LEARNER ACTION (ACKNOWLEDGE TOPIC)
// ============================================================================

export const acknowledgeCurriculumTopic = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");

  const { logId, learnerId } = request.data;
  if (!logId || !learnerId)
    throw new HttpsError("invalid-argument", "Missing data.");

  const db = admin.firestore();

  try {
    const logRef = db.collection("curriculum_logs").doc(logId);
    const learnerRef = db.collection("learners").doc(learnerId);

    // Run as a transaction to ensure score capping is accurate
    await db.runTransaction(async (transaction) => {
      const learnerDoc = await transaction.get(learnerRef);
      if (!learnerDoc.exists) throw new Error("Learner not found");

      const currentScore = learnerDoc.data()?.professionalismScore ?? 100;

      transaction.update(logRef, {
        acknowledgedBy: FieldValue.arrayUnion(learnerId),
      });

      // Reward: +1 to streak, +1 to score (capped at 100)
      const newScore = Math.min(100, currentScore + 1);

      transaction.update(learnerRef, {
        professionalismScore: newScore,
        professionalismStreak: FieldValue.increment(1),
      });
    });

    return { success: true, message: "Topic acknowledged. Score updated!" };
  } catch (error: any) {
    logger.error("Failed to acknowledge topic:", error);
    throw new HttpsError("internal", "Failed to process acknowledgement.");
  }
});

// Runs every night at Midnight (SAST)
export const midnightInactivityPenalty = onSchedule(
  {
    schedule: "0 0 * * *",
    timeZone: "Africa/Johannesburg",
  },
  async (event) => {
    const db = admin.firestore();
    const now = new Date().toISOString();

    console.log("Running Midnight Penalty Engine...");

    try {
      // Find all curriculum logs where the deadline has PASSED
      const overdueLogsSnap = await db
        .collection("curriculum_logs")
        .where("deadlineAt", "<", now)
        .get();

      if (overdueLogsSnap.empty) {
        console.log(" No overdue tasks found.");
        return;
      }

      // Track exactly how many points to deduct per learner
      const penaltiesToApply: Record<string, number> = {};

      overdueLogsSnap.forEach((doc) => {
        const log = doc.data();
        const targetLearners = log.targetLearners || [];
        const acknowledgedBy = log.acknowledgedBy || [];
        const penalizedLearners = log.penalizedLearners || [];

        targetLearners.forEach((learnerId: string) => {
          // If they haven't acknowledged it, AND haven't been penalized for this specific task yet
          if (
            !acknowledgedBy.includes(learnerId) &&
            !penalizedLearners.includes(learnerId)
          ) {
            // Add a penalty mark for this learner
            if (!penaltiesToApply[learnerId]) penaltiesToApply[learnerId] = 0;
            penaltiesToApply[learnerId] += 2;

            // Mark them as penalized on the log so we don't hit them again tomorrow for the SAME task
            doc.ref.update({
              penalizedLearners:
                admin.firestore.FieldValue.arrayUnion(learnerId),
            });
          }
        });
      });

      // Apply the penalties to the actual Learner profiles using a Batch Write
      const batch = db.batch();
      let batchCount = 0;

      for (const [learnerId, penaltyPoints] of Object.entries(
        penaltiesToApply,
      )) {
        const learnerRef = db.collection("learners").doc(learnerId);

        // Reset streak to 0, deduct points
        batch.update(learnerRef, {
          professionalismScore:
            admin.firestore.FieldValue.increment(-penaltyPoints),
          professionalismStreak: 0,
        });

        batchCount++;
        console.log(
          `Penalized Learner ${learnerId}: -${penaltyPoints} points & lost streak.`,
        );
      }

      if (batchCount > 0) {
        await batch.commit();
        console.log(
          `Successfully applied penalties to ${batchCount} learners.`,
        );
      }
    } catch (error) {
      console.error(" Midnight Penalty Engine Failed:", error);
    }
  },
);

// Run manually via browser to test the Midnight Penalty Logic
export const testMidnightPenalty = onRequest(async (req, res) => {
  const db = admin.firestore();

  // Use current time to check deadlines
  const now = new Date().toISOString();

  try {
    console.log("🔍 Scanning for overdue curriculum tasks...");

    // Find all curriculum logs where the deadline has PASSED
    const overdueLogsSnap = await db
      .collection("curriculum_logs")
      .where("deadlineAt", "<", now)
      .get();

    if (overdueLogsSnap.empty) {
      res.status(200).json({
        success: true,
        message: "No overdue tasks found right now.",
        penalizedCount: 0,
      });
      return;
    }

    const penaltiesToApply: Record<string, number> = {};
    const logsUpdated: any[] = [];

    // Loop through every overdue task
    for (const doc of overdueLogsSnap.docs) {
      const log = doc.data();
      const cohortId = log.cohortId;
      const acknowledgedBy = log.acknowledgedBy || [];
      const penalizedLearners = log.penalizedLearners || [];

      if (!cohortId) continue;

      // Find all ACTIVE learners in this specific class
      const enrollsSnap = await db
        .collection("enrollments")
        .where("cohortId", "==", cohortId)
        .where("status", "in", ["active", "in-progress"])
        .get();

      const cohortLearnerIds = enrollsSnap.docs.map((d) => d.data().learnerId);
      let logNeedsUpdate = false;

      // Check if each learner is guilty of ghosting this task
      cohortLearnerIds.forEach((learnerId) => {
        // If they HAVEN'T acknowledged it AND we HAVEN'T punished them for it yet
        if (
          !acknowledgedBy.includes(learnerId) &&
          !penalizedLearners.includes(learnerId)
        ) {
          if (!penaltiesToApply[learnerId]) penaltiesToApply[learnerId] = 0;
          penaltiesToApply[learnerId] += 2;

          penalizedLearners.push(learnerId);
          logNeedsUpdate = true;
        }
      });

      // Stage the log document to be saved with the updated 'penalizedLearners' array
      if (logNeedsUpdate) {
        logsUpdated.push({ ref: doc.ref, penalizedLearners });
      }
    }

    // Apply all the changes at once using a Batch Write
    const batch = db.batch();
    let batchCount = 0;

    // Apply the score drops to the Learners
    for (const [learnerId, penaltyPoints] of Object.entries(penaltiesToApply)) {
      const learnerRef = db.collection("learners").doc(learnerId);

      batch.update(learnerRef, {
        professionalismScore:
          admin.firestore.FieldValue.increment(-penaltyPoints),
        professionalismStreak: 0, // 💥 Reset streak to 0
      });
      batchCount++;
    }

    // Update the logs so we don't double-penalize them tomorrow
    for (const logUpdate of logsUpdated) {
      batch.update(logUpdate.ref, {
        penalizedLearners: logUpdate.penalizedLearners,
      });
    }

    // Commit the batch to Firebase
    if (batchCount > 0 || logsUpdated.length > 0) {
      await batch.commit();
    }

    // Return a beautiful JSON report to your browser!
    res.status(200).json({
      success: true,
      message: "Penalty Engine Ran Successfully!",
      totalOverdueTasksScanned: overdueLogsSnap.size,
      learnersPenalized: batchCount,
      penaltyDetails: penaltiesToApply,
    });
  } catch (error: any) {
    console.error(" Penalty Engine Failed:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export const startAssessment = onCall(async (request) => {
  const auth = request.auth;
  if (!auth || auth.token.role !== "learner") {
    throw new HttpsError(
      "permission-denied",
      "Only learners can start assessments.",
    );
  }

  const { submissionId } = request.data;

  try {
    const subRef = admin
      .firestore()
      .collection("learner_submissions")
      .doc(submissionId);
    const subSnap = await subRef.get();

    if (!subSnap.exists) {
      throw new HttpsError("not-found", "Assessment not found.");
    }

    const subData = subSnap.data();

    //  QCTO COMPLIANCE GATE (Only runs if it's a Summative)
    if (subData?.type?.toLowerCase().includes("summative")) {
      const cohortId = subData.cohortId;
      const learnerId = subData.learnerId;
      const moduleCode = subData.moduleNumber;

      // Are there any pending curriculum topics for this module?
      const logsSnap = await admin
        .firestore()
        .collection("curriculum_logs")
        .where("cohortId", "==", cohortId)
        .where("moduleCode", "==", moduleCode)
        .get();

      const pendingLogs = logsSnap.docs.filter((doc) => {
        const log = doc.data();
        return (
          !log.acknowledgedBy?.includes(learnerId) &&
          new Date(log.deadlineAt) > new Date()
        );
      });

      if (pendingLogs.length > 0) {
        throw new HttpsError(
          "failed-precondition",
          "You must acknowledge all curriculum topics for this module before starting the Summative Assessment.",
        );
      }

      // Did they pass the Formative? (Checking history for a Competent Formative in this module)
      const formativeSnap = await admin
        .firestore()
        .collection("learner_submissions")
        .where("learnerId", "==", learnerId)
        .where("moduleNumber", "==", moduleCode)
        .where("status", "==", "moderated")
        .where("competency", "==", "C")
        .get();

      const hasFacilitatorOverride = subData.facilitatorOverride === true;

      // If they didn't pass the formative AND don't have an override, block them.
      if (formativeSnap.empty && !hasFacilitatorOverride) {
        throw new HttpsError(
          "failed-precondition",
          "You must achieve Competency on the Formative assessment before attempting the Summative.",
        );
      }
    }

    // Start the exam clock!
    const now = new Date().toISOString();
    await subRef.update({
      status: "in_progress",
      startedAt: now,
    });

    return { success: true, startedAt: now };
  } catch (error: any) {
    // Prevent our custom HTTP errors from being overwritten by generic internal errors
    if (error instanceof HttpsError) {
      throw error;
    }
    throw new HttpsError(
      "internal",
      error.message || "Failed to start assessment.",
    );
  }
});

// ───SECURELY DECLARE THE SECRET ──────────────────────────────

export const sendHolidayGoodwill = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "Africa/Johannesburg",
    secrets: [openAISecret],
  },
  async (event) => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const todayString = `${year}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      // Check if today is a public holiday in South Africa
      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`,
      );
      if (!response.ok) throw new Error(`Failed to fetch holidays`);

      const holidays = await response.json();
      const todayHoliday = holidays.find((h: any) => h.date === todayString);

      if (!todayHoliday) return;

      const holidayName = todayHoliday.localName;

      // Retrieve the secret safely at runtime
      const apiKey = openAISecret.value();

      if (!apiKey) throw new Error("Missing OpenAI API Key in Secret Manager");

      const openai = new OpenAI({ apiKey });

      // Generate the dynamic, contextual message
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "user",
            content: `
              Today is ${holidayName} in South Africa. 
              Write a short, powerful, and inspiring push notification for young software development learners at 'CodeTribe'.
              
              Requirements:
              1. Acknowledge the historical significance of the day.
              2. Connect this history to their current journey: remind them not to take their freedom and opportunities for granted.
              3. Encourage them to honor these sacrifices by upskilling themselves in tech.
              4. Keep it under 3 sentences. Tone should be respectful, highly motivating, and tech-forward.
            `,
          },
        ],
      });

      const generatedMessage =
        completion.choices[0].message.content?.trim() ||
        `Happy ${holidayName}! Keep coding and building the future.`;

      // Send Push Notification via Firebase Cloud Messaging
      const messagePayload = {
        notification: { title: `${holidayName} 🇿🇦`, body: generatedMessage },
        topic: "all_learners",
        data: { type: "holiday", route: "/notifications" },
      };

      await admin.messaging().send(messagePayload);

      // Save to Firestore for in-app viewing
      await admin
        .firestore()
        .collection("notifications")
        .add({
          recipientId: "all_learners",
          type: "holiday",
          title: `${holidayName}`,
          message: generatedMessage,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          read: false,
        });

      logger.info(
        `Successfully broadcasted ${holidayName} goodwill message to all learners.`,
      );
    } catch (error) {
      logger.error(" Error in sendHolidayGoodwill function:", error);
    }
  },
);

// ============================================================================
// IN-APP NOTIFICATION ENGINE
// ============================================================================

/**
 * Trigger: When a Facilitator Approves or Declines a Leave Request
 */
export const onLeaveStatusChanged = onDocumentUpdated(
  { document: "leave_requests/{requestId}" },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

    // Only trigger if it changed FROM Pending TO Approved or Declined
    if (
      beforeData.status === "Pending" &&
      (afterData.status === "Approved" || afterData.status === "Declined")
    ) {
      const learnerId = afterData.learnerId;
      const status = afterData.status;
      const leaveType = afterData.type || "Leave";

      try {
        await admin
          .firestore()
          .collection("notifications")
          .add({
            recipientId: learnerId,
            type: "leave",
            title: `Leave ${status}`,
            message: `Your request for ${leaveType} has been ${status.toLowerCase()} by your facilitator.`,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
          });
        logger.info(`Leave notification generated for ${learnerId}`);
      } catch (error) {
        logger.error(" Failed to generate leave notification", error);
      }
    }
  },
);

/**
 * Trigger: When a Learner successfully scans the Kiosk
 */
export const onScanLogged = onDocumentCreated(
  { document: "live_attendance_scans/{scanId}" },
  async (event) => {
    const scanData = event.data?.data();
    if (!scanData) return;

    const learnerId = scanData.learnerId;
    const isManual = scanData.method === "manual";

    const message = isManual
      ? "Your facilitator has manually logged your attendance for this session."
      : "Your attendance scan was recorded successfully.";

    try {
      await admin.firestore().collection("notifications").add({
        recipientId: learnerId,
        type: "scan",
        title: "Scan Successful",
        message: message,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
      });
    } catch (error) {
      logger.error(" Failed to generate scan notification", error);
    }
  },
);

export const generateDailyKioskPins = onSchedule(
  {
    schedule: "0 6 * * 1-5", // Runs 6:00 AM, Monday to Friday ONLY
    timeZone: "Africa/Johannesburg",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [mailgunSecret],
  },
  async (event) => {
    try {
      const db = admin.firestore();

      // Securely format today's date as YYYY-MM-DD based on SAST
      const now = new Date();
      const sastDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const currentYear = sastDate.getUTCFullYear();
      const todayString = `${currentYear}-${String(sastDate.getUTCMonth() + 1).padStart(2, "0")}-${String(sastDate.getUTCDate()).padStart(2, "0")}`;

      // DYNAMIC HOLIDAY CHECK VIA API
      try {
        logger.info(
          `Fetching SA public holidays for ${currentYear} from API...`,
        );
        // Nager.Date is a free, reliable, no-auth API for global public holidays
        const response = await fetch(
          `https://date.nager.at/api/v3/PublicHolidays/${currentYear}/ZA`,
        );

        if (response.ok) {
          const holidays = await response.json();
          const holidayDates = holidays.map((h: any) => h.date);

          if (holidayDates.includes(todayString)) {
            // Find the specific name of the holiday for the logs
            const holidayName =
              holidays.find((h: any) => h.date === todayString)?.name ||
              "Public Holiday";
            logger.info(
              `Today (${todayString}) is ${holidayName}. Skipping auto-generation.`,
            );
            return; // Exit early, no PINs generated today!
          }
        } else {
          logger.warn(
            `Holiday API returned status ${response.status}. Proceeding with normal execution as fallback.`,
          );
        }
      } catch (apiError) {
        logger.error(
          "Failed to fetch public holidays from API. Proceeding with normal execution.",
          apiError,
        );
      }

      logger.info(`Generating Kiosk PINs for: ${todayString}`);

      // Get all active cohorts
      const cohortsSnap = await db
        .collection("cohorts")
        .where("isArchived", "==", false)
        .get();

      if (cohortsSnap.empty) {
        logger.info("No active cohorts found. Skipping execution.");
        return;
      }

      // Initialize Firestore Batch & Promise Array
      const batch = db.batch();
      const emailPromises: Promise<any>[] = [];
      let count = 0;

      for (const doc of cohortsSnap.docs) {
        const cohortData = doc.data();

        // Only generate for cohorts that have a facilitator assigned
        if (!cohortData.facilitatorId) continue;

        // Generate a secure 6-digit random PIN
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const cohortName = cohortData.name || "Unnamed Cohort";

        // Create a new document reference in 'kiosk_sessions'
        const sessionRef = db.collection("kiosk_sessions").doc();

        batch.set(sessionRef, {
          pin: pin,
          cohortId: doc.id,
          cohortName: cohortName,
          facilitatorId: cohortData.facilitatorId,
          date: todayString,
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        count++;

        // Fetch Facilitator Data to send the email
        const facSnap = await db
          .collection("users")
          .doc(cohortData.facilitatorId)
          .get();

        if (facSnap.exists) {
          const facData = facSnap.data();
          if (facData?.email) {
            // DYNAMIC MLAB EMAIL TEMPLATE
            const emailParams = {
              title: "Today's Kiosk PIN",
              subtitle: cohortName,
              recipientName: facData.fullName || "Facilitator",
              bodyHtml: `
                      <p>Good morning! Your live attendance kiosk PIN for today has been securely generated.</p>
                      <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0; text-align: center;">
                          <p style="margin: 0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">Secure Access Code</p>
                          <p style="margin: 5px 0 0; color: #073f4e; font-size: 34px; font-weight: bold; font-family: monospace; letter-spacing: 0.2em;">${pin}</p>
                      </div>
                      <p>To project today's rotating QR code, simply open the Kiosk page on your classroom's Smart TV or tablet and enter this code.</p>
                    `,
              ctaText: "Open TV Kiosk Now",
              ctaLink: `${APP_URL}/kiosk`,
              showStepIndicator: false,
            };

            // Push the email request to the promise array
            emailPromises.push(
              sendMailgunEmail({
                to: facData.email,
                subject: `Hub Kiosk PIN: ${pin} (${cohortName})`,
                text: buildMlabEmailPlainText(emailParams),
                html: buildMlabEmailHtml(emailParams),
              }).catch((err) => {
                logger.error(
                  `Failed to send PIN email to ${facData.email}`,
                  err,
                );
              }),
            );
          }
        }
      }

      // Commit the batch and send emails
      if (count > 0) {
        await batch.commit();
        logger.info(
          `Successfully saved ${count} daily Kiosk PINs to Firestore.`,
        );

        // Wait for all Mailgun emails to be dispatched
        await Promise.all(emailPromises);
        logger.info(
          `Successfully dispatched ${emailPromises.length} PIN emails.`,
        );
      }
    } catch (error) {
      logger.error("Error generating daily Kiosk PINs:", error);
    }
  },
);

export const testGenerateKioskPins = onRequest(
  {
    secrets: [mailgunSecret],
    timeoutSeconds: 120,
    memory: "256MiB",
  },
  async (req, res) => {
    try {
      const db = admin.firestore();

      // HARDCODED TEST EMAIL
      // Change this to your personal email to receive the test PINs
      const TEST_EMAIL = "codetribe@mlab.co.za";
      // const TEST_EMAIL = "fca63821@laoia.com";

      // Securely format today's date as YYYY-MM-DD based on SAST
      const now = new Date();
      const sastDate = new Date(now.getTime() + 2 * 60 * 60 * 1000);
      const todayString = `${sastDate.getUTCFullYear()}-${String(sastDate.getUTCMonth() + 1).padStart(2, "0")}-${String(sastDate.getUTCDate()).padStart(2, "0")}`;

      logger.info(`[TEST MODE] Generating Kiosk PINs for: ${todayString}`);

      // Get all active cohorts
      const cohortsSnap = await db
        .collection("cohorts")
        .where("isArchived", "==", false)
        .get();

      if (cohortsSnap.empty) {
        logger.info("No active cohorts found. Skipping execution.");
        res
          .status(200)
          .send({ success: true, message: "No active cohorts found." });
        return;
      }

      // Initialize Firestore Batch & Promise Array
      const batch = db.batch();
      const emailPromises: Promise<any>[] = [];
      let count = 0;

      for (const doc of cohortsSnap.docs) {
        const cohortData = doc.data();

        // Only generate for cohorts that have a facilitator assigned
        if (!cohortData.facilitatorId) continue;

        // Generate a secure 6-digit random PIN
        const pin = Math.floor(100000 + Math.random() * 900000).toString();
        const cohortName = cohortData.name || "Unnamed Cohort";

        // Create a new document reference in 'kiosk_sessions'
        const sessionRef = db.collection("kiosk_sessions").doc();

        batch.set(sessionRef, {
          pin: pin,
          cohortId: doc.id,
          cohortName: cohortName,
          facilitatorId: cohortData.facilitatorId,
          date: todayString,
          status: "active",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        count++;

        // Fetch Facilitator Data to get their name, but override the email
        const facSnap = await db
          .collection("users")
          .doc(cohortData.facilitatorId)
          .get();
        const facName = facSnap.exists
          ? facSnap.data()?.fullName
          : "Test Facilitator";

        // DYNAMIC MLAB EMAIL TEMPLATE
        const emailParams = {
          title: "[TEST] Today's Kiosk PIN",
          subtitle: cohortName,
          recipientName: facName,
          bodyHtml: `
              <p>Good morning! Your live attendance kiosk PIN for today has been securely generated.</p>
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0; text-align: center;">
                  <p style="margin: 0; color: #475569; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: bold;">Secure Access Code</p>
                  <p style="margin: 5px 0 0; color: #073f4e; font-size: 34px; font-weight: bold; font-family: monospace; letter-spacing: 0.2em;">${pin}</p>
              </div>
              <p>To project today's rotating QR code, simply open the Kiosk page on your classroom's Smart TV or tablet and enter this code.</p>
            `,
          ctaText: "Open TV Kiosk Now",
          ctaLink: `${APP_URL}/kiosk`,
          showStepIndicator: false,
        };

        // Push the email request to the promise array (using the hardcoded TEST_EMAIL)
        emailPromises.push(
          sendMailgunEmail({
            to: TEST_EMAIL,
            subject: `[TEST] Hub Kiosk PIN: ${pin} (${cohortName})`,
            text: buildMlabEmailPlainText(emailParams),
            html: buildMlabEmailHtml(emailParams),
          }).catch((err) => {
            logger.error(`Failed to send test PIN email to ${TEST_EMAIL}`, err);
          }),
        );
      }

      // Commit the batch and send emails
      if (count > 0) {
        await batch.commit();
        logger.info(
          `Successfully saved ${count} daily Kiosk PINs to Firestore.`,
        );

        // Wait for all Mailgun emails to be dispatched
        await Promise.all(emailPromises);
        logger.info(
          `Successfully dispatched ${emailPromises.length} test PIN emails to ${TEST_EMAIL}.`,
        );
      }

      res.status(200).send({
        success: true,
        message: `Generated ${count} PINs. Sent emails to ${TEST_EMAIL}.`,
      });
    } catch (error: any) {
      logger.error("Error generating test Kiosk PINs:", error);
      res.status(500).send({ success: false, error: error.message });
    }
  },
);

export const autoFinalizeAttendance = onSchedule(
  {
    schedule: "59 23 * * *",
    timeZone: "Africa/Johannesburg",
    region: "us-central1",
    timeoutSeconds: 300,
    memory: "256MiB",
  },
  async (event) => {
    try {
      const db = admin.firestore();
      logger.info("🕒 [autoFinalizeAttendance] CRON JOB INITIATED...");

      const settingsSnap = await db
        .collection("system_settings")
        .doc("global")
        .get();
      const campuses = settingsSnap.exists
        ? settingsSnap.data()?.campuses || []
        : [];

      const activeSessionsSnap = await db
        .collection("kiosk_sessions")
        .where("status", "==", "active")
        .get();

      if (activeSessionsSnap.empty) return;

      let totalRegistersCreated = 0;
      let totalScansProcessed = 0;

      for (const sessionDoc of activeSessionsSnap.docs) {
        const sessionData = sessionDoc.data();
        const cohortId = sessionData.cohortId;
        const sessionDate = sessionData.date;
        const facilitatorId = sessionData.facilitatorId;

        const cohortSnap = await db.collection("cohorts").doc(cohortId).get();
        const cohortData = cohortSnap.exists ? cohortSnap.data() : null;
        // In cohorts collection, learnerIds are also saved as the Document IDs (ID Numbers)
        const enrolledLearnerIds = cohortData?.learnerIds || [];
        const campusId = cohortData?.campusId;

        const myCampus =
          campuses.find((c: any) => c.id === campusId) ||
          campuses.find((c: any) => c.isDefault) ||
          campuses[0];
        const fallbackTimeStr = myCampus?.campusTimes?.checkoutStart || "16:00";
        const [fallbackH, fallbackM] = fallbackTimeStr.split(":").map(Number);

        const liveScansSnap = await db
          .collection("live_attendance_scans")
          .where("cohortId", "==", cohortId)
          .where("dateString", "==", sessionDate)
          .get();

        const getMs = (val: any) => {
          if (!val) return null;
          if (val.toMillis) return val.toMillis();
          if (typeof val === "number") return val;
          return new Date(val).getTime();
        };

        //  GROUP TAPS DIRECTLY BY LEARNER ID
        const groupedScans: Record<string, any[]> = {};
        liveScansSnap.docs.forEach((d) => {
          const data = d.data();
          const lId = String(data.learnerId);
          if (!groupedScans[lId]) groupedScans[lId] = [];
          groupedScans[lId].push(data);
        });

        const scansMap: Record<string, any> = {};
        const presentLearnerIds = Object.keys(groupedScans);

        // MAP TAPS AND TIMESTAMPS
        presentLearnerIds.forEach((lId) => {
          const userTaps = groupedScans[lId];
          userTaps.sort((a, b) => {
            const tA = getMs(a.checkInAt) || getMs(a.timestamp) || 0;
            const tB = getMs(b.checkInAt) || getMs(b.timestamp) || 0;
            return tA - tB;
          });

          let checkInMs = null,
            lunchOutMs = null,
            lunchInMs = null,
            checkOutMs = null;

          if (userTaps.length === 1) {
            checkInMs =
              getMs(userTaps[0].checkInAt) || getMs(userTaps[0].timestamp);
            lunchOutMs = getMs(userTaps[0].lunchOutAt);
            lunchInMs = getMs(userTaps[0].lunchInAt);
            checkOutMs = getMs(userTaps[0].checkOutAt);
          } else if (userTaps.length > 1) {
            checkInMs =
              getMs(userTaps[0].checkInAt) || getMs(userTaps[0].timestamp);
            lunchOutMs =
              getMs(userTaps[1]?.checkInAt) ||
              getMs(userTaps[1]?.timestamp) ||
              getMs(userTaps[0].lunchOutAt);
            lunchInMs =
              getMs(userTaps[2]?.checkInAt) ||
              getMs(userTaps[2]?.timestamp) ||
              getMs(userTaps[0].lunchInAt);
            checkOutMs =
              getMs(userTaps[3]?.checkInAt) ||
              getMs(userTaps[3]?.timestamp) ||
              getMs(userTaps[0].checkOutAt);
          }

          scansMap[lId] = {
            checkInAt: checkInMs,
            lunchOutAt: lunchOutMs,
            lunchInAt: lunchInMs,
            checkOutAt: checkOutMs,
          };
        });

        // AUTO-IMPUTE MISSING CHECKOUTS
        presentLearnerIds.forEach((lId) => {
          const scan = scansMap[lId];
          if (scan.checkInAt && !scan.checkOutAt) {
            const outDate = new Date(scan.checkInAt);
            outDate.setHours(fallbackH || 16, fallbackM || 0, 0, 0);
            scan.checkOutAt = Math.max(outDate.getTime(), scan.checkInAt);
          }
        });

        const absentIds = enrolledLearnerIds.filter(
          (id: string) => !presentLearnerIds.includes(id),
        );

        const batch = db.batch();

        await db.collection("attendance").add({
          cohortId: cohortId,
          cohortName: cohortData?.name || "Unknown Cohort",
          facilitatorId: facilitatorId,
          date: sessionDate,
          presentLearners: presentLearnerIds,
          absentLearners: absentIds,
          reasons: {},
          proofs: {},
          scans: scansMap,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          finalizedBy: "system-auto",
          method: "system_cron_job",
        });

        liveScansSnap.docs.forEach((scanDoc) => batch.delete(scanDoc.ref));

        presentLearnerIds.forEach((id: string) => {
          const learnerRef = db.collection("learners").doc(id);
          batch.update(learnerRef, {
            labHours: admin.firestore.FieldValue.increment(8),
            professionalismStreak: admin.firestore.FieldValue.increment(1),
          });
        });

        absentIds.forEach((id: string) => {
          const learnerRef = db.collection("learners").doc(id);
          batch.update(learnerRef, {
            professionalismStreak: 0,
            professionalismScore: admin.firestore.FieldValue.increment(-5),
          });
        });

        batch.update(sessionDoc.ref, { status: "completed" });
        await batch.commit();

        totalRegistersCreated++;
        totalScansProcessed += liveScansSnap.size;
      }
      logger.info(
        `🏁 [autoFinalizeAttendance] COMPLETED. Created: ${totalRegistersCreated}`,
      );
    } catch (error: any) {
      logger.error(" CRITICAL ERROR in autoFinalizeAttendance:", error);
    }
  },
);

// ============================================================================
// GUEST OTP VERIFICATION LOGIC
// ============================================================================

export const requestGuestOTP = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
    const { email } = request.data;

    if (!email || typeof email !== "string") {
      throw new HttpsError("invalid-argument", "A valid email is required.");
    }

    const cleanEmail = email.toLowerCase().trim();

    // Generate a secure 6-digit numeric OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    try {
      const db = admin.firestore();

      // Save the OTP to Firestore
      await db
        .collection("otp_codes")
        .doc(cleanEmail)
        .set({
          otp,
          expiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          attempts: 0,
        });

      // Utilize your existing email template builder
      const emailParams = {
        title: "Your mLab Verification Code",
        subtitle: "Secure Event Check-In",
        recipientName: "Guest",
        bodyHtml: `
          <p>You are attempting to securely check in to an mLab ecosystem event.</p>
          <p>Please use the following 6-digit verification code to confirm your email address:</p>
          
          <div style="background-color: #f8fafc; padding: 24px; border-radius: 8px; border: 1px solid #dde4e8; text-align: center; margin: 24px 0;">
              <span style="font-size: 36px; font-weight: 800; letter-spacing: 12px; color: #073f4e;">${otp}</span>
          </div>
          
          <p>This code will expire in <strong>10 minutes</strong>.</p>
          <p style="font-size: 12px; color: #64748b; margin-top: 20px;">If you did not request this code, you can safely ignore this email.</p>
        `,
        ctaText: "Return to Check-in",
        ctaLink: APP_URL,
        showStepIndicator: false,
      };

      await sendMailgunEmail({
        to: cleanEmail,
        subject: `${otp} is your mLab Verification Code`,
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });

      return { success: true, message: "OTP sent successfully." };
    } catch (error: any) {
      logger.error("Failed to request OTP:", error);
      throw new HttpsError("internal", "Failed to send verification code.");
    }
  },
);

export const verifyGuestOTP = onCall(async (request) => {
  const { email, otp } = request.data;

  if (!email || !otp) {
    throw new HttpsError("invalid-argument", "Email and OTP are required.");
  }

  const cleanEmail = email.toLowerCase().trim();
  const db = admin.firestore();
  const otpRef = db.collection("otp_codes").doc(cleanEmail);

  try {
    // Run in a transaction to prevent race conditions on the attempts counter
    const isValid = await db.runTransaction(async (transaction) => {
      const otpDoc = await transaction.get(otpRef);

      if (!otpDoc.exists) {
        throw new HttpsError(
          "not-found",
          "No active verification found for this email.",
        );
      }

      const otpData = otpDoc.data();

      // Check Expiration
      if (otpData?.expiresAt.toDate() < new Date()) {
        transaction.delete(otpRef);
        throw new HttpsError(
          "failed-precondition",
          "This code has expired. Please request a new one.",
        );
      }

      // Anti-Brute-Force Check (Max 3 tries)
      if (otpData?.attempts >= 3) {
        transaction.delete(otpRef);
        throw new HttpsError(
          "resource-exhausted",
          "Too many failed attempts. Please request a new code.",
        );
      }

      // Verify the Code
      if (otpData?.otp !== otp.trim()) {
        transaction.update(otpRef, {
          attempts: admin.firestore.FieldValue.increment(1),
        });
        throw new HttpsError(
          "invalid-argument",
          "Incorrect code. Please try again.",
        );
      }

      // Success: Consume (delete) the OTP so it can't be reused
      transaction.delete(otpRef);
      return true;
    });

    return { success: isValid, message: "Email verified successfully." };
  } catch (error: any) {
    logger.error("OTP Verification Error:", error);
    // Pass through our specific HttpsErrors (like 'resource-exhausted') to the frontend
    if (error instanceof HttpsError) throw error;
    throw new HttpsError(
      "internal",
      "An error occurred while verifying the code.",
    );
  }
});

// ============================================================================
// TRACEABILITY OF LEARNING: ATTENDANCE & CURRICULUM HANDSHAKE
// ============================================================================

/**
 * TRIGGER A: When Attendance is Finalized
 * Finds all curriculum logs for that day and stamps them with the present/absent lists.
 */
export const onAttendanceFinalized = onDocumentCreated(
  { document: "attendance/{attendanceId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { cohortId, date, presentLearners, absentLearners } = data;
    const db = admin.firestore();

    try {
      // Find all curriculum logs for this cohort on this specific date
      const logsSnap = await db
        .collection("curriculum_logs")
        .where("cohortId", "==", cohortId)
        .where("coveredAt", "==", date)
        .get();

      if (logsSnap.empty) {
        logger.info(
          `No curriculum logs found for cohort ${cohortId} on ${date}. Skipping handshake.`,
        );
        return;
      }

      const batch = db.batch();

      logsSnap.docs.forEach((docSnap) => {
        batch.update(docSnap.ref, {
          presentLearnerIds: presentLearners || [],
          absentLearnerIds: absentLearners || [],
        });
      });

      await batch.commit();
      logger.info(
        `Successfully linked attendance to ${logsSnap.size} curriculum logs for cohort ${cohortId} on ${date}`,
      );
    } catch (error) {
      logger.error("Error in onAttendanceFinalized trigger:", error);
    }
  },
);

/**
 * TRIGGER B: When a Curriculum Log is Created
 * Checks if attendance was ALREADY finalized for this date. If yes, it stamps itself.
 */
export const onCurriculumLogCreated = onDocumentCreated(
  { document: "curriculum_logs/{logId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { cohortId, coveredAt } = data;
    const db = admin.firestore();

    try {
      // Check if there is ALREADY a finalized attendance register for this cohort/date
      const attendanceSnap = await db
        .collection("attendance")
        .where("cohortId", "==", cohortId)
        .where("date", "==", coveredAt)
        .limit(1)
        .get();

      // If no attendance register exists yet, do nothing.
      // Trigger A will catch this log later when attendance is eventually finalized.
      if (attendanceSnap.empty) return;

      const attendanceData = attendanceSnap.docs[0].data();

      // Update this newly created log with the historical attendance data
      await event.data?.ref.update({
        presentLearnerIds: attendanceData.presentLearners || [],
        absentLearnerIds: attendanceData.absentLearners || [],
      });

      logger.info(
        `Retroactively linked attendance to new curriculum log ${event.params.logId}`,
      );
    } catch (error) {
      logger.error("Error in onCurriculumLogCreated trigger:", error);
    }
  },
);

// ============================================================================
// ONE-OFF MIGRATION SCRIPT: BACKTRACE HISTORICAL TRACEABILITY (FORCE UPDATE)
// ============================================================================
export const backtraceAttendanceTraceability = onRequest(
  {
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (req, res) => {
    logger.info(" Initiating Historical Traceability Backtrace (FORCE RUN)...");
    const db = admin.firestore();

    try {
      const logsSnap = await db.collection("curriculum_logs").get();

      let updatedCount = 0;
      let skippedCount = 0;
      let operationCount = 0;
      const batches: Promise<any>[] = [];
      let currentBatch = db.batch();

      const attendanceCache = new Map<string, any>();

      for (const logDoc of logsSnap.docs) {
        const logData = logDoc.data();

        // We are forcing it to evaluate every single log in the database.

        const cohortId = logData.cohortId;
        const coveredAt =
          logData.coveredAt || logData.dateLogged?.split("T")[0];

        if (!cohortId || !coveredAt) {
          skippedCount++;
          continue;
        }

        const cacheKey = `${cohortId}_${coveredAt}`;
        let attendanceData = attendanceCache.get(cacheKey);

        if (attendanceData === undefined) {
          const attSnap = await db
            .collection("attendance")
            .where("cohortId", "==", cohortId)
            .where("date", "==", coveredAt)
            .limit(1)
            .get();

          if (!attSnap.empty) {
            attendanceData = attSnap.docs[0].data();
            attendanceCache.set(cacheKey, attendanceData);
          } else {
            attendanceCache.set(cacheKey, null);
            attendanceData = null;
          }
        }

        // If attendance exists for this day, forcefully stamp it!
        if (attendanceData) {
          currentBatch.update(logDoc.ref, {
            presentLearnerIds: attendanceData.presentLearners || [],
            absentLearnerIds: attendanceData.absentLearners || [],
          });

          updatedCount++;
          operationCount++;

          if (operationCount === 490) {
            batches.push(currentBatch.commit());
            currentBatch = db.batch();
            operationCount = 0;
          }
        } else {
          skippedCount++;
        }
      }

      if (operationCount > 0) {
        batches.push(currentBatch.commit());
      }

      await Promise.all(batches);

      const resultMessage = `Force Backtrace Complete! Successfully refreshed & linked ${updatedCount} logs. Unlinked (No register found): ${skippedCount}.`;
      logger.info(resultMessage);

      res.status(200).send({
        success: true,
        message: resultMessage,
        updated: updatedCount,
        skipped: skippedCount,
      });
    } catch (error: any) {
      logger.error(" Backtrace Error:", error);
      res.status(500).send({ success: false, error: error.message });
    }
  },
);

/**
 * Trigger: When an Admin sends a Broadcast message to the notifications collection
 * This function wakes up and sends the actual Firebase Cloud Messaging (FCM) Push to the phones.
 */

export const onBroadcastNotificationCreated = onDocumentCreated(
  { document: "notifications/{notifId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { recipientId, title, message, type } = data;

    // We ONLY want to send FCM pushes for mass broadcasts to avoid spamming personal DB writes
    if (
      type === "system" &&
      (recipientId === "all_learners" || recipientId.startsWith("campus_"))
    ) {
      try {
        // Create a boolean condition to target BOTH live rings
        // This hits the App Store users (_prod) AND your Firebase App Testers (_beta)
        // It specifically excludes local development simulators (_dev)
        const prodTopic = `${recipientId}_prod`;
        const betaTopic = `${recipientId}_beta`;
        const targetCondition = `'${prodTopic}' in topics || '${betaTopic}' in topics`;

        // HARDWARE ENGINE: Constructing the forced priority blueprint
        const messagePayload: any = {
          notification: {
            title: title || "mLab Announcement",
            body: message,
          },
          condition: targetCondition,

          // Android Specific Enforcement (Forces sound and vibration)
          android: {
            priority: "high",
            notification: {
              sound: "default",
              channelId: "default",
              vibrateTimingsMillis: [0, 500, 250, 500],
              defaultVibrateTimings: false,
            },
          },

          // iOS/APNs Specific Enforcement (Forces ringer and bypasses battery throttling)
          apns: {
            payload: {
              aps: {
                sound: "default",
                badge: 1,
              },
            },
            headers: {
              "apns-priority": "10",
            },
          },

          data: {
            route: "/notifications",
          },
        };

        // Dispatch to Google's FCM Gateway
        await admin.messaging().send(messagePayload);

        logger.info(
          `Successfully broadcasted high-priority push using condition: ${targetCondition}`,
        );
      } catch (error) {
        logger.error(
          ` Failed to send FCM broadcast for target ${recipientId}`,
          error,
        );
      }
    }
  },
);

export const testSingleTokenPush = onRequest((req, res) => {
  return cors(req, res, async () => {
    logger.info("📱 [Single Token Test] Initiating forced hardware check...");

    try {
      const targetToken =
        "ctTg0a7_SWG2FPWjD98VXe:APA91bGa98HXfnzQIYt9YUezK-TIL9vPq91WvC8sQ3Z3mBzR8yiOzMalZ1Wfyk0Jurd5V2Y18woeu9S0Pw6fMZDYR77qeCp5kpWXvPMk0SN_g4vTGyhSe6Q";

      if (!targetToken) {
        res.status(400).send({
          success: false,
          message: "Bad Request: Missing token parameter.",
        });
        return;
      }

      // HARDWARE ENGINE: Constructing the forced priority blueprint
      const messagePayload = {
        token: targetToken.trim(),
        notification: {
          title: "🔊 Hardware Forced Test",
          body: "This alert was dispatched with absolute maximum priority flags!",
        },
        // Android Specific Enforcement
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            channelId: "default", // MUST match the custom string set in your Expo client code!
            vibrateTimingsMillis: [0, 500, 250, 500], // [Delay, Vibrate, Pause, Vibrate]
            defaultVibrateTimings: false,
          },
        },
        // iOS/APNs Specific Enforcement
        apns: {
          payload: {
            aps: {
              sound: "default", // 🍏 Signals iOS to trigger device ringer immediately
              badge: 1,
            },
          },
          headers: {
            "apns-priority": "10", // Forces immediate delivery, skipping background power management throttling
          },
        },
        data: {
          route: "/notifications",
          testMode: "forced_vibration",
        },
      };

      logger.info(`🔑 Transmitting high-priority direct link payload...`);
      const fcmResponse = await admin.messaging().send(messagePayload);

      res.status(200).send({
        success: true,
        message:
          "High priority sound & vibration payload dispatched successfully.",
        fcmMessageId: fcmResponse,
      });
    } catch (error: any) {
      logger.error("Hardware deployment route failed:", error);
      res.status(500).send({ success: false, errorMessage: error.message });
    }
  });
});

export const testDevTopicPush = onRequest((req, res) => {
  return cors(req, res, async () => {
    logger.info(
      "[Dev Topic Test] Initiating forced hardware check for dev environment...",
    );

    try {
      // Target the development topic instead of a single token
      const targetTopic = "all_learners_dev";

      // Constructing the forced priority blueprint
      const messagePayload = {
        topic: targetTopic,
        notification: {
          title: "🛠️ Dev Environment Blast",
          body: "If you are reading this, your app successfully subscribed to the _dev channel!",
        },
        // Android Specific Enforcement
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            channelId: "default", // MUST match the custom string set in your Expo client code!
            vibrateTimingsMillis: [0, 500, 250, 500], // [Delay, Vibrate, Pause, Vibrate]
            defaultVibrateTimings: false,
          },
        },
        // iOS/APNs Specific Enforcement
        apns: {
          payload: {
            aps: {
              sound: "default", // Signals iOS to trigger device ringer immediately
              badge: 1,
            },
          },
          headers: {
            "apns-priority": "10", // Forces immediate delivery
          },
        },
        data: {
          route: "/notifications",
          testMode: "dev_topic_blast",
        },
      };

      logger.info(
        `🔑 Transmitting high-priority payload to topic: ${targetTopic}...`,
      );
      const fcmResponse = await admin.messaging().send(messagePayload);

      res.status(200).send({
        success: true,
        message: `High priority sound & vibration payload dispatched successfully to ${targetTopic}.`,
        fcmMessageId: fcmResponse,
      });
    } catch (error: any) {
      logger.error("Hardware deployment route failed:", error);
      res.status(500).send({ success: false, errorMessage: error.message });
    }
  });
});

const encryptId = (text: string, key: string) => {
  try {
    console.log(
      `[CRYPTO-ENCRYPT] Starting encryption for input length: ${text.length}`,
    );
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", Buffer.from(key), iv);
    let encrypted = cipher.update(text);
    encrypted = Buffer.concat([encrypted, cipher.final()]);

    const result = `${iv.toString("hex")}-${encrypted.toString("hex")}`;
    console.log(
      `[CRYPTO-ENCRYPT] Encryption successful. Output length: ${result.length}`,
    );
    return result;
  } catch (err) {
    console.error(`[CRYPTO-ENCRYPT] Critical failure during encryption:`, err);
    throw err;
  }
};

const decryptId = (hash: string, key: string) => {
  try {
    console.log(`[CRYPTO-DECRYPT] Attempting to decrypt incoming hash...`);
    const parts = hash.split("-");

    if (parts.length !== 2) {
      console.warn(
        `[CRYPTO-DECRYPT] Hash format invalid (Missing IV dash). Returning null.`,
      );
      return null;
    }

    const iv = Buffer.from(parts[0], "hex");
    const encryptedText = Buffer.from(parts[1], "hex");
    const decipher = crypto.createDecipheriv(
      "aes-256-cbc",
      Buffer.from(key),
      iv,
    );

    let decrypted = decipher.update(encryptedText);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    console.log(`[CRYPTO-DECRYPT] Decryption successful!`);
    return decrypted.toString();
  } catch (e) {
    console.warn(
      `[CRYPTO-DECRYPT] Decryption failed (Likely a plain-text fallback URL). Details:`,
      e,
    );
    return null;
  }
};

// ─── FOR THE MOBILE APP TO GET THE SECURE QR STRING ───
export const encryptStudentId = onCall(
  { secrets: [encryptionKeySecret] },
  (request) => {
    console.log(`[ENCRYPT-ENDPOINT] Request received from mobile app.`);
    const { idNumber } = request.data;
    const key = encryptionKeySecret.value();

    if (!idNumber) {
      console.error(`[ENCRYPT-ENDPOINT] Missing idNumber in request payload.`);
      throw new HttpsError(
        "invalid-argument",
        "ID Number is required for encryption.",
      );
    }

    const encryptedId = encryptId(idNumber, key);
    console.log(`[ENCRYPT-ENDPOINT] Returning secure hash to mobile app.`);
    return { encryptedId };
  },
);

// ─── VERIFICATION & DECRYPTION ───
export const verifyStudentCard = onCall(
  { secrets: [encryptionKeySecret] },
  async (request) => {
    console.log(`[VERIFY-CARD] Initialization started.`);
    const { code } = request.data;
    const key = encryptionKeySecret.value();

    if (!code) {
      console.error(
        `[VERIFY-CARD] Aborting: No code provided in request data.`,
      );
      return { status: "invalid" };
    }

    const db = admin.firestore();

    console.log(`[VERIFY-CARD] Cleaning incoming code...`);
    const decodedCode = decodeURIComponent(code);

    // DECRYPT THE CODE FIRST
    console.log(`[VERIFY-CARD] Routing to Decryption Engine...`);
    const decryptedString = decryptId(decodedCode, key);

    // If decryption works, use it. Otherwise, assume they scanned an old plain-text QR code.
    const finalString = decryptedString || decodedCode;
    console.log(
      `[VERIFY-CARD] Resolution Strategy: ${decryptedString ? "SECURE_DECRYPTED" : "PLAIN_TEXT_FALLBACK"}`,
    );

    const targetId = finalString.replace(/[\s-]/g, "").trim();
    const upperTargetId = targetId.toUpperCase();
    console.log(
      `[VERIFY-CARD] Target query string prepared. Length: ${targetId.length}`,
    );

    try {
      const learnersRef = db.collection("learners");

      console.log(
        `[VERIFY-CARD] [DB Query 1] Searching learners collection by idNumber...`,
      );
      let learnerSnap = await learnersRef
        .where("idNumber", "==", targetId)
        .get();

      if (learnerSnap.empty) {
        console.log(
          `[VERIFY-CARD] [DB Query 2] Not found. Falling back to verificationCode (exact match)...`,
        );
        learnerSnap = await learnersRef
          .where("verificationCode", "==", targetId)
          .get();
      }
      if (learnerSnap.empty) {
        console.log(
          `[VERIFY-CARD] [DB Query 3] Not found. Falling back to verificationCode (uppercase match)...`,
        );
        learnerSnap = await learnersRef
          .where("verificationCode", "==", upperTargetId)
          .get();
      }

      if (learnerSnap.empty) {
        console.warn(
          `[VERIFY-CARD] Failure: Learner not found in database matching Target ID.`,
        );
        return { status: "invalid" };
      }

      const learnerId = learnerSnap.docs[0].id;
      const learnerData = learnerSnap.docs[0].data();
      console.log(
        `[VERIFY-CARD] Success: Learner located. Learner UID: ${learnerId}`,
      );

      console.log(`[VERIFY-CARD] Fetching enrollments for Learner UID...`);
      const enrollSnap = await db
        .collection("enrollments")
        .where("learnerId", "==", learnerId)
        .get();

      if (enrollSnap.empty) {
        console.warn(
          `[VERIFY-CARD] Failure: Learner found, but NO enrollments exist for this user.`,
        );
        return { status: "invalid" };
      }

      const enrollmentsList = enrollSnap.docs.map((d) => d.data());
      console.log(
        `[VERIFY-CARD] Found ${enrollmentsList.length} enrollment(s). Evaluating active status...`,
      );

      const activeEnrollment =
        enrollmentsList.find((e) => e.status === "active") ||
        enrollmentsList[0];
      console.log(
        `[VERIFY-CARD] Selected Enrollment Status: ${activeEnrollment.status}`,
      );

      // ─── RESOLVE DYNAMIC METADATA (Cohort & Campus) ───
      let safeEndDate = activeEnrollment.endDate || null;
      let cohortName = activeEnrollment.cohortName || "CodeTribe Academy";
      let campusName =
        activeEnrollment.campusName ||
        activeEnrollment.location ||
        "Unassigned Campus";

      // Fetch Global Settings to get the Campuses Array
      let globalCampuses: any[] = [];
      try {
        const settingsSnap = await db
          .collection("system_settings")
          .doc("global")
          .get();
        if (settingsSnap.exists) {
          globalCampuses = settingsSnap.data()?.campuses || [];
        }
      } catch (err) {
        console.error("[VERIFY-CARD] Failed to fetch global settings:", err);
      }

      // Fetch true Cohort Name, Date, and resolve Campus against Global Settings
      if (activeEnrollment.cohortId) {
        try {
          const cohortSnap = await db
            .collection("cohorts")
            .doc(activeEnrollment.cohortId)
            .get();
          if (cohortSnap.exists) {
            const cohortData = cohortSnap.data();
            if (!safeEndDate && cohortData?.endDate)
              safeEndDate = cohortData.endDate;
            if (cohortData?.name) cohortName = cohortData.name;

            // Mirroring the Mobile App: Find the matched campus using the cohort's campusId
            if (cohortData?.campusId) {
              const matchedCampus = globalCampuses.find(
                (c: any) => c.id === cohortData.campusId,
              );
              if (matchedCampus && matchedCampus.name) {
                campusName = matchedCampus.name;
              }
            }
          }
        } catch (err) {
          console.error("[VERIFY-CARD] Failed to fetch cohort:", err);
        }
      }

      // Safely parse the date for the frontend
      if (safeEndDate && typeof safeEndDate.toDate === "function") {
        safeEndDate = safeEndDate.toDate().toISOString();
      } else if (safeEndDate && safeEndDate.seconds) {
        safeEndDate = new Date(safeEndDate.seconds * 1000).toISOString();
      } else if (typeof safeEndDate === "string") {
        safeEndDate = new Date(safeEndDate).toISOString();
      }

      console.log(`[VERIFY-CARD] Evaluating expiration date...`);
      const isPastDate = safeEndDate
        ? new Date(safeEndDate).getTime() < Date.now()
        : false;
      const isExpired = isPastDate || activeEnrollment.status !== "active";
      console.log(
        `[VERIFY-CARD] Expiration check result - isExpired: ${isExpired}`,
      );

      console.log(`[VERIFY-CARD] Reconstructing visual Display ID...`);
      const uidPart = learnerId.slice(-4).toUpperCase();
      const idPart = String(learnerData.idNumber || "").slice(-4);
      const generatedStudentId = learnerData.idNumber
        ? `${uidPart}CT${idPart}`
        : activeEnrollment.verificationCode || "PENDING";

      console.log(
        `[VERIFY-CARD] Generating final payload. Final Status: ${isExpired ? "expired" : "valid"}`,
      );

      // Return ONLY the public-safe data payload
      return {
        status: isExpired ? "expired" : "valid",
        studentData: {
          name:
            learnerData.fullName ||
            activeEnrollment.learnerName ||
            "Unknown Learner",
          cohort: cohortName,
          campus: campusName,
          validThru: safeEndDate,
          studentNumber: generatedStudentId,
        },
      };
    } catch (error) {
      console.error("[VERIFY-CARD] CRITICAL BACKEND EXCEPTION:", error);
      return { status: "invalid" };
    }
  },
);

// ============================================================================
// LEGACY DATA BACKFILL: RANDOMIZED TIMESHEET GENERATOR (SAST TIMEZONE FIX)
// ============================================================================

// Generates a random millisecond timestamp explicitly locked to SAST (+02:00)
const getRandomTimeMs = (
  dateStr: string,
  minH: number,
  minM: number,
  maxH: number,
  maxM: number,
) => {
  const pad = (n: number) => String(n).padStart(2, "0");

  // Explicitly append +02:00 so the Cloud Function ignores its own UTC timezone
  const minIso = `${dateStr}T${pad(minH)}:${pad(minM)}:00+02:00`;
  const maxIso = `${dateStr}T${pad(maxH)}:${pad(maxM)}:00+02:00`;

  const minTime = new Date(minIso).getTime();
  const maxTime = new Date(maxIso).getTime();

  return Math.floor(Math.random() * (maxTime - minTime + 1)) + minTime;
};

export const backfillLegacyAttendanceScans = onRequest(async (req, res) => {
  return cors(req, res, async () => {
    logger.info(
      " Initiating Legacy Attendance Backfill Script (SAST TIMEZONE FIX)...",
    );

    const db = admin.firestore();
    const isDryRun = req.query.execute !== "true";

    try {
      // Fetch all finalized attendance records
      const snap = await db.collection("attendance").get();

      let updatedCount = 0;
      const batches: Promise<any>[] = [];
      let currentBatch = db.batch();
      let opCount = 0;

      snap.docs.forEach((doc) => {
        const data = doc.data();
        const dateStr = data.date;
        const presentLearners = data.presentLearners || [];
        let scans = data.scans || {};
        let docNeedsUpdate = false;

        // Skip if no date or no learners were present
        if (!dateStr || presentLearners.length === 0) return;

        presentLearners.forEach((lId: string) => {
          // FORCE OVERWRITE: Re-run the randomizer to fix the UTC offset bug
          scans[lId] = {
            // Check-in: 07:30 to 08:00
            checkInAt: getRandomTimeMs(dateStr, 7, 30, 8, 0),
            // Lunch-out: 12:00 to 12:05
            lunchOutAt: getRandomTimeMs(dateStr, 12, 0, 12, 5),
            // Lunch-in: 12:58 to 13:02
            lunchInAt: getRandomTimeMs(dateStr, 12, 58, 13, 2),
            // Check-out: 16:00 to 16:05
            checkOutAt: getRandomTimeMs(dateStr, 16, 0, 16, 5),
          };
          docNeedsUpdate = true;
        });

        if (docNeedsUpdate) {
          updatedCount++;
          currentBatch.update(doc.ref, { scans });
          opCount++;

          // Chunk batches
          if (opCount === 490) {
            if (!isDryRun) batches.push(currentBatch.commit());
            currentBatch = db.batch();
            opCount = 0;
          }
        }
      });

      if (opCount > 0 && !isDryRun) {
        batches.push(currentBatch.commit());
      }

      await Promise.all(batches);

      if (isDryRun) {
        res.status(200).send({
          success: true,
          mode: "DRY RUN",
          message: `Found ${updatedCount} records. Ready to fix timezone bug. Add ?execute=true to run.`,
        });
      } else {
        res.status(200).send({
          success: true,
          mode: "LIVE EXECUTION",
          message: `Successfully OVERWRITTEN ${updatedCount} records with absolute SAST timezone timestamps!`,
        });
      }
    } catch (error: any) {
      logger.error(" Backfill Script Failed:", error);
      res.status(500).send({ success: false, error: error.message });
    }
  });
});

/**
 * SMART ATTENDANCE BACKFILL
 * Triggers automatically whenever a new Learner is enrolled in a Cohort.
 * It looks at all past Zoom sessions for that cohort, checks the raw metadata,
 * and retroactively awards attendance (or marks them Absent).
 */
export const backfillLearnerAttendance = onDocumentCreated(
  "enrollments/{enrollmentId}",
  async (event) => {
    const snapshot = event.data;
    if (!snapshot) return;

    const enrollment = snapshot.data();
    const cohortId = enrollment.cohortId;
    const learnerId = enrollment.learnerId;

    if (!cohortId || !learnerId || cohortId === "Unassigned") return;

    const db = admin.firestore();

    try {
      // Fetch the physical Learner profile to get their Name & Email
      const learnerDoc = await db.doc(`learners/${learnerId}`).get();
      if (!learnerDoc.exists) return;

      const learner = learnerDoc.data();
      const learnerEmail = learner?.email?.toLowerCase().trim();
      const learnerName = learner?.fullName?.toLowerCase().trim();

      // Fetch all past Attendance Logs for this specific Cohort
      const logsSnap = await db
        .collection("attendance_logs")
        .where("cohortId", "==", cohortId)
        .get();

      if (logsSnap.empty) {
        console.log(
          `No past attendance logs found for cohort ${cohortId}. Skipping backfill.`,
        );
        return;
      }

      const batch = db.batch();
      let updatesMade = false;

      // Loop through every past session and calculate attendance
      logsSnap.docs.forEach((logDoc) => {
        const logData = logDoc.data();
        const rawZoomData = logData.rawZoomData || [];
        const expectedDuration = logData.expectedDuration || 120;
        const sessionDate = logData.sessionDate;

        // If the log doesn't have the raw Zoom payload, we can't backfill it.
        if (!Array.isArray(rawZoomData) || rawZoomData.length === 0) return;

        // Attempt to match the new learner against the saved Zoom payload
        const zoomMatch = rawZoomData.find((z) => {
          const zEmail = String(z.email || "")
            .toLowerCase()
            .trim();
          const zName = String(z.name || "")
            .toLowerCase()
            .trim();
          return (
            (learnerEmail && zEmail === learnerEmail) || zName === learnerName
          );
        });

        const duration = zoomMatch ? zoomMatch.duration : 0;

        // Calculate compliance Math
        const pct =
          expectedDuration > 0 ? (duration / expectedDuration) * 100 : 0;
        let status = "Absent";
        if (pct >= 80) status = "Present";
        else if (pct > 20) status = "Partial";

        // Create the Retroactive Attendance Record
        const recordId = `${cohortId}_${sessionDate}_${learnerId}`;
        const recordRef = db.doc(`attendance_records/${recordId}`);

        batch.set(
          recordRef,
          {
            attendanceLogId: logDoc.id,
            cohortId: cohortId,
            learnerId: learnerId,
            sessionDate: sessionDate,
            expectedDuration: expectedDuration,
            actualDuration: duration,
            status: status,
            compliancePct: Math.round(pct),
            updatedAt: new Date().toISOString(),
            isBackfilled: true, // helpful for debugging
          },
          { merge: true },
        );

        // Update the Master Log Totals
        const logRef = db.doc(`attendance_logs/${logDoc.id}`);
        batch.update(logRef, {
          totalEnrolled: admin.firestore.FieldValue.increment(1),
          [`total${status}`]: admin.firestore.FieldValue.increment(1),
        });

        updatesMade = true;
      });

      if (updatesMade) {
        await batch.commit();
        console.log(
          `Successfully backfilled attendance for learner ${learnerId} in cohort ${cohortId}`,
        );
      }
    } catch (error) {
      console.error("Failed to backfill attendance:", error);
    }
  },
);

// ============================================================================
// WORKPLACE LOGS: FRIDAY MENTOR APPROVAL SWEEPER (MAGIC LINKS)
// ============================================================================

export const generateWeeklyMentorLinks = onSchedule(
  {
    schedule: "0 15 * * 5", // Runs every Friday at 15:00 SAST
    timeZone: "Africa/Johannesburg",
    timeoutSeconds: 120,
    memory: "256MiB",
    secrets: [mailgunSecret],
  },
  async (event) => {
    try {
      const db = admin.firestore();
      logger.info("🕒 [generateWeeklyMentorLinks] Executing Friday Sweeper...");

      // 1. Find all pending workplace logs
      const logsSnap = await db
        .collection("workplace_logs")
        .where("status", "==", "Pending_Mentor_Approval")
        .get();

      if (logsSnap.empty) {
        logger.info("No pending workplace logs found. Skipping execution.");
        return;
      }

      // 2. Group logs directly by the Immutable mentorId stamped on the log
      const logsByMentor: Record<
        string,
        { name: string; logs: string[]; mentorId: string }
      > = {};

      for (const docSnap of logsSnap.docs) {
        const logData = docSnap.data();
        const learnerId = logData.learnerId;
        const mentorId = logData.mentorId; // 🚀 Explicitly stamped by the UI

        if (mentorId) {
          // 🚀 Fetch the actual mentor profile from the 'users' collection
          const mentorProfileSnap = await db
            .collection("users")
            .doc(mentorId)
            .get();

          if (mentorProfileSnap.exists) {
            const mentorData = mentorProfileSnap.data()!;

            // 🚀 STRICT GATES: Must be a mentor, must not be archived, must have an email
            if (
              mentorData.role === "mentor" &&
              mentorData.status !== "archived" &&
              mentorData.email
            ) {
              const verifiedEmail = mentorData.email.toLowerCase().trim();
              const verifiedName =
                mentorData.fullName || logData.mentorName || "Workplace Mentor";

              if (!logsByMentor[verifiedEmail]) {
                logsByMentor[verifiedEmail] = {
                  name: verifiedName,
                  mentorId: mentorId,
                  logs: [],
                };
              }
              logsByMentor[verifiedEmail].logs.push(docSnap.id);
            } else {
              logger.warn(
                `Mentor ${mentorId} for Learner ${learnerId} failed compliance gates (Archived, Invalid Role, or Missing Email).`,
              );
            }
          } else {
            logger.warn(
              `Mentor profile ${mentorId} not found in users collection for Learner ${learnerId}.`,
            );
          }
        } else {
          logger.warn(
            `Pending Log ${docSnap.id} for Learner ${learnerId} is missing an immutable mentorId. Sweeper cannot route this log.`,
          );
        }
      }

      // 3. Generate Magic Tokens & Dispatch Emails
      const batch = db.batch();
      const emailPromises: Promise<any>[] = [];
      let tokenCount = 0;

      for (const [email, data] of Object.entries(logsByMentor)) {
        // Generate a cryptographically random token string
        const tokenId = crypto.randomBytes(24).toString("hex");

        const expireDate = new Date();
        expireDate.setDate(expireDate.getDate() + 7); // Valid for 7 days

        // Store the secure token in the DB
        const tokenRef = db.collection("mentor_tokens").doc(tokenId);
        batch.set(tokenRef, {
          mentorEmail: email,
          mentorName: data.name,
          mentorId: data.mentorId, // Store the verified mentor UID
          logIds: data.logs,
          status: "pending",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          expiresAt: expireDate.toISOString(),
        });

        // The secure magic link to your web platform route
        const magicLink = `${APP_URL}/mentor-verify/${tokenId}`;

        const emailParams = {
          title: "Verify Weekly Timesheets",
          subtitle: "QCTO Workplace Experience Verification",
          recipientName: data.name,
          bodyHtml: `
            <p>Good afternoon. Your assigned mLab interns have submitted their workplace evidence logs and timesheets for this week.</p>
            <p>As their official Workplace Mentor, you are required to review and digitally sign off on their submissions to ensure compliance with QCTO regulations.</p>
            
            <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                <p style="margin: 0; color: #475569; font-size: 13px;"><strong>Pending Approvals:</strong> ${data.logs.length} Logged Task(s)<br/> 
                <strong>Security:</strong> No password required. This is a secure, single-use authentication link.</p>
            </div>
            
            <p>Please click the button below to open your secure verification portal. <strong>This link will automatically expire in 7 days.</strong></p>
          `,
          ctaText: "Review & Sign-Off Timesheets",
          ctaLink: magicLink,
          showStepIndicator: false,
        };

        emailPromises.push(
          sendMailgunEmail({
            to: email,
            subject: "Action Required: Weekly Timesheet Verification",
            text: buildMlabEmailPlainText(emailParams),
            html: buildMlabEmailHtml(emailParams),
          }).catch((err) => {
            logger.error(`Failed to send magic link to ${email}`, err);
          }),
        );

        tokenCount++;
      }

      if (tokenCount > 0) {
        await batch.commit();
        logger.info(
          `Successfully saved ${tokenCount} verified mentor magic tokens to Firestore.`,
        );
        await Promise.all(emailPromises);
        logger.info(
          `Successfully dispatched ${emailPromises.length} secure mentor emails.`,
        );
      } else {
        logger.info(
          "No valid mentors resolved for the pending logs. Zero emails dispatched.",
        );
      }
    } catch (error) {
      logger.error("Error executing Friday Mentor Sweeper:", error);
    }
  },
);

// ─── MANUAL TRIGGER FOR TESTING ───
// ─── MANUAL TRIGGER FOR TESTING ───
export const testGenerateWeeklyMentorLinks = onRequest(
  { secrets: [mailgunSecret], timeoutSeconds: 120, memory: "256MiB" },
  async (req, res) => {
    return cors(req, res, async () => {
      try {
        const db = admin.firestore();
        logger.info("🕒 [TEST MODE] Executing Mentor Sweeper...");

        const logsSnap = await db
          .collection("workplace_logs")
          .where("status", "==", "Pending_Mentor_Approval")
          .get();

        if (logsSnap.empty) {
          res
            .status(200)
            .send({ success: true, message: "No pending logs found to test." });
          return;
        }

        const TEST_EMAIL = "codetribe@mlab.co.za";

        // Mirror exact verification logic in Test mode
        const logsByMentor: Record<
          string,
          { name: string; logs: string[]; mentorId: string }
        > = {};

        for (const docSnap of logsSnap.docs) {
          const logData = docSnap.data();
          const mentorId = logData.mentorId;
          const learnerId = logData.learnerId; // 🚀 Kept and used below to fix the ts(6133) warning!

          if (mentorId) {
            const mentorProfileSnap = await db
              .collection("users")
              .doc(mentorId)
              .get();

            if (mentorProfileSnap.exists) {
              const mentorData = mentorProfileSnap.data()!;

              if (
                mentorData.role === "mentor" &&
                mentorData.status !== "archived"
              ) {
                const verifiedName =
                  mentorData.fullName || logData.mentorName || "Test Mentor";

                // Overwrite the destination email to the test email, but keep real logic
                if (!logsByMentor[TEST_EMAIL]) {
                  logsByMentor[TEST_EMAIL] = {
                    name: `${verifiedName} (TEST MODE)`,
                    mentorId: mentorId,
                    logs: [],
                  };
                }
                logsByMentor[TEST_EMAIL].logs.push(docSnap.id);
              } else {
                // 🚀 Explicitly using learnerId to provide contextual audit trails
                logger.warn(
                  `Test Sweeper: Mentor ${mentorId} for Learner ${learnerId || "Unknown"} failed compliance gates.`,
                );
              }
            } else {
              logger.warn(
                `Test Sweeper: Mentor Profile ${mentorId} not found for Learner ${learnerId || "Unknown"}.`,
              );
            }
          } else {
            logger.warn(
              `Test Sweeper: Log ${docSnap.id} for Learner ${learnerId || "Unknown"} is missing a mentorId.`,
            );
          }
        }

        if (Object.keys(logsByMentor).length === 0) {
          res.status(200).send({
            success: true,
            message:
              "No valid mentors resolved for pending logs in Test mode. Check your Firebase logs for compliance warnings.",
          });
          return;
        }

        const batch = db.batch();
        const emailPromises: Promise<any>[] = [];

        for (const [email, data] of Object.entries(logsByMentor)) {
          const tokenId = crypto.randomBytes(24).toString("hex");
          const expireDate = new Date();
          expireDate.setDate(expireDate.getDate() + 7);

          const tokenRef = db.collection("mentor_tokens").doc(tokenId);
          batch.set(tokenRef, {
            mentorEmail: email, // Will be the test email
            mentorName: data.name,
            mentorId: data.mentorId,
            logIds: data.logs,
            status: "pending",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: expireDate.toISOString(),
          });

          const magicLink = `${APP_URL}/mentor-verify/${tokenId}`;

          const emailParams = {
            title: "[TEST] Verify Weekly Timesheets",
            subtitle: "QCTO Workplace Experience Verification",
            recipientName: data.name,
            bodyHtml: `
              <p>Good afternoon. Your assigned mLab interns have submitted their workplace evidence logs and timesheets for this week.</p>
              <p>As their official Workplace Mentor, you are required to review and digitally sign off on their submissions to ensure compliance with QCTO regulations.</p>
              <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
                  <p style="margin: 0; color: #475569; font-size: 13px;"><strong>Pending Approvals:</strong> ${data.logs.length} Logged Task(s)<br/> 
                  <strong>Security:</strong> No password required. This is a secure, single-use authentication link.</p>
              </div>
              <p>Please click the button below to open your secure verification portal. <strong>This link will automatically expire in 7 days.</strong></p>
            `,
            ctaText: "Review & Sign-Off Timesheets",
            ctaLink: magicLink,
            showStepIndicator: false,
          };

          emailPromises.push(
            sendMailgunEmail({
              to: email,
              subject: "[TEST] Action Required: Weekly Timesheet Verification",
              text: buildMlabEmailPlainText(emailParams),
              html: buildMlabEmailHtml(emailParams),
            }),
          );
        }

        await batch.commit();
        await Promise.all(emailPromises);

        res.status(200).send({
          success: true,
          message: `Test complete. Generated ${Object.keys(logsByMentor).length} token(s) and routed emails to ${TEST_EMAIL}.`,
        });
      } catch (error: any) {
        logger.error("Error executing Test Mentor Sweeper:", error);
        res.status(500).send({ success: false, error: error.message });
      }
    });
  },
);

// ============================================================================
// WORKPLACE LOGS: SECURE MENTOR GATEWAYS
// ============================================================================

export const getMentorVerificationDetails = onCall(async (request) => {
  const { tokenId } = request.data;
  if (!tokenId) throw new HttpsError("invalid-argument", "Token ID missing.");

  const db = admin.firestore();

  try {
    const tokenSnap = await db.collection("mentor_tokens").doc(tokenId).get();

    if (!tokenSnap.exists) return { status: "not_found" };

    const tokenData = tokenSnap.data()!;

    if (tokenData.status === "approved") return { status: "already_approved" };
    if (new Date(tokenData.expiresAt).getTime() < Date.now())
      return { status: "expired" };

    // Check if this mentor has a previously saved signature linked to their email
    const sigSnap = await db
      .collection("mentor_signatures")
      .doc(tokenData.mentorEmail.toLowerCase())
      .get();
    const existingSignatureUrl = sigSnap.exists
      ? sigSnap.data()?.signatureUrl
      : null;

    // Fetch the actual log documents
    const fetchedLogs: any[] = [];
    for (const logId of tokenData.logIds) {
      const logSnap = await db.collection("workplace_logs").doc(logId).get();
      if (logSnap.exists) {
        fetchedLogs.push({ id: logSnap.id, ...logSnap.data() });
      }
    }

    // Group by Learner for a clean UI delivery
    const groupedLogs = fetchedLogs.reduce((acc: any, log: any) => {
      if (!acc[log.learnerId]) {
        acc[log.learnerId] = {
          learnerName: log.learnerName || "Assigned Intern",
          totalHours: 0,
          entries: [],
        };
      }
      acc[log.learnerId].entries.push(log);
      acc[log.learnerId].totalHours += log.totalHours || 0;
      return acc;
    }, {});

    return {
      status: "valid",
      tokenData,
      logs: Object.values(groupedLogs),
      existingSignatureUrl,
    };
  } catch (error) {
    logger.error("Error verifying mentor token:", error);
    throw new HttpsError("internal", "Failed to verify token.");
  }
});

export const submitMentorApproval = onCall(async (request) => {
  // EXTRACT BOTH signatureBase64 (if new) OR existingSignatureUrl (if reused)
  const {
    tokenId,
    userAgent,
    decisions,
    signatureBase64,
    existingSignatureUrl,
  } = request.data;
  if (!tokenId) throw new HttpsError("invalid-argument", "Token ID missing.");

  const db = admin.firestore();
  const bucket = admin.storage().bucket();
  const tokenRef = db.collection("mentor_tokens").doc(tokenId);

  try {
    let finalSignatureUrl = existingSignatureUrl || null;

    // 1. Fetch token early to get the mentor's email for the registry
    const initialTokenSnap = await tokenRef.get();
    if (!initialTokenSnap.exists)
      throw new HttpsError("not-found", "Token is invalid.");
    const tokenDataRaw = initialTokenSnap.data()!;

    // 2. CONVERT BASE64 TO IMAGE FILE AND SAVE TO REGISTRY
    if (signatureBase64) {
      const base64Data = signatureBase64.replace(
        /^data:image\/png;base64,/,
        "",
      );
      const imageBuffer = Buffer.from(base64Data, "base64");
      const file = bucket.file(
        `signatures/mentors/${tokenDataRaw.mentorEmail.toLowerCase()}_${Date.now()}.png`,
      );

      await file.save(imageBuffer, { metadata: { contentType: "image/png" } });
      const [url] = await file.getSignedUrl({
        action: "read",
        expires: "01-01-2100",
      });
      finalSignatureUrl = url;

      // Save this URL globally for this mentor's email so they never have to draw it again
      await db
        .collection("mentor_signatures")
        .doc(tokenDataRaw.mentorEmail.toLowerCase())
        .set(
          {
            signatureUrl: finalSignatureUrl,
            updatedAt: new Date().toISOString(),
          },
          { merge: true },
        );
    }

    // 3. APPLY DECISIONS TO LOGS
    await db.runTransaction(async (transaction) => {
      const tokenSnap = await transaction.get(tokenRef);
      const data = tokenSnap.data()!;

      if (data.status === "approved")
        throw new HttpsError(
          "failed-precondition",
          "Timesheets already processed.",
        );

      const commonMetadata: any = {
        processedAt: new Date().toISOString(),
        processedBy: data.mentorEmail,
        approvalIpAddress: request.rawRequest?.ip || "Remote IP",
        userAgent: userAgent || "Unknown",
        // 🚀 INJECT EXACT MENTOR UID INTO THE LOG METADATA AUDIT TRAIL
        verifiedMentorId: data.mentorId || null,
      };

      if (finalSignatureUrl)
        commonMetadata.mentorSignatureUrl = finalSignatureUrl;

      for (const logId of data.logIds) {
        const logRef = db.collection("workplace_logs").doc(logId);
        const decision =
          decisions && decisions[logId]
            ? decisions[logId]
            : { status: "approved", reason: "" };

        if (decision.status === "rejected") {
          transaction.update(logRef, {
            status: "Rejected",
            rejectionReason: decision.reason || "No reason provided.",
            ...commonMetadata,
          });
        } else {
          transaction.update(logRef, { status: "Approved", ...commonMetadata });
        }
      }

      transaction.update(tokenRef, {
        status: "approved",
        executedAt: new Date().toISOString(),
        mentorSignatureUrl: finalSignatureUrl,
      });
    });

    return { success: true };
  } catch (error: any) {
    logger.error("Error submitting mentor review:", error);
    throw new HttpsError(
      "internal",
      error.message || "Failed to process review.",
    );
  }
});

// ============================================================================
// GEOSPATIAL REVERSE-GEOCODING ENGINE (BOOTCAMP ADDRESSES)
// ============================================================================

/**
 * Trigger: Runs automatically whenever a new document is added to the "learners" collection.
 * Purpose: Reverse-geocodes the raw address, updates the geoData block, and backfills legacy QCTO demographic fields.
 */
export const geocodeLearnerAddress = onDocumentCreated(
  {
    document: "learners/{learnerId}",
    secrets: [mapsApiKey],
    maxInstances: 10, // Limits concurrency to protect against Google Maps 50 QPS limit
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const data = snap.data();
    const learnerId = event.params.learnerId;
    // const db = admin.firestore();

    // 1. Safety Check: Skip if already processed or manually flagged
    if (data._geocoded) {
      return;
    }

    const rawAddress = data.demographics?.learnerHomeAddress1 || "";
    const province = data.province || data.nearestCodeTribe || "";

    // If no address is provided at all, mark as skipped
    if (!rawAddress || rawAddress.toLowerCase() === "not specified") {
      logger.info(
        `[GEOCODE] Skipping ${learnerId}: No valid street address provided.`,
      );
      await snap.ref.update({ _geocoded: "skipped_no_address" });
      return;
    }

    // 2. Build the search query dynamically
    const searchQuery = `${rawAddress}, ${province}, South Africa`;

    try {
      const apiKey = mapsApiKey.value();

      // 3. Call Google Maps Geocoding API
      const response = await axios.get(
        `https://maps.googleapis.com/maps/api/geocode/json`,
        {
          params: {
            address: searchQuery,
            key: apiKey,
          },
        },
      );

      const apiStatus = response.data.status;

      // 🟢 SCENARIO 1: PERFECT SUCCESS
      if (apiStatus === "OK" && response.data.results.length > 0) {
        const result = response.data.results[0];
        const lat = result.geometry.location.lat;
        const lng = result.geometry.location.lng;
        const formattedAddress = result.formatted_address;

        let postalCode = "";
        let normalizedProvince = data.demographics?.provinceCode || province;
        let city = "";

        result.address_components.forEach((comp: any) => {
          if (comp.types.includes("postal_code")) {
            postalCode = comp.long_name;
          }
          if (comp.types.includes("administrative_area_level_1")) {
            normalizedProvince = comp.long_name;
          }
          if (
            comp.types.includes("locality") ||
            comp.types.includes("administrative_area_level_3")
          ) {
            city = comp.long_name;
          }
        });

        await snap.ref.update({
          _geocoded: true,
          geoData: {
            lat: lat,
            lng: lng,
            formattedAddress: formattedAddress,
            postalCode: postalCode,
            province: normalizedProvince,
            city: city,
            geocodedAt: new Date().toISOString(),
          },
          // DYNAMIC BACKFILL: Keeps legacy QCTO object consistent
          "demographics.learnerPostalAddressPostCode":
            postalCode || data.demographics?.learnerPostalAddressPostCode || "",
          "demographics.provinceCode": normalizedProvince,
        });

        logger.info(
          `✅ [GEOCODE] Successfully geocoded ${learnerId} to ${formattedAddress}`,
        );
      }
      // 🟡 SCENARIO 2: BAD USER DATA
      else if (apiStatus === "ZERO_RESULTS") {
        logger.warn(
          `⚠️ [GEOCODE] Address not found for ${learnerId}: "${searchQuery}"`,
        );
        await snap.ref.update({ _geocoded: "failed_no_results" });
      }
      // 🔴 SCENARIO 3: CRITICAL SYSTEM ERROR
      else {
        logger.error(
          `🚨 [GEOCODE] API CRITICAL ERROR [${apiStatus}] for ${learnerId}: ${response.data.error_message}`,
        );
        await snap.ref.update({ _geocoded: "failed_api_error" });
      }
    } catch (error: any) {
      // ⚫ SCENARIO 4: NETWORK/AXIOS FAILURE
      logger.error(
        `🚨 [GEOCODE] Network Error for ${learnerId}:`,
        error.message,
      );
    }
  },
);

// ============================================================================
// ONE-OFF SCRIPT: GLOBAL GHOST PURGE (SCIENTIFIC NOTATION)
// ============================================================================

export const executeGlobalGhostPurge = onRequest((req, res) => {
  return cors(req, res, async () => {
    logger.info("Initiating Global Ghost Purge...");
    const db = admin.firestore();

    try {
      const learnersSnap = await db.collection("learners").get();
      const enrollmentsSnap = await db.collection("enrollments").get();

      const batch = db.batch();
      let purgeCount = 0;

      // 1. Hunt down ghost Learners by document ID
      learnersSnap.forEach((docSnap) => {
        const docId = docSnap.id;

        // Target specifically the scientific notation corruptions
        if (docId.includes("E") || docId.includes("+")) {
          batch.delete(docSnap.ref);
          purgeCount++;
          logger.info(`Found & staged for deletion: Learner ${docId}`);
        }
      });

      // 2. Hunt down ghost Enrollments that point to those broken IDs
      enrollmentsSnap.forEach((docSnap) => {
        const data = docSnap.data();
        if (
          data.learnerId &&
          (data.learnerId.includes("E") || data.learnerId.includes("+"))
        ) {
          batch.delete(docSnap.ref);
          purgeCount++;
        }
      });

      if (purgeCount > 0) {
        await batch.commit();
        logger.info(
          `✅ Successfully purged ${purgeCount} ghost records globally.`,
        );
        res.status(200).send({
          success: true,
          message: `Global Ghost Purge Complete. Obliterated ${purgeCount} corrupted records.`,
        });
      } else {
        res.status(200).send({
          success: true,
          message: `Scan complete. No ghost records found in the database.`,
        });
      }
    } catch (error: any) {
      logger.error("Ghost Purge Failed:", error);
      res.status(500).send({ success: false, error: error.message });
    }
  });
});

// ============================================================================
// SETA COMPLIANCE AUDIT PACK GENERATOR (ZIPPED)
// ============================================================================

export const generateSetaAuditPack = onCall(
  {
    timeoutSeconds: 300,
    memory: "2GiB",
  },
  async (request) => {
    logger.info("BACKEND: generateSetaAuditPack triggered.");

    const auth = request.auth;
    if (!auth) {
      throw new HttpsError(
        "unauthenticated",
        "User must be logged in to generate audit packs.",
      );
    }

    const {
      learnerId,
      placementId,
      employerName,
      learnerName,
      idNumber: payloadIdNumber,
      mentorName: payloadMentorName,
    } = request.data;

    if (!learnerId || !placementId) {
      throw new HttpsError(
        "invalid-argument",
        "Missing required Learner or Placement IDs.",
      );
    }

    const db = admin.firestore();
    const bucket = admin.storage().bucket();

    try {
      let actualDocId = learnerId;
      let extractedCohortId = "";

      if (learnerId.includes("_")) {
        const parts = learnerId.split("_");
        extractedCohortId = parts[0];
        actualDocId = parts[1];
      }

      const [learnerSnap, placementSnap, disbursementsSnap] = await Promise.all(
        [
          db.collection("learners").doc(actualDocId).get(),
          db.collection("placements").doc(placementId).get(),
          db.collection(`placements/${placementId}/disbursements`).get(),
        ],
      );

      const learner = learnerSnap.data() || {};
      const placement = placementSnap.exists ? placementSnap.data() || {} : {};

      const disbursementsList = disbursementsSnap.docs
        .map((doc) => doc.data())
        .sort((a, b) => String(a.monthYear).localeCompare(String(b.monthYear)));

      const finalIdNumber =
        payloadIdNumber && payloadIdNumber !== "—"
          ? payloadIdNumber
          : String(learner.idNumber || actualDocId).trim();
      const resolvedMentorName =
        payloadMentorName && payloadMentorName !== "Unassigned"
          ? payloadMentorName
          : placement.assignedMentorName ||
            placement.mentorName ||
            "Unassigned Mentor";
      const cohortId =
        placement.cohortId || learner.cohortId || extractedCohortId;

      // 🚀 4. FETCH THE FULL EMPLOYER PROFILE FOR THE MASTER REGISTRY
      let employer: any = {};
      const targetEmployerId = placement.employerId || learner.employerId;

      if (targetEmployerId) {
        const empSnap = await db
          .collection("employers")
          .doc(targetEmployerId)
          .get();
        if (empSnap.exists) {
          employer = empSnap.data() || {};
        }
      }

      // Extract Employer Details prioritizing the actual employer document
      const empName =
        employerName ||
        employer.name ||
        placement.employerName ||
        "Registered Host Employer";
      const empAddress =
        employer.physicalAddress ||
        employer.address ||
        placement.employerAddress ||
        placement.employerPhysicalAddress ||
        "N/A";
      const empPhone =
        employer.contactPhone ||
        employer.phone ||
        placement.employerPhone ||
        placement.employerTelephone ||
        "N/A";
      const empEmail =
        employer.contactEmail ||
        employer.email ||
        placement.employerEmail ||
        "N/A";
      const moduleCode =
        learner.qualificationCode || "Software Developer (SAQA ID: 118707)";

      const JSZipModule = require("jszip");
      const JSZip =
        typeof JSZipModule === "function"
          ? JSZipModule
          : JSZipModule.default || JSZipModule;
      const zip = new JSZip();

      const logQueries = [
        db
          .collection("workplace_logs")
          .where("learnerId", "==", learnerId)
          .get(),
      ];
      if (finalIdNumber && learnerId !== finalIdNumber) {
        logQueries.push(
          db
            .collection("workplace_logs")
            .where("learnerId", "==", finalIdNumber)
            .get(),
        );
      }

      const logSnaps = await Promise.all(logQueries);
      const allLogsMap = new Map();

      logSnaps.forEach((snap) => {
        snap.docs.forEach((doc) => {
          const logData = doc.data();
          if (
            String(logData.status || "")
              .trim()
              .toLowerCase() === "approved"
          ) {
            allLogsMap.set(doc.id, logData);
          }
        });
      });

      const logs = Array.from(allLogsMap.values());

      let classroomRecords: any[] = [];
      if (cohortId && finalIdNumber) {
        const attendanceSnap = await db
          .collection("attendance")
          .where("cohortId", "==", cohortId)
          .get();

        const formatScanTime = (ts: number | undefined) => {
          if (!ts) return "—";
          return new Date(ts).toLocaleTimeString("en-ZA", {
            timeZone: "Africa/Johannesburg",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        };

        classroomRecords = attendanceSnap.docs
          .map((d) => {
            const att = d.data();
            const isPresent =
              Array.isArray(att.presentLearners) &&
              att.presentLearners.includes(finalIdNumber);
            const isAbsent =
              Array.isArray(att.absentLearners) &&
              att.absentLearners.includes(finalIdNumber);

            if (!isPresent && !isAbsent) return null;

            const scanData =
              isPresent && att.scans ? att.scans[finalIdNumber] : null;

            return {
              date: att.date || "—",
              status: isPresent ? "Present" : "Absent",
              checkIn: scanData?.checkInAt
                ? formatScanTime(scanData.checkInAt)
                : "—",
              lunchOut: scanData?.lunchOutAt
                ? formatScanTime(scanData.lunchOutAt)
                : "—",
              lunchIn: scanData?.lunchInAt
                ? formatScanTime(scanData.lunchInAt)
                : "—",
              checkOut: scanData?.checkOutAt
                ? formatScanTime(scanData.checkOutAt)
                : "—",
            };
          })
          .filter(Boolean)
          .sort(
            (a: any, b: any) =>
              new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
      }

      const folderLegal = "01_Legal_Identity_and_Contracts/";
      const folderClassroom = "02_Theory_and_Practical_Classroom_Evidence/";
      const folderWorkplace = "03_Workplace_Logbooks_and_Timesheets/";
      const folderFinancial = "04_Financial_and_Payroll_Evidence/";
      const folderEvidenceArtifacts = `${folderWorkplace}Evidence_Artifacts/`;

      const fetchImageAsBase64 = async (url: string | null | undefined) => {
        if (!url) return null;
        try {
          const response = await axios.get(url, {
            responseType: "arraybuffer",
          });
          const base64 = Buffer.from(response.data, "binary").toString(
            "base64",
          );
          const mimeType =
            url.toLowerCase().includes(".jpg") ||
            url.toLowerCase().includes(".jpeg")
              ? "image/jpeg"
              : "image/png";
          return `data:${mimeType};base64,${base64}`;
        } catch (error) {
          logger.warn(`[AuditPack] Failed to fetch signature: ${url}`);
          return null;
        }
      };

      let idUrl =
        learner.documents?.idDocument ||
        learner.idUrl ||
        learner.idDocumentUrl ||
        "";
      let wblpaUrl =
        placement.compliance?.wblpaAgreementUrl ||
        placement.wblAgreementUrl ||
        placement.wblpaAgreementUrl ||
        "";

      let learnerUserDoc: any = {};
      if (learner.authUid) {
        const uSnap = await db.collection("users").doc(learner.authUid).get();
        if (uSnap.exists) learnerUserDoc = uSnap.data();
      }

      const arraysToScan = [
        ...(learner.uploadedDocuments || []),
        ...(placement.uploadedDocuments || []),
        ...(learnerUserDoc?.uploadedDocuments || []),
      ];
      arraysToScan.forEach((doc: any) => {
        const docId = String(doc.id || "").toLowerCase();
        const name = String(doc.name || "").toLowerCase();
        if (
          !idUrl &&
          (docId === "id" ||
            name.includes("id") ||
            name.includes("identity") ||
            name.includes("passport"))
        )
          idUrl = doc.url;
        if (
          !wblpaUrl &&
          (docId === "wblpa" ||
            docId === "contract" ||
            name.includes("contract") ||
            name.includes("wblpa") ||
            name.includes("agreement"))
        )
          wblpaUrl = doc.url;
      });

      const appendUrlToZipFolder = async (
        url: string,
        folderPath: string,
        filename: string,
      ) => {
        try {
          const response = await axios.get(url, {
            responseType: "arraybuffer",
          });
          zip.file(`${folderPath}${filename}`, response.data);
          return true;
        } catch (e: any) {
          return false;
        }
      };

      const safeLearnerName = (learnerName || "Learner").replace(
        /[^a-zA-Z0-9]/g,
        "_",
      );

      const getExtensionFromUrl = (url: string, defaultExt: string = "pdf") => {
        try {
          const ext = url.split("?")[0].split(".").pop()?.toLowerCase();
          return ["pdf", "jpg", "jpeg", "png", "docx", "webp"].includes(
            ext || "",
          )
            ? ext
            : defaultExt;
        } catch {
          return defaultExt;
        }
      };

      if (idUrl)
        await appendUrlToZipFolder(
          idUrl,
          folderLegal,
          `ID_Document_${safeLearnerName}.${getExtensionFromUrl(idUrl, "pdf")}`,
        );
      else
        zip.file(
          `${folderLegal}⚠️_MISSING_IDENTITY_DOCUMENT.txt`,
          "Compliance Alert: No certified ID file or passport was uploaded.",
        );

      if (wblpaUrl)
        await appendUrlToZipFolder(
          wblpaUrl,
          folderLegal,
          `Fully_Executed_WBLPA_Contract_${safeLearnerName}.${getExtensionFromUrl(wblpaUrl, "pdf")}`,
        );
      else
        zip.file(
          `${folderLegal}⚠️_MISSING_WBLPA_CONTRACT.txt`,
          "Compliance Alert: No signed tripartite WBLPA agreement link could be fetched.",
        );

      const formatCurrency = (val: any) =>
        new Intl.NumberFormat("en-ZA", {
          style: "currency",
          currency: "ZAR",
          maximumFractionDigits: 0,
        }).format(Number(val) || 0);

      // ─── GENERATE FINANCIAL LEDGER HTML ───
      let financialHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Trebuchet MS', Arial, sans-serif; color: #333; font-size: 14px; }
          h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 10px; text-align: left; }
          th { background-color: #f8fafc; font-weight: bold; text-transform: uppercase; font-size: 12px; }
        </style>
      </head>
      <body>
        <h1>Stipend Disbursement Ledger</h1>
        <p><strong>Candidate:</strong> ${learnerName} | <strong>ID Number:</strong> ${finalIdNumber}</p>
      `;

      if (disbursementsList.length === 0) {
        financialHtml += `<p style="padding: 20px; background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b;">No verified financial disbursements recorded on the ledger.</p>`;
      } else {
        financialHtml += `
          <table>
            <thead><tr><th>Month/Year</th><th>Amount Disbursed</th><th>Payment Status</th><th>Payment Date</th></tr></thead>
            <tbody>
        `;
        disbursementsList.forEach((disb) => {
          financialHtml += `
            <tr>
              <td>${disb.monthYear || "N/A"}</td>
              <td style="font-weight: bold;">${formatCurrency(disb.amount)}</td>
              <td style="color: ${disb.status === "Paid" ? "#166534" : "#d97706"}; font-weight: bold;">${disb.status || "Pending"}</td>
              <td>${disb.paymentDate ? new Date(disb.paymentDate).toLocaleDateString() : "—"}</td>
            </tr>
          `;
        });
        financialHtml += `</tbody></table>`;
      }
      financialHtml += `</body></html>`;

      // ─── GENERATE CLASSROOM ATTENDANCE HTML ───
      let classroomHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: 'Trebuchet MS', Arial, sans-serif; color: #333; font-size: 14px; }
          h1 { color: #0f172a; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; text-align: left; font-size: 13px; }
          th { background-color: #f8fafc; font-weight: bold; text-transform: uppercase; font-size: 12px; }
          .present { color: #166534; font-weight: bold; }
          .absent { color: #991b1b; font-weight: bold; }
        </style>
      </head>
      <body>
        <h1>Theory & Classroom Attendance Ledger</h1>
        <p><strong>Candidate:</strong> ${learnerName} | <strong>ID Number:</strong> ${finalIdNumber}</p>
      `;

      if (classroomRecords.length === 0) {
        classroomHtml += `<p style="padding: 20px; background: #fef2f2; border: 1px solid #fca5a5; color: #991b1b;">No biometric or manual classroom attendance records found for this candidate.</p>`;
      } else {
        classroomHtml += `
          <table>
            <thead><tr><th>Date</th><th>Status</th><th>Check In</th><th>Lunch Out</th><th>Lunch In</th><th>Check Out</th></tr></thead>
            <tbody>
        `;
        classroomRecords.forEach((rec) => {
          classroomHtml += `
            <tr>
              <td><strong>${rec.date}</strong></td>
              <td class="${rec.status === "Present" ? "present" : "absent"}">${rec.status}</td>
              <td>${rec.checkIn}</td>
              <td>${rec.lunchOut}</td>
              <td>${rec.lunchIn}</td>
              <td>${rec.checkOut}</td>
            </tr>
          `;
        });
        classroomHtml += `</tbody></table>`;
      }
      classroomHtml += `</body></html>`;

      // ─── GENERATE WORKPLACE LOGBOOK HTML (LANDSCAPE) ───
      logs.sort(
        (a, b) =>
          new Date(a.dateString).getTime() - new Date(b.dateString).getTime(),
      );
      const totalHours = logs.reduce(
        (sum, l) => sum + (Number(l.totalHours) || 0),
        0,
      );

      const matrixMap = new Map();
      const cwkMap = new Map();
      logs.forEach((l) => {
        (l.selectedMilestones || []).forEach((code: string) => {
          const desc =
            l.milestoneLabels?.[code] ||
            "Workplace Activity Metric / Milestone";
          if (code.startsWith("CWK")) cwkMap.set(code, desc);
          else matrixMap.set(code, desc);
        });
      });

      const lastSignedLog = [...logs]
        .reverse()
        .find((l) => l.mentorSignatureUrl);
      const rawMentorSigUrl = lastSignedLog?.mentorSignatureUrl || null;
      const rawLearnerSigUrl =
        learnerUserDoc?.signatureUrl || learner.signatureUrl || null;

      const [base64MentorSignature, base64LearnerSignature] = await Promise.all(
        [
          fetchImageAsBase64(rawMentorSigUrl),
          fetchImageAsBase64(rawLearnerSigUrl),
        ],
      );

      const currentDateStr = new Date().toLocaleDateString("en-GB");

      let logsHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { background: #ffffff; color: #000000; font-family: Arial, Helvetica, sans-serif; font-size: 10pt; line-height: 1.4; margin: 0; padding: 0; box-sizing: border-box; }
            * { box-sizing: border-box; }
            .print-page-break { page-break-after: always; width: 100%; clear: both; padding-bottom: 20px; }
            .bulk-header-block { width: 100%; border-collapse: collapse; margin-bottom: 20px; border: 2px solid #000000; }
            .bulk-header-block td { border: 1px solid #000000; padding: 10px 14px; font-weight: bold; font-size: 10pt; }
            .bulk-header-block td span { font-weight: normal; margin-left: 12px; display: inline-block; }
            .statutory-declaration-box { border: 2px solid #000000; padding: 14px; margin-bottom: 20px; background: #ffffff; page-break-inside: avoid; }
            .bulk-ledger-table { width: 100%; table-layout: fixed; border-collapse: collapse; border: 2px solid #000000; margin-bottom: 20px; }
            .bulk-ledger-table th, .bulk-ledger-table td { border: 1px solid #000000; padding: 10px; vertical-align: top; word-break: break-word; overflow-wrap: break-word; white-space: normal; }
            .bulk-ledger-table th { background-color: #f1f5f9; text-align: left; font-weight: bold; font-size: 9.5pt; text-transform: uppercase; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            .ledger-html-content { display: block; word-wrap: break-word; overflow-wrap: break-word; max-width: 100%; color: #1e293b; }
            .ledger-html-content p { margin: 0 0 4px 0; font-size: 9.5pt; }
            .row-sig-container { display: flex; flex-direction: column; gap: 6px; font-size: 7.5pt; }
            .row-sig-item { display: flex; align-items: center; justify-content: space-between; border-bottom: 1px dashed #cbd5e1; padding-bottom: 3px; }
            .row-sig-item:last-child { border-bottom: none; padding-bottom: 0; }
            .row-sig-img { max-height: 22px; max-width: 80px; object-fit: contain; mix-blend-mode: multiply; }
            .bulk-signatures-strip { display: table; width: 100%; margin-top: 30px; table-layout: fixed; page-break-inside: avoid; }
            .bulk-sig-col { display: table-cell; width: 33.33%; padding: 0 15px; vertical-align: bottom; text-align: center; }
            .bulk-sig-img-wrap { height: 45px; display: flex; align-items: center; justify-content: center; margin-bottom: 4px; }
            .bulk-sig-img-wrap img { max-height: 45px; max-width: 120px; object-fit: contain; mix-blend-mode: multiply; }
            .bulk-sig-line { border-top: 1.5px solid #000000; padding-top: 6px; font-size: 8.5pt; font-weight: bold; text-transform: uppercase; }
            .bulk-print-se-block { margin-top: 8px; padding: 6px 10px; background: #ffffff; border: 1px solid #000000; display: flex; flex-direction: column; gap: 4px; page-break-inside: avoid; }
            .bulk-print-se-tag { background: #000000; color: #ffffff; font-weight: 800; font-size: 7pt; padding: 1px 4px; border-radius: 2px; font-family: monospace; }
          </style>
        </head>
        <body>
          <!-- PAGE 1: MASTER REGISTRY -->
          <div class="print-page-break">
            <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px dashed #000; padding-bottom: 15px;">
              <h1 style="font-size: 18pt; margin: 0 0 4px 0; letter-spacing: 0.5px;">OFFICIAL LOGBOOK STATEMENT OF WORK EXPERIENCE</h1>
              <h2 style="font-size: 12pt; font-weight: bold; color: #333; margin: 0 0 6px 0; text-transform: uppercase;">Occupational Certificate: ${moduleCode}</h2>
              <span style="font-size: 10pt; font-weight: bold; background: #f1f5f9; padding: 3px 10px; border-radius: 4px;">NQF LEVEL 5 | DESIGNATED COMPLIANCE SCOPE NOTIONAL HOURS: 150</span>
            </div>

            <table class="bulk-header-block">
              <thead>
                <tr style="background-color: #f1f5f9;"><th colspan="4" style="padding: 8px 14px; text-align: left; font-size: 10pt;">LEARNER AND EMPLOYER MASTER REGISTRY</th></tr>
              </thead>
              <tbody>
                <tr>
                  <td style="width: 20%;">CANDIDATE NAME</td>
                  <td style="width: 30%;"><span>${learnerName}</span></td>
                  <td style="width: 20%;">COMPANY NAME</td>
                  <td style="width: 30%;"><span>${empName}</span></td>
                </tr>
                <tr>
                  <td>CURRICULUM SPEC</td>
                  <td><span>${moduleCode}</span></td>
                  <td>PHYSICAL ADDRESS</td>
                  <td><span>${empAddress}</span></td>
                </tr>
                <tr>
                  <td>SUPERVISOR NAME</td>
                  <td><span>${resolvedMentorName}</span></td>
                  <td>WORK TELEPHONE</td>
                  <td><span>${empPhone}</span></td>
                </tr>
                <tr>
                  <td>ASSESSOR NAME</td>
                  <td><span style="color: #d97706; font-style: italic; font-weight: bold;">Pending Assignment</span></td>
                  <td>E-MAIL</td>
                  <td><span>${empEmail}</span></td>
                </tr>
                <tr>
                  <td colspan="2">TOTAL TARGET HOURS: <span style="font-weight: normal; margin-left: 8px;">150 Hours</span></td>
                  <td colspan="2">ACCUMULATED HOURS: <span style="font-weight: normal; margin-left: 8px;">${totalHours.toFixed(1)} Hours Verified</span></td>
                </tr>
              </tbody>
            </table>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
              <div class="statutory-declaration-box">
                <h3 style="margin: 0 0 8px 0; font-size: 10pt; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 4px;">Acknowledgment of Receipt</h3>
                <p style="font-size: 9pt; margin: 0 0 15px 0; line-height: 1.45; text-align: justify;">I hereby acknowledge receipt of the official Work Experience Module logbook guidelines. The operational frameworks, expected milestones, and continuous tracking protocols have been explicitly outlined and communicated to me.</p>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px;">
                  <div>
                    <div class="bulk-sig-img-wrap" style="justify-content: flex-start; height: 30px;">
                      ${base64LearnerSignature ? `<img src="${base64LearnerSignature}" style="max-height: 30px; mix-blend-mode: multiply;" />` : ""}
                    </div>
                    <div style="border-top: 1px solid #000; width: 220px; font-size: 7.5pt; font-weight: bold;">CANDIDATE SIGNATURE</div>
                    <div style="font-size: 7.5pt; color: #475569; margin-top: 2px;">ID No: ${finalIdNumber}</div>
                  </div>
                  <div style="font-size: 8.5pt;">DATE: ${currentDateStr}</div>
                </div>
              </div>

              <div class="statutory-declaration-box">
                <h3 style="margin: 0 0 8px 0; font-size: 10pt; text-transform: uppercase; border-bottom: 1px solid #000; padding-bottom: 4px;">Declaration of Authenticity</h3>
                <p style="font-size: 9pt; margin: 0 0 15px 0; line-height: 1.45; text-align: justify;">I hereby declare that the logged workplace activities, descriptive entries, and submitted evidence metrics constitute a true and accurate reflection of my own practical work exposure and professional output inside the enterprise environment.</p>
                <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: 20px;">
                  <div>
                    <div class="bulk-sig-img-wrap" style="justify-content: flex-start; height: 30px;">
                      ${base64MentorSignature ? `<img src="${base64MentorSignature}" style="max-height: 30px; mix-blend-mode: multiply;" />` : ""}
                    </div>
                    <div style="border-top: 1px solid #000; width: 220px; font-size: 7.5pt; font-weight: bold;">MENTOR SIGNATURE</div>
                  </div>
                  <div style="font-size: 8.5pt;">DATE: ${currentDateStr}</div>
                </div>
              </div>
            </div>
          </div>

          <!-- PAGE 2: QCTO MATRIX -->
          <div class="print-page-break">
            <h3 style="margin: 0 0 6px 0; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">QCTO Module Specification Matrix & Milestone Checklist</h3>
            <table class="bulk-ledger-table" style="font-size: 9pt;">
              <thead>
                <tr>
                  <th style="width: 15%;">CODE</th>
                  <th style="width: 57%;">WORK EXPERIENCE MODULE ACTIVITY METRICS SPECIFICATION</th>
                  <th style="width: 14%; text-align: center;">CONTROL DATA</th>
                  <th style="width: 14%; text-align: center;">STATUS VALIDATION</th>
                </tr>
              </thead>
              <tbody>
      `;

      if (matrixMap.size === 0) {
        logsHtml += `<tr><td colspan="4" style="text-align: center; padding: 20px; font-style: italic;">No specific roadmap milestones mapped yet.</td></tr>`;
      } else {
        logsHtml += `<tr style="background-color: #f8fafc;"><td colspan="4" style="font-weight: bold; font-size: 8.5pt; border-bottom: 2px solid #000;">SUB-SECTION UNIT: WORKPLACE ACTIVITIES</td></tr>`;
        matrixMap.forEach((desc, code) => {
          logsHtml += `
            <tr style="height: 26px;">
              <td><strong>${code}</strong></td>
              <td>${desc}</td>
              <td style="text-align: center; font-size: 8pt; vertical-align: middle;">Dynamic Trace</td>
              <td style="text-align: center; vertical-align: middle; font-weight: bold;">
                ${base64MentorSignature ? `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><img src="${base64MentorSignature}" style="max-height: 15px; mix-blend-mode: multiply;"/><span style="font-size: 7.5pt; color: #166534;">SIGNED</span></div>` : `<span style="color: #166534;">✔️ APPROVED</span>`}
              </td>
            </tr>
          `;
        });
      }

      if (cwkMap.size > 0) {
        logsHtml += `<tr style="background-color: #f0f9ff;"><td colspan="4" style="font-weight: bold; font-size: 8.5pt; border-bottom: 2px solid #000; color: #0369a1;">SUB-SECTION UNIT: CWK — CONTEXTUALIZED WORKPLACE KNOWLEDGE</td></tr>`;
        cwkMap.forEach((desc, code) => {
          logsHtml += `
            <tr style="height: 26px;">
              <td><strong style="color: #0369a1;">${code}</strong></td>
              <td>${desc}</td>
              <td style="text-align: center; font-size: 8pt; vertical-align: middle;">Dynamic Trace</td>
              <td style="text-align: center; vertical-align: middle; font-weight: bold;">
                ${base64MentorSignature ? `<div style="display: flex; align-items: center; justify-content: center; gap: 4px;"><img src="${base64MentorSignature}" style="max-height: 15px; mix-blend-mode: multiply;"/><span style="font-size: 7.5pt; color: #166534;">SIGNED</span></div>` : `<span style="color: #166534;">✔️ APPROVED</span>`}
              </td>
            </tr>
          `;
        });
      }

      logsHtml += `
              </tbody>
            </table>
          </div>

          <!-- PAGE 3: GRANULAR LEDGER -->
          <div class="print-page-break">
            <h3 style="margin: 0 0 6px 0; font-size: 11pt; text-transform: uppercase; letter-spacing: 0.5px;">Granular Daily Activity Diary & Evidence Ledger</h3>
            <table class="bulk-ledger-table">
              <thead>
                <tr>
                  <th style="width: 12%;">DATE / SHIFT</th>
                  <th style="width: 56%;">DIARY ENTRY OF WORKPLACE EVIDENCE & PERFORMED TASKS</th>
                  <th style="width: 8%; text-align: center;">HOURS</th>
                  <th style="width: 24%; text-align: left;">AUTHENTICATION & VERIFICATION MAP</th>
                </tr>
              </thead>
              <tbody>
      `;

      if (logs.length === 0) {
        logsHtml += `<tr><td colspan="4" style="text-align:center; padding: 30px; font-weight: bold; color: #dc2626;">No approved workplace logs found.</td></tr>`;
      } else {
        for (const entry of logs) {
          const entryDateStr = entry.dateString || "N/A";
          const formattedTasks =
            entry.tasksPerformed ||
            "<em style='color:#94a3b8'>No descriptive logs recorded.</em>";

          const base64DailySig = await fetchImageAsBase64(
            entry.mentorSignatureUrl,
          );

          logsHtml += `
            <tr style="page-break-inside: avoid;">
              <td>
                <strong>${entryDateStr}</strong>
                <div style="font-size: 8pt; margin-top: 4px; color: #475569;">Shift: ${entry.startTime || "08:00"} - ${entry.endTime || "16:00"}</div>
              </td>
              <td>
                <div class="ledger-html-content">${formattedTasks}</div>
          `;

          if (
            entry.customEvidenceTracking &&
            entry.customEvidenceTracking.length > 0
          ) {
            logsHtml += `<div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #cbd5e1;"><div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; color: #4f46e5; margin-bottom: 4px;">📎 Version Bound Artifact Evidence:</div>`;
            entry.customEvidenceTracking.forEach((seItem: any) => {
              logsHtml += `
                <div class="bulk-print-se-block">
                  <div>
                    <span class="bulk-print-se-tag">${seItem.code}</span>
                    <strong style="font-size: 8.5pt; margin-left: 4px;">${seItem.description}</strong>
                  </div>
                  <div style="font-size: 7.5pt; font-family: monospace; color: #334155; word-break: break-all; background: #f8fafc; padding: 2px 4px; margin-top: 2px; border: 1px solid #cbd5e1;">Location URI: ${seItem.fileUrl || "N/A"}</div>
                </div>
              `;
            });
            logsHtml += `</div>`;
          }

          logsHtml += `
              </td>
              <td style="text-transform: uppercase; text-align: center; font-weight: bold; vertical-align: middle; font-size: 10.5pt;">${entry.totalHours || "0"}</td>
              <td style="vertical-align: middle;">
                <div class="row-sig-container">
                  <div class="row-sig-item">
                    <span>Learner:</span>
                    ${base64LearnerSignature ? `<img src="${base64LearnerSignature}" class="row-sig-img"/>` : `<span style="color: #64748b; font-style: italic; font-size: 7pt;">System Authenticated</span>`}
                  </div>
                  <div class="row-sig-item">
                    <span>Supervisor:</span>
                    ${base64DailySig ? `<img src="${base64DailySig}" class="row-sig-img"/>` : `<span style="color: #166534; font-weight: bold; font-size: 7pt;">VERIFIED</span>`}
                  </div>
                </div>
              </td>
            </tr>
          `;
        }
      }

      logsHtml += `
              </tbody>
            </table>
            
            <div class="bulk-signatures-strip">
              <div class="bulk-sig-col">
                <div class="bulk-sig-img-wrap">
                  ${base64MentorSignature ? `<img src="${base64MentorSignature}" alt="Supervisor Certified Stamp" />` : `<div style="height: 35px;"></div>`}
                </div>
                <div class="bulk-sig-line">SUPERVISOR SIGNATURE</div>
                <div style="font-size: 7.5pt; margin-top: 2px; color: #333;">${resolvedMentorName}</div>
              </div>
              <div class="bulk-sig-col">
                <div class="bulk-sig-img-wrap">
                  <div style="height: 35px; display: flex; align-items: center; justify-content: center; color: #d97706; font-size: 8pt; font-style: italic; font-weight: bold;">Pending Review</div>
                </div>
                <div class="bulk-sig-line">ASSESSOR SIGNATURE</div>
                <div style="font-size: 7.5pt; margin-top: 2px; color: #333;">Internal/External Quality Assessor</div>
              </div>
              <div class="bulk-sig-col">
                <div class="bulk-sig-img-wrap">
                  ${base64LearnerSignature ? `<img src="${base64LearnerSignature}" alt="Candidate Signature" />` : `<div style="height: 35px;"></div>`}
                </div>
                <div class="bulk-sig-line">LEARNER SIGNATURE</div>
                <div style="font-size: 7.5pt; margin-top: 2px; color: #333;">${learnerName}</div>
              </div>
            </div>
          </div>
        </body>
        </html>
      `;

      // ─── SPAWN CHROMIUM AND CONVERT PAGES ───
      logger.info(
        "[AuditPack] Spawning chromium instance for PDF generation...",
      );
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      // Render Portrait Classroom
      const pageClassroom = await browser.newPage();
      await pageClassroom.setContent(classroomHtml, {
        waitUntil: ["load", "networkidle0"],
      });
      const classroomPdfBuffer = await pageClassroom.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      // Render Landscape QCTO Logbook
      const pageWorkplace = await browser.newPage();
      await pageWorkplace.setContent(logsHtml, {
        waitUntil: ["load", "networkidle0"],
      });
      const workplacePdfBuffer = await pageWorkplace.pdf({
        format: "A4",
        landscape: true,
        printBackground: true,
        margin: { top: "10mm", right: "12mm", bottom: "10mm", left: "12mm" },
      });

      // Render Portrait Financial Ledger
      const pageFinancial = await browser.newPage();
      await pageFinancial.setContent(financialHtml, {
        waitUntil: ["load", "networkidle0"],
      });
      const financialPdfBuffer = await pageFinancial.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      await browser.close();

      // ─── COMPILE ZIP ───
      zip.file(
        `${folderClassroom}Campus_Attendance_Register_Summary_${safeLearnerName}.pdf`,
        classroomPdfBuffer,
      );
      zip.file(
        `${folderWorkplace}Official_QCTO_Workplace_Logbook_${safeLearnerName}.pdf`,
        workplacePdfBuffer,
      );
      zip.file(
        `${folderFinancial}Financial_Stipend_Ledger_${safeLearnerName}.pdf`,
        financialPdfBuffer,
      );

      for (const logItem of logs) {
        const logDateStr = logItem.dateString || "UnknownDate";

        if (logItem.evidenceUrl && typeof logItem.evidenceUrl === "string") {
          const ext = getExtensionFromUrl(logItem.evidenceUrl, "pdf");
          await appendUrlToZipFolder(
            logItem.evidenceUrl,
            folderEvidenceArtifacts,
            `Shift_Summary_Proof_${logDateStr}.${ext}`,
          );
        }

        if (logItem.cwkEvidence && typeof logItem.cwkEvidence === "object") {
          for (const [cwkCode, cwkUrl] of Object.entries(logItem.cwkEvidence)) {
            if (cwkUrl && typeof cwkUrl === "string") {
              const ext = getExtensionFromUrl(cwkUrl, "pdf");
              await appendUrlToZipFolder(
                cwkUrl,
                folderEvidenceArtifacts,
                `${cwkCode}_Proof_${logDateStr}.${ext}`,
              );
            }
          }
        }

        if (Array.isArray(logItem.customEvidenceTracking)) {
          for (const asset of logItem.customEvidenceTracking) {
            if (
              asset.type !== "link" &&
              asset.fileUrl &&
              typeof asset.fileUrl === "string"
            ) {
              const ext = getExtensionFromUrl(asset.fileUrl, "pdf");
              const cleanDesc = String(
                asset.description || "Portfolio_Artifact",
              )
                .replace(/[^a-zA-Z0-9]/g, "_")
                .substring(0, 30);
              await appendUrlToZipFolder(
                asset.fileUrl,
                folderEvidenceArtifacts,
                `${asset.code}_${cleanDesc}_${logDateStr}.${ext}`,
              );
            }
          }
        }
      }

      const finalZipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "DEFLATE",
        compressionOptions: { level: 9 },
      });
      const fileName = `audit_packs/SETA_Audit_${safeLearnerName}_${Date.now()}.zip`;
      const file = bucket.file(fileName);
      await file.save(finalZipBuffer, {
        metadata: { contentType: "application/zip" },
      });

      const [signedUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60 * 2,
      });
      return { success: true, url: signedUrl };
    } catch (error: any) {
      logger.error("Audit Pack Generation Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to compile compliance pack.",
      );
    }
  },
);

// ============================================================================
// ENTERPRISE BULK EXPORT ENGINE (ASYNCHRONOUS FAN-OUT PIPELINE)
// ============================================================================

import { onTaskDispatched } from "firebase-functions/v2/tasks";
import { getFunctions as getAdminFunctions } from "firebase-admin/functions";

/**
 * 1. THE MASTER TRIGGER
 * Takes the array of learners from the Bulk Upload UI, creates a Master Tracker
 * in Firestore, and queues up a Google Cloud Task for every single learner.
 */
export const requestBulkAuditPacks = onCall(async (request) => {
  const auth = request.auth;
  if (!auth) throw new HttpsError("unauthenticated", "Unauthorized.");

  const { companyId, companyName, placements } = request.data;
  if (!companyId || !placements || placements.length === 0) {
    throw new HttpsError("invalid-argument", "Missing required payload.");
  }

  const db = admin.firestore();
  // Target the worker function we define below
  const queue = getAdminFunctions().taskQueue("processSingleLearnerTask");

  try {
    // Create Master Job Tracker
    const jobRef = db.collection("compliance_jobs").doc();
    await jobRef.set({
      companyId,
      companyName,
      status: "processing",
      totalTasks: placements.length,
      completedTasks: 0,
      failedTasks: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      downloadUrl: null,
    });

    // Enqueue a background task for every single learner in parallel
    const enqueuePromises = placements.map((p: any) => {
      return queue.enqueue({
        jobId: jobRef.id,
        companyName,
        learnerId: p.learnerId,
        placementId: p.placementId,
        learnerName: p.learnerName,
        idNumber: p.idNumber,
        mentorName: p.mentorName,
      });
    });

    await Promise.all(enqueuePromises);

    logger.info(
      `Bulk Job ${jobRef.id} started. Enqueued ${placements.length} learners.`,
    );
    return { success: true, jobId: jobRef.id };
  } catch (error: any) {
    logger.error("Error starting bulk job:", error);
    throw new HttpsError("internal", "Failed to initialize bulk export.");
  }
});

/**
 * 2. THE WORKER BEE (Google Cloud Task)
 * Runs in parallel. Generates the PDFs for ONE learner using Puppeteer and
 * saves them securely to a temporary folder in Cloud Storage.
 */
export const processSingleLearnerTask = onTaskDispatched(
  {
    retryConfig: { maxAttempts: 3, minBackoffSeconds: 60 },
    rateLimits: { maxConcurrentDispatches: 10 }, // Throttles Puppeteer so we don't crash RAM
    memory: "2GiB",
    timeoutSeconds: 300,
  },
  async (request) => {
    const {
      jobId,
      companyName,
      learnerId,
      placementId,
      learnerName,
      idNumber: payloadIdNumber,
      mentorName: payloadMentorName,
    } = request.data;

    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    const jobRef = db.collection("compliance_jobs").doc(jobId);

    try {
      logger.info(`Worker starting for ${learnerName} (Job: ${jobId})`);

      // DECODE COMPOSITE IDs (e.g. "CohortID_IDNumber")
      let actualDocId = learnerId;
      let extractedCohortId = "";
      if (learnerId.includes("_")) {
        const parts = learnerId.split("_");
        extractedCohortId = parts[0];
        actualDocId = parts[1];
      }

      // Fetch Primary Documents
      const [learnerSnap, placementSnap, disbursementsSnap] = await Promise.all(
        [
          db.collection("learners").doc(actualDocId).get(),
          db.collection("placements").doc(placementId).get(),
          db.collection(`placements/${placementId}/disbursements`).get(),
        ],
      );

      const learner = learnerSnap.data() || {};
      const placement = placementSnap.exists ? placementSnap.data() || {} : {};
      const disbursementsList = disbursementsSnap.docs
        .map((d) => d.data())
        .sort((a, b) => String(a.monthYear).localeCompare(String(b.monthYear)));

      const finalIdNumber =
        payloadIdNumber && payloadIdNumber !== "—"
          ? payloadIdNumber
          : String(learner.idNumber || actualDocId).trim();
      const resolvedMentorName =
        payloadMentorName && payloadMentorName !== "Unassigned"
          ? payloadMentorName
          : placement.assignedMentorName ||
            placement.mentorName ||
            "Unassigned Mentor";
      const cohortId =
        placement.cohortId || learner.cohortId || extractedCohortId;

      // FETCH LOGS
      const logQueries = [
        db
          .collection("workplace_logs")
          .where("learnerId", "==", learnerId)
          .get(),
      ];
      if (finalIdNumber && learnerId !== finalIdNumber) {
        logQueries.push(
          db
            .collection("workplace_logs")
            .where("learnerId", "==", finalIdNumber)
            .get(),
        );
      }
      const logSnaps = await Promise.all(logQueries);
      const allLogsMap = new Map();
      logSnaps.forEach((snap) => {
        snap.docs.forEach((doc) => {
          if (
            String(doc.data().status || "")
              .trim()
              .toLowerCase() === "approved"
          ) {
            allLogsMap.set(doc.id, doc.data());
          }
        });
      });
      const logs = Array.from(allLogsMap.values());

      // FETCH CLASSROOM ATTENDANCE
      let classroomRecords: any[] = [];
      if (cohortId && finalIdNumber) {
        const attendanceSnap = await db
          .collection("attendance")
          .where("cohortId", "==", cohortId)
          .get();
        const formatScanTime = (ts: number | undefined) => {
          if (!ts) return "—";
          return new Date(ts).toLocaleTimeString("en-ZA", {
            timeZone: "Africa/Johannesburg",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        };
        classroomRecords = attendanceSnap.docs
          .map((d) => {
            const att = d.data();
            const isPresent =
              Array.isArray(att.presentLearners) &&
              att.presentLearners.includes(finalIdNumber);
            const isAbsent =
              Array.isArray(att.absentLearners) &&
              att.absentLearners.includes(finalIdNumber);
            if (!isPresent && !isAbsent) return null;
            const scanData =
              isPresent && att.scans ? att.scans[finalIdNumber] : null;
            return {
              date: att.date || "—",
              status: isPresent ? "Present" : "Absent",
              checkIn: scanData?.checkInAt
                ? formatScanTime(scanData.checkInAt)
                : "—",
              lunchOut: scanData?.lunchOutAt
                ? formatScanTime(scanData.lunchOutAt)
                : "—",
              lunchIn: scanData?.lunchInAt
                ? formatScanTime(scanData.lunchInAt)
                : "—",
              checkOut: scanData?.checkOutAt
                ? formatScanTime(scanData.checkOutAt)
                : "—",
              finalizedBy: att.finalizedBy || "system-auto",
            };
          })
          .filter(Boolean)
          .sort(
            (a: any, b: any) =>
              new Date(b.date).getTime() - new Date(a.date).getTime(),
          );
      }

      // FOLDER STRUCTURE
      const safeLearnerName = (learnerName || "Learner").replace(
        /[^a-zA-Z0-9]/g,
        "_",
      );
      const basePath = `tmp_bulk_jobs/${jobId}/Learner_${safeLearnerName}_${finalIdNumber}`;
      const folderLegal = `${basePath}/01_Legal_Identity_and_Contracts/`;
      const folderClassroom = `${basePath}/02_Theory_and_Practical_Classroom_Evidence/`;
      const folderWorkplace = `${basePath}/03_Workplace_Logbooks_and_Timesheets/`;
      const folderFinancial = `${basePath}/04_Financial_and_Payroll_Evidence/`;

      // ─── FILE DOWNLOADING HELPER ───
      const getExtensionFromUrl = (url: string, defaultExt: string = "pdf") => {
        try {
          return (
            url.split("?")[0].split(".").pop()?.toLowerCase() || defaultExt
          );
        } catch {
          return defaultExt;
        }
      };

      const downloadFileToStorage = async (url: string, targetPath: string) => {
        try {
          const response = await axios.get(url, {
            responseType: "arraybuffer",
          });
          await bucket.file(targetPath).save(Buffer.from(response.data));
          return true;
        } catch (e: any) {
          logger.warn(`Failed to pull file ${targetPath}: ${e.message}`);
          return false;
        }
      };

      // FETCH IDENTITY & WBLPA
      let idUrl =
        learner.documents?.idDocument ||
        learner.idUrl ||
        learner.idDocumentUrl ||
        "";
      let wblpaUrl =
        placement.compliance?.wblpaAgreementUrl ||
        placement.wblAgreementUrl ||
        placement.wblpaAgreementUrl ||
        "";

      let learnerUserDoc: any = {};
      if (learner.authUid) {
        const uSnap = await db.collection("users").doc(learner.authUid).get();
        if (uSnap.exists) learnerUserDoc = uSnap.data();
      }

      const arraysToScan = [
        ...(learner.uploadedDocuments || []),
        ...(placement.uploadedDocuments || []),
        ...(learnerUserDoc?.uploadedDocuments || []),
      ];
      arraysToScan.forEach((doc: any) => {
        const docId = String(doc.id || "").toLowerCase();
        const name = String(doc.name || "").toLowerCase();
        if (
          !idUrl &&
          (docId === "id" ||
            name.includes("id") ||
            name.includes("identity") ||
            name.includes("passport"))
        )
          idUrl = doc.url;
        if (
          !wblpaUrl &&
          (docId === "wblpa" ||
            docId === "contract" ||
            name.includes("contract") ||
            name.includes("wblpa") ||
            name.includes("agreement"))
        )
          wblpaUrl = doc.url;
      });

      if (idUrl)
        await downloadFileToStorage(
          idUrl,
          `${folderLegal}ID_Document_${safeLearnerName}.${getExtensionFromUrl(idUrl, "pdf")}`,
        );
      else
        await bucket
          .file(`${folderLegal}⚠️_MISSING_IDENTITY_DOCUMENT.txt`)
          .save(
            "Compliance Alert: No certified ID file or passport was uploaded.",
          );

      if (wblpaUrl)
        await downloadFileToStorage(
          wblpaUrl,
          `${folderLegal}Fully_Executed_WBLPA_Contract_${safeLearnerName}.${getExtensionFromUrl(wblpaUrl, "pdf")}`,
        );
      else
        await bucket
          .file(`${folderLegal}⚠️_MISSING_WBLPA_CONTRACT.txt`)
          .save(
            "Compliance Alert: No signed tripartite WBLPA agreement link could be fetched.",
          );

      // DOWNLOAD BANK CLEARED RECEIPTS
      for (const disb of disbursementsList) {
        if (disb.payslipEftUrl) {
          await downloadFileToStorage(
            disb.payslipEftUrl,
            `${folderFinancial}Bank_Cleared_Receipt_${disb.monthYear}.${getExtensionFromUrl(disb.payslipEftUrl, "pdf")}`,
          );
        }
      }

      const formatCurrency = (val: any) =>
        new Intl.NumberFormat("en-ZA", {
          style: "currency",
          currency: "ZAR",
          maximumFractionDigits: 0,
        }).format(Number(val) || 0);

      // ─── BUILD FINANCIAL HTML ───
      let financialHtml = `<!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap');body{font-family:'Trebuchet MS',Arial,sans-serif;font-size:11px;color:#1a2e35;padding:20px;}h1{color:#073f4e;text-align:center;text-transform:uppercase;font-family:'Oswald',sans-serif;letter-spacing:0.05em;}.meta{background:#fffbeb;border-left:4px solid #d97706;padding:15px;margin-bottom:20px;border-radius:4px;border:1px solid #fef3c7;}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed;}th,td{border:1px solid #dde4e8;padding:10px;text-align:left;vertical-align:middle;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;}th{background-color:#073f4e;color:white;font-family:'Oswald',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;}tr:nth-child(even){background-color:#f8fafb;}</style></head><body><h1>Stipend Disbursement Compliance Ledger</h1><div class="meta"><strong>Learner Name:</strong> ${learnerName || "Unknown"}<br/><strong>Identity Number:</strong> ${finalIdNumber || "Unknown"}<br/><strong>Host Employer:</strong> ${companyName || "Unknown"}<br/><strong>SARS Employment Verification Status:</strong> Active Tracking Account</div><table><thead><tr><th width="15%">Month</th><th width="18%">Total Earnings</th><th width="12%">Log Days</th><th width="20%">Net Payment</th><th width="15%">ETI Claimed</th><th width="20%">Bank Reference</th></tr></thead><tbody>`;
      if (disbursementsList.length === 0)
        financialHtml += `<tr><td colspan="6" style="text-align:center;">No financial disbursements on record.</td></tr>`;
      else {
        disbursementsList.forEach((disb: any) => {
          financialHtml += `<tr><td><strong>${disb.monthYear}</strong></td><td>${formatCurrency(disb.totalEarnings)}</td><td>${disb.daysApproved} / ${disb.daysExpected} d</td><td style="font-weight:bold; color:#16a34a;">${formatCurrency(disb.netPayment)}</td><td>${formatCurrency(disb.etiClaimed)}</td><td style="font-family:monospace; font-size:10px; color:#475569;">${disb.bankReference || "—"}</td></tr>`;
        });
      }
      financialHtml += `</tbody></table></body></html>`;

      // ─── BUILD CLASSROOM HTML ───
      const totalSessions = classroomRecords.length;
      const totalPresent = classroomRecords.filter(
        (r) => r.status === "Present",
      ).length;
      const attendanceRatio =
        totalSessions > 0
          ? Math.round((totalPresent / totalSessions) * 100)
          : 0;
      let classroomHtml = `<!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap');body{font-family:'Trebuchet MS',Arial,sans-serif;font-size:11px;color:#1a2e35;padding:20px;}h1{color:#073f4e;text-align:center;text-transform:uppercase;font-family:'Oswald',sans-serif;letter-spacing:0.05em;}.meta{background:#f0f9ff;border-left:4px solid #0ea5e9;padding:15px;margin-bottom:20px;border-radius:4px;border:1px solid #bae6fd;}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed;}th,td{border:1px solid #dde4e8;padding:10px;text-align:left;vertical-align:middle;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;}th{background-color:#073f4e;color:white;font-family:'Oswald',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;}tr:nth-child(even){background-color:#f8fafb;}.badge-present{color:#166534;font-weight:bold;background:#dcfce7;padding:2px 6px;border:1px solid #bbf7d0;text-transform:uppercase;font-size:9px;}.badge-absent{color:#991b1b;font-weight:bold;background:#fee2e2;padding:2px 6px;border:1px solid #fecaca;text-transform:uppercase;font-size:9px;}</style></head><body><h1>Classroom Attendance Verification Ledger</h1><div class="meta"><strong>Learner Name:</strong> ${learnerName || "Unknown"}<br/><strong>Identity Number:</strong> ${finalIdNumber || "Unknown"}<br/><strong>Class Cohort ID:</strong> ${cohortId || "Unknown"}<br/><strong>Theoretical Compliance Threshold:</strong> 80% Required<br/><strong>Actual Classroom Attendance Ratio:</strong> <span style="color: ${attendanceRatio >= 80 ? "#16a34a" : "#dc2626"}; font-weight: bold;">${attendanceRatio}% (${totalPresent} / ${totalSessions} sessions)</span></div><table><thead><tr><th>Session Date</th><th>Enrolment Status</th><th>Check-In (SAST)</th><th>Lunch Break Out/In</th><th>Check-Out (SAST)</th><th>Validation Stream</th></tr></thead><tbody>`;
      if (classroomRecords.length === 0)
        classroomHtml += `<tr><td colspan="6" style="text-align:center; padding: 30px;">No historical campus registration sequences located.</td></tr>`;
      else {
        classroomRecords.forEach((rec) => {
          const statusBadge =
            rec.status === "Present"
              ? `<span class="badge-present">Present</span>`
              : `<span class="badge-absent">Absent</span>`;
          classroomHtml += `<tr><td><strong>${rec.date}</strong></td><td>${statusBadge}</td><td>${rec.checkIn}</td><td>${rec.lunchOut} → ${rec.lunchIn}</td><td>${rec.checkOut}</td><td style="color:#64748b; font-family: monospace;">${rec.finalizedBy}</td></tr>`;
        });
      }
      classroomHtml += `</tbody></table></body></html>`;

      // ─── BUILD WORKPLACE LOGBOOK HTML ───
      logs.sort(
        (a, b) =>
          new Date(a.dateString).getTime() - new Date(b.dateString).getTime(),
      );
      const totalHours = logs.reduce(
        (sum, l) => sum + (Number(l.totalHours) || 0),
        0,
      );
      const lastSignedLog = [...logs]
        .reverse()
        .find((l) => l.mentorSignatureUrl);
      const mentorSignature = lastSignedLog?.mentorSignatureUrl || null;
      const finalSignoffMentorName =
        lastSignedLog?.processedBy || resolvedMentorName;
      const learnerSignature =
        learnerUserDoc?.signatureUrl || learner.signatureUrl || null;
      const signatureDate =
        logs.length > 0
          ? logs[logs.length - 1].dateString
          : "_________________________";

      let logsHtml = `<!DOCTYPE html><html><head><style>@import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap');body{font-family:'Trebuchet MS',Arial,sans-serif;font-size:11px;color:#1a2e35;padding:20px;}h1{color:#073f4e;text-align:center;text-transform:uppercase;font-family:'Oswald',sans-serif;letter-spacing:0.05em;}.meta{background:#f8fafc;border-left:4px solid #94c73d;padding:15px;margin-bottom:20px;border-radius:4px;border:1px solid #dde4e8;}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed;}th,td{border:1px solid #dde4e8;padding:10px;text-align:left;vertical-align:top;word-wrap:break-word;overflow-wrap:break-word;word-break:break-word;}th{background-color:#073f4e;color:white;font-family:'Oswald',sans-serif;font-size:11px;text-transform:uppercase;letter-spacing:0.05em;}tr:nth-child(even){background-color:#f8fafb;}.quill-content{font-size:11px;line-height:1.5;color:#334155;white-space:normal;}.quill-content *{word-wrap:break-word !important;overflow-wrap:break-word !important;word-break:break-word !important;max-width:100%;}.quill-content p{margin:0 0 5px 0;}.quill-content ul,.quill-content ol{margin:4px 0;padding-left:18px;}.signature-block{margin-top:40px;page-break-inside:avoid;border-top:2px solid #073f4e;padding-top:20px;}.signature-table{width:100%;border:none;margin-top:30px;table-layout:fixed;}.signature-table td{border:none;background:transparent !important;padding:0;}.sig-line{border-bottom:1px solid #1a2e35;height:40px;margin-bottom:5px;}</style></head><body><h1>Official QCTO Workplace Evidence Logbook</h1><div class="meta"><strong>Learner Name:</strong> ${learnerName || "Unknown"}<br/><strong>Identity Number:</strong> ${finalIdNumber || "Unknown"}<br/><strong>Host Employer:</strong> ${companyName || "Unknown"}<br/><strong>Current Workplace Mentor:</strong> ${resolvedMentorName}<br/><strong>Total Approved Workplace Hours:</strong> ${totalHours.toFixed(1)} hrs</div><table><thead><tr><th width="12%">Date</th><th width="15%">Time Logged</th><th width="18%">SETA Module</th><th width="55%">Tasks Performed & Supervisor Validation</th></tr></thead><tbody>`;
      if (logs.length === 0)
        logsHtml += `<tr><td colspan="4" style="text-align:center; padding: 30px; font-weight: bold; color: #dc2626;">No approved workplace logs found.</td></tr>`;
      else {
        logs.forEach((log) => {
          const formattedTasks =
            log.tasksPerformed ||
            "<em style='color:#94a3b8'>No description provided</em>";
          const logSignatureImg = log.mentorSignatureUrl
            ? `<img src="${log.mentorSignatureUrl}" style="max-height: 25px; mix-blend-mode: multiply; display: block;" />`
            : `<span style="font-size: 9px; color: #166534; font-weight: bold;">✔ VERIFIED ONLINE</span>`;
          const logApprover = log.processedBy || resolvedMentorName;
          const logApprovalDate = log.processedAt
            ? new Date(log.processedAt).toLocaleDateString("en-ZA", {
                timeZone: "Africa/Johannesburg",
              })
            : log.dateString;
          logsHtml += `<tr><td><strong>${log.dateString}</strong></td><td>${log.startTime} to ${log.endTime}<br/><em style="color:#0ea5e9;">(${Number(log.totalHours).toFixed(1)} hrs)</em></td><td><strong>${log.workActivityCode || log.moduleCode || "N/A"}</strong></td><td><div class="quill-content">${formattedTasks}</div><div style="background: #f8fafc; border: 1px solid #dde4e8; border-left: 3px solid #0ea5e9; padding: 6px; display: flex; align-items: center; gap: 10px; margin-top: 8px;"><div style="width: 80px;">${logSignatureImg}</div><div style="font-size: 9px; color: #475569;"><strong>Supervisor:</strong> ${logApprover}<br/><strong>Date Verified:</strong> ${logApprovalDate}</div></div></td></tr>`;
        });
      }
      logsHtml += `</tbody></table><div class="signature-block"><h3 style="color: #073f4e; text-transform: uppercase; font-family: 'Oswald', sans-serif; margin-bottom: 10px;">Official Sign-Off & Declaration</h3><p style="font-size: 11px; line-height: 1.6; color: #475569;">I, the undersigned Workplace Mentor, hereby declare that the learner <strong>${learnerName}</strong> has authentically completed <strong>${totalHours.toFixed(1)}</strong> hours of workplace experience at <strong>${companyName}</strong> as detailed in the logs above. I confirm that the tasks performed align with the required SETA/QCTO curriculum outcomes, and the evidence provided is valid, authentic, and current.</p><table class="signature-table"><tr><td style="width: 45%;">${mentorSignature ? `<img src="${mentorSignature}" style="max-height: 40px; mix-blend-mode: multiply; margin-bottom: 4px;" />` : `<div class="sig-line"></div>`}<div style="font-weight: bold;">Workplace Mentor Signature</div><div style="color: #64748b; font-size: 10px; margin-top: 4px;">Name: ${finalSignoffMentorName}</div><div style="color: #64748b; font-size: 10px; margin-top: 2px;">Date: ${signatureDate}</div></td><td style="width: 10%;"></td><td style="width: 45%;">${learnerSignature ? `<img src="${learnerSignature}" style="max-height: 40px; mix-blend-mode: multiply; margin-bottom: 4px;" />` : `<div class="sig-line"></div>`}<div style="font-weight: bold;">Learner Signature</div><div style="color: #64748b; font-size: 10px; margin-top: 4px;">Name: ${learnerName || "_________________________"}</div><div style="color: #64748b; font-size: 10px; margin-top: 2px;">Date: ${signatureDate}</div></td></tr></table></div></body></html>`;

      // ─── SPAWN CHROMIUM AND SAVE PDFs TO CLOUD STORAGE ───
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const pageClassroom = await browser.newPage();
      await pageClassroom.setContent(classroomHtml, {
        waitUntil: ["load", "networkidle0"],
      });
      const classroomPdfBuffer = await pageClassroom.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      const pageWorkplace = await browser.newPage();
      await pageWorkplace.setContent(logsHtml, {
        waitUntil: ["load", "networkidle0"],
      });
      const workplacePdfBuffer = await pageWorkplace.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "20mm", left: "15mm" },
      });

      const pageFinancial = await browser.newPage();
      await pageFinancial.setContent(financialHtml, {
        waitUntil: ["load", "networkidle0"],
      });
      const financialPdfBuffer = await pageFinancial.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      await browser.close();

      // Save generated PDFs into Cloud Storage
      await bucket
        .file(
          `${folderClassroom}Campus_Attendance_Register_Summary_${safeLearnerName}.pdf`,
        )
        .save(classroomPdfBuffer);
      await bucket
        .file(
          `${folderWorkplace}Official_QCTO_Workplace_Logbook_${safeLearnerName}.pdf`,
        )
        .save(workplacePdfBuffer);
      await bucket
        .file(
          `${folderFinancial}Official_Stipend_Disbursement_Ledger_${safeLearnerName}.pdf`,
        )
        .save(financialPdfBuffer);

      // Increment Master Tracker Complete Count
      await jobRef.update({
        completedTasks: admin.firestore.FieldValue.increment(1),
      });
      logger.info(`Worker completed for ${learnerName}`);
    } catch (error) {
      logger.error(`Worker failed for Learner ${learnerId}:`, error);
      await jobRef.update({
        failedTasks: admin.firestore.FieldValue.increment(1),
        completedTasks: admin.firestore.FieldValue.increment(1), // Advance tracker so the queue doesn't hang
      });
    }
  },
);

/**
 * 3. THE AGGREGATOR
 * Watches the Master Tracker. When completedTasks == totalTasks, it streams all the
 * Cloud Storage temp files into a final ZIP file without crashing the RAM.
 */
export const finalizeBulkJob = onDocumentUpdated(
  {
    document: "compliance_jobs/{jobId}",
    timeoutSeconds: 540,
    memory: "1GiB", // Dropped back to 1GB because Streams use almost zero RAM!
  },
  async (event) => {
    const jobBefore = event.data?.before.data();
    const jobAfter = event.data?.after.data();
    if (!jobBefore || !jobAfter) return;

    // Trigger only when all tasks are done and status is still processing
    if (
      jobAfter.status === "processing" &&
      jobAfter.completedTasks === jobAfter.totalTasks
    ) {
      const jobId = event.params.jobId;
      const bucket = admin.storage().bucket();
      const cleanCompanyName = String(jobAfter.companyName).replace(
        /[^a-zA-Z0-9]/g,
        "_",
      );
      const finalZipPath = `audit_packs/Bulk_SETA_Audit_${cleanCompanyName}_${Date.now()}.zip`;

      try {
        await event.data?.after.ref.update({ status: "zipping" });
        logger.info(
          `All tasks complete for job ${jobId}. Streaming final ZIP via Archiver...`,
        );

        // 1. Initialize Google Cloud Storage Write Stream
        const finalFile = bucket.file(finalZipPath);
        const outputStream = finalFile.createWriteStream({
          contentType: "application/zip",
          resumable: false,
        });

        // 2. Initialize Archiver
        const archiver = require("archiver");
        const archive = archiver("zip", { zlib: { level: 9 } });

        // 🚀 CRITICAL: Wrap streams in a Promise so the function doesn't exit prematurely!
        const uploadPromise = new Promise((resolve, reject) => {
          outputStream.on("finish", resolve);
          outputStream.on("error", reject);
          archive.on("error", reject);
        });

        // Pipe the Archiver directly into Cloud Storage
        archive.pipe(outputStream);

        // 3. Fetch all generated files from the temp folder
        const [files] = await bucket.getFiles({
          prefix: `tmp_bulk_jobs/${jobId}/`,
        });

        // 4. Stream temp files from Cloud Storage directly into Archiver
        for (const file of files) {
          const zipPath = file.name.replace(`tmp_bulk_jobs/${jobId}/`, "");

          // file.createReadStream() is a native GCP method that pipes beautifully into Archiver
          archive.append(file.createReadStream(), { name: zipPath });
        }

        logger.info(`Finalizing archive stream for ${files.length} files...`);

        // 5. Tell archiver we are done adding files
        await archive.finalize();

        // 6. Wait for the upload pipe to Google Cloud Storage to fully complete
        await uploadPromise;

        // 7. Generate the secure Download URL
        const [signedUrl] = await finalFile.getSignedUrl({
          action: "read",
          expires: Date.now() + 1000 * 60 * 60 * 24 * 7, // Expires in 7 days
        });

        // 8. Mark Job Complete
        await event.data?.after.ref.update({
          status: "complete",
          downloadUrl: signedUrl,
        });

        // 9. Cleanup: Delete the temp folder to save space
        await bucket.deleteFiles({ prefix: `tmp_bulk_jobs/${jobId}/` });
        logger.info(
          `Bulk Job ${jobId} completely finished. Stream closed securely.`,
        );
      } catch (error) {
        logger.error(`Failed to compile final ZIP for job ${jobId}`, error);
        await event.data?.after.ref.update({ status: "failed" });
      }
    }
  },
);

const MAX_PAYLOAD_BYTES = 5 * 1024 * 1024; // 5MB ceiling, adjust as needed

export const saveCodeSnapshot = onCall(
  { region: "us-central1", memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { submissionId, blockId, files, dependencies } = data as {
      submissionId: string;
      blockId: string;
      files: Record<string, string>;
      dependencies?: Record<string, string>;
    };

    if (!submissionId || !blockId || !files) {
      throw new HttpsError(
        "invalid-argument",
        "Missing submissionId, blockId, or files.",
      );
    }

    // Confirm the caller owns this submission
    const subRef = admin
      .firestore()
      .collection("learner_submissions")
      .doc(submissionId);
    const subSnap = await subRef.get();
    if (!subSnap.exists)
      throw new HttpsError("not-found", "Submission not found.");
    const subData = subSnap.data()!;
    if (subData.authUid !== auth.uid) {
      throw new HttpsError("permission-denied", "Not your submission.");
    }
    if (["submitted", "graded", "moderated"].includes(subData.status)) {
      throw new HttpsError("failed-precondition", "Submission is locked.");
    }

    const payload = JSON.stringify({ files, dependencies: dependencies || {} });
    const sizeBytes = Buffer.byteLength(payload, "utf8");

    if (sizeBytes > MAX_PAYLOAD_BYTES) {
      throw new HttpsError(
        "resource-exhausted",
        `Snapshot too large (${(sizeBytes / 1024 / 1024).toFixed(1)}MB). Please remove unused files.`,
      );
    }

    const storagePath = `code_snapshots/${submissionId}/${blockId}.json`;
    const bucket = admin.storage().bucket();
    const file = bucket.file(storagePath);
    await file.save(payload, { contentType: "application/json" });

    const lastSavedAt = new Date().toISOString();

    await subRef.update({
      [`answers.${blockId}`]: {
        storagePath,
        fileCount: Object.keys(files).length,
        sizeBytes,
        lastSavedAt,
      },
    });

    return { success: true, storagePath, sizeBytes, lastSavedAt };
  },
);

export const getCodeSnapshot = onCall(
  { region: "us-central1" },
  async (request) => {
    const { auth, data } = request;
    if (!auth) throw new HttpsError("unauthenticated", "Must be signed in.");

    const { submissionId, blockId } = data as {
      submissionId: string;
      blockId: string;
    };

    const subSnap = await admin
      .firestore()
      .collection("learner_submissions")
      .doc(submissionId)
      .get();
    if (!subSnap.exists)
      throw new HttpsError("not-found", "Submission not found.");

    const answerEntry = subSnap.data()?.answers?.[blockId];
    if (!answerEntry?.storagePath) {
      return { files: {}, dependencies: {} };
    }

    const bucket = admin.storage().bucket();
    const [contents] = await bucket.file(answerEntry.storagePath).download();
    return JSON.parse(contents.toString("utf8"));
  },
);

// ============================================================================
// OFFICIAL COACHING & SUPPORT SCHEDULER (GOOGLE MEET API)
// ============================================================================
import * as path from "path";
import { google } from "googleapis";

export const scheduleCoachingSession = onCall(
  {
    secrets: [mailgunSecret], // Only Mailgun needed here now
    region: "us-central1",
    cors: true,
    invoker: "public",
  },
  async (request) => {
    logger.info("BACKEND: scheduleCoachingSession triggered.");
    const auth = request.auth;

    if (!auth)
      throw new HttpsError("unauthenticated", "You must be logged in.");

    const {
      learnerId,
      learnerEmail,
      learnerName,
      staffId,
      staffEmail,
      staffName,
      dateTime,
      topic,
      sessionCategory,
      assessmentId,
    } = request.data;

    const isLearnerInitiated = auth.token.role === "learner";
    const initiatorName = isLearnerInitiated ? learnerName : staffName;
    const recipientEmail = isLearnerInitiated ? staffEmail : learnerEmail;
    const recipientName = isLearnerInitiated ? staffName : learnerName;

    try {
      const startTime = new Date(dateTime);
      const endTime = new Date(startTime.getTime() + 60 * 60000);

      // 1. IMPERSONATE THE CENTRAL MLAB ACCOUNT USING THE PHYSICAL FILE
      const ORGANIZER_EMAIL = "codetribe@mlab.co.za"; // The official account
      const keyFilePath = path.resolve(__dirname, "../service-account1.json");

      const jwtClient = new google.auth.JWT({
        keyFile: keyFilePath,
        scopes: ["https://www.googleapis.com/auth/calendar"],
        subject: ORGANIZER_EMAIL,
      });

      const calendar = google.calendar({ version: "v3", auth: jwtClient });

      // 2. BUILD THE EVENT
      const event = {
        summary: `mLab Support [${sessionCategory}]: ${learnerName} & ${staffName}`,
        description: `This session was requested by ${initiatorName}.\n\nCategory: ${sessionCategory}\nTopic: ${topic}\n\nPlease join using the Google Meet link attached.`,
        start: {
          dateTime: startTime.toISOString(),
          timeZone: "Africa/Johannesburg",
        },
        end: {
          dateTime: endTime.toISOString(),
          timeZone: "Africa/Johannesburg",
        },

        // Add BOTH users as attendees so they both get invited
        attendees: [{ email: learnerEmail }, { email: staffEmail }],

        conferenceData: {
          createRequest: {
            requestId: `meet-${Date.now()}-${learnerId}`,
            conferenceSolutionKey: { type: "hangoutsMeet" },
          },
        },
      };

      // 3. CREATE EVENT ON CODETRIBE'S CALENDAR
      const calendarResponse = await calendar.events.insert({
        calendarId: "primary", // This is now codetribe@mlab.co.za's calendar
        conferenceDataVersion: 1,
        sendUpdates: "all", // Tells Google to email the `.ics` invites to the attendees
        requestBody: event,
      });

      const meetLink = calendarResponse.data.hangoutLink || "";

      // 4. SEND DYNAMIC MLAB EMAIL VIA MAILGUN
      const emailParams = {
        title: "Support Session Booked",
        subtitle: sessionCategory,
        recipientName: recipientName,
        bodyHtml: `
          <p><strong>${initiatorName}</strong> has scheduled a 1-on-1 session with you regarding: <em>${topic}</em>.</p>
          <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border: 1px solid #dde4e8; border-left: 4px solid #0ea5e9; margin: 20px 0;">
              <p style="margin: 0; color: #073f4e; font-size: 13px;"><strong>Date & Time:</strong><br/>
              ${startTime.toLocaleString("en-ZA", { timeZone: "Africa/Johannesburg", dateStyle: "full", timeStyle: "short" })} (SAST)</p>
          </div>
          <p>An official calendar invite with the meeting link has been sent to your inbox from <strong>Codetribe</strong>. Please accept the invite to add it to your calendar.</p>
        `,
        ctaText: "Join Google Meet",
        ctaLink: meetLink,
        showStepIndicator: false,
      };

      await sendMailgunEmail({
        to: recipientEmail,
        subject: `📅 ${sessionCategory} Scheduled: ${initiatorName}`,
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });

      // 5. SAVE TO FIRESTORE
      const db = admin.firestore();
      const sessionRef = db.collection("coaching_sessions").doc();

      await sessionRef.set({
        assessorId: staffId,
        assessorName: staffName,
        learnerId,
        learnerName,
        assessmentId: assessmentId || null,
        sessionCategory,
        topic,
        dateTime: startTime.toISOString(),
        meetLink,
        status: isLearnerInitiated ? "requested" : "pending_notes",
        initiatedBy: auth.uid,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { success: true, meetLink, sessionId: sessionRef.id };
    } catch (error) {
      logger.error("Failed to schedule session:", error);
      throw new HttpsError("internal", "Failed to schedule the meeting.");
    }
  },
);

// // ─── DEFINE AI SECRETS ───
// const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
// const hfTokenSecret = defineSecret("HF_TOKEN");

// // ─── REUSABLE MULTI-PROVIDER AI UTILITY ───
// const generateCompletion = async (
//   messages: any[],
//   temperature = 0.4,
//   maxTokens = 3000,
// ) => {
//   const openRouterKey = openRouterSecret.value();
//   const hfToken = hfTokenSecret.value();

//   const OPENROUTER_FALLBACKS = [
//     "google/gemini-2.5-flash",
//     "qwen/qwen-plus",
//     "meta-llama/llama-3-70b-instruct",
//     "google/gemini-1.5-flash:free",
//     "meta-llama/llama-3-8b-instruct:free",
//   ];

//   const HUGGINGFACE_FALLBACKS = [
//     "meta-llama/Llama-3.1-8B-Instruct",
//     "mistralai/Mistral-7B-Instruct-v0.3",
//   ];

//   try {
//     logger.info("Attempting AI Generation via OpenRouter...");
//     const response = await fetch(
//       "https://openrouter.ai/api/v1/chat/completions",
//       {
//         method: "POST",
//         headers: {
//           Authorization: `Bearer ${openRouterKey}`,
//           "Content-Type": "application/json",
//           "HTTP-Referer": "https://mlabassessmentcenter.web.app",
//           "X-Title": "mLab Ecosystem",
//         },
//         body: JSON.stringify({
//           models: OPENROUTER_FALLBACKS,
//           messages: messages,
//           temperature: temperature,
//           max_tokens: maxTokens,
//           route: "fallback",
//         }),
//       },
//     );

//     if (response.ok) {
//       const data = await response.json();
//       return {
//         text: data.choices[0].message.content,
//         modelUsed: `OpenRouter (${data.model})`,
//       };
//     }
//     throw new Error(`OpenRouter HTTP ${response.status}`);
//   } catch (openRouterError: any) {
//     logger.warn(
//       "OpenRouter completely failed. Redirecting to Hugging Face...",
//       openRouterError.message,
//     );

//     for (const model of HUGGINGFACE_FALLBACKS) {
//       try {
//         const hfResponse = await fetch(
//           "https://router.huggingface.co/v1/chat/completions",
//           {
//             method: "POST",
//             headers: {
//               Authorization: `Bearer ${hfToken}`,
//               "Content-Type": "application/json",
//             },
//             body: JSON.stringify({
//               model,
//               messages,
//               temperature,
//               max_tokens: maxTokens,
//             }),
//           },
//         );

//         if (hfResponse.ok) {
//           const hfData = await hfResponse.json();
//           return {
//             text: hfData.choices[0].message.content,
//             modelUsed: `HuggingFace (${model})`,
//           };
//         }
//       } catch (hfError) {
//         logger.error(`HF Model ${model} failed`, hfError);
//       }
//     }
//     throw new Error(
//       "Critical Failure: Both OpenRouter and Hugging Face failed.",
//     );
//   }
// };

// export const generateEventReport = onCall(
//   {
//     secrets: [openRouterSecret, hfTokenSecret],
//     timeoutSeconds: 300,
//     memory: "512MiB",
//   },
//   async (request) => {
//     logger.info("BACKEND: generateEventReport triggered.");
//     const auth = request.auth;

//     if (!auth || !["admin", "facilitator"].includes(auth.token.role)) {
//       throw new HttpsError(
//         "permission-denied",
//         "Only authorized staff can generate reports.",
//       );
//     }

//     const {
//       eventId,
//       eventDetails,
//       metrics,
//       humanContext,
//       includeCharts,
//       photoUrls,
//       templateUrl,
//     } = request.data;

//     let systemPrompt = `You are an elite Monitoring & Evaluation (M&E) Officer at mLab Southern Africa.
//     Your task is to write a highly professional, structured post-event report based on the provided metrics and facilitator notes.
//     Maintain a formal, objective, and analytical tone suitable for SETA/QCTO and corporate stakeholders.`;

//     if (includeCharts) {
//       systemPrompt += `\nIMPORTANT: Include a demographic breakdown section. Output the data for this breakdown STRICTLY as a valid JSON array wrapped in <chart-data> tags. Example: <chart-data>[{"name": "Youth", "value": 15}]</chart-data>. Do not use markdown tables for demographics.`;
//     } else {
//       systemPrompt += `\nPresent all demographic and attendance data in clean, easy-to-read Markdown tables.`;
//     }

//     // 🚀 NEW: Explicitly command the AI to use HTML/CSS if a template is provided
//     if (templateUrl) {
//       systemPrompt += `\n\nCRITICAL STYLING COMMAND: The user has provided a reference template image. You MUST act as a frontend developer and mimic the exact visual structure, layout, and brand colors seen in the template.
//       Do NOT use basic markdown headers. You MUST use inline HTML and CSS (e.g., <div style="background-color: #073f4e; color: white; padding: 10px; border-radius: 5px;">, <h2 style="color: #94c73d;">) to perfectly replicate the aesthetic of the provided template.`;
//     }

//     let userPromptText = `
//     EVENT DETAILS:
//     - Name: ${eventDetails.eventName}
//     - Location: ${eventDetails.location}
//     - Date: ${eventDetails.date}

//     HARD METRICS:
//     - Total Attendance: ${metrics.totalAttendance} / ${metrics.maxCapacity}
//     - Youth (18-35): ${metrics.youthCount}
//     - Female Participants: ${metrics.femaleCount}

//     FACILITATOR NOTES (Human Context):
//     - Objectives & Highlights: ${humanContext.highlights || "None provided."}
//     - Challenges: ${humanContext.challenges || "None provided."}
//     `;

//     if (photoUrls && photoUrls.length > 0) {
//       userPromptText += `\n\nEVENT MEDIA / PHOTOS TO INCLUDE:\n`;
//       photoUrls.forEach((url: string, index: number) => {
//         userPromptText += `- Photo ${index + 1}: ${url}\n`;
//       });
//       userPromptText += `\nCRITICAL: You must embed these images directly into the report body using standard HTML: <img src="url" style="width:100%; border-radius:8px;" />`;
//     }

//     // 🚀 NEW: Format the payload for Vision-capable models (OpenRouter format)
//     let userContent: any = userPromptText;

//     if (templateUrl) {
//       // If a template exists, convert the user content into a multimodal array
//       userContent = [
//         {
//           type: "text",
//           text:
//             userPromptText +
//             "\n\nAnalyze the attached template image and apply its exact visual styling (colors, fonts, borders) to this report using inline HTML/CSS.",
//         },
//         { type: "image_url", image_url: { url: templateUrl } },
//       ];
//     }

//     try {
//       const aiResult = await generateCompletion([
//         { role: "system", content: systemPrompt },
//         { role: "user", content: userContent }, // Passes the multimodal payload
//       ]);

//       // 🚀 SAVE REPORT HISTORY TO FIRESTORE
//       const db = admin.firestore();
//       const reportRef = db.collection("event_reports").doc();

//       await reportRef.set({
//         eventId: eventId || "unknown_event",
//         eventName: eventDetails.eventName,
//         generatedBy: auth.uid,
//         generatedAt: new Date().toISOString(),
//         markdown: aiResult.text,
//         modelUsed: aiResult.modelUsed,
//         photoUrls: photoUrls || [],
//         templateUrl: templateUrl || null,
//         status: "final",
//       });

//       return {
//         success: true,
//         markdown: aiResult.text,
//         modelUsed: aiResult.modelUsed,
//         reportId: reportRef.id,
//       };
//     } catch (error: any) {
//       logger.error("Report Generation Error:", error);
//       throw new HttpsError(
//         "internal",
//         "Failed to generate AI report: " + error.message,
//       );
//     }
//   },
// );

export const exportReportToPDF = onCall(
  { timeoutSeconds: 300, memory: "1GiB", region: "us-central1" },
  async (request) => {
    const auth = request.auth;
    if (!auth) throw new HttpsError("unauthenticated", "Must be logged in.");

    const { htmlContent, reportName } = request.data;

    if (!htmlContent) {
      throw new HttpsError("invalid-argument", "HTML content is required.");
    }

    try {
      logger.info(`[PDF Engine] Spawning Puppeteer for ${reportName}...`);

      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });

      const page = await browser.newPage();

      // Wait until network is idle so all Firebase images have time to fully load!
      await page.setContent(htmlContent, {
        waitUntil: ["load", "networkidle0"],
      });

      const pdfBuffer = await page.pdf({
        format: "A4",
        printBackground: true,
        margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
      });

      await browser.close();

      // Save to Firebase Storage
      const bucket = admin.storage().bucket();
      const safeName = (reportName || "Report").replace(/[^a-zA-Z0-9]/g, "_");
      const filePath = `ai_reports/pdfs/${safeName}_${Date.now()}.pdf`;
      const file = bucket.file(filePath);

      await file.save(pdfBuffer, {
        metadata: { contentType: "application/pdf" },
      });

      // Generate a Download URL valid for 2 hours
      const [downloadUrl] = await file.getSignedUrl({
        action: "read",
        expires: Date.now() + 1000 * 60 * 60 * 2,
      });

      return { success: true, url: downloadUrl };
    } catch (error: any) {
      logger.error("PDF Generation Error:", error);
      throw new HttpsError(
        "internal",
        "Failed to render PDF: " + error.message,
      );
    }
  },
);

// import { onCall, HttpsError } from "firebase-functions/v2/https";
// import { defineSecret } from "firebase-functions/params";
// import { logger } from "firebase-functions";
// import * as admin from "firebase-admin";
// import { getApps } from "firebase-admin/app";

// // Initialize Firebase Admin (ensure this is done)
// if (getApps().length === 0) {
//   admin.initializeApp();
// }

// ─── DEFINE AI SECRETS ───
const openRouterSecret = defineSecret("OPENROUTER_API_KEY");
const hfTokenSecret = defineSecret("HF_TOKEN");

// ─── REUSABLE MULTI-PROVIDER AI UTILITY ───
export const generateCompletion = async (
  messages: any[],
  temperature = 0.4,
  maxTokens = 3000,
) => {
  const openRouterKey = openRouterSecret.value();
  const hfToken = hfTokenSecret.value();

  // Models that natively support Text + Vision (Images) on OpenRouter
  const OPENROUTER_FALLBACKS = [
    "google/gemini-2.0-flash-exp:free",
    "meta-llama/llama-3.2-90b-vision-instruct:free",
    "qwen/qwen-2.5-72b-instruct",
    "google/gemini-1.5-flash:free",
  ];

  const HUGGINGFACE_FALLBACKS = [
    "meta-llama/Llama-3.1-8B-Instruct",
    "mistralai/Mistral-7B-Instruct-v0.3",
  ];

  try {
    logger.info("Attempting AI Generation via OpenRouter...");
    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openRouterKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://mlabassessmentcenter.web.app",
          "X-Title": "mLab Ecosystem",
        },
        body: JSON.stringify({
          models: OPENROUTER_FALLBACKS,
          messages: messages,
          temperature: temperature,
          max_tokens: maxTokens,
          route: "fallback",
        }),
      },
    );

    if (response.ok) {
      const data = await response.json();
      return {
        text: data.choices[0].message.content,
        modelUsed: `OpenRouter (${data.model})`,
      };
    }

    const errorText = await response.text();
    logger.warn(`OpenRouter returned HTTP ${response.status}: ${errorText}`);
    throw new Error(`OpenRouter HTTP ${response.status}`);
  } catch (openRouterError: any) {
    logger.warn(
      "OpenRouter completely failed. Redirecting to Hugging Face...",
      openRouterError.message,
    );

    // 🚀 CRITICAL FIX: Flatten vision arrays to pure text so Hugging Face doesn't crash
    const hfMessages = messages.map((msg) => {
      if (Array.isArray(msg.content)) {
        const textContent = msg.content
          .filter((c: any) => c.type === "text")
          .map((c: any) => c.text)
          .join("\n\n");
        return { role: msg.role, content: textContent };
      }
      return msg;
    });

    for (const model of HUGGINGFACE_FALLBACKS) {
      try {
        const hfResponse = await fetch(
          "https://router.huggingface.co/v1/chat/completions",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${hfToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model,
              messages: hfMessages, // Pass the safe, text-only messages
              temperature,
              max_tokens: maxTokens,
            }),
          },
        );

        if (hfResponse.ok) {
          const hfData = await hfResponse.json();
          return {
            text: hfData.choices[0].message.content,
            modelUsed: `HuggingFace (${model})`,
          };
        }
      } catch (hfError) {
        logger.error(`HF Model ${model} failed`, hfError);
      }
    }

    throw new Error(
      "Critical Failure: Both OpenRouter and Hugging Face providers failed to generate a response.",
    );
  }
};

export const generateEventReport = onCall(
  {
    secrets: [openRouterSecret, hfTokenSecret],
    timeoutSeconds: 300,
    memory: "512MiB",
  },
  async (request) => {
    logger.info("BACKEND: generateEventReport triggered.");
    const auth = request.auth;

    if (!auth || !["admin", "facilitator"].includes(auth.token.role)) {
      throw new HttpsError(
        "permission-denied",
        "Only authorized staff can generate reports.",
      );
    }

    const {
      eventId,
      eventDetails,
      metrics,
      humanContext,
      includeCharts,
      photoUrls,
      templateUrl,
    } = request.data;

    let systemPrompt = `You are an elite Monitoring & Evaluation (M&E) Officer at mLab Southern Africa.
    Your task is to write a highly professional, structured post-event report based on the provided metrics and facilitator notes.
    Maintain a formal, objective, and analytical tone suitable for SETA/QCTO and corporate stakeholders.
    
    CRITICAL MARKDOWN FORMATTING INSTRUCTIONS:
    - Use Markdown exclusively.
    - Use H1 (#) for the Main Report Title.
    - Use H2 (##) for Major Sections (e.g., Executive Summary, Event Highlights, Challenges, Conclusion).
    - Use H3 (###) for sub-sections.
    - Use bullet points (-) for lists.
    - Use bold text (**) for emphasis on key metrics or terms.
    - Ensure there is a blank line between paragraphs and after headers for clean rendering.`;

    if (includeCharts) {
      systemPrompt += `\nIMPORTANT: Include a demographic breakdown section. Output the data for this breakdown STRICTLY as a valid JSON array wrapped in <chart-data> tags. Example: <chart-data>[{"name": "Youth", "value": 15}]</chart-data>. Do not use markdown tables for demographics.`;
    } else {
      systemPrompt += `\nPresent all demographic and attendance data in clean, easy-to-read Markdown tables.`;
    }

    let userPromptText = `
    EVENT DETAILS:
    - Name: ${eventDetails.eventName}
    - Location: ${eventDetails.location}
    - Date: ${eventDetails.date}

    HARD METRICS:
    - Total Attendance: ${metrics.totalAttendance} / ${metrics.maxCapacity}
    - Youth (18-35): ${metrics.youthCount}
    - Female Participants: ${metrics.femaleCount}
    - Male Participants: ${metrics.maleCount}

    FACILITATOR NOTES (Human Context):
    - Objectives & Highlights: ${humanContext.highlights || "None provided."}
    - Challenges: ${humanContext.challenges || "None provided."}
    `;

    if (photoUrls && photoUrls.length > 0) {
      userPromptText += `\n\nEVENT MEDIA / PHOTOS TO INCLUDE:\n`;
      photoUrls.forEach((url: string, index: number) => {
        userPromptText += `- Photo ${index + 1}: ${url}\n`;
      });
      userPromptText += `\nCRITICAL: You must embed these images directly into the report body (e.g., in the Highlights or Media section) using standard Markdown image syntax: ![Event Photo Description](url).`;
    }

    // 🚀 CRITICAL FIX: Build a single, unified User Content payload
    let userContent: any = userPromptText;

    if (templateUrl) {
      userContent = [
        { type: "text", text: userPromptText },
        {
          type: "text",
          text: "CRITICAL: Please analyze the attached reference template image. Mimic its structural layout, section ordering, and formatting style exactly for the new report.",
        },
        { type: "image_url", image_url: { url: templateUrl } },
      ];
    }

    const messages = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ];

    try {
      const aiResult = await generateCompletion(messages, 0.4, 4000);

      // 🚀 SAVE REPORT HISTORY TO FIRESTORE
      const db = admin.firestore();
      const reportRef = db.collection("event_reports").doc();

      await reportRef.set({
        eventId: eventId || "unknown_event",
        eventName: eventDetails.eventName,
        generatedBy: auth.uid,
        generatedAt: new Date().toISOString(),
        markdown: aiResult.text,
        modelUsed: aiResult.modelUsed,
        photoUrls: photoUrls || [],
        templateUrl: templateUrl || null,
        status: "final",
      });

      return {
        success: true,
        markdown: aiResult.text,
        modelUsed: aiResult.modelUsed,
        reportId: reportRef.id,
      };
    } catch (error: any) {
      logger.error("Report Generation Error:", error);
      throw new HttpsError(
        "internal",
        "Failed to generate AI report: " + error.message,
      );
    }
  },
);
