// functions/src/modules/accountEngine.ts

import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";

import {
  sendMailgunEmail,
  buildMlabEmailHtml,
  buildMlabEmailPlainText,
} from "../utils/emailBuilder";

// Secrets
const mailgunSecret = defineSecret("MAILGUN_API_KEY");

// Auto-detects runtime environment (Emulator vs Live)
const APP_URL =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? "http://localhost:5173"
    : "https://mlabassessmentcenter.web.app";

// ============================================================================
// 1. PROVISION STAFF ACCOUNT
// ============================================================================

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

        // Construct clean mLab React Link
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
        console.error(
          "[createStaffAccount] ⚠️ MAILGUN ERROR: Failed to send welcome email:",
          emailError,
        );
        emailSent = false;
        emailErrorMsg = emailError.message || "Unknown mailer error";
      }

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

// ============================================================================
// 2. AUTOMATED LEARNER PROMOTION & EMAIL REGISTRATION TRIGGER
// ============================================================================

export const onLearnerInviteTriggered = onDocumentUpdated(
  { document: "learners/{learnerId}", secrets: [mailgunSecret] },
  async (event) => {
    const learnerId = event.params.learnerId;

    logger.info(`🔥 Trigger Awakened! Learner document updated: ${learnerId}`);

    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) {
      logger.warn(`⚠️ [${learnerId}] Missing before/after data. Exiting.`);
      return;
    }

    logger.info(
      `📊 [${learnerId}] Status Check -> Before: [${beforeData.authStatus}] | After: [${afterData.authStatus}]`,
    );

    // Only trigger if status flipped to "invite_pending"
    if (
      beforeData.authStatus !== "invite_pending" &&
      afterData.authStatus === "invite_pending"
    ) {
      logger.info(
        `✅ [${learnerId}] Condition met! Proceeding with email automation...`,
      );

      const rawEmail =
        afterData.email || afterData.demographics?.learnerEmailAddress;
      const email = rawEmail ? String(rawEmail).toLowerCase().trim() : null;
      const fullName = afterData.fullName || "Learner";

      if (!email) {
        logger.error(
          `[onLearnerInvite] Missing email for learner ${learnerId}. Cannot send invite.`,
        );
        await event.data?.after.ref.update({
          authStatus: "failed",
          authError: "No email address found on applicant profile.",
        });
        return;
      }

      let uid: string;

      try {
        // 1. Create or Fetch the Firebase Auth User
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
          } else throw error;
        }

        // 2. Set Custom User Claims
        await admin.auth().setCustomUserClaims(uid, { role: "learner" });

        // 3. Create or Update Global 'users' Document
        const userRef = admin.firestore().collection("users").doc(uid);
        await userRef.set(
          {
            email,
            fullName,
            role: "learner",
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );

        // 4. Generate Secure Reset Link
        const defaultFirebaseLink = await admin
          .auth()
          .generatePasswordResetLink(email);
        const urlObj = new URL(defaultFirebaseLink);
        const oobCode = urlObj.searchParams.get("oobCode");
        const customReactLink = `${APP_URL}/reset-password?oobCode=${oobCode}`;

        // 5. Construct Email
        const emailParams = {
          title: "Welcome to mLab",
          subtitle: "Action Required: Activate your learner portal",
          recipientName: fullName,
          bodyHtml: `
            <p>Welcome to the <strong>mLab Assessment Platform</strong>! You have been officially registered as a <strong>Learner</strong> and promoted to an active class.</p>
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

        // 6. Send Mailgun Email
        await sendMailgunEmail({
          to: email,
          subject: "Welcome to mLab - Activate Your Account",
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        });

        // 7. Update Learner Record
        await event.data?.after.ref.update({
          authUid: uid,
          authStatus: "pending",
          invitedAt: admin.firestore.FieldValue.serverTimestamp(),
          lastSynced: admin.firestore.FieldValue.serverTimestamp(),
          authError: admin.firestore.FieldValue.delete(),
          lastSystemMessage: `✅ Successfully created Auth account and dispatched welcome email to ${email} at ${new Date().toISOString()}`,
        });

        logger.info(`[onLearnerInvite] 🏁 SUCCESS! Email sent to ${email}`);
      } catch (error: any) {
        logger.error(
          `[onLearnerInvite] ❌ Critical Error processing ${email}:`,
          error,
        );

        await event.data?.after.ref.update({
          authStatus: "failed",
          authError: error.message || "Failed during automated registration.",
          lastSystemMessage: `❌ Failed to send invite: ${error.message}`,
        });
      }
    } else {
      logger.info(
        `⏭️ [${learnerId}] Skipped: Status did not change to 'invite_pending'.`,
      );
    }
  },
);

// ============================================================================
// 3. DIRECT LEARNER ACCOUNT PROVISIONING
// ============================================================================

export const createLearnerAccount = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
    const { email, fullName, role, learnerId, idNumber } = request.data;

    logger.info(`[createLearnerAccount] Initiated for ${email}`);

    if (!email || !fullName) {
      throw new HttpsError("invalid-argument", "Missing email or full name.");
    }

    const cleanEmail = email.toLowerCase().trim();
    let uid: string;
    let isNewUser = false;

    try {
      // 1. Create or Fetch the Auth User
      try {
        const existingUser = await admin.auth().getUserByEmail(cleanEmail);
        uid = existingUser.uid;
      } catch (error: any) {
        if (error.code === "auth/user-not-found") {
          const newUser = await admin.auth().createUser({
            email: cleanEmail,
            emailVerified: false,
            displayName: fullName,
          });
          uid = newUser.uid;
          isNewUser = true;
        } else throw error;
      }

      // 2. Set Custom User Claims
      await admin.auth().setCustomUserClaims(uid, { role: role || "learner" });

      // 3. Create or Update Global 'users' Document
      const userRef = admin.firestore().collection("users").doc(uid);
      await userRef.set(
        {
          email: cleanEmail,
          fullName,
          role: role || "learner",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true },
      );

      // 4. Link Auth UID to the 'learners' document
      let targetDocId = learnerId || idNumber;
      if (targetDocId) {
        await admin.firestore().collection("learners").doc(targetDocId).update({
          authUid: uid,
          status: "active",
          authStatus: "pending",
          lastSynced: admin.firestore.FieldValue.serverTimestamp(),
        });
      } else {
        const snapshot = await admin
          .firestore()
          .collection("learners")
          .where("email", "==", cleanEmail)
          .get();

        if (!snapshot.empty) {
          await snapshot.docs[0].ref.update({
            authUid: uid,
            status: "active",
            authStatus: "pending",
            lastSynced: admin.firestore.FieldValue.serverTimestamp(),
          });
        }
      }

      // 5. Generate Password Reset Link
      const defaultFirebaseLink = await admin
        .auth()
        .generatePasswordResetLink(cleanEmail);
      const urlObj = new URL(defaultFirebaseLink);
      const oobCode = urlObj.searchParams.get("oobCode");

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

      // 6. Dispatch Email
      await sendMailgunEmail({
        to: cleanEmail,
        subject: "Welcome to mLab - Activate Your Account",
        text: buildMlabEmailPlainText(emailParams),
        html: buildMlabEmailHtml(emailParams),
      });

      return { success: true, uid: uid, wasNewlyCreated: isNewUser };
    } catch (error: any) {
      logger.error("[createLearnerAccount] Critical Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to provision learner account.",
      );
    }
  },
);

// ============================================================================
// 4. PERMANENT STAFF DELETION
// ============================================================================

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

  // Prevent self-deletion
  if (auth.uid === uid) {
    throw new HttpsError(
      "invalid-argument",
      "You cannot delete your own active session.",
    );
  }

  try {
    // Delete from Firebase Auth
    try {
      await admin.auth().deleteUser(uid);
    } catch (authErr: any) {
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

// ============================================================================
// 5. CUSTOM PASSWORD RESET EMAIL DISPATCHER
// ============================================================================

export const sendCustomPasswordReset = onCall(
  { secrets: [mailgunSecret] },
  async (request) => {
    const { email } = request.data;

    if (!email) {
      throw new HttpsError("invalid-argument", "Email address is required.");
    }

    try {
      const userRecord = await admin.auth().getUserByEmail(email);

      const userDoc = await admin
        .firestore()
        .collection("users")
        .doc(userRecord.uid)
        .get();
      const userData = userDoc.data();
      const actualName =
        userData?.fullName || userRecord.displayName || "Member";

      const defaultFirebaseLink = await admin
        .auth()
        .generatePasswordResetLink(email);

      const urlObj = new URL(defaultFirebaseLink);
      const oobCode = urlObj.searchParams.get("oobCode");

      const customReactLink = `${APP_URL}/reset-password?oobCode=${oobCode}`;

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

// ============================================================================
// 6. CUSTOM EMAIL VERIFICATION DISPATCHER
// ============================================================================

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
