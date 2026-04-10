// src/lib/pinata.ts

const PINATA_JWT =
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJjNGI3YjdmMS03MWE3LTRhNDktYjY1Ny0wNGU1NTI1Y2I5MDMiLCJlbWFpbCI6ImJybmRrdEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNmM4NjBlYTJjN2I1YTIwN2RhMTQiLCJzY29wZWRLZXlTZWNyZXQiOiI0OGVjOGE1OGZhZmM3Yzk2MWVjZjIwM2ZmMjM0M2Q3ZjY1YmFmMzY4MzFiMjU3OTQ5NjAzNjMxZGFlNDNhMTNlIiwiZXhwIjoxODA1MTkzNjEyfQ.JVd5r-b9RrLB3Y7kR3CD7321HwWEHWhr5LoaEj5iQ4I";

// src/lib/pinata.ts

export const uploadToIPFS = async (file: File): Promise<string> => {
  try {
    const formData = new FormData();
    formData.append("file", file);

    // Add metadata so you can identify it in your Pinata dashboard
    const pinataMetadata = JSON.stringify({ name: file.name });
    formData.append("pinataMetadata", pinataMetadata);

    const pinataOptions = JSON.stringify({ cidVersion: 0 });
    formData.append("pinataOptions", pinataOptions);

    // Fetch the JWT token from your environment variables
    const jwt = import.meta.env.VITE_PINATA_JWT;

    if (!jwt) {
      throw new Error("Pinata JWT is missing. Please check your .env file.");
    }

    console.log("Uploading to Pinata...");

    const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
      body: formData,
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("Pinata API rejected the request:", errorData);
      throw new Error(`Pinata API Error: ${res.statusText}`);
    }

    const resData = await res.json();
    console.log("Successfully uploaded to IPFS! Hash:", resData.IpfsHash);

    return resData.IpfsHash;
  } catch (error) {
    console.error("IPFS Upload Error:", error);
    throw new Error(
      "Failed to upload document to IPFS. Please check your network or API keys.",
    );
  }
};
