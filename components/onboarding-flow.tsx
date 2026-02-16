"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isAuthenticated } from "@/app/actions";
import { LoginForm } from "@/components/login-form";

export function OnboardingFlow() {
  const router = useRouter();

  useEffect(() => {
    const checkAuthStatus = async () => {
      const authenticated = await isAuthenticated();

      if (authenticated) {
        router.replace("/");
      }
    };

    checkAuthStatus();
  }, [router]);

  const handleLoginSuccess = () => {
    router.replace("/");
  };

  return <LoginForm onSuccess={handleLoginSuccess} />;
}
