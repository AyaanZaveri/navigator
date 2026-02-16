"use client";

import React, { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { authenticateUser } from "@/app/actions";
import { Loader2, Mail, ArrowLeft } from "lucide-react";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  // Server actions are imported directly

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Please enter your email");
      return;
    }

    setIsLoading(true);
    setError("");

    try {
      const result = await authenticateUser(email, password);

      if (result) {
        onSuccess();
      } else {
        setError("Invalid email or password. Please try again.");
      }
    } catch {
      setError("Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4 relative w-full">
      <VibrantAuroraBackground
        amplitude={0.8}
        blend={0.4}
      />
      <Card className="w-full max-w-md relative z-10">
        <CardHeader className="text-center">
          <div className="flex items-center justify-center mb-4">
            <div className="p-3 bg-primary/10 rounded-full w-fit">
              <Mail className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>
            Enter your Stremio credentials to continue
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent>
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="text-sm font-medium block mb-2"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="Enter your email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  autoComplete="email"
                  className={error ? "border-red-500" : ""}
                />
              </div>
              <div>
                <label
                  htmlFor="password"
                  className="text-sm font-medium block mb-2"
                >
                  Password
                </label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  autoComplete="current-password"
                  className={error ? "border-red-500" : ""}
                />
                {error && (
                  <p className="text-sm text-red-500 mt-2 flex items-start gap-2">
                    <span className="text-red-500 mt-0.5">⚠</span>
                    <span>{error}</span>
                  </p>
                )}
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full mt-8" disabled={isLoading}>
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing In...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </CardFooter>
        </form>
      </Card>

      {/* Theme toggle in bottom right */}
      <div className="fixed bottom-4 right-4">
        <ThemeToggle />
      </div>
    </div>
  );
}
