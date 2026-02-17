"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
    Card,
    CardContent,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from "@/components/ui/card";
import {
    InputGroup,
    InputGroupAddon,
    InputGroupButton,
    InputGroupInput,
} from "@/components/ui/input-group";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { VibrantAuroraBackground } from "@/components/vibrant-aurora-background";
import { authenticateUser } from "@/app/actions";
import { ArrowRight, Loader2, Mail, LockKeyhole, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [isPasswordVisible, setIsPasswordVisible] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState("");
    const [isLoginSuccessful, setIsLoginSuccessful] = useState(false);
    // Server actions are imported directly
    const isInputSuccessState = isLoginSuccessful && !error;
    const emailGroupClass = error
        ? "border-red-500 ring-red-500/20"
        : isInputSuccessState
            ? "border-primary ring-primary/20 ring-[3px]"
            : "";
    const passwordGroupClass = error
        ? "border-red-500 ring-red-500/20"
        : isInputSuccessState
            ? "border-primary ring-primary/20 ring-[3px]"
            : "";

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email.trim()) {
            setError("Please enter your email");
            return;
        }

        setIsLoading(true);
        setIsLoginSuccessful(false);
        setError("");

        try {
            const result = await authenticateUser(email, password);

            if (result) {
                setIsLoginSuccessful(true);
                toast.success("Login success");
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
            <Card className="w-full max-w-md relative z-10 border-white/10 bg-background/85 backdrop-blur-xl shadow-2xl">
                <CardHeader className="text-center">
                    <div className="flex items-center justify-center mb-5">
                        <Image
                            src="/logo/navigator.png"
                            alt="Navigator logo"
                            width={64}
                            height={64}
                            priority
                            className="drop-shadow-[0_10px_20px_rgba(0,0,0,0.4)]"
                        />
                    </div>
                    <CardTitle className="font-poppins text-3xl font-semibold tracking-tight">Sign in</CardTitle>
                    <CardDescription className="text-base text-muted-foreground/90 mt-2">
                        Enter your Stremio credentials to continue
                    </CardDescription>
                </CardHeader>
                <form onSubmit={handleSubmit}>
                    <CardContent>
                        <div className="space-y-5">
                            <div>
                                <label
                                    htmlFor="email"
                                    className="text-sm font-medium block mb-2"
                                >Email</label>
                                <InputGroup className={emailGroupClass}>
                                    <InputGroupAddon>
                                        <Mail className={isInputSuccessState ? "text-primary" : ""} />
                                    </InputGroupAddon>
                                    <InputGroupInput
                                        id="email"
                                        type="email"
                                        placeholder="Enter your email"
                                        value={email}
                                        onChange={(e) => {
                                            setEmail(e.target.value);
                                            if (isLoginSuccessful) {
                                                setIsLoginSuccessful(false);
                                            }
                                            if (error) {
                                                setError("");
                                            }
                                        }}
                                        disabled={isLoading}
                                        autoComplete="email"
                                        aria-invalid={error ? true : undefined}
                                    />
                                </InputGroup>
                            </div>
                            <div>
                                <label
                                    htmlFor="password"
                                    className="text-sm font-medium block mb-2"
                                >Password</label>
                                <InputGroup className={passwordGroupClass}>
                                    <InputGroupAddon>
                                        <LockKeyhole className={isInputSuccessState ? "text-primary" : ""} />
                                    </InputGroupAddon>
                                    <InputGroupInput
                                        id="password"
                                        type={isPasswordVisible ? "text" : "password"}
                                        placeholder="Enter your password"
                                        value={password}
                                        onChange={(e) => {
                                            setPassword(e.target.value);
                                            if (isLoginSuccessful) {
                                                setIsLoginSuccessful(false);
                                            }
                                            if (error) {
                                                setError("");
                                            }
                                        }}
                                        disabled={isLoading}
                                        autoComplete="current-password"
                                        aria-invalid={error ? true : undefined}
                                    />
                                    <InputGroupAddon align="inline-end">
                                        <InputGroupButton
                                            size="icon-xs"
                                            aria-label={isPasswordVisible ? "Hide password" : "Show password"}
                                            title={isPasswordVisible ? "Hide password" : "Show password"}
                                            onClick={() => setIsPasswordVisible((prev) => !prev)}
                                        >
                                            {isPasswordVisible ? <EyeOff /> : <Eye />}
                                        </InputGroupButton>
                                    </InputGroupAddon>
                                </InputGroup>
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
                        <Button
                            type="submit"
                            className="w-full mt-8"
                            disabled={isLoading}
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                    Signing In...
                                </>
                            ) : (
                                <>
                                    Sign In
                                    <ArrowRight className="h-4 w-4" />
                                </>
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
