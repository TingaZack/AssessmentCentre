// // src/lib/web3/blockchainService.ts

// import { ethers } from "ethers";
// // @ts-ignore
// import ContractABI from "./QCTOCredentialRegistry.json";
// // @ts-ignore
// import { CONTRACT_ADDRESS } from "./config";

// /**
//  * PUBLIC READ-ONLY PROVIDER
//  * We are hardcoding a highly reliable Sepolia RPC URL here to guarantee
//  * that the scanner looks at the exact same network where you just minted the record!
//  */
// const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

// /**
//  * Gets a contract instance.
//  * If 'isWrite' is true, it requires MetaMask (for issuing).
//  * If 'isWrite' is false, it uses a public provider (for scanning/verifying).
//  */
// export const getContract = async (isWrite: boolean = false) => {
//   // WRITE MODE: (Admins only) Requires MetaMask to sign the transaction
//   if (isWrite) {
//     const { ethereum } = window as any;
//     if (!ethereum) throw new Error("Please install MetaMask.");

//     await ethereum.request({ method: "eth_requestAccounts" });
//     const provider = new ethers.BrowserProvider(ethereum);
//     const signer = await provider.getSigner();
//     return new ethers.Contract(CONTRACT_ADDRESS, ContractABI, signer);
//   }

//   // READ MODE: (Public/Employers/Scanners) Uses the direct Sepolia tunnel
//   const publicProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
//   return new ethers.Contract(CONTRACT_ADDRESS, ContractABI, publicProvider);
// };

// export const generateDataFingerprint = (
//   learnerName: string,
//   idNumber: string,
//   qualification: string,
//   issueDate: string,
//   eisaStatus: string,
//   ipfsHash: string,
// ): string => {
//   return ethers.solidityPackedKeccak256(
//     ["string", "string", "string", "string", "string", "string"],
//     [
//       learnerName.trim(),
//       idNumber.trim(),
//       qualification.trim(),
//       issueDate.trim(),
//       eisaStatus.trim(),
//       ipfsHash.trim(),
//     ],
//   );
// };

// /**
//  * ISSUANCE: Uses isWrite = true
//  */
// export const issueBlockchainCertificate = async (
//   certId: string,
//   learnerName: string,
//   idNumber: string,
//   qualification: string,
//   issueDate: string,
//   eisaStatus: string,
//   ipfsHash: string,
// ) => {
//   try {
//     // Aggressive Data Check before talking to the blockchain
//     console.log("MINTING DATA CHECK:", {
//       certId,
//       learnerName,
//       idNumber,
//       qualification,
//       issueDate,
//       eisaStatus,
//       ipfsHash,
//     });

//     if (!certId || !ipfsHash || !learnerName) {
//       throw new Error(
//         `Missing Critical Data! certId: ${certId}, ipfsHash: ${ipfsHash}, name: ${learnerName}`,
//       );
//     }

//     const contract = await getContract(true); // 👈 Requesting Write Access (MetaMask)

//     const fingerprint = generateDataFingerprint(
//       learnerName,
//       idNumber,
//       qualification,
//       issueDate,
//       eisaStatus,
//       ipfsHash,
//     );

//     console.log("🦊 Sending to MetaMask...");
//     const tx = await contract.issueCertificate(certId, fingerprint);

//     console.log("⏳ Waiting for Blockchain Confirmation...");
//     const receipt = await tx.wait(); // CRITICAL: This pauses the code until the block is fully mined!

//     console.log(
//       "✅ Secure Fingerprint officially saved to blockchain!",
//       receipt,
//     );
//     return fingerprint;
//   } catch (error: any) {
//     console.error("🚨 Blockchain Issue Error:", error);
//     throw new Error(
//       error.shortMessage || error.message || "Failed to issue certificate.",
//     );
//   }
// };

