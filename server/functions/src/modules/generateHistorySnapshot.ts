// functions/src/generateHistorySnapshot.ts

import { onDocumentCreated } from "firebase-functions/v2/firestore";
import * as admin from "firebase-admin";
const puppeteer = require("puppeteer-core");
const chromium = require("@sparticuz/chromium");

export const generateHistorySnapshot = onDocumentCreated(
  {
    document: "learner_submissions/{submissionId}/history/{historyId}",
    timeoutSeconds: 300, // 5 minutes is plenty for a single document
    memory: "1GiB", // Needs less RAM than the Master PoE
    region: "us-central1",
  },
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const historyData = snap.data();
    const submissionId = event.params.submissionId;

    // Prevent infinite loops or redundant runs
    if (historyData.historyPdfUrl || historyData.isGeneratingPdf) return;

    try {
      // 1. Mark as generating so we don't accidentally run twice
      await snap.ref.update({ isGeneratingPdf: true });

      // 2. Fetch the assessment template to get the questions
      const assessmentId = historyData.assessmentId;
      const assessmentSnap = await admin
        .firestore()
        .collection("assessments")
        .doc(assessmentId)
        .get();
      const assessment = assessmentSnap.data() || {};
      const blocks = assessment.blocks || [];

      // 3. Fetch Learner info
      const learnerId = historyData.learnerId;
      const learnerSnap = await admin
        .firestore()
        .collection("learners")
        .doc(learnerId)
        .get();
      const learner = learnerSnap.data() || {};

      // 4. Build the HTML Snapshot
      const attemptNum = historyData.attemptNumber || "Previous";
      const answers = historyData.answers || {};
      const grading = historyData.grading || {};

      let html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;700&display=swap');
          body { font-family: 'Trebuchet MS', Arial, sans-serif; padding: 30px; color: #1a2e35; }
          .header { border-bottom: 3px solid #ef4444; padding-bottom: 15px; margin-bottom: 20px; }
          h1 { font-family: 'Oswald'; color: #b91c1c; text-transform: uppercase; margin: 0 0 5px 0; }
          .meta { font-size: 12px; color: #64748b; margin-bottom: 5px; }
          .box { border: 1px solid #fecaca; background: #fef2f2; padding: 15px; border-radius: 6px; margin-bottom: 20px; }
          .q-block { margin-bottom: 15px; border-bottom: 1px solid #e2e8f0; padding-bottom: 15px; page-break-inside: avoid; }
          .q-title { font-family: 'Oswald'; font-weight: 700; color: #073f4e; font-size: 14px; margin-bottom: 8px; }
          .a-text { background: #f8fafc; border-left: 4px solid #94a3b8; padding: 10px; font-size: 12px; white-space: pre-wrap; }
          .feedback { background: #fff; border: 1px solid #fecaca; border-left: 4px solid #ef4444; padding: 8px; margin-top: 8px; font-size: 11px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>Archived Attempt #${attemptNum} (NYC)</h1>
          <div class="meta"><strong>Module:</strong> ${historyData.title || assessment.title}</div>
          <div class="meta"><strong>Learner:</strong> ${learner.fullName || "Unknown Learner"} (${learner.idNumber || "N/A"})</div>
          <div class="meta"><strong>Submitted On:</strong> ${historyData.submittedAt ? new Date(historyData.submittedAt).toLocaleString("en-ZA") : "N/A"}</div>
        </div>

        <div class="box">
          <p style="margin:0 0 5px 0;"><strong>Final Score:</strong> ${historyData.marks || 0} / ${historyData.totalMarks || 0}</p>
          <p style="margin:0;"><strong>Assessor NYC Feedback:</strong> <span style="color:#b91c1c;">${grading.assessorOverallFeedback || historyData.facilitatorOverallFeedback || "No overall feedback provided."}</span></p>
        </div>
        
        <h2 style="font-family: 'Oswald'; color: #073f4e; text-transform: uppercase; border-bottom: 2px solid #073f4e; padding-bottom: 5px;">Assessment Evidence & Feedback</h2>
      `;

      blocks.forEach((block: any) => {
        if (block.type === "section" || block.type === "info") return;

        const ans = answers[block.id];
        let formattedAns = "<em>No answer provided.</em>";

        if (ans !== undefined && ans !== null) {
          if (typeof ans === "object") {
            if (ans.text) formattedAns += `<div>${ans.text}</div>`;
            if (ans.uploadUrl)
              formattedAns += `<div><a href="${ans.uploadUrl}" style="color:#0284c7;">📎 Attached Evidence File</a></div>`;

            // Deep scan for nested uploads
            Object.keys(ans).forEach((k) => {
              if (ans[k] && typeof ans[k] === "object" && ans[k].uploadUrl) {
                formattedAns += `<div><a href="${ans[k].uploadUrl}" style="color:#0284c7;">📎 Attached Evidence (${k.replace(/_/g, " ")})</a></div>`;
              } else if (
                typeof ans[k] === "string" &&
                !["text", "url", "uploadUrl"].includes(k)
              ) {
                formattedAns += `<div><strong>${k}:</strong> ${ans[k]}</div>`;
              }
            });
          } else {
            formattedAns = String(ans);
          }
        }

        const assFeedback =
          grading.assessorBreakdown?.[block.id]?.feedback ||
          grading.facilitatorBreakdown?.[block.id]?.feedback;

        html += `
        <div class="q-block">
          <div class="q-title">Q. ${block.question || block.title || "Task"}</div>
          <div class="a-text">${formattedAns}</div>
          ${assFeedback ? `<div class="feedback"><strong style="color:#b91c1c;">Assessor Note:</strong> ${assFeedback}</div>` : ""}
        </div>`;
      });

      html += `</body></html>`;

      // 5. Render PDF with Puppeteer
      const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: chromium.defaultViewport,
        executablePath: await chromium.executablePath(),
        headless: chromium.headless,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle2" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await browser.close();

      // 6. Upload to Firebase Storage
      const bucket = admin.storage().bucket();
      const filePath = `reassessment_archives/${learnerId}/${submissionId}_attempt_${attemptNum}.pdf`;
      const file = bucket.file(filePath);

      await file.save(pdfBuffer, {
        metadata: { contentType: "application/pdf" },
      });
      const [downloadUrl] = await file.getSignedUrl({
        action: "read",
        expires: "01-01-2100",
      });

      // 7. Update the history document with the newly generated URL
      await snap.ref.update({
        historyPdfUrl: downloadUrl,
        isGeneratingPdf: admin.firestore.FieldValue.delete(), // Clean up the flag
      });

      console.log(
        `Successfully generated history snapshot for attempt ${attemptNum}`,
      );
    } catch (error) {
      console.error("Failed to generate history snapshot:", error);
      await snap.ref.update({ isGeneratingPdf: false }); // Reset flag so it can be retried if needed
    }
  },
);
