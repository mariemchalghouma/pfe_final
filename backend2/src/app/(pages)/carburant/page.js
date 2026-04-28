"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function CarburantPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/carburant/analyse");
  }, [router]);

  return null;
}
