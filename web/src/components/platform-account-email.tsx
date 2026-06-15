"use client";

import { useEffect, useState } from "react";

import {
  DEFAULT_PLATFORM_ACCOUNT_EMAIL,
  PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY
} from "@/lib/platform-session";

type PlatformAccountEmailProps = {
  className?: string;
};

export function PlatformAccountEmail({ className }: PlatformAccountEmailProps) {
  const [accountEmail, setAccountEmail] = useState(DEFAULT_PLATFORM_ACCOUNT_EMAIL);

  useEffect(() => {
    const storedEmail = window.localStorage.getItem(PLATFORM_ACCOUNT_EMAIL_STORAGE_KEY);

    if (storedEmail?.includes("@")) {
      setAccountEmail(storedEmail);
    }
  }, []);

  return <span className={className}>{accountEmail}</span>;
}
