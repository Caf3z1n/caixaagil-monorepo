"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { getPlatformPrefetchRoutes, prefetchPlatformDataForPath } from "@/lib/platform-preload";
import {
  getStoredPlatformAuthToken,
  PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY,
  PLATFORM_ACCOUNT_TYPE_STORAGE_KEY
} from "@/lib/platform-session";

const warmedSignatures = new Set<string>();
const dataWarmupDelayMs = 90;
const dataWarmupStepMs = 45;

function readAccountPermissions() {
  const rawPermissions = window.localStorage.getItem(PLATFORM_ACCOUNT_PERMISSIONS_STORAGE_KEY);

  if (!rawPermissions) {
    return ["*"];
  }

  try {
    const parsed = JSON.parse(rawPermissions);
    return Array.isArray(parsed) ? parsed : ["*"];
  } catch {
    return ["*"];
  }
}

export function PlatformPerformanceWarmup() {
  const router = useRouter();

  useEffect(() => {
    const token = getStoredPlatformAuthToken();

    if (!token) {
      return;
    }

    const accountType = window.localStorage.getItem(PLATFORM_ACCOUNT_TYPE_STORAGE_KEY) ?? "usuario";
    const routes = getPlatformPrefetchRoutes(accountType, readAccountPermissions());
    const signature = `${token}:${accountType}:${routes.join("|")}`;

    if (warmedSignatures.has(signature)) {
      return;
    }

    warmedSignatures.add(signature);

    const timers: number[] = [];

    routes.forEach((route) => {
      router.prefetch(route);
    });

    routes.forEach((route, index) => {
      const timer = window.setTimeout(() => {
        void Promise.all(prefetchPlatformDataForPath(route, token));
      }, dataWarmupDelayMs + index * dataWarmupStepMs);

      timers.push(timer);
    });

    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
    };
  }, [router]);

  return null;
}
