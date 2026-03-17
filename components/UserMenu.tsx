"use client";

import type { User } from "@supabase/supabase-js";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function UserMenu({ user }: { user: User }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="User menu"
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/60 text-zinc-600 shadow-sm ring-1 ring-white/70 backdrop-blur-sm transition-all hover:bg-white/80 hover:shadow-md focus:outline-none"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-[17px] w-[17px]"
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
        sideOffset={10}
        className="relative w-52 overflow-hidden rounded-2xl border border-white/70 bg-white/40 p-0 font-sans shadow-2xl backdrop-blur-2xl data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:slide-in-from-top-1 duration-200"
      >
        {/* Gradient orbs — mirrors the homepage background */}
        <div className="pointer-events-none absolute -left-6 -top-6 h-20 w-20 rounded-full bg-sky-200/50 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-4 right-0 h-16 w-16 rounded-full bg-indigo-200/50 blur-2xl" />

        {/* Signed-in label */}
        <div className="relative px-4 py-3.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-400">
            Signed in as
          </p>
          <p className="mt-0.5 truncate text-[12px] font-medium tracking-tight text-zinc-700">
            {user.email}
          </p>
        </div>

        <DropdownMenuSeparator className="mx-0 bg-white/60" />

        <div className="relative p-1.5">
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-xl px-3 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors focus:bg-white/60 focus:text-zinc-900"
          >
            <a href="/admin/entry">Dashboard</a>
          </DropdownMenuItem>
          <DropdownMenuItem
            asChild
            className="cursor-pointer rounded-xl px-3 py-2.5 font-sans text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-600 transition-colors focus:bg-white/60 focus:text-zinc-900"
          >
            <a href="/logout">Logout</a>
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
