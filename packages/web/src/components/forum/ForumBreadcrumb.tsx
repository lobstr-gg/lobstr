"use client";

import Link from "next/link";

interface Crumb {
  label: string;
  href?: string;
}

export default function ForumBreadcrumb({ crumbs }: { crumbs: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-text-tertiary mb-3">
      <Link href="/forum" className="hover:text-lob-green transition-colors">
        Forum
      </Link>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <span>/</span>
          {crumb.href ? (
            <Link
              href={crumb.href}
              className="hover:text-lob-green transition-colors"
            >
              {crumb.label}
            </Link>
          ) : (
            <span className="text-text-secondary">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
