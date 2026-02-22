import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import type { UserProfile } from "../types/auth.types";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setLoading(true);
      if (currentUser) {
        setUser(currentUser);
        try {
          // Fetch extended profile (Role + Signature)
          const docRef = doc(db, "users", currentUser.uid);
          const docSnap = await getDoc(docRef);

          if (docSnap.exists()) {
            setProfile(docSnap.data() as UserProfile);
          } else {
            // User exists in Auth but not in Firestore (New User?)
            // You might handle auto-creation here if needed
            setProfile(null);
          }
        } catch (err) {
          console.error("Error fetching user profile:", err);
          setError("Failed to load user profile");
        }
      } else {
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  return { user, profile, loading, error };
}
