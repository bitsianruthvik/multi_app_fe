/* eslint-disable @typescript-eslint/no-explicit-any, react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useParams } from "react-router-dom";
import api, { API_HOST } from "@core/utils/axiosConfig";

interface FlowContextValue {
  actionId: string | null;
  brandName: string | null;      // decoded from URL param :brandName
  recordingId: string | null;
  actionName: string | null;     // auto-fetched from DB when actionId is present
  setActionName: (name: string) => void;
}

const FlowContext = createContext<FlowContextValue | null>(null);

export function FlowProvider({ children }: { children: ReactNode }) {
  const { actionId = null, brandName = null, recordingId = null } = useParams<{
    actionId?: string;
    brandName?: string;
    recordingId?: string;
  }>();

  const [actionName, setActionName] = useState<string | null>(null);

  const decodedBrandName = brandName ? decodeURIComponent(brandName) : null;

  // Auto-fetch action name whenever actionId changes so every flow page gets it
  // without each page needing its own fetch.
  useEffect(() => {
    if (!actionId) { setActionName(null); return; }
    let cancelled = false;
    api.post(`${API_HOST}/api/query/v1/base_resource`, {
      operation: "query",
      resource: "actions",
      filters: { id: Number(actionId) },
    }).then((resp) => {
      if (cancelled) return;
      const rows: any[] = Array.isArray(resp?.data?.data) ? resp.data.data
        : Array.isArray(resp?.data) ? resp.data : [];
      if (rows[0]?.name) setActionName(rows[0].name);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [actionId]);

  return (
    <FlowContext.Provider
      value={{
        actionId,
        brandName: decodedBrandName,
        recordingId,
        actionName,
        setActionName,
      }}
    >
      {children}
    </FlowContext.Provider>
  );
}

export function useFlow(): FlowContextValue {
  const context = useContext(FlowContext);
  if (context === null) {
    throw new Error("useFlow must be used within a FlowProvider");
  }
  return context;
}
