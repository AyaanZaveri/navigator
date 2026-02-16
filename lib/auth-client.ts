'use client';

import type { StremioUserWithToken } from '@/types/stremio';

interface AuthResponse {
  success: boolean;
  error?: string;
}

// Client-side authentication utilities
export class AuthClient {
  static async login(email: string, password: string): Promise<AuthResponse> {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        return { success: true };
      }

      return { success: false, error: data.error || 'Login failed' };
    } catch (error) {
      console.error('Login error:', error);
      return { success: false, error: 'Network error occurred' };
    }
  }

  static async logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }
}
