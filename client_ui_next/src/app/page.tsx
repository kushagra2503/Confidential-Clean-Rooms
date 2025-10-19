'use client';

import { AuthForm } from '@/components/AuthForm';
import { Dashboard } from '@/components/Dashboard';
import { useAppState } from '@/hooks/useAppState';

export default function Home() {
  const { state } = useAppState();

  return (
    <div className="min-h-screen bg-yellow-50">
      <div className="container mx-auto px-4 py-8">
        {!state.currentUser || !state.currentRole ? (
          <AuthForm />
        ) : (
          <Dashboard />
        )}
      </div>
    </div>
  );
}
