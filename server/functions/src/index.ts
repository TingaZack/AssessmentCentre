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
import { onDocumentCreated } from "firebase-functions/firestore";

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

// interface CreateStaffRequest {
//   email: string;
//   fullName: string;
//   role: string;
// }
export const createStaffAccount = onCall(async (request) => {
  // 1. EXTRACT DATA & AUTH FROM THE SINGLE 'request' OBJECT
  const { email, fullName, role, phone } = request.data;
  const auth = request.auth;

  // 2. Security Check: Ensure caller is Authenticated
  if (!auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  // 3. Security Check: Ensure caller is an Admin
  const callerUid = auth.uid;
  const callerDoc = await admin
    .firestore()
    .collection("users")
    .doc(callerUid)
    .get();

  if (!callerDoc.exists || callerDoc.data()?.role !== "admin") {
    throw new HttpsError(
      "permission-denied",
      "Only Admins can create staff accounts.",
    );
  }

  try {
    // 4. Create the User in Firebase Auth
    const userRecord = await admin.auth().createUser({
      email: email,
      displayName: fullName,
      emailVerified: true,
    });

    // 5. Create Firestore Profile
    await admin.firestore().collection("users").doc(userRecord.uid).set({
      uid: userRecord.uid,
      fullName: fullName,
      email: email,
      role: role,
      phone: phone,
      createdAt: new Date().toISOString(),
      signatureUrl: "", // Empty until they log in
    });

    // 6. Generate Password Reset Link
    const link = await admin.auth().generatePasswordResetLink(email);

    // 7. Send Email via Nodemailer
    const mailOptions = {
      from: '"mLab Admin" <brndkt@gmail.com>',
      to: email,
      subject: "Welcome to mLab Assessment Platform",
      html: `
        <h3>Welcome, ${fullName}!</h3>
        <p>You have been registered as a <strong>${role}</strong>.</p>
        <p>Please click the link below to set your password and access the dashboard:</p>
        <a href="${link}" style="padding: 10px 20px; background-color: #94c73d; color: white; text-decoration: none; border-radius: 5px;">Set Password & Login</a>
        <br /><br />
        <p>Regards,<br/>mLab Admin Team</p>
      `,
    };

    await transporter.sendMail(mailOptions);

    return { success: true, message: `Account created for ${email}` };
  } catch (error: any) {
    console.error("Error creating staff:", error);
    // Return a structured error to the client
    throw new HttpsError(
      "internal",
      error.message || "Unable to create account.",
    );
  }
});

// ================= CONFIGURATION =================
// I will replace this with my actual deployed URL
const APP_URL = "https://mlab-assessment-platform.web.app";

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

// export const createLearnerAccount = onRequest((req, res) => {
//   return cors(req, res, async () => {
//     try {
//       // 1. Validation
//       if (req.method !== "POST") {
//         res.status(405).send("Method Not Allowed");
//         return;
//       }

//       const { email, fullName, role } = req.body.data || req.body;

//       if (!email || !fullName) {
//         res
//           .status(400)
//           .send({ data: { success: false, message: "Missing email or name" } });
//         return;
//       }

//       let uid: string;
//       let isNewUser = false;

//       // 2. 🚀 CHECK IF USER ALREADY EXISTS IN AUTH
//       try {
//         const existingUser = await admin.auth().getUserByEmail(email);
//         uid = existingUser.uid; // User exists! Grab their ID.
//         console.log(`User ${email} already exists in Auth with UID: ${uid}`);
//       } catch (error: any) {
//         // If the error is 'user-not-found', we create them.
//         if (error.code === "auth/user-not-found") {
//           console.log(`User ${email} not found in Auth. Creating new user...`);
//           const newUser = await admin.auth().createUser({
//             email,
//             emailVerified: true,
//             displayName: fullName,
//           });
//           uid = newUser.uid;
//           isNewUser = true;
//         } else {
//           // If it's a different Auth error (e.g., bad connection), throw it.
//           throw error;
//         }
//       }

//       // 3. Ensure Custom Claims are set (even if they already existed, make sure they have the role)
//       await admin.auth().setCustomUserClaims(uid, { role: role || "learner" });

//       // 4. 🚀 CHECK IF USER EXISTS IN FIRESTORE
//       const userRef = admin.firestore().collection("users").doc(uid);
//       const userDoc = await userRef.get();

//       if (!userDoc.exists) {
//         console.log(`Creating missing Firestore profile for ${uid}`);
//         await userRef.set({
//           email: email,
//           fullName: fullName,
//           role: role || "learner",
//           createdAt: new Date().toISOString(),
//         });
//       } else {
//         console.log(
//           `Firestore profile for ${uid} already exists. Skipping overwrite.`,
//         );
//       }

//       // 5. Generate the "Set Password" Link
//       const link = await admin.auth().generatePasswordResetLink(email);

//       // 6. Send Invite Email
//       const mailOptions = {
//         from: '"mLab Admin" <brndkt@gmail.com>',
//         to: email,
//         subject: "Invitation to mLab Learner Portal",
//         html: `
//                     <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #eee;">
//                         <h2 style="color: #0f172a;">Welcome, ${fullName}!</h2>
//                         <p>You have been registered as a <strong>Learner</strong> on the mLab Assessment Platform.</p>
//                         <p>To access your dashboard, please click the button below to set your secure password:</p>

//                         <div style="margin: 30px 0;">
//                             <a href="${link}" style="background-color: #6366f1; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
//                                 ${isNewUser ? "Set Your Password" : "Login / Reset Password"}
//                             </a>
//                         </div>

//                         <p style="color: #64748b; font-size: 14px;">
//                             If the button doesn't work, copy and paste this link:<br/>
//                             <a href="${link}">${link}</a>
//                         </p>
//                         <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;" />
//                         <p style="font-size: 12px; color: #94a3b8;">mLab Admin Team</p>
//                     </div>
//                 `,
//       };

//       await transporter.sendMail(mailOptions);

//       // 7. Return Success (We return the UID so your frontend can link the dashboard learner to this Auth UID)
//       res.status(200).send({
//         data: { success: true, uid: uid, wasNewlyCreated: isNewUser },
//       });
//     } catch (error: any) {
//       console.error("Critical Error processing learner account:", error);
//       res
//         .status(500)
//         .send({ data: { success: false, message: error.message } });
//     }
//   });
// });
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
            emailVerified: true,
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
        // ✅ We inject the 'link' variable here
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
