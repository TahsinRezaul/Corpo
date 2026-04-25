"use client";

import { createContext, useContext, useState } from "react";

export type BgNotif = {
  id: string;
  status: "parsing" | "done" | "error";
  label: string;
};

type CtxType = {
  notifs: BgNotif[];
  setNotifs: React.Dispatch<React.SetStateAction<BgNotif[]>>;
};

const BackgroundTasksContext = createContext<CtxType>({
  notifs: [],
  setNotifs: () => {},
});

export function BackgroundTasksProvider({ children }: { children: React.ReactNode }) {
  const [notifs, setNotifs] = useState<BgNotif[]>([]);
  return (
    <BackgroundTasksContext.Provider value={{ notifs, setNotifs }}>
      {children}
    </BackgroundTasksContext.Provider>
  );
}

export function useBackgroundTasks() {
  return useContext(BackgroundTasksContext);
}
