"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase-browser";

export default function LogoutPage() {
  const router = useRouter();

  useEffect(() => {
    supabaseBrowser.auth.signOut().then(() => {
      router.push("/");
    });
  }, [router]);

  return null;
}
