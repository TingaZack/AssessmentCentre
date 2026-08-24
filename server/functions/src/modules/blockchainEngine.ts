// functions/src/modules/blockchainEngine.ts

import { defineSecret } from "firebase-functions/params";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onDocumentUpdated } from "firebase-functions/v2/firestore";
import * as logger from "firebase-functions/logger";
import { ethers } from "ethers";
import axios from "axios";
import FormData from "form-data";

import {
  sendMailgunEmail,
  buildMlabEmailHtml,
  buildMlabEmailPlainText,
} from "../utils/emailBuilder";

// Secrets
const privateKeySecret = defineSecret("INSTITUTION_PRIVATE_KEY");
const mailgunSecret = defineSecret("MAILGUN_API_KEY");

// Auto-detects runtime environment (Emulator vs Live)
const APP_URL =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? "http://localhost:5173"
    : "https://mlabassessmentcenter.web.app";

// Blockchain Network & Contract Configuration
const RPC_URL =
  process.env.RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || "";
const PINATA_JWT = process.env.PINATA_JWT || "";

const contractABI = [
  "function issueCertificate(string certId, bytes32 dataFingerprint) public",
];

// ============================================================================
// 1. ISSUE BLOCKCHAIN CERTIFICATE (PINATA IPFS + ETHEREUM SEPOLIA MINTING)
// ============================================================================

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
      logger.info(
        `[BlockchainEngine] Uploading ${verificationCode}.pdf to Pinata IPFS...`,
      );
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
      logger.info(`[BlockchainEngine] Uploaded to IPFS! Hash: ${ipfsHash}`);
      logger.info(`[BlockchainEngine] Minting to Sepolia network...`);

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

      logger.info(
        `[BlockchainEngine] Minted successfully! TX: ${receipt.hash}`,
      );

      return {
        success: true,
        ipfsHash: ipfsHash,
        fingerprint: fingerprint,
        transactionHash: receipt.hash,
        timestamp: new Date().toISOString(),
      };
    } catch (error: any) {
      logger.error("[BlockchainEngine] Minting Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to process certificate on blockchain.",
      );
    }
  },
);

// ============================================================================
// 2. ON LEARNER BLOCKCHAIN VERIFIED TRIGGER (EMAIL NOTIFICATION)
// ============================================================================

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
          logger.info(`[BlockchainEngine] Verified email sent to ${email}`);
        } catch (error) {
          logger.error(
            "[BlockchainEngine] Error sending verification email:",
            error,
          );
        }
      }
    }
  },
);

// ============================================================================
// 3. SEND AD-HOC CERTIFICATE
// ============================================================================

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
      logger.error("[BlockchainEngine] Ad-Hoc Email Error:", error);
      throw new HttpsError(
        "internal",
        error.message || "Failed to send certificate email.",
      );
    }
  },
);
