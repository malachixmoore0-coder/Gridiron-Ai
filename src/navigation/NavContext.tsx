/**
 * The handful of destinations every screen needs to reach — your profile, the
 * settings sheet, the paywall — without threading four callbacks through six
 * screens to get there.
 */
import React, { createContext, useContext } from 'react';

export interface NavActions {
  openProfile: () => void;
  openSettings: () => void;
  openUpgrade: () => void;
  openCard: () => void;
}

const NOOP: NavActions = { openProfile: () => {}, openSettings: () => {}, openUpgrade: () => {}, openCard: () => {} };

const Ctx = createContext<NavActions>(NOOP);

export const NavProvider = Ctx.Provider;
export const useNav = (): NavActions => useContext(Ctx);
