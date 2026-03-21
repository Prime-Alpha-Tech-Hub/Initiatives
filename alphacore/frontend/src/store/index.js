import { create } from 'zustand';
import { authApi } from '../utils/api';

export const useStore = create((set, get) => ({
  // ── Auth ────────────────────────────────────────────────────────────────
  user:        null,
  isAuth:      !!localStorage.getItem('access_token'),

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    localStorage.setItem('access_token',  data.access);
    localStorage.setItem('refresh_token', data.refresh);
    const me = await authApi.me();
    set({ user: me.data, isAuth: true });
    return me.data;
  },

  logout: () => {
    localStorage.clear();
    set({ user: null, isAuth: false });
    window.location.href = '/login';
  },

  loadMe: async () => {
    try {
      const me = await authApi.me();
      set({ user: me.data, isAuth: true });
    } catch {
      set({ isAuth: false });
    }
  },

  // ── UI state ────────────────────────────────────────────────────────────
  sidebarOpen:    true,
  setSidebar:     (v) => set({ sidebarOpen: v }),
  toasts:         [],

  addToast: (msg, type = 'success') => {
    const id = Date.now();
    set(s => ({ toasts: [...s.toasts, { id, msg, type }] }));
    setTimeout(() => set(s => ({ toasts: s.toasts.filter(t => t.id !== id) })), 4000);
  },
}));
