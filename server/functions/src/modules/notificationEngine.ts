// functions/src/modules/notificationEngine.ts

import { defineSecret } from "firebase-functions/params";
import {
  onCall,
  onRequest,
  CallableRequest,
  HttpsError,
} from "firebase-functions/v2/https";
import {
  onDocumentCreated,
  onDocumentUpdated,
} from "firebase-functions/v2/firestore";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as logger from "firebase-functions/logger";
import * as admin from "firebase-admin";
import OpenAI from "openai";
import cors from "cors";

import {
  sendMailgunEmail,
  buildMlabEmailHtml,
  buildMlabEmailPlainText,
} from "../utils/emailBuilder";

const corsHandler = cors({ origin: true });

// Secrets
const mailgunSecret = defineSecret("MAILGUN_API_KEY");
const openAISecret = defineSecret("OPENAI_API_KEY");

// Environment URL Auto-detection
const APP_URL =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? "http://localhost:5173"
    : "https://mlabassessmentcenter.web.app";

// ============================================================================
// 1. ASSESSMENT CALENDAR INVITE ENGINE (.ICS ATTACHMENT GENERATOR)
// ============================================================================

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

        saastFormattedDate = new Intl.DateTimeFormat("en-ZA", {
          timeZone: "Africa/Johannesburg",
          dateStyle: "full",
          timeStyle: "short",
        }).format(startDate);

        const formatICSDate = (date: Date) =>
          date.toISOString().replace(/-|:|\.\d\d\d/g, "");
        const dtStart = formatICSDate(startDate);
        const dtEnd = formatICSDate(endDate);
        const dtStamp = formatICSDate(new Date());

        const eventTitle = encodeURIComponent(`mLab: ${title}`);
        const eventDetails = encodeURIComponent(
          `Your secure assessment module is scheduled.\n\nAccess Link: ${platformLink}`,
        );
        googleCalendarLink = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${eventTitle}&dates=${dtStart}/${dtEnd}&details=${eventDetails}`;

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
          "TRIGGER:-PT1440M",
          "END:VALARM",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:mLab Assessment in 1 Hour",
          "TRIGGER:-PT60M",
          "END:VALARM",
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          "DESCRIPTION:mLab Assessment starting soon!",
          "TRIGGER:-PT10M",
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
          subject: emailSubject,
          text: buildMlabEmailPlainText(emailParams),
          html: buildMlabEmailHtml(emailParams),
        };

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
// 2. ASSESSMENT COLLABORATOR ADDED TRIGGER
// ============================================================================

export const onAssessmentCollaboratorAdded = onDocumentUpdated(
  { document: "assessments/{assessmentId}", secrets: [mailgunSecret] },
  async (event) => {
    if (!event.data) return;

    const beforeData = event.data.before.data();
    const afterData = event.data.after.data();

    if (!beforeData || !afterData) return;

    const beforeCollabs = beforeData.collaboratorIds || [];
    const afterCollabs = afterData.collaboratorIds || [];

    const newCollabs = afterCollabs.filter(
      (id: string) => !beforeCollabs.includes(id),
    );

    if (newCollabs.length === 0) return;

    const db = admin.firestore();
    const batch = db.batch();

    const assessmentId = event.params.assessmentId;
    const workbookTitle = afterData.title || "Untitled Workbook";
    const workbookLink = `${APP_URL}/facilitator/assessments/builder/${assessmentId}`;

    const emailPromises: Promise<any>[] = [];

    for (const userId of newCollabs) {
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

      const invitedDoc = await db.collection("users").doc(userId).get();
      if (!invitedDoc.exists) continue;

      const invitedData = invitedDoc.data();
      const invitedEmail = invitedData?.email;
      const invitedName = invitedData?.fullName || "Staff Member";

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

    await batch.commit();
    await Promise.all(emailPromises).catch((err) =>
      logger.error("Failed to send collaborator invite emails", err),
    );
  },
);

// ============================================================================
// 3. SUBMISSION STATUS CHANGE NOTIFICATIONS
// ============================================================================

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

// ============================================================================
// 4. NEW ASSESSMENT CREATED NOTIFICATION
// ============================================================================

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

// ============================================================================
// 5. COHORT CREATED NOTIFICATION (FACILITATOR, ASSESSOR, MODERATOR, LEARNERS)
// ============================================================================

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

// ============================================================================
// 6. HOLIDAY GOODWILL SCHEDULED PUSH & IN-APP NOTIFICATION
// ============================================================================

export const sendHolidayGoodwill = onSchedule(
  {
    schedule: "0 8 * * *",
    timeZone: "Africa/Johannesburg",
    secrets: [openAISecret],
  },
  async () => {
    try {
      const today = new Date();
      const year = today.getFullYear();
      const todayString = `${year}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      const response = await fetch(
        `https://date.nager.at/api/v3/PublicHolidays/${year}/ZA`,
      );
      if (!response.ok) throw new Error("Failed to fetch public holidays");

      const holidays = await response.json();
      const todayHoliday = holidays.find((h: any) => h.date === todayString);

      if (!todayHoliday) return;

      const holidayName = todayHoliday.localName;
      const apiKey = openAISecret.value();

      if (!apiKey) throw new Error("Missing OpenAI API Key in Secret Manager");

      const openai = new OpenAI({ apiKey });

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

      const messagePayload = {
        notification: { title: `${holidayName} 🇿🇦`, body: generatedMessage },
        topic: "all_learners",
        data: { type: "holiday", route: "/notifications" },
      };

      await admin.messaging().send(messagePayload);

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
      logger.error("Error in sendHolidayGoodwill function:", error);
    }
  },
);

