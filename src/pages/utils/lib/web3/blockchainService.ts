import { ethers } from "ethers";
import ContractABI from "./QCTOCredentialRegistry.json";
import { CONTRACT_ADDRESS, SEPOLIA_RPC_URL } from "./config";

/**
 * PUBLIC READ-ONLY PROVIDER
 * Public verification uses the same Sepolia contract that issuance writes to.
 */
const getReadOnlyContract = () => {
  const publicProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, ContractABI, publicProvider);
};

const generateDataFingerprint = (
  learnerName: string,
  idNumber: string,
  qualification: string,
  issueDate: string,
  eisaStatus: string,
  ipfsHash: string,
): string => {
  return ethers.solidityPackedKeccak256(
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
};

export const verifyBlockchainCertificate = async (
  certId: string,
  firebaseData: {
    learnerName: string;
    idNumber: string;
    qualification: string;
    issueDate: string;
    eisaStatus: string;
    ipfsHash: string;
  },
): Promise<{ isAuthentic: boolean; isRevoked: boolean }> => {
  try {
    const contract = getReadOnlyContract();

    // Ask Smart Contract for the record
    const result = await contract.verifyCertificate(certId);

    const onChainFingerprint = result[0];
    const isValid = result[1];

    const localFingerprint = generateDataFingerprint(
      firebaseData.learnerName,
      firebaseData.idNumber,
      firebaseData.qualification,
      firebaseData.issueDate,
      firebaseData.eisaStatus,
      firebaseData.ipfsHash,
    );

    if (onChainFingerprint !== localFingerprint) {
      console.error("Certificate fingerprint mismatch.");
    }

    if (!isValid) return { isAuthentic: false, isRevoked: true };

    return {
      isAuthentic: onChainFingerprint === localFingerprint,
      isRevoked: false,
    };
  } catch (error) {
    console.error("Blockchain certificate verification failed:", error);
    return { isAuthentic: false, isRevoked: false };
  }
};
