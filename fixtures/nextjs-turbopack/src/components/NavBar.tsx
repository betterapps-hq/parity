"use client"

import { Menu, MenuButton, MenuItem, MenuItems } from "@headlessui/react"
import { ChevronDownIcon, Cog6ToothIcon, HomeIcon } from "@heroicons/react/24/outline"
import Link from "next/link"

export function NavBar() {
  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
      <Link href="/" className="flex items-center gap-2 font-semibold text-brand">
        <HomeIcon className="size-5" />
        Acme
      </Link>
      <Menu as="div" className="relative">
        <MenuButton className="flex items-center gap-1 rounded-md px-3 py-1.5 text-sm hover:bg-gray-100">
          Account
          <ChevronDownIcon className="size-4" />
        </MenuButton>
        <MenuItems className="absolute right-0 mt-2 w-40 rounded-md border border-gray-200 bg-white p-1 shadow-lg">
          <MenuItem>
            <Link href="/projects/1" className="flex items-center gap-2 rounded px-2 py-1.5 text-sm data-focus:bg-gray-100">
              <Cog6ToothIcon className="size-4" />
              Settings
            </Link>
          </MenuItem>
        </MenuItems>
      </Menu>
    </nav>
  )
}
