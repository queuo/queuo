"use client";

import type { User } from "@supabase/supabase-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: User }) {

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="User menu"
          className="frosted-pill flex h-9 w-9 items-center justify-center rounded-full text-zinc-900 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md focus:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-[18px] w-[18px]"
          >
            <path
              fillRule="evenodd"
              d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-60 overflow-hidden rounded-[1.25rem] border border-white/68 bg-white/45 p-0 font-sans shadow-[0_20px_80px_rgba(25,34,52,0.12)] backdrop-blur-[24px] duration-300 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:slide-out-to-top-1 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-2"
      >
        {/* Ambient orbs — echoes the page background */}
        <div
          className="pointer-events-none absolute -left-8 -top-8 h-24 w-24 rounded-full blur-2xl"
          style={{ background: "var(--frosted-orb-sky)" }}
        />
        <div
          className="pointer-events-none absolute -bottom-6 right-0 h-20 w-20 rounded-full blur-2xl"
          style={{ background: "var(--frosted-orb-indigo)" }}
        />

        {/* Account header */}
        <div className="relative px-4 py-4">
          <p className="truncate text-[13px] font-semibold leading-tight text-zinc-900">
            {user.email}
          </p>
          <p className="mt-0.5 text-[11px] font-medium text-zinc-400">
            Your account
          </p>
        </div>

        {/* Divider */}
        <div className="mx-4 h-px bg-white/60" />

        {/* Menu items */}
        <div className="relative p-2">
          <a
            href="/admin/entry"
            className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-white/70 hover:shadow-sm hover:ring-1 hover:ring-white/70"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover/item:bg-zinc-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M4.25 2A2.25 2.25 0 0 0 2 4.25v2.5A2.25 2.25 0 0 0 4.25 9h2.5A2.25 2.25 0 0 0 9 6.75v-2.5A2.25 2.25 0 0 0 6.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 2 13.25v2.5A2.25 2.25 0 0 0 4.25 18h2.5A2.25 2.25 0 0 0 9 15.75v-2.5A2.25 2.25 0 0 0 6.75 11h-2.5Zm9-9A2.25 2.25 0 0 0 11 4.25v2.5A2.25 2.25 0 0 0 13.25 9h2.5A2.25 2.25 0 0 0 18 6.75v-2.5A2.25 2.25 0 0 0 15.75 2h-2.5Zm0 9A2.25 2.25 0 0 0 11 13.25v2.5A2.25 2.25 0 0 0 13.25 18h2.5A2.25 2.25 0 0 0 18 15.75v-2.5A2.25 2.25 0 0 0 15.75 11h-2.5Z" clipRule="evenodd" />
              </svg>
            </span>
            <span className="text-[13px] font-medium text-zinc-700">Dashboard</span>
          </a>

          <a
            href="/logout"
            className="group/item flex items-center gap-3 rounded-xl px-3 py-2.5 transition-all duration-200 hover:bg-white/70 hover:shadow-sm hover:ring-1 hover:ring-white/70"
          >
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600 transition-colors group-hover/item:bg-zinc-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5">
                <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 0 1 5.25 2h5.5A2.25 2.25 0 0 1 13 4.25v2a.75.75 0 0 1-1.5 0v-2a.75.75 0 0 0-.75-.75h-5.5a.75.75 0 0 0-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 0 0 .75-.75v-2a.75.75 0 0 1 1.5 0v2A2.25 2.25 0 0 1 10.75 18h-5.5A2.25 2.25 0 0 1 3 15.75V4.25Zm13.47 4.22a.75.75 0 0 1 1.06 0l2 2a.75.75 0 0 1 0 1.06l-2 2a.75.75 0 1 1-1.06-1.06l.72-.72H8.75a.75.75 0 0 1 0-1.5h8.44l-.72-.72a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
              </svg>
            </span>
            <span className="text-[13px] font-medium text-zinc-500">Sign out</span>
          </a>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