// /**
//  * VERIFICATION: Uses isWrite = false (Default)
//  * This works on any mobile phone or browser without MetaMask!
//  */
// export const verifyBlockchainCertificate = async (
//   certId: string,
//   firebaseData: {
//     learnerName: string;
//     idNumber: string;
//     qualification: string;
//     issueDate: string;
//     eisaStatus: string;
//     ipfsHash: string;
//   },
// ): Promise<{ isAuthentic: boolean; isRevoked: boolean }> => {
//   try {
//     // console.log("🔍 1. Starting Verification for ID:", certId);
//     // console.log("📄 2. Local Data from Firebase:", firebaseData);

//     const contract = await getContract(false);
//     // console.log("📡 3. Connected to Sepolia RPC successfully.");

//     // console.log("⏳ 4. Asking Smart Contract for the record...");
//     const result = await contract.verifyCertificate(certId);
//     // console.log("📦 5. Raw Contract Response:", result);

//     const onChainFingerprint = result[0];
//     const isValid = result[1];

//     // console.log("⛓️ On-Chain Fingerprint:", onChainFingerprint);
//     // console.log("✅ Is Valid Status:", isValid);

//     // // X-RAY Logging to catch exact character mismatches
//     // console.log("🛠️ --- FINGERPRINT X-RAY ---");
//     // console.log("1. Name:", firebaseData.learnerName.trim());
//     // console.log("2. ID:", firebaseData.idNumber.trim());
//     // console.log("3. Qual:", firebaseData.qualification.trim());
//     // console.log("4. Date:", firebaseData.issueDate.trim());
//     // console.log("5. EISA:", firebaseData.eisaStatus.trim());
//     // console.log("6. IPFS:", firebaseData.ipfsHash.trim());
//     // console.log("🛠️ ------------------------");

//     const localFingerprint = generateDataFingerprint(
//       firebaseData.learnerName,
//       firebaseData.idNumber,
//       firebaseData.qualification,
//       firebaseData.issueDate,
//       firebaseData.eisaStatus,
//       firebaseData.ipfsHash,
//     );
//     // console.log("💻 Local Fingerprint Generated:", localFingerprint);

//     if (onChainFingerprint !== localFingerprint) {
//       console.error(
//         "❌ MISMATCH! The data on Firebase does not perfectly match the data that was minted.",
//       );
//     } else {
//       console.log("🎉 MATCH! The fingerprints are identical.");
//     }

//     if (!isValid) return { isAuthentic: false, isRevoked: true };

//     return {
//       isAuthentic: onChainFingerprint === localFingerprint,
//       isRevoked: false,
//     };
//   } catch (error: any) {
//     console.error("🚨 VERIFICATION CRASHED:", error);
//     return { isAuthentic: false, isRevoked: false };
//   }
// };

// src/lib/web3/blockchainService.ts

import { ethers } from "ethers";
// @ts-ignore
import ContractABI from "./QCTOCredentialRegistry.json";
// @ts-ignore
import { CONTRACT_ADDRESS } from "./config";

/**
 * PUBLIC READ-ONLY PROVIDER
 * We are using Sepolia RPC to guarantee that the scanner
 * looks at the exact same network where the backend mints the record!
 */
const SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";

/**
 * READ-ONLY CONTRACT INSTANCE
 * No MetaMask required. Works on mobile phones and normal browsers.
 */
export const getReadOnlyContract = () => {
  const publicProvider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
  return new ethers.Contract(CONTRACT_ADDRESS, ContractABI, publicProvider);
};

export const generateDataFingerprint = (
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

/**
 * VERIFICATION ONLY
 * This is the only Web3 function the frontend needs to do!
 */
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
      console.error(
        "❌ MISMATCH! The data on Firebase does not perfectly match the data that was minted.",
      );
    } else {
      console.log("🎉 MATCH! The fingerprints are identical.");
    }

    if (!isValid) return { isAuthentic: false, isRevoked: true };

    return {
      isAuthentic: onChainFingerprint === localFingerprint,
      isRevoked: false,
    };
  } catch (error: any) {
    console.error("🚨 VERIFICATION CRASHED:", error);
    return { isAuthentic: false, isRevoked: false };
  }
};