// ============================================================================
// 7. IN-APP NOTIFICATION TRIGGERS (LEAVE STATUS & KIOSK SCANS)
// ============================================================================

export const onLeaveStatusChanged = onDocumentUpdated(
  { document: "leave_requests/{requestId}" },
  async (event) => {
    const beforeData = event.data?.before.data();
    const afterData = event.data?.after.data();

    if (!beforeData || !afterData) return;

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
        logger.error("Failed to generate leave notification", error);
      }
    }
  },
);

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
      logger.error("Failed to generate scan notification", error);
    }
  },
);

// ============================================================================
// 8. BROADCAST FCM PUSH NOTIFICATIONS
// ============================================================================

export const onBroadcastNotificationCreated = onDocumentCreated(
  { document: "notifications/{notifId}" },
  async (event) => {
    const data = event.data?.data();
    if (!data) return;

    const { recipientId, title, message, type } = data;

    if (
      type === "system" &&
      (recipientId === "all_learners" || recipientId.startsWith("campus_"))
    ) {
      try {
        const prodTopic = `${recipientId}_prod`;
        const betaTopic = `${recipientId}_beta`;
        const targetCondition = `'${prodTopic}' in topics || '${betaTopic}' in topics`;

        const messagePayload: any = {
          notification: {
            title: title || "mLab Announcement",
            body: message,
          },
          condition: targetCondition,
          android: {
            priority: "high",
            notification: {
              sound: "default",
              channelId: "default",
              vibrateTimingsMillis: [0, 500, 250, 500],
              defaultVibrateTimings: false,
            },
          },
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

        await admin.messaging().send(messagePayload);

        logger.info(
          `Successfully broadcasted push using condition: ${targetCondition}`,
        );
      } catch (error) {
        logger.error(
          `Failed to send FCM broadcast for target ${recipientId}`,
          error,
        );
      }
    }
  },
);

// ============================================================================
// 9. PUSH NOTIFICATION HARDWARE TEST ENDPOINTS
// ============================================================================

export const testSingleTokenPush = onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    logger.info("📱 [Single Token Test] Initiating hardware check...");

    try {
      const targetToken =
        "ctTg0a7_SWG2FPWjD98VXe:APA91bGa98HXfnzQIYt9YUezK-TIL9vPq91WvC8sQ3Z3mBzR8yiOzMalZ1Wfyk0Jurd5V2Y18woeu9S0Pw6fMZDYR77qeCp5kpWXvPMk0SN_g4vTGyhSe6Q";

      const messagePayload = {
        token: targetToken.trim(),
        notification: {
          title: "🔊 Hardware Forced Test",
          body: "Dispatched with maximum priority flags!",
        },
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            channelId: "default",
            vibrateTimingsMillis: [0, 500, 250, 500],
            defaultVibrateTimings: false,
          },
        },
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
          testMode: "forced_vibration",
        },
      };

      const fcmResponse = await admin.messaging().send(messagePayload);

      res.status(200).send({
        success: true,
        message: "High priority payload dispatched successfully.",
        fcmMessageId: fcmResponse,
      });
    } catch (error: any) {
      logger.error("Hardware push failed:", error);
      res.status(500).send({ success: false, errorMessage: error.message });
    }
  });
});

export const testDevTopicPush = onRequest((req, res) => {
  return corsHandler(req, res, async () => {
    logger.info("[Dev Topic Test] Initiating hardware check for dev topic...");

    try {
      const targetTopic = "all_learners_dev";

      const messagePayload = {
        topic: targetTopic,
        notification: {
          title: "🛠️ Dev Environment Blast",
          body: "Successfully subscribed to the _dev channel!",
        },
        android: {
          priority: "high" as const,
          notification: {
            sound: "default",
            channelId: "default",
            vibrateTimingsMillis: [0, 500, 250, 500],
            defaultVibrateTimings: false,
          },
        },
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
          testMode: "dev_topic_blast",
        },
      };

      const fcmResponse = await admin.messaging().send(messagePayload);

      res.status(200).send({
        success: true,
        message: `Dispatched to ${targetTopic}.`,
        fcmMessageId: fcmResponse,
      });
    } catch (error: any) {
      logger.error("Topic push failed:", error);
      res.status(500).send({ success: false, errorMessage: error.message });
    }
  });
});
