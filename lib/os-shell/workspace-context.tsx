"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AppId, ModuleId } from "@/components/os-shell/registry/types";

/**
 * MUV OS™ — Core Platform Foundation (Milestone 1), AI Panel "Context
 * container" and Command Palette "context-sensitive commands".
 *
 * The single contract Global Layout Specification §8 and Manifest
 * Architecture §6/§8 both depend on: whatever module is currently mounted
 * in the Workspace supplies this, and the AI Panel / Command Palette read
 * it generically — neither ever needs bespoke per-App wiring. `version` is
 * a scalability hedge already flagged in the Specification: it lets a
 * future consumer detect a context shape from a module built years apart
 * from this one, rather than silently misreading it.
 *
 * `moduleId`/`recordType`/`recordId` are all optional because a page can
 * legitimately have no more specific context than "the platform shell
 * itself" — with zero Apps installed today, that's the only state that can
 * exist, and the default value below reflects exactly that; it is not a
 * placeholder, it is the accurate context of an empty platform.
 */
export interface WorkspaceContextValue {
  version: 1;
  appId: AppId | null;
  moduleId: ModuleId | null;
  recordType: string | null;
  recordId: string | null;
}

const DEFAULT_WORKSPACE_CONTEXT: WorkspaceContextValue = {
  version: 1,
  appId: null,
  moduleId: null,
  recordType: null,
  recordId: null,
};

const WorkspaceContext = createContext<WorkspaceContextValue>(DEFAULT_WORKSPACE_CONTEXT);

export function WorkspaceContextProvider({
  value,
  children,
}: {
  value?: Partial<Omit<WorkspaceContextValue, "version">>;
  children: ReactNode;
}) {
  const resolved = useMemo<WorkspaceContextValue>(
    () => ({ ...DEFAULT_WORKSPACE_CONTEXT, ...value }),
    [value]
  );
  return <WorkspaceContext.Provider value={resolved}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspaceContext(): WorkspaceContextValue {
  return useContext(WorkspaceContext);
}
